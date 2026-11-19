import { useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'

const boton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50'
const campo = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-emerald-700'

export function AlertasActualizacionesRP({ rpId }) {
  const [alertas, setAlertas] = useState(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let activo = true
    supabase.rpc('alertas_actualizaciones_rp', { p_rp_id: rpId }).then(({ data, error: fallo }) => {
      if (fallo) throw fallo
      if (!Array.isArray(data)) throw new Error('Respuesta inválida al consultar alertas.')
      if (activo) { setAlertas(data); setError('') }
    }).catch((fallo) => { if (activo) setError(fallo.message) })
    return () => { activo = false }
  }, [rpId, revision])
  const actualizar = () => { setAlertas(null); setError(''); setRevision((n) => n + 1) }
  if (error) return <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"><p>No se pudieron consultar los cambios de actualización: {error}</p><button type="button" className={boton} onClick={actualizar}>Reintentar</button></div>
  if (!alertas) return <p role="status" className="text-xs text-slate-500">Consultando cambios de actualización…</p>
  if (!alertas.length) return <div className="flex items-center gap-3 text-xs text-slate-500"><span>Sin cambios de actualización registrados.</span><button type="button" className={boton} onClick={actualizar}><RefreshCw size={14} />Actualizar alertas</button></div>
  return <section role="status" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
    <h3 className="flex items-center gap-2 font-bold"><AlertTriangle size={18} />Cambios posteriores en actualizaciones</h3>
    <p className="text-xs leading-5">Revísalos antes de continuar. Son informativos y no modifican los archivos aprobados.</p>
    <button type="button" className={boton} onClick={actualizar}><RefreshCw size={14} />Actualizar alertas</button>
    <ul className="max-h-48 space-y-1 overflow-auto text-xs">{alertas.map((a, i) => <li key={`${a.actualizacion_id}-${a.fecha}-${i}`}>
      {a.beneficiario} · {a.identificacion}: {a.estado_anterior} → {a.estado_nuevo} ({new Date(a.fecha).toLocaleString('es-CO')}). Estado actual: {a.estado_actual}.
    </li>)}</ul>
  </section>
}

