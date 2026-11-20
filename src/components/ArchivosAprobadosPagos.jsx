import { useEffect, useState } from 'react'
import { Download, FileCheck2, RefreshCw, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { descargarExcelOP } from '../lib/exportarOP'
import { descargarExcelContabilizacionObligaciones } from '../lib/exportarContabilizacionObligaciones'
import { AlertasActualizacionesRP } from './ActualizacionesRP'
import { ConfirmacionEgresos } from './TrazabilidadPagos'

const boton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50'

export default function ArchivosAprobadosPagos({ convocatoriaId }) {
  const [lista, setLista] = useState(null)
  const [revision, setRevision] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [seleccion, setSeleccion] = useState(null)
  const porPagina = 6

  useEffect(() => {
    let activo = true
    supabase.rpc('listar_contabilizaciones_para_pagos', { p_convocatoria_id: convocatoriaId })
      .then(({ data, error: fallo }) => {
        if (fallo) throw fallo
        if (!Array.isArray(data)) throw new Error('No se recibió una lista válida de archivos aprobados.')
        if (activo) { setLista(data); setPagina(1); setError('') }
      })
      .catch((fallo) => { if (activo) setError(fallo.message) })
    return () => { activo = false }
  }, [convocatoriaId, revision])

  const abrir = async (rpId, tipo) => {
    if (ocupado) return
    setOcupado(true)
    setError('')
    try {
      const { data, error: fallo } = await supabase.rpc('leer_archivos_aprobados_pagos', {
        p_convocatoria_id: convocatoriaId, p_rp_id: rpId,
      })
      if (fallo) throw fallo
      if (!data?.op?.datos || !data?.contabilidad?.datos) throw new Error('No se recibieron los archivos aprobados completos.')
      setSeleccion({ ...data, rpId })
      if (tipo) {
        const { data: alertas, error: falloAlertas } = await supabase.rpc('alertas_actualizaciones_rp', { p_rp_id: rpId })
        if (falloAlertas) throw falloAlertas
        if (!Array.isArray(alertas)) throw new Error('No se pudo verificar si hay cambios en las actualizaciones.')
        if (alertas.length && !window.confirm(`Hay ${alertas.length} cambios de estado en las actualizaciones del RP. Consulta el detalle de la alerta antes de continuar. ¿Descargar de todos modos?`)) return
      }
      if (tipo === 'op') await descargarExcelOP(data.op.filas, data.op.datos)
      if (tipo === 'contabilidad') await descargarExcelContabilizacionObligaciones(data.contabilidad.filas, data.contabilidad.datos)
    } catch (fallo) {
      setError(fallo.message || 'No se pudieron consultar los archivos aprobados.')
    } finally {
      setOcupado(false)
    }
  }

  const filtrados = (lista || []).filter((item) => [item.no_op, item.resolucion, item.rp_id]
    .some((valor) => String(valor || '').toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es'))))
  const paginas = Math.max(1, Math.ceil(filtrados.length / porPagina))
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><FileCheck2 size={21} aria-hidden="true" /> Archivos aprobados para Pagos</h2>
          <p className="mt-2 text-sm text-slate-600">Consulta y descarga el OP y su contabilización aprobada. Continúa después con el proceso SIAFE habitual.</p>
        </div>
        <button type="button" className={boton} disabled={ocupado} onClick={() => { setLista(null); setSeleccion(null); setError(''); setRevision((n) => n + 1) }}>
          <RefreshCw size={15} aria-hidden="true" /> Actualizar
        </button>
      </header>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!lista && !error && <p role="status" className="text-sm text-slate-500">Consultando archivos aprobados…</p>}
      {lista && <>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
          <Search size={16} aria-hidden="true" />
          <input type="search" aria-label="Buscar archivos aprobados" placeholder="Buscar por No. OP, resolución o referencia"
            className="min-h-11 w-full bg-transparent text-sm outline-none"
            value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(1) }} />
        </label>
        {!filtrados.length && <p className="py-4 text-sm text-slate-500">{lista.length ? 'Sin coincidencias para esta búsqueda.' : 'No hay contabilizaciones aprobadas en esta convocatoria. Los borradores no están disponibles para Pagos.'}</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {filtrados.slice((pagina - 1) * porPagina, pagina * porPagina).map((item) => (
            <article key={item.rp_id} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="font-bold text-slate-900">OP {item.no_op}</h3>
              <p className="text-xs text-slate-600">Resolución {item.resolucion || 'sin referencia'} · {item.cantidad} obligaciones · Aprobado el {new Date(item.aprobado_en).toLocaleDateString('es-CO')}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={boton} disabled={ocupado} onClick={() => abrir(item.rp_id)}>Consultar</button>
                <button type="button" className={boton} disabled={ocupado} onClick={() => abrir(item.rp_id, 'op')}><Download size={15} /> OP</button>
                <button type="button" className={boton} disabled={ocupado} onClick={() => abrir(item.rp_id, 'contabilidad')}><Download size={15} /> Contabilización</button>
              </div>
            </article>
          ))}
        </div>
        {paginas > 1 && <div className="flex items-center justify-between gap-2 text-xs">
          <button type="button" className={boton} disabled={pagina === 1} onClick={() => setPagina((n) => n - 1)}>Anterior</button>
          <span>Página {pagina} de {paginas}</span>
          <button type="button" className={boton} disabled={pagina === paginas} onClick={() => setPagina((n) => n + 1)}>Siguiente</button>
        </div>}
      </>}
      {seleccion && <div className="space-y-3 border-t border-slate-200 pt-4">
        <AlertasActualizacionesRP key={seleccion.rpId} rpId={seleccion.rpId} />
        <h3 className="font-bold text-slate-900">Consulta OP {seleccion.op.datos.no_op} · Solo lectura</h3>
        <p className="text-xs text-slate-600">Fecha OP: {seleccion.op.datos.fecha} · Débito: {seleccion.contabilidad.datos.cuenta_debito} · Crédito: {seleccion.contabilidad.datos.cuenta_credito}</p>
        <div role="region" aria-label="Obligaciones aprobadas para Pagos" tabIndex={0} className="max-h-96 overflow-auto">
          <table className="w-full min-w-[840px] text-left text-xs">
            <thead className="sticky top-0 bg-[#10233f] text-white"><tr>{['No. OP', 'Subconsecutivo', 'Descripción', 'No. RP', 'Entidad', 'Rubro', 'Fuente', 'Valor', 'Clase contable'].map((titulo) => <th key={titulo} scope="col" className="p-3">{titulo}</th>)}</tr></thead>
            <tbody>{seleccion.contabilidad.filas.map((fila, i) => {
              const op = seleccion.op.filas[i]
              return <tr key={fila.id} className="border-b border-slate-100">
                <td className="whitespace-nowrap p-3">{fila.no_obligacion}</td><td className="p-3">{fila.subconsecutivo}</td>
                <td className="min-w-72 p-3">{op.descripcion}</td><td className="whitespace-nowrap p-3">{op.no_rp}</td>
                <td className="p-3">{fila.codigo_entidad}</td><td className="p-3">{fila.rubro_presupuestal}</td>
                <td className="p-3">{fila.fuente_financiacion}</td><td className="p-3">{op.valor}</td><td className="p-3">{fila.clase}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
        <ConfirmacionEgresos key={seleccion.rpId} convocatoriaId={convocatoriaId} rpId={seleccion.rpId} />
      </div>}
    </section>
  )
}
