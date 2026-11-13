import { useState } from 'react'
import { Download, History, Pencil, Search, ShieldCheck } from 'lucide-react'
import { CAMPOS_TERCEROS, camposPendientesTercero, filaExportacionTercero, normalizarBusquedaTercero, terceroDesdeRegistro } from '../lib/tercerosCargue'
import { descargarExcelTerceros } from '../lib/exportarTerceros'
import { supabase } from '../lib/supabase'
import CorreccionTerceroPresupuesto from './CorreccionTerceroPresupuesto'

const ListaTercerosPresupuesto = ({ filas, documentoId, estado, editadoEn, onGuardado, onEdicionPendiente }) => {
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState(null)
  const [descargando, setDescargando] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [edicion, setEdicion] = useState(null)
  const [exito, setExito] = useState(null)
  const [historial, setHistorial] = useState(null)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [paginaHistorial, setPaginaHistorial] = useState(1)
  const puedeCorregir = estado === 'enviado_para_revision'
  const abrirCorreccion = (fila, campo) => {
    setEdicion({ fila, campo })
    setExito(null)
    onEdicionPendiente(true)
  }
  const cerrarCorreccion = () => {
    setEdicion(null)
    onEdicionPendiente(false)
  }
  const cargarHistorial = async () => {
    setError(null)
    setCargandoHistorial(true)
    try {
      const { data, error: errorHistorial } = await supabase.rpc('leer_correcciones_terceros', { p_documento_id: documentoId })
      if (errorHistorial) throw errorHistorial
      if (!Array.isArray(data)) throw new Error('No se pudo consultar el historial de correcciones.')
      setHistorial(data)
      setPaginaHistorial(1)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargandoHistorial(false)
    }
  }
  const termino = normalizarBusquedaTercero(busqueda)
  const filtradas = filas.filter((fila) => [...filaExportacionTercero(fila), fila.nombre_referencia].some((valor) => normalizarBusquedaTercero(valor).includes(termino)))
  const pendientes = filas.filter((fila) => camposPendientesTercero(fila).length > 0).length
  const paginas = Math.max(1, Math.ceil(filtradas.length / 25))
  const actual = Math.min(pagina, paginas)
  const descargar = async () => {
    setDescargando(true)
    setError(null)
    try {
      const { data, error: errorExportacion } = await supabase.rpc('obtener_terceros_exportacion', { p_documento_id: documentoId })
      if (errorExportacion) throw errorExportacion
      if (!Array.isArray(data)) throw new Error('No se recibió una lista válida para exportar.')
      await descargarExcelTerceros(data.map(terceroDesdeRegistro), `terceros-${documentoId}.xlsx`)
    } catch (err) {
      setError(err.message)
    } finally {
      setDescargando(false)
    }
  }
  return (
    <section aria-label="Lista de terceros para Presupuesto" className="min-w-0 space-y-5 text-slate-800">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Revisión de Presupuesto</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900">Terceros · Lista de importación</h2>
          <p className="mt-2 text-sm text-slate-600">{filas.length} registros · 22 columnas · {puedeCorregir ? 'Correcciones con trazabilidad' : 'Solo lectura'}</p>
        </div>
        <button type="button" onClick={descargar} disabled={Boolean(edicion) || descargando || !filas.length || pendientes > 0 || !['enviado_para_revision', 'aprobado', 'finalizado'].includes(estado)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">
          <Download size={17} />{descargando ? 'Preparando Excel…' : 'Descargar Excel (.xlsx)'}
        </button>
      </header>
      <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
        <ShieldCheck className="mt-1 shrink-0" size={18} />
        {puedeCorregir ? 'Pulsa una celda con lápiz para corregir sus datos con un motivo. Guardar o descargar no aprueba: usa Aprobar o Rechazar para continuar.' : 'Documento bloqueado para correcciones. Descargar no cambia su estado.'}
      </p>
      <p className="text-xs leading-5 text-slate-500">El Excel incluye todos los registros, sin aplicar la búsqueda. Banco se exporta por nombre; valida la primera importación con el programa de Presupuesto.</p>
      {pendientes > 0 && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{pendientes} ficha(s) requieren corrección o confirmación de nombres. {puedeCorregir ? 'Corrige la ficha completa o rechaza con observaciones para Educación.' : 'Los documentos aprobados/finalizados se conservan sin cambios; los borradores deben completarse en Educación.'} No se puede aprobar ni exportar incompleto.</p>}
      {error && <p role="alert" className="whitespace-pre-line rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {exito && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{exito}</p>}
      {edicion && <CorreccionTerceroPresupuesto key={edicion.fila.id} fila={edicion.fila} campoInicial={edicion.campo} documentoId={documentoId} editadoEn={editadoEn}
        onCancelar={cerrarCorreccion} onGuardado={(data) => {
          onGuardado(data)
          cerrarCorreccion()
          setHistorial(null)
          setExito('Corrección guardada y registrada en el historial. El documento sigue pendiente de aprobación.')
        }} />}
      <label className="flex max-w-lg items-center gap-2 rounded-xl border border-slate-300 px-3 text-slate-500">
        <Search size={17} />
        <input type="search" aria-label="Buscar en lista de terceros" placeholder="Buscar documento, nombre, banco…"
          value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(1) }}
          className="min-h-11 w-full min-w-0 bg-transparent text-sm text-slate-900 outline-none" />
      </label>
      <div role="region" aria-label="Tabla de importación de terceros" tabIndex={0} className="max-h-[65vh] overflow-auto rounded-xl border border-slate-200 focus-visible:outline-emerald-600">
        <table className="w-full border-separate border-spacing-0 text-left text-xs">
          <caption className="sr-only">22 columnas en el orden del archivo Excel. Desplázate horizontalmente para ver todos los campos.</caption>
          <thead><tr>{CAMPOS_TERCEROS.map((campo, i) => <th key={campo.name} scope="col" className={`sticky top-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-100 px-4 py-4 font-bold text-slate-700 ${i === 0 ? 'left-0 z-20' : ''}`}>{campo.label}</th>)}</tr></thead>
          <tbody>{filtradas.slice((actual - 1) * 25, actual * 25).map((fila) => (
            <tr key={fila.id} className={camposPendientesTercero(fila).length ? 'bg-amber-50' : 'bg-white'}>
              {filaExportacionTercero(fila).map((valor, i) => <td key={CAMPOS_TERCEROS[i].name} className={`min-w-36 max-w-xs whitespace-normal break-words border-b border-slate-100 px-4 py-3 leading-5 [overflow-wrap:anywhere] ${i === 0 ? 'sticky left-0 bg-inherit font-semibold' : ''}`}>
                {puedeCorregir && !CAMPOS_TERCEROS[i].readonly ? <button type="button" disabled={Boolean(edicion) || descargando}
                  aria-label={`Corregir ${CAMPOS_TERCEROS[i].label} de ${fila.cc_nit}`}
                  onClick={() => abrirCorreccion(fila, CAMPOS_TERCEROS[i].name)}
                  className="group flex min-h-10 w-full items-start justify-between gap-3 rounded-lg text-left hover:bg-emerald-50 focus-visible:outline-emerald-700 disabled:opacity-60">
                  <span>{valor || 'Completar…'}</span><Pencil size={13} className="mt-1 shrink-0 text-emerald-700" />
                </button> : valor || <span className="text-slate-400" aria-label="En blanco">—</span>}
              </td>)}
            </tr>
          ))}</tbody>
        </table>
        {!filtradas.length && <p className="p-8 text-sm text-slate-500">No hay registros que coincidan.</p>}
      </div>
      <section aria-label="Historial de correcciones" className="space-y-4 rounded-xl border border-slate-200 p-4">
        <button type="button" disabled={cargandoHistorial} onClick={() => historial ? setHistorial(null) : cargarHistorial()} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-800">
          <History size={17} />{cargandoHistorial ? 'Consultando historial…' : historial ? 'Ocultar historial de correcciones' : 'Ver historial de correcciones'}
        </button>
        {historial && <>
          {!historial.length && <p className="text-sm text-slate-500">Aún no hay correcciones de Presupuesto.</p>}
          <ol className="space-y-3">{historial.slice((paginaHistorial - 1) * 25, paginaHistorial * 25).map((cambio) => (
            <li key={cambio.id} className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm [overflow-wrap:anywhere]">
              <p className="font-semibold">{cambio.identificacion} · {CAMPOS_TERCEROS.find((campo) => campo.name === cambio.campo)?.label || (cambio.campo === 'nombres_confirmados' ? 'Confirmación de nombres' : cambio.campo)}</p>
              <dl className="grid gap-2 sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Antes</dt><dd className="whitespace-pre-wrap">{cambio.valor_anterior || 'En blanco'}</dd></div><div><dt className="text-xs text-slate-500">Después</dt><dd className="whitespace-pre-wrap font-medium text-emerald-900">{cambio.valor_nuevo || 'En blanco'}</dd></div></dl>
              <p className="whitespace-pre-wrap">Motivo: {cambio.motivo}</p>
              <p className="text-xs text-slate-500">{new Date(cambio.fecha).toLocaleString('es-CO')} · Usuario: {cambio.usuario_id}</p>
            </li>
          ))}</ol>
          {historial.length > 25 && <div className="flex items-center gap-4 text-xs">
            <button type="button" disabled={paginaHistorial === 1} onClick={() => setPaginaHistorial((p) => p - 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Historial anterior</button>
            <span>Página {paginaHistorial} de {Math.ceil(historial.length / 25)}</span>
            <button type="button" disabled={paginaHistorial * 25 >= historial.length} onClick={() => setPaginaHistorial((p) => p + 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Historial siguiente</button>
          </div>}
        </>}
      </section>
      <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
        <span>{filtradas.length} de {filas.length} · Página {actual} de {paginas}</span>
        <div className="flex gap-3">
          <button type="button" disabled={actual === 1} onClick={() => setPagina(actual - 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Anterior</button>
          <button type="button" disabled={actual === paginas} onClick={() => setPagina(actual + 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Siguiente</button>
        </div>
      </div>
    </section>
  )
}

export default ListaTercerosPresupuesto
