import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { CheckCircle, XCircle, Send, AlertCircle } from 'lucide-react'

const BotonesFlujoCargue = ({ documentoId, estado, tipoDocumento, userRole, onAccionCompletada }) => {
  const [cargando, setCargando] = useState(false)
  const [mostrarDialogo, setMostrarDialogo] = useState(null)
  const [comentario, setComentario] = useState('')
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(null)

  // Determinar qué acciones son disponibles según el rol y estado actual
  const puedeEnviarRevision = ['borrador', 'rechazado'].includes(estado)
  const puedeAprobar = estado === 'enviado_para_revision'
  const puedeRechazar = estado === 'enviado_para_revision'
  const puedeFinalizar = estado === 'aprobado' && tipoDocumento === 'siafe' && userRole === 'admin_pagos'

  // Validar permisos
  const tipoAAccion = {
    terceros: ['admin_educacion', 'admin_presupuesto'],
    rp: ['admin_educacion', 'admin_presupuesto'],
    op: ['admin_contabilidad'],
    contabilidad: ['admin_contabilidad'],
    siafe: ['admin_pagos']
  }

  const rolesPermitidos = tipoAAccion[tipoDocumento] || []
  const tienePermiso = rolesPermitidos.includes(userRole)

  const ejecutarAccion = async (accion) => {
    if (!tienePermiso) {
      setError('No tienes permiso para realizar esta acción')
      return
    }

    try {
      setCargando(true)
      setError(null)

      const {
        data: { session },
        error: authError
      } = await supabase.auth.getSession()
      if (authError || !session) {
        setError('No autorizado')
        return
      }

      let resultado
      let endpoint = ''

      switch (accion) {
        case 'enviar-revision':
          endpoint = 'enviar-para-revision'
          resultado = await supabase.functions.invoke(endpoint, {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: {
              documento_id: documentoId,
              comentario: comentario || 'Enviado para revisión'
            }
          })
          break

        case 'aprobar':
          endpoint = 'aprobar-documento'
          resultado = await supabase.functions.invoke(endpoint, {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: {
              documento_id: documentoId,
              comentario: comentario || 'Aprobado'
            }
          })
          break

        case 'rechazar':
          endpoint = 'rechazar-documento'
          resultado = await supabase.functions.invoke(endpoint, {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: {
              documento_id: documentoId,
              motivo_rechazo: comentario || 'Rechazado por revisión'
            }
          })
          break

        case 'finalizar':
          endpoint = 'finalizar-documento'
          resultado = await supabase.functions.invoke(endpoint, {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { documento_id: documentoId }
          })
          break
      }

      if (resultado.error) {
        setError(resultado.error.message)
      } else if (resultado.data.success) {
        setExito(`Acción completada: ${resultado.data.mensaje}`)
        setComentario('')
        setMostrarDialogo(null)
        if (onAccionCompletada) {
          onAccionCompletada(resultado.data)
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  if (!tienePermiso) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex gap-3">
        <AlertCircle size={20} className="text-yellow-600 flex-shrink-0" />
        <p className="text-sm text-yellow-800">No tienes permisos para realizar acciones en este documento</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4">
      {/* Alertas */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        </div>
      )}

      {exito && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex gap-3">
          <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">{exito}</p>
          </div>
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex flex-col md:flex-row gap-3 flex-wrap">
        {puedeEnviarRevision && (
          <button
            onClick={() => setMostrarDialogo('enviar-revision')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm disabled:opacity-50"
            disabled={cargando}
          >
            <Send size={18} />
            Enviar para Revisión
          </button>
        )}

        {puedeAprobar && (
          <button
            onClick={() => setMostrarDialogo('aprobar')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium text-sm disabled:opacity-50"
            disabled={cargando}
          >
            <CheckCircle size={18} />
            Aprobar
          </button>
        )}

        {puedeRechazar && (
          <button
            onClick={() => setMostrarDialogo('rechazar')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium text-sm disabled:opacity-50"
            disabled={cargando}
          >
            <XCircle size={18} />
            Rechazar
          </button>
        )}

        {puedeFinalizar && (
          <button
            onClick={() => setMostrarDialogo('finalizar')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium text-sm disabled:opacity-50"
            disabled={cargando}
          >
            <CheckCircle size={18} />
            Finalizar
          </button>
        )}
      </div>

      {/* Diálogo de confirmación */}
      {mostrarDialogo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {mostrarDialogo === 'enviar-revision' && 'Enviar para Revisión'}
                {mostrarDialogo === 'aprobar' && 'Aprobar Documento'}
                {mostrarDialogo === 'rechazar' && 'Rechazar Documento'}
                {mostrarDialogo === 'finalizar' && 'Finalizar Documento'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {mostrarDialogo === 'enviar-revision' && 'Este documento será enviado para revisión por el siguiente paso del proceso.'}
                {mostrarDialogo === 'aprobar' && 'Al aprobar, el documento avanzará al siguiente estado.'}
                {mostrarDialogo === 'rechazar' && 'El documento será rechazado y retornará para correcciones. Por favor indica el motivo.'}
                {mostrarDialogo === 'finalizar' && 'Esto marcará el documento como finalizado en el sistema.'}
              </p>
            </div>

            {/* Campo de comentario */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {mostrarDialogo === 'rechazar' ? 'Motivo del Rechazo' : 'Comentario (opcional)'}
              </label>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Escribe tu comentario aquí..."
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            {/* Botones del diálogo */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setMostrarDialogo(null)
                  setComentario('')
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => ejecutarAccion(mostrarDialogo)}
                disabled={cargando || (mostrarDialogo === 'rechazar' && !comentario)}
                className={`flex-1 px-4 py-2 text-white rounded-lg transition font-medium text-sm disabled:opacity-50 ${
                  mostrarDialogo === 'rechazar'
                    ? 'bg-red-600 hover:bg-red-700'
                    : mostrarDialogo === 'aprobar'
                      ? 'bg-green-600 hover:bg-green-700'
                      : mostrarDialogo === 'finalizar'
                        ? 'bg-indigo-600 hover:bg-indigo-700'
                        : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {cargando ? 'Procesando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BotonesFlujoCargue
