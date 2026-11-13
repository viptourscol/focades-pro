import { useState } from 'react'
import { Download, Search, ShieldCheck } from 'lucide-react'
import { CAMPOS_TERCEROS, camposPendientesTercero, filaExportacionTercero, normalizarBusquedaTercero, terceroDesdeRegistro } from '../lib/tercerosCargue'
import { descargarExcelTerceros } from '../lib/exportarTerceros'
import { supabase } from '../lib/supabase'

const ListaTercerosPresupuesto = ({ filas, documentoId, estado }) => {
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState(null)
  const [descargando, setDescargando] = useState(false)
  const [pagina, setPagina] = useState(1)
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
          <p className="mt-2 text-sm text-slate-600">{filas.length} registros · 22 columnas · Solo lectura</p>
        </div>
        <button type="button" onClick={descargar} disabled={descargando || !filas.length || pendientes > 0 || !['enviado_para_revision', 'aprobado', 'finalizado'].includes(estado)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">
          <Download size={17} />{descargando ? 'Preparando Excel…' : 'Descargar Excel (.xlsx)'}
        </button>
      </header>
      <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
        <ShieldCheck className="mt-1 shrink-0" size={18} />
        Descargar no aprueba el documento. Revisa los datos y usa Aprobar o Rechazar para continuar el proceso.
      </p>
      <p className="text-xs leading-5 text-slate-500">El Excel incluye todos los registros, sin aplicar la búsqueda. Banco se exporta por nombre; valida la primera importación con el programa de Presupuesto.</p>
      {pendientes > 0 && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{pendientes} ficha(s) requieren corrección o confirmación de nombres por Educación. {estado === 'enviado_para_revision' ? 'Rechaza el documento con el motivo para que lo completen.' : 'Los documentos aprobados/finalizados se conservan sin cambios; los borradores deben completarse en Educación.'} No se puede aprobar ni exportar incompleto.</p>}
      {error && <p role="alert" className="whitespace-pre-line rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
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
              {filaExportacionTercero(fila).map((valor, i) => <td key={CAMPOS_TERCEROS[i].name} className={`min-w-36 max-w-xs whitespace-normal break-words border-b border-slate-100 px-4 py-3 leading-5 [overflow-wrap:anywhere] ${i === 0 ? 'sticky left-0 bg-inherit font-semibold' : ''}`}>{valor || <span className="text-slate-400" aria-label="En blanco">—</span>}</td>)}
            </tr>
          ))}</tbody>
        </table>
        {!filtradas.length && <p className="p-8 text-sm text-slate-500">No hay registros que coincidan.</p>}
      </div>
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
