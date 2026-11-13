import { createElement, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { AlertCircle, ArrowRight, CheckCircle, ChevronLeft, ChevronRight, Clock, Download, FileCheck2, FileText, FolderOpen, Landmark, ListFilter, Plus, RefreshCw, Users, Wallet } from 'lucide-react'

const ESTADOS = {
  borrador: { label: 'Borrador', estilo: 'bg-slate-100 text-slate-600', punto: 'bg-slate-400' },
  enviado_para_revision: { label: 'En revisión', estilo: 'bg-amber-50 text-amber-800', punto: 'bg-amber-500' },
  aprobado: { label: 'Aprobado', estilo: 'bg-emerald-50 text-emerald-800', punto: 'bg-emerald-600' },
  rechazado: { label: 'Rechazado', estilo: 'bg-rose-50 text-rose-800', punto: 'bg-rose-500' },
  finalizado: { label: 'Finalizado', estilo: 'bg-sky-50 text-sky-800', punto: 'bg-sky-600' }
}
const TIPOS = {
  terceros: { label: 'TERCEROS', detalle: 'Creación de terceros', icono: Users, estilo: 'bg-emerald-50 text-emerald-800' },
  rp: { label: 'RP', detalle: 'Registro presupuestal', icono: Wallet, estilo: 'bg-sky-50 text-sky-800' },
  op: { label: 'OP', detalle: 'Orden de pago', icono: FileCheck2, estilo: 'bg-amber-50 text-amber-800' },
  contabilidad: { label: 'CONTABILIDAD', detalle: 'Asiento contable', icono: FileText, estilo: 'bg-slate-100 text-slate-700' },
  siafe: { label: 'SIAFE', detalle: 'Información de pagos', icono: Landmark, estilo: 'bg-teal-50 text-teal-800' }
}
const TIPOS_POR_ROL = {
  admin_educacion: ['terceros', 'rp'],
  admin_presupuesto: ['terceros', 'rp'],
  admin_contabilidad: ['op', 'contabilidad'],
  admin_pagos: ['siafe'],
  admin_visualizacion: []
}
const control = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus-visible:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-100'

const DocumentosCargueIndex = ({ onSelectDocumento, userRole, convocatoriaId }) => {
  const [documentos, setDocumentos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [paginaActual, setPaginaActual] = useState(1)
  const itemsPorPagina = 10
  const solicitudActual = useRef(0)

  const cargarDocumentos = useCallback(() => {
    const solicitud = ++solicitudActual.current
    return supabase.auth.getSession().then(async ({ data: { session }, error: authError }) => {
      if (solicitud !== solicitudActual.current) return
      setCargando(true)
      setError(null)
      if (authError || !session) throw new Error('No autorizado')
      const { data, error: queryError } = await supabase.functions.invoke('obtener-documentos-por-rol', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { convocatoria_id: convocatoriaId }
      })
      if (solicitud !== solicitudActual.current) return
      if (queryError) throw queryError
      if (!data?.success || !Array.isArray(data.documentos)) throw new Error(data?.error || 'No se recibió una lista válida de documentos')
      setDocumentos(data.documentos)
      setPaginaActual(1)
    }).catch((err) => {
      if (solicitud === solicitudActual.current) {
        setDocumentos([])
        setError(err.message)
      }
    }).finally(() => {
      if (solicitud === solicitudActual.current) setCargando(false)
    })
  }, [convocatoriaId])

  useEffect(() => {
    cargarDocumentos()
    return () => { solicitudActual.current += 1 }
  }, [cargarDocumentos, userRole])

  const documentosFiltrados = documentos.filter((doc) =>
    (!filtroEstado || doc.estado === filtroEstado) && (!filtroTipo || doc.tipo_documento === filtroTipo))
  const documentosPaginados = documentosFiltrados.slice((paginaActual - 1) * itemsPorPagina, paginaActual * itemsPorPagina)
  const totalPaginas = Math.max(1, Math.ceil(documentosFiltrados.length / itemsPorPagina))
  const tiposParaRol = TIPOS_POR_ROL[userRole] || []
  const metricas = [
    { estado: '', label: 'Documentos totales', icono: FolderOpen, color: 'text-slate-700' },
    { estado: 'enviado_para_revision', label: 'En revisión', icono: Clock, color: 'text-amber-700' },
    { estado: 'aprobado', label: 'Aprobados', icono: CheckCircle, color: 'text-emerald-700' },
    { estado: 'borrador', label: 'Borradores', icono: FileText, color: 'text-slate-500' }
  ]
  const cambiarEstado = (estado) => {
    setFiltroEstado(estado)
    setPaginaActual(1)
  }
  return (
    <section aria-label="Bandeja de documentos" className="min-w-0 space-y-6">
      <div aria-label="Resumen de documentos de la convocatoria" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metricas.map((metrica) => (
          <button key={metrica.label} type="button" onClick={() => cambiarEstado(metrica.estado)} disabled={cargando || Boolean(error)}
            aria-pressed={filtroEstado === metrica.estado} aria-label={`Filtrar: ${metrica.label}`}
            className={`min-w-0 rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed sm:p-5 ${filtroEstado === metrica.estado ? 'border-emerald-700 bg-emerald-50/60 ring-1 ring-emerald-700' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
            <span className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">{metrica.label}{createElement(metrica.icono, { size: 17, className: metrica.color, 'aria-hidden': true })}</span>
            <span className={`mt-3 block text-3xl font-bold tabular-nums tracking-tight ${metrica.color}`}>{cargando || error ? '—' : metrica.estado ? documentos.filter((doc) => doc.estado === metrica.estado).length : documentos.length}</span>
            <span className="mt-1 block text-[10px] text-slate-500">En esta convocatoria</span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-6">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Bandeja de documentos</h2>
              {!cargando && !error && <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold tabular-nums text-slate-600">{documentosFiltrados.length}</span>}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">Consulta el estado y abre un documento para continuar su gestión.</p>
          </div>
          {userRole === 'admin_educacion' && <button type="button" onClick={() => onSelectDocumento('nuevo')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
            <Plus size={17} aria-hidden="true" />Nuevo Documento
          </button>}
        </header>

        <div className="grid gap-3 border-y border-slate-100 bg-slate-50/70 px-5 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:px-6">
          <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span className="flex items-center gap-1.5"><ListFilter size={12} aria-hidden="true" />Tipo de documento</span>
            <select aria-label="Filtrar por tipo de documento" value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value); setPaginaActual(1) }} className={control}>
              <option value="">Todos los tipos</option>
              {tiposParaRol.map((tipo) => <option key={tipo} value={tipo}>{TIPOS[tipo].label}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span>Estado del documento</span>
            <select aria-label="Filtrar por estado del documento" value={filtroEstado} onChange={(e) => cambiarEstado(e.target.value)} className={control}>
              <option value="">Todos los estados</option>
              {Object.entries(ESTADOS).map(([estado, config]) => <option key={estado} value={estado}>{config.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={cargarDocumentos} disabled={cargando} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-emerald-700 disabled:opacity-50">
            <RefreshCw size={15} aria-hidden="true" className={cargando ? 'animate-spin' : ''} />{cargando ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        {error ? <div role="alert" className="m-5 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle size={19} className="shrink-0" aria-hidden="true" /><p>{error}</p></div> :
          cargando ? <div role="status" className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm text-slate-500"><RefreshCw size={24} className="animate-spin text-emerald-700" aria-hidden="true" />Consultando documentos…</div> :
            !documentosPaginados.length ? <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
              <span className="mb-4 rounded-2xl bg-slate-50 p-4"><FolderOpen size={30} className="text-slate-400" aria-hidden="true" /></span>
              <h3 className="text-sm font-bold text-slate-800">{documentos.length ? 'Sin coincidencias' : 'Esta convocatoria aún no tiene documentos'}</h3>
              <p className="mt-2 max-w-sm text-xs leading-6 text-slate-500">{documentos.length ? 'Prueba otro tipo o estado para encontrar el documento que necesitas.' : userRole === 'admin_educacion' ? 'Crea el primer documento para comenzar el proceso.' : 'Aquí aparecerán los documentos disponibles para tu rol.'}</p>
              {(filtroTipo || filtroEstado) && <button type="button" onClick={() => { setFiltroTipo(''); cambiarEstado('') }} className="mt-4 min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-emerald-800">Limpiar filtros</button>}
            </div> : <div role="region" aria-label="Listado de documentos" tabIndex={0} className="overflow-x-auto focus-visible:outline-emerald-700">
              <table className="w-full min-w-[720px] text-left">
                <caption className="sr-only">Documentos de la convocatoria seleccionada. Usa Abrir documento para ver su información y acciones.</caption>
                <thead className="border-b border-slate-100 bg-slate-50/40 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  <tr>{['Documento', 'Estado', 'Registros', 'Versión', 'Creado', 'Acciones'].map((titulo) => <th key={titulo} scope="col" className="px-5 py-3.5 font-semibold sm:px-6">{titulo}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documentosPaginados.map((doc) => {
                    const tipo = TIPOS[doc.tipo_documento] || { label: doc.tipo_documento, detalle: 'Documento', icono: FileText, estilo: 'bg-slate-100 text-slate-700' }
                    const estado = ESTADOS[doc.estado] || { label: doc.estado, estilo: 'bg-slate-100 text-slate-600', punto: 'bg-slate-400' }
                    return <tr key={doc.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-5 py-4 sm:px-6"><div className="flex items-center gap-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tipo.estilo}`}>{createElement(tipo.icono, { size: 19, 'aria-hidden': true })}</span>
                        <div><p className="text-xs font-bold tracking-wide text-slate-800">{tipo.label}</p><p className="mt-1 whitespace-nowrap text-[10px] text-slate-500">{tipo.detalle}</p></div>
                      </div></td>
                      <td className="px-5 py-4 sm:px-6"><span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${estado.estilo}`}><span className={`h-1.5 w-1.5 rounded-full ${estado.punto}`} />{estado.label}</span></td>
                      <td className="px-5 py-4 text-sm font-semibold tabular-nums text-slate-700 sm:px-6">{doc.cantidad_registros ?? 0}</td>
                      <td className="px-5 py-4 text-xs tabular-nums text-slate-500 sm:px-6">v{doc.version}</td>
                      <td className="px-5 py-4 sm:px-6"><time dateTime={doc.creado_en} className="whitespace-nowrap text-xs text-slate-600">{new Date(doc.creado_en).toLocaleDateString('es-CO', { month: 'short', day: 'numeric', year: 'numeric' })}<span className="mt-1 block text-[10px] text-slate-400">{new Date(doc.creado_en).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span></time></td>
                      <td className="px-5 py-4 sm:px-6"><div className="flex items-center gap-2">
                        <button type="button" onClick={() => onSelectDocumento(doc.id, doc.tipo_documento)} title="Ver detalles" aria-label={`Abrir documento ${tipo.label} ${String(doc.id).slice(0, 8)}`}
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-emerald-700 hover:text-emerald-800 focus-visible:outline-emerald-700">Abrir<ArrowRight size={14} aria-hidden="true" /></button>
                        {doc.archivo_url && <a href={doc.archivo_url} download title="Descargar archivo" aria-label={`Descargar archivo ${tipo.label} ${String(doc.id).slice(0, 8)}`} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200 text-emerald-800 hover:bg-emerald-50"><Download size={16} aria-hidden="true" /></a>}
                      </div></td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>}
        {!cargando && !error && <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-xs text-slate-500 sm:px-6">
          <p aria-live="polite">{documentosFiltrados.length ? `${(paginaActual - 1) * itemsPorPagina + 1}–${Math.min(paginaActual * itemsPorPagina, documentosFiltrados.length)} de ${documentosFiltrados.length}` : '0 resultados'}<span className="hidden sm:inline"> · {documentos.length} en la convocatoria</span></p>
          {totalPaginas > 1 && <div className="flex items-center gap-3">
            <button type="button" onClick={() => setPaginaActual((p) => Math.max(1, p - 1))} disabled={paginaActual === 1} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-slate-700 disabled:opacity-40"><ChevronLeft size={14} aria-hidden="true" />Anterior</button>
            <span className="tabular-nums">{paginaActual} / {totalPaginas}</span>
            <button type="button" onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-slate-700 disabled:opacity-40">Siguiente<ChevronRight size={14} aria-hidden="true" /></button>
          </div>}
        </footer>}
      </div>
    </section>
  )
}

export default DocumentosCargueIndex
