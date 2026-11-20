import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { showConfirmAlert } from '../lib/alerts'

const input = 'min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:outline-emerald-700'
const button = 'min-h-11 rounded-xl border border-emerald-700 px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50'
const pesos = (valor) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(valor)
const fecha = (valor) => valor || 'Sin dato'

export function SoportesPago({ soporte }) {
  if (!soporte) return <p className="mt-2 text-xs text-slate-500">Sin trazabilidad contable registrada.</p>
  return <dl className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-3">
    {[['RP', soporte.numero_rp, soporte.fecha_rp], ['OP', soporte.numero_op, soporte.fecha_op], ['Egreso', soporte.numero_egreso, soporte.fecha_egreso]].map(([label, numero, dia]) => (
      <div key={label}><dt className="font-bold uppercase tracking-wide text-slate-500">{label}</dt>
        <dd className="mt-1 font-semibold text-slate-800">{numero || 'Sin dato'}</dd>
        <dd className="text-slate-500">{fecha(dia)}</dd></div>
    ))}
    <div className="text-slate-500 sm:col-span-3">Origen: {soporte.origen === 'historico' ? 'histórico importado' : 'confirmado por Pagos'}</div>
  </dl>
}

export function ConsultaTrazabilidadPagos() {
  const [documento, setDocumento] = useState('')
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const buscar = async (e) => {
    e.preventDefault()
    setOcupado(true); setError(''); setResultado(null)
    try {
      const { data, error: fallo } = await supabase.rpc('buscar_trazabilidad_pagos', { p_documento: documento.trim() })
      if (fallo) throw fallo
      if (!data || !Array.isArray(data.pagos)) throw new Error('No se recibió una respuesta válida.')
      setResultado(data)
    } catch (fallo) { setError(fallo.message || 'No se pudo consultar la trazabilidad.') }
    finally { setOcupado(false) }
  }
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <div><h2 className="text-lg font-bold text-slate-900">Trazabilidad por beneficiario</h2>
      <p className="mt-1 text-sm text-slate-600">Consulta RP, OP y egreso guardados con cada pago, incluidos los históricos.</p></div>
    <form className="flex flex-wrap gap-2" onSubmit={buscar}>
      <label className="sr-only" htmlFor="documento-trazabilidad">Documento completo</label>
      <input id="documento-trazabilidad" className={input} inputMode="numeric" pattern="[0-9]+" required value={documento}
        onChange={(e) => setDocumento(e.target.value)} placeholder="Documento completo" />
      <button className={button} disabled={ocupado} type="submit">{ocupado ? 'Consultando…' : 'Consultar'}</button>
    </form>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {resultado && <div className="space-y-3"><h3 className="font-semibold">{resultado.nombre} · {resultado.documento}</h3>
      {resultado.pagos.length === 0 && <p className="text-sm text-slate-500">No hay pagos registrados.</p>}
      {resultado.pagos.map((p) => <article key={p.id} className="rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-bold">{p.concepto} · {pesos(p.monto)}</p>
        <p className="mt-1 text-xs text-slate-600">{p.periodo || 'Sin período'} · {p.estado}</p>
        <SoportesPago soporte={p.soporte} />
      </article>)}
    </div>}
  </section>
}

