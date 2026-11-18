import { useEffect, useState } from 'react'
import { BookOpenCheck, Download, RefreshCw, Save } from 'lucide-react'
import { showErrorAlert } from '../lib/alerts'
import { supabase } from '../lib/supabase'
import { COLUMNAS_CONTABILIZACION, descargarExcelContabilizacionObligaciones } from '../lib/exportarContabilizacionObligaciones'

const control = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#c88c3a] focus:ring-2 focus:ring-amber-100 disabled:bg-slate-50 disabled:text-slate-500'
const boton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50'
const datosIniciales = { tipo: 'OP', cuenta_debito: '', cuenta_credito: '', clases: {} }

export default function CargueContabilizacionObligaciones({ convocatoriaId, rpId, aprobadoEn }) {
  const [filas, setFilas] = useState(null)
  const [datos, setDatos] = useState(datosIniciales)
  const [editadoEn, setEditadoEn] = useState(null)
  const [modificado, setModificado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const cargar = async () => {
    setCargando(true)
    setError('')
    try {
      const { data, error: fallo } = await supabase.rpc('leer_contabilizacion_op', {
        p_convocatoria_id: convocatoriaId,
        p_rp_id: rpId,
      })
      if (fallo) throw fallo
      if (!Array.isArray(data?.filas) || !data.filas.length) throw new Error('El OP aprobado no devolvió filas para contabilizar.')
      setFilas(data.filas)
      setDatos(data.datos || datosIniciales)
      setEditadoEn(data.editado_en)
      setModificado(false)
      setMensaje('')
    } catch (fallo) {
      setError(fallo.message || 'No se pudo cargar el archivo de contabilización.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    let activo = true
    const cargarInicial = async () => {
      try {
        const { data, error: fallo } = await supabase.rpc('leer_contabilizacion_op', {
          p_convocatoria_id: convocatoriaId,
          p_rp_id: rpId,
        })
        if (fallo) throw fallo
        if (!Array.isArray(data?.filas) || !data.filas.length) throw new Error('El OP aprobado no devolvió filas para contabilizar.')
        if (!activo) return
        setFilas(data.filas)
        setDatos(data.datos || datosIniciales)
        setEditadoEn(data.editado_en)
        setModificado(false)
      } catch (fallo) {
        if (activo) setError(fallo.message || 'No se pudo cargar el archivo de contabilización.')
      } finally {
        if (activo) setCargando(false)
      }
    }
    cargarInicial()
    return () => { activo = false }
  }, [convocatoriaId, rpId])

  const cambiar = (campo, valor) => {
    setDatos((actual) => ({ ...actual, [campo]: valor }))
    setModificado(true)
    setError('')
    setMensaje('')
  }

  const guardar = async (event) => {
    event.preventDefault()
    if (!filas || guardando) return
    setGuardando(true)
    setError('')
    setMensaje('')
    try {
      if (datos.tipo !== 'OP' || !datos.cuenta_debito.trim() || !datos.cuenta_credito.trim()) {
        throw new Error('Selecciona el tipo OP e indica las cuentas débito y crédito.')
      }
      const { data, error: fallo } = await supabase.rpc('guardar_contabilizacion_op', {
        p_convocatoria_id: convocatoriaId,
        p_rp_id: rpId,
        p_tipo: datos.tipo,
        p_cuenta_debito: datos.cuenta_debito,
        p_cuenta_credito: datos.cuenta_credito,
        p_clases: datos.clases,
        p_editado_en: editadoEn,
      })
      if (fallo) throw fallo
      setEditadoEn(data)
      setModificado(false)
      setMensaje('Cargue de contabilización guardado. Ya puedes descargar el Excel.')
    } catch (fallo) {
      setError(fallo.message || 'No se pudo guardar la contabilización.')
      await showErrorAlert({ title: 'No se pudo guardar', text: fallo.message || 'Verifica los datos e intenta de nuevo.' })
    } finally {
      setGuardando(false)
    }
  }

  const descargar = async () => {
    if (!filas || !editadoEn || modificado || guardando) return
    setGuardando(true)
    setError('')
    setMensaje('')
    try {
      const { data, error: fallo } = await supabase.rpc('leer_contabilizacion_op', {
        p_convocatoria_id: convocatoriaId,
        p_rp_id: rpId,
      })
      if (fallo) throw fallo
      if (data.editado_en !== editadoEn) throw new Error('La contabilización cambió en otra sesión. Recarga antes de descargar.')
      await descargarExcelContabilizacionObligaciones(data.filas, data.datos)
      setMensaje('CargueContabilizacionObligaciones.xlsx descargado.')
    } catch (fallo) {
      setError(fallo.message || 'No se pudo descargar el Excel.')
    } finally {
      setGuardando(false)
    }
  }

  const puedeGuardar = Boolean(filas?.length && datos.cuenta_debito.trim() && datos.cuenta_credito.trim())
  if (cargando) return <p role="status" className="flex items-center gap-2 py-4 text-sm text-slate-500"><RefreshCw size={15} className="animate-spin" /> Preparando contabilización del OP aprobado…</p>

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-emerald-100 bg-[linear-gradient(110deg,#f0fdf7,#fffdf8)] p-5 sm:px-6">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-emerald-800"><BookOpenCheck size={15} /> Siguiente paso · Contabilidad</p>
          <h3 className="mt-2 text-lg font-bold text-slate-900">CargueContabilizacionObligaciones</h3>
          <p className="mt-1 text-xs text-slate-600">Precargado desde el OP aprobado{aprobadoEn ? ` el ${new Date(aprobadoEn).toLocaleDateString('es-CO')}` : ''}. Los números de obligación y códigos se mantienen ligados al OP.</p>
        </div>
        <span className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800">{filas?.length || 0} obligaciones</span>
      </header>

      <form className="space-y-5 p-5 sm:p-6" onSubmit={guardar}>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        {mensaje && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{mensaje}</p>}

        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Tipo común
            <select className={control} value={datos.tipo} onChange={(e) => cambiar('tipo', e.target.value)} disabled={guardando}>
              <option value="OP">OP · Orden de pago</option>
            </select>
            <span className="mt-1 block text-[11px] font-normal normal-case text-slate-500">Se aplicará a todas las filas.</span>
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Cuenta débito
            <input className={control} value={datos.cuenta_debito} onChange={(e) => cambiar('cuenta_debito', e.target.value)} maxLength={30} required disabled={guardando} placeholder="Ej. 14150701" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Cuenta crédito
            <input className={control} value={datos.cuenta_credito} onChange={(e) => cambiar('cuenta_credito', e.target.value)} maxLength={30} required disabled={guardando} placeholder="Ej. 24903701" />
          </label>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <h4 className="text-sm font-bold text-slate-800">Filas del OP aprobado</h4>
              <p className="mt-0.5 text-[11px] text-slate-500">Clase es opcional; las cuentas y el tipo son comunes.</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Vista previa</span>
          </div>
          <div role="region" aria-label="Filas de contabilización de obligaciones" tabIndex={0} className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#10233f] text-white">
                <tr>{COLUMNAS_CONTABILIZACION.map(([, titulo]) => <th key={titulo} scope="col" className="whitespace-nowrap px-3 py-3 font-semibold">{titulo}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas?.map((fila, indice) => (
                  <tr key={fila.id} className="hover:bg-emerald-50/40">
                    <td className="px-3 py-3 font-bold text-emerald-800">OP</td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums text-slate-800">{fila.no_obligacion}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-700">{fila.subconsecutivo}</td>
                    <td className="px-3 py-2"><input className={`${control} min-w-28`} aria-label={`Clase, fila ${indice + 1}`}
                      value={datos.clases[fila.id] || ''} maxLength={32767} disabled={guardando}
                      onChange={(e) => cambiar('clases', { ...datos.clases, [fila.id]: e.target.value })} /></td>
                    <td className="px-3 py-3 tabular-nums text-slate-700">{fila.codigo_entidad}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-700">{fila.rubro_presupuestal}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-700">{fila.fuente_financiacion}</td>
                    <td className="px-3 py-3 font-mono text-slate-700">{datos.cuenta_debito || '—'}</td>
                    <td className="px-3 py-3 font-mono text-slate-700">{datos.cuenta_credito || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={`${boton} border-[#10233f] bg-[#10233f] text-white hover:bg-[#19365d]`}
            disabled={guardando || !puedeGuardar || (!modificado && Boolean(editadoEn))}>
            <Save size={16} aria-hidden="true" /> {guardando ? 'Guardando…' : 'Guardar contabilización'}
          </button>
          <button type="button" className={`${boton} text-emerald-800 hover:bg-emerald-50`}
            disabled={guardando || !editadoEn || modificado} onClick={descargar}>
            <Download size={16} aria-hidden="true" /> Descargar Excel
          </button>
          {error && <button type="button" className={boton} disabled={guardando} onClick={cargar}>Recargar datos guardados</button>}
        </div>
      </form>
    </section>
  )
}