export default function ActualizacionesRP({ documento, pendiente, ocupadoEditor, onIncorporado, onProcesando }) {
  const [personas, setPersonas] = useState(null)
  const [seleccion, setSeleccion] = useState([])
  const [suenos, setSuenos] = useState('')
  const [merito, setMerito] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let activo = true
    supabase.rpc('listar_actualizaciones_rp', { p_documento_id: documento.id }).then(({ data, error: fallo }) => {
      if (fallo) throw fallo
      if (!Array.isArray(data)) throw new Error('La lista de actualizaciones no es válida.')
      if (activo) { setPersonas(data); setSeleccion(data.filter((p) => p.valido).map((p) => p.id)); setError('') }
    }).catch((fallo) => { if (activo) setError(fallo.message) })
    return () => { activo = false }
  }, [documento.id, revision])
  const visibles = (personas || []).filter((p) => `${p.nombre} ${p.identificacion}`.toLocaleLowerCase('es').includes(busqueda.toLocaleLowerCase('es')))
  const elegidas = (personas || []).filter((p) => seleccion.includes(p.id))
  const incorporar = async () => {
    if (pendiente || ocupadoEditor) { setError('Guarda o descarta los cambios del editor antes de incorporar personas.'); return }
    const duplicadas = elegidas.filter((p) => p.anteriores.length)
    if (duplicadas.length && !window.confirm(`${duplicadas.length} personas ya aparecen en otros RP, incluidos rechazados. Revisa las referencias y estados mostrados. ¿Confirmas incorporarlas nuevamente?`)) return
    if (!window.confirm(`Se incorporarán ${elegidas.length} personas al borrador. ¿Confirmas?`)) return
    setOcupado(true); onProcesando(true); setError('')
    try {
      const { data, error: fallo } = await supabase.rpc('incorporar_actualizaciones_rp', {
        p_documento_id: documento.id, p_editado_en: documento.editado_en,
        p_seleccion: elegidas.map((p) => ({ id: p.id, anteriores: p.anteriores, confirmado: p.anteriores.length > 0 })),
        p_valor_suenos: suenos, p_valor_merito: merito
      })
      if (fallo) throw fallo
      if (!data || !Array.isArray(data.filas)) throw new Error('No se confirmó la incorporación; recarga para verificar.')
      await onIncorporado()
      setPersonas(null)
      setRevision((n) => n + 1)
    } catch (fallo) { setError(fallo.message) } finally { setOcupado(false); onProcesando(false) }
  }
  return <section className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="flex items-center gap-2 font-bold text-slate-900"><Users size={18} />Actualizaciones aprobadas</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">Solo beneficiarios activos de esta convocatoria y período. Los valores se aplican únicamente a nuevas filas; confirma cada importe en el editor.</p></div>
      <button type="button" className={boton} disabled={ocupado} onClick={() => { setPersonas(null); setError(''); setRevision((n) => n + 1) }}><RefreshCw size={15} />Actualizar lista</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-bold text-slate-700">Valor común Sueños<input className={`${campo} mt-1`} inputMode="decimal" value={suenos} onChange={(e) => setSuenos(e.target.value)} placeholder="Ej. 1750905" /></label>
      <label className="text-xs font-bold text-slate-700">Valor común Mérito<input className={`${campo} mt-1`} inputMode="decimal" value={merito} onChange={(e) => setMerito(e.target.value)} placeholder="Ej. 1750905" /></label>
    </div>
    <p className="text-xs text-slate-600">Modalidades no reconocidas se incorporan sin valor para completarlo manualmente. Utiliza punto para decimales.</p>
    <input className={campo} type="search" aria-label="Buscar beneficiarios elegibles" placeholder="Buscar por nombre o identificación" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
    {error && <p role="alert" className="whitespace-pre-wrap text-sm text-red-700">{error}</p>}
    {!personas && !error && <p role="status" className="text-sm text-slate-500">Consultando beneficiarios…</p>}
    {personas && <>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" className={boton} onClick={() => setSeleccion(personas.filter((p) => p.valido).map((p) => p.id))}>Seleccionar todos</button>
        <button type="button" className={boton} onClick={() => setSeleccion([])}>Quitar selección</button>
        <span>{seleccion.length} seleccionados de {personas.length}</span>
      </div>
      <ul className="max-h-80 divide-y divide-slate-200 overflow-auto rounded-lg border border-slate-200 bg-white">{visibles.map((p) => <li key={p.id} className="flex items-start gap-3 p-3 text-sm">
        <input type="checkbox" className="mt-1" aria-label={`Seleccionar ${p.nombre || p.identificacion}`} disabled={!p.valido || ocupado} checked={seleccion.includes(p.id)}
          onChange={() => setSeleccion((ids) => ids.includes(p.id) ? ids.filter((id) => id !== p.id) : [...ids, p.id])} />
        <div className="min-w-0"><strong className="break-words">{p.nombre || 'Nombre faltante'}</strong>
          <p className="text-xs text-slate-600">{p.identificacion || 'Identificación faltante'} · {p.modalidad || 'Sin modalidad'}</p>
          {!p.valido && <p className="mt-1 text-xs text-red-700">Nombre o identificación inválidos; corrige el perfil antes de incorporarlo.</p>}
          {p.anteriores.length > 0 && <p className="mt-1 break-all text-xs text-amber-800">Ya incluido en: {p.anteriores.map((a) => `RP ${a.id} (${a.estado})`).join(', ')}</p>}
        </div>
      </li>)}</ul>
      {!visibles.length && <p className="text-sm text-slate-500">No hay beneficiarios disponibles para esta búsqueda.</p>}
      {pendiente && <p className="text-xs font-semibold text-amber-800">Guarda o descarta los cambios del editor antes de incorporar.</p>}
      <button type="button" className={`${boton} !border-emerald-800 !bg-emerald-800 !text-white`} disabled={ocupado || ocupadoEditor || pendiente || !seleccion.length} onClick={incorporar}>Incorporar {seleccion.length} personas</button>
    </>}
  </section>
}
