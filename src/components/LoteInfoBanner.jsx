import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ESTADO_COLORS = {
  en_preparacion: 'bg-amber-100 text-amber-800',
  validado: 'bg-blue-100 text-blue-800',
  cargado: 'bg-indigo-100 text-indigo-800',
  activado: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-800'
}

const ESTADO_LABELS = {
  en_preparacion: 'En preparación',
  validado: 'Validado',
  cargado: 'Cargado',
  activado: 'Activado',
  error: 'Error'
}

/**
 * LoteInfoBanner — muestra el resumen de un lote cuando se recibe loteId.
 * Props:
 *   loteId: string  — UUID del lote
 */
export default function LoteInfoBanner({ loteId }) {
  const [lote, setLote] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!loteId) return
    let mounted = true

    const fetchLote = async () => {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('portal_migracion_lotes')
          .select('id, titulo, descripcion, estado, cantidad_registros, cantidad_documentos, created_at')
          .eq('id', loteId)
          .single()

        if (mounted && data) setLote(data)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchLote()
    return () => { mounted = false }
  }, [loteId])

  if (!loteId) return null
  if (loading) return <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-400">Cargando lote…</div>
  if (!lote) return null

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-5 py-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <p className="text-xs text-indigo-500 font-semibold uppercase tracking-wider mb-0.5">Lote vinculado</p>
          <p className="text-base font-semibold text-indigo-900">{lote.titulo}</p>
          {lote.descripcion && <p className="text-xs text-indigo-600 mt-0.5">{lote.descripcion}</p>}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="text-center">
            <p className="text-2xl font-bold text-indigo-800">{lote.cantidad_registros ?? '—'}</p>
            <p className="text-xs text-indigo-500">Beneficiarios</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-indigo-800">{lote.cantidad_documentos ?? 0}</p>
            <p className="text-xs text-indigo-500">Documentos</p>
          </div>
          <div className="flex flex-col items-center justify-center">
            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${ESTADO_COLORS[lote.estado] || 'bg-gray-100 text-gray-600'}`}>
              {ESTADO_LABELS[lote.estado] || lote.estado}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
