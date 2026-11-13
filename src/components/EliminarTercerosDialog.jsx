import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

const EliminarTercerosDialog = ({ documento, onCancelado, onEliminado }) => {
  const dialogo = useRef(null)
  const cancelar = useRef(null)
  const [confirmacion, setConfirmacion] = useState('')
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    const elemento = dialogo.current
    elemento.showModal()
    cancelar.current?.focus()
    return () => elemento.close()
  }, [])
  const eliminar = async (evento) => {
    evento.preventDefault()
    if (confirmacion !== 'ELIMINAR' || eliminando) return
    setEliminando(true)
    setError(null)
    try {
      const { data, error: errorEliminacion } = await supabase.rpc('eliminar_terceros_educacion', {
        p_documento_id: documento.id, p_estado: documento.estado, p_editado_en: documento.editado_en
      })
      if (errorEliminacion) throw errorEliminacion
      if (data?.success !== true || data.documento_id !== documento.id) throw new Error('No se recibió una confirmación válida. Actualiza la bandeja antes de intentar nuevamente.')
      onEliminado(documento.id)
    } catch (err) {
      setError(err.message)
      setEliminando(false)
    }
  }
  return (
    <dialog ref={dialogo} aria-labelledby="eliminar-terceros-titulo" aria-describedby="eliminar-terceros-aviso"
      onCancel={(evento) => { evento.preventDefault(); if (!eliminando) onCancelado() }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-950/50">
      <form onSubmit={eliminar} className="space-y-5 p-6">
        <span className="inline-flex rounded-xl bg-rose-50 p-3 text-rose-700"><AlertTriangle size={24} aria-hidden="true" /></span>
        <div>
          <h2 id="eliminar-terceros-titulo" className="text-xl font-bold">Eliminar documento TERCEROS</h2>
          <p className="mt-2 break-all text-xs text-slate-500">Documento: {documento.id}</p>
          <p className="mt-2 text-sm font-semibold">Estado: {documento.estado === 'borrador' ? 'Borrador' : 'En revisión'} · {documento.cantidad_registros ?? 0} registros</p>
        </div>
        <p id="eliminar-terceros-aviso" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
          Esta acción es permanente. Se eliminarán el documento, sus filas, validaciones e historial de revisión y correcciones.
          {documento.estado === 'enviado_para_revision' && ' También dejará de estar disponible para Presupuesto.'}
          {' '}No se eliminarán aspirantes, beneficiarios ni sus perfiles originales.
        </p>
        <label className="block space-y-2 text-sm font-semibold">
          <span>Escribe ELIMINAR para confirmar</span>
          <input value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} disabled={eliminando} autoComplete="off"
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal focus:outline-rose-700" />
        </label>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <footer className="flex flex-wrap justify-end gap-3">
          <button ref={cancelar} type="button" disabled={eliminando} onClick={onCancelado} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={eliminando || confirmacion !== 'ELIMINAR'} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50"><Trash2 size={16} aria-hidden="true" />{eliminando ? 'Eliminando…' : 'Eliminar definitivamente'}</button>
        </footer>
      </form>
    </dialog>
  )
}

export default EliminarTercerosDialog
