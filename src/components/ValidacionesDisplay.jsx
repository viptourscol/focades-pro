import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { AlertCircle, CheckCircle, Trash2, Filter } from 'lucide-react'

const ValidacionesDisplay = ({ documentoId }) => {
  const [validaciones, setValidaciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [filtroResueltas, setFiltroResueltas] = useState('sin-resolver')
  const [error, setError] = useState(null)

  useEffect(() => {
    cargarValidaciones()
  }, [documentoId])

  const cargarValidaciones = async () => {
    try {
      setCargando(true)
      const {
        data: { session },
        error: authError
      } = await supabase.auth.getSession()
      if (authError || !session) {
        setError('No autorizado')
        return
      }

      const { data, error: queryError } = await supabase
        .from('portal_cargue_validaciones')
        .select('*')
        .eq('documento_id', documentoId)
        .order('created_at', { ascending: false })

      if (queryError) {
        setError(queryError.message)
      } else {
        setValidaciones(data || [])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  const marcarResuelta = async (validacionId) => {
    try {
      const { error: updateError } = await supabase
        .from('portal_cargue_validaciones')
        .update({ resuelta: true })
        .eq('id', validacionId)

      if (updateError) {
        setError(updateError.message)
      } else {
        setValidaciones(validaciones.map((v) => (v.id === validacionId ? { ...v, resuelta: true } : v)))
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const eliminarValidacion = async (validacionId) => {
    try {
      const { error: deleteError } = await supabase
        .from('portal_cargue_validaciones')
        .delete()
        .eq('id', validacionId)

      if (deleteError) {
        setError(deleteError.message)
      } else {
        setValidaciones(validaciones.filter((v) => v.id !== validacionId))
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const validacionesFiltradas = validaciones.filter((v) => {
    if (filtroResueltas === 'sin-resolver') return !v.resuelta
    if (filtroResueltas === 'resueltas') return v.resuelta
    return true
  })

  const tipoErrorConfig = {
    validacion_formato: { icon: '❌', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
    validacion_rango: { icon: '⚠️', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
    validacion_referencia: { icon: '🔗', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    duplicado: { icon: '📋', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
    tipo_dato: { icon: '📊', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    error_sistema: { icon: '⚡', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' }
  }

  if (cargando) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (validaciones.length === 0) {
    return (
      <div className="text-center py-8">
        <CheckCircle size={48} className="mx-auto text-green-400 mb-3" />
        <p className="text-gray-600 font-medium">Sin errores de validación</p>
        <p className="text-gray-500 text-sm">Este documento pasó todas las validaciones</p>
      </div>
    )
  }

  const erroresPendientes = validaciones.filter((v) => !v.resuelta).length
  const erroresResueltos = validaciones.filter((v) => v.resuelta).length

  return (
    <div className="w-full space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
          <p className="text-xs font-medium text-red-600 mb-1">Pendientes</p>
          <p className="text-2xl font-bold text-red-900">{erroresPendientes}</p>
        </div>
        <div className="bg-green-50 p-3 rounded-lg border border-green-200">
          <p className="text-xs font-medium text-green-600 mb-1">Resueltos</p>
          <p className="text-2xl font-bold text-green-900">{erroresResueltos}</p>
        </div>
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
          <p className="text-xs font-medium text-blue-600 mb-1">Total</p>
          <p className="text-2xl font-bold text-blue-900">{validaciones.length}</p>
        </div>
      </div>

      {/* Filtro */}
      <div className="flex gap-2">
        <button
          onClick={() => setFiltroResueltas('sin-resolver')}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
            filtroResueltas === 'sin-resolver'
              ? 'bg-red-100 text-red-800'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <AlertCircle size={16} />
          Sin Resolver ({erroresPendientes})
        </button>
        <button
          onClick={() => setFiltroResueltas('resueltas')}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
            filtroResueltas === 'resueltas'
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <CheckCircle size={16} />
          Resueltos ({erroresResueltos})
        </button>
        <button
          onClick={() => setFiltroResueltas('todos')}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
            filtroResueltas === 'todos'
              ? 'bg-blue-100 text-blue-800'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Filter size={16} />
          Todos ({validaciones.length})
        </button>
      </div>

      {/* Lista de validaciones */}
      <div className="space-y-3">
        {validacionesFiltradas.map((validacion) => {
          const config = tipoErrorConfig[validacion.tipo_error] || tipoErrorConfig.error_sistema
          return (
            <div key={validacion.id} className={`p-4 rounded-lg border ${config.bg} ${config.border} ${validacion.resuelta ? 'opacity-60' : ''}`}>
              <div className="flex gap-3">
                <div className="text-2xl flex-shrink-0">{config.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <p className={`font-medium text-sm ${config.color}`}>{validacion.tipo_error.replace(/_/g, ' ').toUpperCase()}</p>
                      <p className="text-sm text-gray-700 mt-1">{validacion.mensaje_error}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {validacion.fila_numero && (
                        <span className="text-xs bg-white bg-opacity-50 px-2 py-1 rounded text-gray-600">
                          Fila {validacion.fila_numero}
                        </span>
                      )}
                      {validacion.columna_nombre && (
                        <span className="text-xs bg-white bg-opacity-50 px-2 py-1 rounded text-gray-600">
                          Col: {validacion.columna_nombre}
                        </span>
                      )}
                    </div>
                  </div>

                  {validacion.valor_problematico && (
                    <div className="mt-2 p-2 bg-white bg-opacity-50 rounded text-xs text-gray-600">
                      <span className="font-mono">Valor: "{validacion.valor_problematico}"</span>
                    </div>
                  )}
                </div>

                {/* Acciones */}
                <div className="flex gap-2 flex-shrink-0">
                  {!validacion.resuelta && (
                    <button
                      onClick={() => marcarResuelta(validacion.id)}
                      className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition"
                      title="Marcar como resuelto"
                    >
                      <CheckCircle size={18} />
                    </button>
                  )}
                  <button
                    onClick={() => eliminarValidacion(validacion.id)}
                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition"
                    title="Eliminar"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Mensaje cuando no hay resultados */}
      {validacionesFiltradas.length === 0 && validaciones.length > 0 && (
        <div className="text-center py-8 text-gray-600">
          <p>No hay validaciones para mostrar en este filtro</p>
        </div>
      )}
    </div>
  )
}

export default ValidacionesDisplay
