import { useEffect, useState } from 'react'
import { BadgeCheck, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, FileCheck2, RefreshCw, Save, Search } from 'lucide-react'
import { showConfirmAlert } from '../lib/alerts'
import { supabase } from '../lib/supabase'
import { COLUMNAS_OP, descargarExcelOP, numeroOP } from '../lib/exportarOP'
import { fechaFilaDesdeISO } from '../lib/rpCargue'
import CargueContabilizacionObligaciones from './CargueContabilizacionObligaciones'

const control = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus-visible:outline-emerald-700 disabled:opacity-60'
const boton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-50'

export default function CargueOPDesdeRP({ convocatoriaId }) {
  const [lista, setLista] = useState(null)
  const [rpId, setRpId] = useState('')
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const porPagina = 6

  useEffect(() => {
    let activo = true
    supabase.rpc('listar_rp_para_op', { p_convocatoria_id: convocatoriaId }).then(({ data, error }) => {
      if (error) throw error
      if (activo) {
        setLista(data)
        setPagina(1)
        setError('')
      }
    }).catch((fallo) => { if (activo) setError(fallo.message) })
    return () => { activo = false }
  }, [convocatoriaId, revision])

  const rp = lista?.find(({ id }) => id === rpId)
  const rpsFiltrados = (lista || []).filter((documento) => [
    documento.numero_rp, documento.resolucion, documento.id,
  ].some((valor) => String(valor || '').toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es'))))
  const paginas = Math.max(1, Math.ceil(rpsFiltrados.length / porPagina))
  const rpsVisibles = rpsFiltrados.slice((pagina - 1) * porPagina, pagina * porPagina)

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-900/10 bg-emerald-50/60 p-5 sm:px-6">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-emerald-800"><FileCheck2 size={15} aria-hidden="true" /> Presupuesto a Contabilidad</p>
          <h2 className="text-xl font-bold text-slate-900">Órdenes de pago desde RP aprobados</h2>
          <p className="mt-1 text-sm text-slate-600">Selecciona un RP de esta convocatoria para preparar su archivo de cargue.</p>
        </div>
        <button type="button" className={`${boton} bg-white text-slate-700`}
          disabled={!lista && !error}
          onClick={() => { setError(''); setRevision((n) => n + 1) }}>
          <RefreshCw size={15} aria-hidden="true" /> Actualizar RP
        </button>
      </header>
      <div className="space-y-4 p-5 sm:px-6">
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {!lista && !error && <p role="status" className="text-sm text-slate-500">Consultando RP aprobados…</p>}
        {lista?.length === 0 && <p className="text-sm text-slate-600">No hay RP aprobados por Presupuesto en esta convocatoria.</p>}
        {lista?.length > 0 && <>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="space-y-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <span>Buscar entre {lista.length} RP aprobados</span>
              <span className="relative block">
                <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className={`${control} pl-9 font-normal normal-case tracking-normal`} type="search" value={busqueda}
                  onChange={(e) => { setBusqueda(e.target.value); setPagina(1) }}
                  placeholder="No. RP, resolución o referencia" />
              </span>
            </label>
            <p className="text-xs text-slate-500">{rpsFiltrados.length} resultados · más recientes primero</p>
          </div>
          {rpsVisibles.length > 0 ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {rpsVisibles.map((documento) => {
              const seleccionado = documento.id === rpId
              const aprobado = documento.estado_op === 'aprobado'
              const Icono = aprobado ? BadgeCheck : documento.preparado ? Clock3 : FileCheck2
              return <button key={documento.id} type="button" onClick={() => { setRpId(documento.id); setError('') }}
                aria-pressed={seleccionado}
                className={`min-w-0 rounded-xl border p-3.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${seleccionado ? 'border-emerald-700 bg-emerald-50 ring-1 ring-emerald-700' : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50'}`}>
                <span className="flex items-start gap-3">
                  <span className={`mt-0.5 rounded-lg p-2 ${aprobado ? 'bg-emerald-100 text-emerald-800' : documento.preparado ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}><Icono size={17} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-slate-900">{documento.numero_rp || (documento.resolucion ? `Resolución ${documento.resolucion}` : `RP ${documento.id.slice(0, 8)}`)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${aprobado ? 'bg-emerald-100 text-emerald-800' : documento.preparado ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>
                        {aprobado ? 'OP aprobado' : documento.preparado ? 'OP guardado' : 'Sin OP'}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-600">{documento.resolucion ? `Resolución ${documento.resolucion}` : `RP ${documento.id.slice(0, 8)}`}</span>
                    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                      <span>{documento.cantidad ?? 0} filas</span>
                      <span>{documento.aprobado_en ? new Date(documento.aprobado_en).toLocaleDateString('es-CO') : 'Fecha sin registro'}</span>
                    </span>
                  </span>
                </span>
              </button>
            })}
          </div> : <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No hay RP que coincidan con esa búsqueda.</p>}
          {paginas > 1 && <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <p className="text-xs tabular-nums text-slate-500">Página {pagina} de {paginas}</p>
            <div className="flex gap-2">
              <button type="button" className={boton} onClick={() => setPagina((actual) => Math.max(1, actual - 1))} disabled={pagina === 1}><ChevronLeft size={15} /> Anterior</button>
              <button type="button" className={boton} onClick={() => setPagina((actual) => Math.min(paginas, actual + 1))} disabled={pagina === paginas}>Siguiente <ChevronRight size={15} /></button>
            </div>
          </div>}
        </>}
        {rp && <FormularioOP key={rp.id} rp={rp} convocatoriaId={convocatoriaId}
          onActualizado={(cambios) => setLista((actual) => actual?.map((item) => item.id === rp.id ? { ...item, ...cambios, preparado: true } : item) ?? null)} />}
      </div>
    </section>
  )
}

function FormularioOP({ rp, convocatoriaId, onActualizado }) {
  const [origen, setOrigen] = useState(null)
  const [datos, setDatos] = useState({ fecha: '', no_op: '', subconsecutivo: '', opcionales: {} })
  const [editadoEn, setEditadoEn] = useState(null)
  const [estadoOP, setEstadoOP] = useState('sin_guardar')
  const [aprobadoEn, setAprobadoEn] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [modificado, setModificado] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let activo = true
    supabase.rpc('leer_op_desde_rp', { p_convocatoria_id: convocatoriaId, p_rp_id: rp.id }).then(({ data, error }) => {
      if (error) throw error
      if (!activo) return
      setOrigen(data.filas)
      setDatos(data.datos || { fecha: '', no_op: '', subconsecutivo: '', opcionales: {} })
      setEditadoEn(data.editado_en)
      setEstadoOP(data.estado_op || 'sin_guardar')
      setAprobadoEn(data.op_aprobado_en)
      setModificado(false)
    }).catch((fallo) => { if (activo) setError(fallo.message) })
    return () => { activo = false }
  }, [convocatoriaId, rp.id, revision])

  const ultimo = origen ? numeroOP(datos.no_op, origen.length - 1) : ''
  const fecha = fechaFilaDesdeISO(datos.fecha)
  const preparado = Boolean(origen && fecha && ultimo && /^[0-9]{0,4}$/.test(datos.subconsecutivo))
  const aprobado = estadoOP === 'aprobado'
  const bloqueado = ocupado || aprobado

  const editar = (campo, valor) => {
    setDatos((actual) => ({ ...actual, [campo]: valor }))
    setModificado(true)
    setMensaje('')
    setError('')
  }
  const ejecutar = async (descargar) => {
    setOcupado(true)
    setError('')
    setMensaje('')
    try {
      if (descargar) {
        const { data, error } = await supabase.rpc('leer_op_desde_rp', { p_convocatoria_id: convocatoriaId, p_rp_id: rp.id })
        if (error) throw error
        if (data.editado_en !== editadoEn) throw new Error('El archivo OP cambió. Recarga los datos guardados antes de descargar.')
        await descargarExcelOP(data.filas, data.datos)
        setMensaje('CargueInformacionOP.xlsx descargado.')
      } else {
        const { data, error } = await supabase.rpc('guardar_op_desde_rp', {
          p_convocatoria_id: convocatoriaId, p_rp_id: rp.id, p_fecha: datos.fecha,
          p_no_op: datos.no_op, p_subconsecutivo: datos.subconsecutivo,
          p_opcionales: datos.opcionales, p_editado_en: editadoEn,
        })
        if (error) throw error
        setEditadoEn(data)
        setEstadoOP('borrador')
        setAprobadoEn(null)
        setModificado(false)
        onActualizado({ estado_op: 'borrador', preparado: true, op_aprobado_en: null })
        setMensaje('Archivo OP guardado. Ya puedes descargar el Excel.')
      }
    } catch (fallo) {
      setError(fallo.message)
    } finally {
      setOcupado(false)
    }
  }

  const aprobar = async () => {
    if (!editadoEn || modificado || ocupado || aprobado) return
    const confirmado = await showConfirmAlert({
      title: '¿Aprobar el Cargue de Información OP?',
      text: 'Después de aprobarlo no podrás editarlo. La aprobación habilitará el CargueContabilizacionObligaciones.',
      confirmButtonText: 'Aprobar OP',
      cancelButtonText: 'Revisar de nuevo',
    })
    if (!confirmado) return
    setOcupado(true)
    setError('')
    setMensaje('')
    try {
      const { data, error: fallo } = await supabase.rpc('aprobar_op_desde_rp', {
        p_convocatoria_id: convocatoriaId,
        p_rp_id: rp.id,
        p_editado_en: editadoEn,
      })
      if (fallo) throw fallo
      if (!data?.ok || data.estado_op !== 'aprobado') throw new Error('No se confirmó la aprobación del OP.')
      setEstadoOP('aprobado')
      setAprobadoEn(data.aprobado_en)
      onActualizado({ estado_op: 'aprobado', preparado: true, op_aprobado_en: data.aprobado_en })
      setMensaje('OP aprobado. Ya puedes continuar con la contabilización de obligaciones.')
    } catch (fallo) {
      setError(fallo.message || 'No se pudo aprobar el OP.')
    } finally {
      setOcupado(false)
    }
  }

  const alertas = <>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {mensaje && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{mensaje}</p>}
  </>
  const recargar = <button type="button" className={boton} disabled={ocupado} onClick={() => {
    setError(''); setOrigen(null); setRevision((n) => n + 1)
  }}>Recargar datos guardados</button>
  if (!origen) return error ? <div className="space-y-2">{alertas}{recargar}</div> : <p role="status" className="text-sm text-slate-500">Consultando filas del RP…</p>

  return (
    <div className="space-y-4 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">{aprobado ? 'Cargue OP aprobado' : 'Preparar Cargue de Información OP'}</h3>
          <p className="mt-1 text-xs text-slate-500">{aprobado ? 'Este archivo está cerrado para edición.' : 'Completa los datos comunes y revisa la vista previa antes de aprobar.'}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${aprobado ? 'bg-emerald-100 text-emerald-900' : editadoEn ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>
          {aprobado ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
          {aprobado ? `Aprobado${aprobadoEn ? ` · ${new Date(aprobadoEn).toLocaleDateString('es-CO')}` : ''}` : editadoEn ? 'Guardado · pendiente de aprobación' : 'Borrador'}
        </span>
      </div>
      {alertas}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm font-semibold text-slate-700"><span>Fecha para todas las filas</span>
          <input className={control} type="date" value={datos.fecha} onChange={(e) => editar('fecha', e.target.value)} required disabled={bloqueado} />
        </label>
        <label className="space-y-1 text-sm font-semibold text-slate-700"><span>No. OP inicial</span>
          <input className={control} type="text" inputMode="text" pattern="([A-Za-z0-9]+([.-][A-Za-z0-9]+)*[.-])?[0-9]{1,10}" maxLength={30} title="Usa solo dígitos o un formato como 2026.ALC.01.001249" placeholder="2026.ALC.01.001249" value={datos.no_op} onChange={(e) => editar('no_op', e.target.value.trim())} required disabled={bloqueado} />
        </label>
        <label className="space-y-1 text-sm font-semibold text-slate-700"><span>SubConsecutivo OP (opcional)</span>
          <input className={control} inputMode="numeric" pattern="[0-9]{0,4}" maxLength={4} value={datos.subconsecutivo} onChange={(e) => editar('subconsecutivo', e.target.value)} disabled={bloqueado} />
        </label>
      </div>
      <p className="rounded-lg bg-slate-50 p-3 text-sm tabular-nums text-slate-700">
        {origen.length} filas · {ultimo ? `OP ${datos.no_op} a ${ultimo}` : 'Ingresa un consecutivo válido, por ejemplo 2026.ALC.01.001249'}
        {fecha && ` · Fecha en Excel: ${fecha}`}
      </p>
      <div role="region" aria-label="Vista previa del cargue OP" tabIndex={0} className="max-h-96 overflow-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-100 text-slate-700">
            <tr>{COLUMNAS_OP.map(([campo, titulo]) => <th key={campo} scope="col" className="whitespace-nowrap px-3 py-2">{titulo}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {origen.map((fila, i) => <tr key={fila.id}>{COLUMNAS_OP.map(([campo, titulo]) => (
              <td key={campo} className={`${campo === 'descripcion' ? 'min-w-72' : 'whitespace-nowrap'} px-3 py-2 text-slate-700`}>
                {campo === 'estado' || campo === 'clase' ? <input className={`${control} min-w-28`} maxLength={32767}
                  aria-label={`${titulo}, fila ${i + 1}`} disabled={bloqueado} value={datos.opcionales[fila.id]?.[campo] || ''}
                  onChange={(e) => editar('opcionales', { ...datos.opcionales, [fila.id]: { estado: '', clase: '', ...datos.opcionales[fila.id], [campo]: e.target.value } })} />
                  : campo === 'no_op' ? numeroOP(datos.no_op, i) : campo === 'fecha' ? fecha : campo === 'subconsecutivo' ? datos.subconsecutivo : fila[campo]}
              </td>
            ))}</tr>)}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Estado y Clase pueden quedar vacíos. Verifica los códigos de entidad, rubro y fuente en el sistema receptor antes de importar.</p>
      <div className="flex flex-wrap gap-2">
        {!aprobado && <button type="button" className={`${boton} border-emerald-800 bg-emerald-800 text-white`} disabled={ocupado || !preparado || (!modificado && !!editadoEn)} onClick={() => ejecutar(false)}><Save size={16} aria-hidden="true" /> Guardar OP</button>}
        {!aprobado && editadoEn && <button type="button" className={`${boton} border-sky-800 bg-sky-800 text-white`} disabled={ocupado || modificado} onClick={aprobar}><CheckCircle2 size={16} aria-hidden="true" /> Aprobar OP</button>}
        <button type="button" className={`${boton} text-emerald-800`} disabled={ocupado || !editadoEn || modificado} onClick={() => ejecutar(true)}><Download size={16} aria-hidden="true" /> Descargar Excel</button>
        {error && recargar}
      </div>
      {aprobado && <CargueContabilizacionObligaciones convocatoriaId={convocatoriaId} rpId={rp.id} aprobadoEn={aprobadoEn} />}
    </div>
  )
}