export function ConfirmacionEgresos({ convocatoriaId, rpId }) {
  const [periodo, setPeriodo] = useState('')
  const [filas, setFilas] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const cargar = async () => {
    setOcupado(true); setError('')
    try {
      const { data, error: fallo } = await supabase.rpc('leer_obligaciones_egreso', {
        p_convocatoria_id: convocatoriaId, p_rp_id: rpId, p_periodo: periodo.trim() || null,
      })
      if (fallo) throw fallo
      if (!Array.isArray(data)) throw new Error('No se recibieron obligaciones válidas.')
      setFilas(data); setDrafts({})
    } catch (fallo) { setError(fallo.message || 'No se pudieron consultar las obligaciones.') }
    finally { setOcupado(false) }
  }
  const confirmar = async (fila) => {
    const d = drafts[fila.fila_id] || {}
    if (!d.numero || !d.fecha || !fila.periodo) { setError('Indica el período, el número y la fecha del egreso.'); return }
    if (fila.coincidencias.length && !d.pago) { setError('Selecciona el pago existente o concilia la diferencia antes de continuar.'); return }
    const ok = await showConfirmAlert({ title: 'Confirmar egreso real', text: `Se registrará el egreso ${d.numero} de ${fila.nombre} por ${pesos(Number(fila.monto))}. Esta acción registra o vincula el pago.`, confirmButtonText: 'Confirmar egreso', cancelButtonText: 'Cancelar' })
    if (!ok) return
    setOcupado(true); setError(''); setMensaje('')
    try {
      const { data, error: fallo } = await supabase.rpc('confirmar_egreso_beneficiario', {
        p_convocatoria_id: convocatoriaId, p_rp_id: rpId, p_fila_id: fila.fila_id,
        p_periodo: periodo.trim() || null, p_numero_egreso: d.numero.trim(),
        p_fecha_egreso: d.fecha, p_pago_existente_id: d.pago ? Number(d.pago) : null,
      })
      if (fallo) throw fallo
      if (!data?.ok) throw new Error('No se confirmó el egreso. Recarga antes de reintentar.')
      setMensaje('Egreso confirmado. Recarga las obligaciones para ver el estado actualizado.')
      setFilas(null)
    } catch (fallo) { setError(fallo.message || 'No se pudo confirmar el egreso.') }
    finally { setOcupado(false) }
  }
  const cambiar = (id, campo, valor) => setDrafts((actual) => ({ ...actual, [id]: { ...actual[id], [campo]: valor } }))
  return <section className="space-y-4 border-t border-slate-200 pt-5">
    <h3 className="text-lg font-bold text-slate-900">Confirmación de egresos</h3>
    <p className="text-sm text-slate-600">Registra solo egresos reales. Se utilizará el valor bruto aprobado del RP y, cuando exista, la ventana académica vinculada.</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-xs font-bold text-slate-600">Período si no hay ventana vinculada
        <input className={input} value={periodo} onChange={(e) => { setPeriodo(e.target.value); setFilas(null) }} maxLength={100} /></label>
      <button type="button" className={button} disabled={ocupado} onClick={cargar}>Consultar obligaciones</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {mensaje && <p role="status" className="text-sm text-emerald-800">{mensaje}</p>}
    {filas?.map((fila) => <article key={fila.fila_id} className="space-y-3 rounded-xl border border-slate-200 p-4">
      <p className="font-bold text-slate-900">{fila.nombre || 'Beneficiario no identificado'} · {fila.documento}</p>
      <p className="text-sm text-slate-600">RP {fila.numero_rp} · OP {fila.numero_op} · {pesos(Number(fila.monto))} · {fila.periodo || 'Falta período'}</p>
      {fila.confirmado ? <p className="text-sm font-semibold text-emerald-700">Egreso ya confirmado</p>
        : !fila.beneficiario_id ? <p className="text-sm text-amber-800">Identidad no inequívoca; requiere conciliación.</p>
          : <div className="flex flex-wrap items-end gap-2">
            {fila.coincidencias.length > 0 && <label className="grid gap-1 text-xs font-bold">Pago existente
              <select className={input} value={drafts[fila.fila_id]?.pago || ''} onChange={(e) => cambiar(fila.fila_id, 'pago', e.target.value)}>
                <option value="">Seleccione un pago coincidente</option>
                {fila.coincidencias.map((p) => <option key={p.id} value={p.id}>#{p.id} · {p.estado} · {pesos(p.monto)} · {fecha(p.fecha_efectiva)}</option>)}
              </select></label>}
            <label className="grid gap-1 text-xs font-bold">Número egreso<input className={input} maxLength={100} value={drafts[fila.fila_id]?.numero || ''} onChange={(e) => cambiar(fila.fila_id, 'numero', e.target.value)} /></label>
            <label className="grid gap-1 text-xs font-bold">Fecha egreso<input className={input} type="date" value={drafts[fila.fila_id]?.fecha || ''} onChange={(e) => cambiar(fila.fila_id, 'fecha', e.target.value)} /></label>
            <button type="button" className={button} disabled={ocupado} onClick={() => confirmar(fila)}>Confirmar</button>
          </div>}
    </article>)}
    {filas?.length === 0 && <p className="text-sm text-amber-800">No se encontraron obligaciones verificables. Contacta al administrador.</p>}
  </section>
}
