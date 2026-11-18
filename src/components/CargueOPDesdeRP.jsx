import { useEffect, useState } from 'react'
import { Download, FileCheck2, RefreshCw, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { COLUMNAS_OP, descargarExcelOP, numeroOP } from '../lib/exportarOP'
import { fechaFilaDesdeISO } from '../lib/rpCargue'

const control = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus-visible:outline-emerald-700 disabled:opacity-60'
const boton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-50'

export default function CargueOPDesdeRP({ convocatoriaId }) {
  const [lista, setLista] = useState(null)
  const [rpId, setRpId] = useState('')
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    supabase.rpc('listar_rp_para_op', { p_convocatoria_id: convocatoriaId }).then(({ data, error }) => {
      if (error) throw error
      if (activo) setLista(data)
    }).catch((fallo) => { if (activo) setError(fallo.message) })
    return () => { activo = false }
  }, [convocatoriaId, revision])

  const rp = lista?.find(({ id }) => id === rpId)
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
          onClick={() => { setError(''); setLista(null); setRevision((n) => n + 1) }}>
          <RefreshCw size={15} aria-hidden="true" /> Actualizar RP
        </button>
      </header>
      <div className="space-y-4 p-5 sm:px-6">
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {!lista && !error && <p role="status" className="text-sm text-slate-500">Consultando RP aprobados…</p>}
        {lista?.length === 0 && <p className="text-sm text-slate-600">No hay RP aprobados por Presupuesto en esta convocatoria.</p>}
        {lista?.length > 0 && <label className="block space-y-1 text-sm font-semibold text-slate-700">
          <span>RP aprobado de origen</span>
          <select className={control} value={rpId} onChange={(e) => setRpId(e.target.value)}>
            <option value="">Selecciona un RP…</option>
            {lista.map(({ id, resolucion, aprobado_en, cantidad, preparado }) => <option key={id} value={id}>
              {resolucion ? `Resolución ${resolucion}` : 'RP'} · {id.slice(0, 8)} · {aprobado_en ? new Date(aprobado_en).toLocaleDateString('es-CO') : 'Sin fecha de aprobación'} · {cantidad ?? 0} registros{preparado ? ' · OP guardada' : ''}
            </option>)}
          </select>
        </label>}
        {rp && <FormularioOP key={rp.id} rp={rp} convocatoriaId={convocatoriaId}
          onGuardado={() => setLista((actual) => actual?.map((item) => item.id === rp.id ? { ...item, preparado: true } : item) ?? null)} />}
      </div>
    </section>
  )
}

function FormularioOP({ rp, convocatoriaId, onGuardado }) {
  const [origen, setOrigen] = useState(null)
  const [datos, setDatos] = useState({ fecha: '', no_op: '', subconsecutivo: '', opcionales: {} })
  const [editadoEn, setEditadoEn] = useState(null)
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
      setModificado(false)
    }).catch((fallo) => { if (activo) setError(fallo.message) })
    return () => { activo = false }
  }, [convocatoriaId, rp.id, revision])

  const ultimo = origen ? numeroOP(datos.no_op, origen.length - 1) : ''
  const fecha = fechaFilaDesdeISO(datos.fecha)
  const preparado = Boolean(origen && fecha && ultimo && /^[0-9]{0,4}$/.test(datos.subconsecutivo))

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
        setModificado(false)
        onGuardado()
        setMensaje('Archivo OP guardado. Ya puedes descargar el Excel.')
      }
    } catch (fallo) {
      setError(fallo.message)
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
    <form className="space-y-4 border-t border-slate-100 pt-4" onSubmit={(e) => { e.preventDefault(); if (!ocupado && preparado) ejecutar(false) }}>
      {alertas}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm font-semibold text-slate-700"><span>Fecha para todas las filas</span>
          <input className={control} type="date" value={datos.fecha} onChange={(e) => editar('fecha', e.target.value)} required disabled={ocupado} />
        </label>
        <label className="space-y-1 text-sm font-semibold text-slate-700"><span>No. OP inicial</span>
          <input className={control} inputMode="numeric" pattern="[0-9]{1,10}" maxLength={10} value={datos.no_op} onChange={(e) => editar('no_op', e.target.value)} required disabled={ocupado} />
        </label>
        <label className="space-y-1 text-sm font-semibold text-slate-700"><span>SubConsecutivo OP (opcional)</span>
          <input className={control} inputMode="numeric" pattern="[0-9]{0,4}" maxLength={4} value={datos.subconsecutivo} onChange={(e) => editar('subconsecutivo', e.target.value)} disabled={ocupado} />
        </label>
      </div>
      <p className="rounded-lg bg-slate-50 p-3 text-sm tabular-nums text-slate-700">
        {origen.length} filas · {ultimo ? `OP ${datos.no_op} a ${ultimo}` : 'Ingresa un No. OP inicial cuyo rango no supere 10 dígitos'}
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
                  aria-label={`${titulo}, fila ${i + 1}`} disabled={ocupado} value={datos.opcionales[fila.id]?.[campo] || ''}
                  onChange={(e) => editar('opcionales', { ...datos.opcionales, [fila.id]: { estado: '', clase: '', ...datos.opcionales[fila.id], [campo]: e.target.value } })} />
                  : campo === 'no_op' ? numeroOP(datos.no_op, i) : campo === 'fecha' ? fecha : campo === 'subconsecutivo' ? datos.subconsecutivo : fila[campo]}
              </td>
            ))}</tr>)}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Estado y Clase pueden quedar vacíos. Verifica los códigos de entidad, rubro y fuente en el sistema receptor antes de importar.</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={`${boton} border-emerald-800 bg-emerald-800 text-white`} disabled={ocupado || !preparado || (!modificado && !!editadoEn)}><Save size={16} aria-hidden="true" /> Guardar OP</button>
        <button type="button" className={`${boton} text-emerald-800`} disabled={ocupado || !editadoEn || modificado} onClick={() => ejecutar(true)}><Download size={16} aria-hidden="true" /> Descargar Excel</button>
        {error && recargar}
      </div>
    </form>
  )
}
