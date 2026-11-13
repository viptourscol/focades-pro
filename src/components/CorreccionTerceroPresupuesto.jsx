import { useEffect, useRef, useState } from 'react'
import { Save, X } from 'lucide-react'
import { CAMPOS_TERCEROS, TIPOS_IDENTIFICACION, validarTercero } from '../lib/tercerosCargue'
import { supabase } from '../lib/supabase'

const nombres = ['primer_nombre', 'segundo_nombre', 'primer_apellido', 'segundo_apellido']
const editables = CAMPOS_TERCEROS.filter((campo) => !campo.readonly)

const CorreccionTerceroPresupuesto = ({ fila, campoInicial, documentoId, editadoEn, onGuardado, onCancelar }) => {
  const [datos, setDatos] = useState({ ...fila })
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const formulario = useRef(null)
  useEffect(() => {
    formulario.current?.elements.namedItem(campoInicial)?.focus()
  }, [campoInicial])
  const cambios = editables.filter(({ name }) => String(datos[name] ?? '').trim() !== String(fila[name] ?? '').trim())
  const requiereConfirmacion = nombres.some((campo) => datos[campo] !== fila[campo]) || !datos.nombres_confirmados || !fila.nombres_confirmados
  const errores = validarTercero(datos, { completo: true })
  const actualizar = (campo, valor) => setDatos((actual) => ({
    ...actual, [campo]: valor, ...(nombres.includes(campo) ? { nombres_confirmados: false } : {})
  }))
  const guardar = async (evento) => {
    evento.preventDefault()
    setError(null)
    if (!motivo.trim()) return setError('Indica el motivo de la corrección.')
    if (Object.keys(errores).length) return setError(Object.values(errores).join('\n'))
    setGuardando(true)
    try {
      const { data, error: errorGuardado } = await supabase.rpc('corregir_tercero_presupuesto', {
        p_documento_id: documentoId, p_fila_id: fila.id, p_editado_en: editadoEn,
        p_motivo: motivo.trim(),
        p_cambios: { ...Object.fromEntries(editables.map(({ name }) => [name, String(datos[name] ?? '').trim()])), nombres_confirmados: datos.nombres_confirmados }
      })
      if (errorGuardado) throw errorGuardado
      if (!data || !Array.isArray(data.filas) || !data.editado_en || data.estado !== 'enviado_para_revision') {
        throw new Error('No se recibió una confirmación válida. Recarga el documento antes de continuar.')
      }
      onGuardado(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }
  return (
    <form ref={formulario} onSubmit={guardar} aria-label="Corrección de tercero por Presupuesto" className="space-y-5 rounded-2xl border-2 border-emerald-700 bg-emerald-50/40 p-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">Corrección auditada</p>
          <h3 className="mt-2 text-xl font-bold">Tercero · {fila.cc_nit || 'Sin identificación'}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">Solo modifica este documento, no el perfil original. Guardar no aprueba. Los códigos fijos y las personas del listado no se pueden cambiar.</p>
        </div>
        <button type="button" aria-label="Cancelar corrección" disabled={guardando} onClick={onCancelar} className="rounded-lg p-2 hover:bg-white disabled:opacity-50"><X size={20} /></button>
      </header>
      <fieldset disabled={guardando} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {editables.map((campo) => (
          <label key={campo.name} className={`space-y-1 text-sm font-semibold ${campo.name === 'direccion' ? 'sm:col-span-2' : ''}`}>
            <span>{campo.label}{campo.required ? ' *' : ''}</span>
            {campo.type === 'select' ? <select name={campo.name} value={datos[campo.name] || ''} onChange={(e) => actualizar(campo.name, e.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal focus:outline-emerald-700">
              <option value="">Seleccionar…</option>
              {campo.options.map((valor) => <option key={valor} value={valor}>{campo.name === 'tipo_identificacion' ? `${valor} · ${TIPOS_IDENTIFICACION[valor]}` : valor}</option>)}
            </select> : <textarea name={campo.name} rows={campo.name === 'direccion' ? 3 : 2}
              value={datos[campo.name] || ''} maxLength={campo.maxLength} inputMode={campo.numerico ? 'numeric' : campo.type === 'email' ? 'email' : undefined}
              onChange={(e) => actualizar(campo.name, e.target.value)} aria-invalid={Boolean(errores[campo.name])}
              className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal focus:outline-emerald-700" />}
            {errores[campo.name] && <span className="block text-xs font-normal text-amber-800">{errores[campo.name]}</span>}
          </label>
        ))}
      </fieldset>
      {requiereConfirmacion && <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <input type="checkbox" checked={datos.nombres_confirmados === true} disabled={guardando} onChange={(e) => actualizar('nombres_confirmados', e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />
        Confirmo que revisé los nombres y apellidos de esta persona. Mi confirmación quedará registrada con la corrección.
      </label>}
      <label className="block space-y-2 text-sm font-semibold">
        <span>Motivo de la corrección *</span>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={guardando} required rows={3}
          placeholder="Describe qué verificaste y por qué realizas el ajuste."
          className="w-full rounded-xl border border-slate-300 bg-white p-3 font-normal focus:outline-emerald-700" />
      </label>
      {error && <p role="alert" className="whitespace-pre-line rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      <footer className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-slate-600">{cambios.length} celda(s) modificada(s). Se registrarán usuario, fecha, motivo y valores anterior/nuevo.</p>
        <div className="flex gap-3">
          <button type="button" disabled={guardando} onClick={onCancelar} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={guardando || (!cambios.length && datos.nombres_confirmados === fila.nombres_confirmados)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white disabled:opacity-50">
            <Save size={17} />{guardando ? 'Guardando…' : 'Guardar corrección'}
          </button>
        </div>
      </footer>
    </form>
  )
}

export default CorreccionTerceroPresupuesto
