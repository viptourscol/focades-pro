import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { AlertCircle, CheckCircle, Clock, FileText, Eye, Trash2, Plus, Download, Upload } from 'lucide-react'

const EstadoaBadge = ({ estado }) => {
  const estadoConfig = {
    borrador: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Borrador' },
    enviado_para_revision: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'En Revisión' },
    aprobado: { bg: 'bg-green-100', text: 'text-green-800', label: 'Aprobado' },
    rechazado: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rechazado' },
    finalizado: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Finalizado' }
  }
  const config = estadoConfig[estado] || estadoConfig.borrador
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  )
}

const TipoDocumentoBadge = ({ tipo }) => {
  const tipoConfig = {
    terceros: { bg: 'bg-purple-100', text: 'text-purple-800', icon: '👥' },
    rp: { bg: 'bg-blue-100', text: 'text-blue-800', icon: '💰' },
    op: { bg: 'bg-orange-100', text: 'text-orange-800', icon: '📋' },
    contabilidad: { bg: 'bg-green-100', text: 'text-green-800', icon: '📊' },
    siafe: { bg: 'bg-indigo-100', text: 'text-indigo-800', icon: '🏦' }
  }
  const config = tipoConfig[tipo] || {}
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium ${config.bg} ${config.text}`}>
      <span>{config.icon}</span>
      {tipo.toUpperCase()}
    </span>
  )
}

const DocumentosCargueIndex = ({ onSelectDocumento, userRole, convocatoriaId }) => {
  const [documentos, setDocumentos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [paginaActual, setPaginaActual] = useState(1)
  const itemsPorPagina = 10

  useEffect(() => {
    cargarDocumentos()
  }, [userRole, convocatoriaId])

  const cargarDocumentos = async () => {
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

      const { data, error: queryError } = await supabase.functions.invoke('obtener-documentos-por-rol', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: {
          convocatoria_id: convocatoriaId,
          tipo_filtro: filtroTipo || undefined
        }
      })

      if (queryError) {
        setError(queryError.message)
      } else if (data.documentos) {
        setDocumentos(data.documentos)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  const documentosFiltrados = documentos.filter((doc) => {
    if (filtroEstado && doc.estado !== filtroEstado) return false
    if (filtroTipo && doc.tipo_documento !== filtroTipo) return false
    return true
  })

  const documentosPaginados = documentosFiltrados.slice(
    (paginaActual - 1) * itemsPorPagina,
    paginaActual * itemsPorPagina
  )
  const totalPaginas = Math.ceil(documentosFiltrados.length / itemsPorPagina)

  const puedeCrear = ['admin_educacion'].includes(userRole)
  const tiposDisponibles = {
    admin_educacion: ['terceros', 'rp'],
    admin_presupuesto: ['terceros', 'rp'],
    admin_contabilidad: ['op', 'contabilidad'],
    admin_pagos: ['siafe'],
    admin_visualizacion: []
  }

  const tiposParaRol = tiposDisponibles[userRole] || []

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Cargue de Documentos</h1>
            <p className="text-gray-600 text-sm mt-1">Gestiona documentos de terceros, presupuesto y contabilidad</p>
          </div>
          {puedeCrear && (
            <button
              onClick={() => onSelectDocumento('nuevo')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
            >
              <Plus size={18} />
              Nuevo Documento
            </button>
          )}
        </div>

        {/* Filtros */}
        <div className="flex flex-col md:flex-row gap-3">
          <select
            value={filtroTipo}
            onChange={(e) => {
              setFiltroTipo(e.target.value)
              setPaginaActual(1)
            }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Todos los tipos</option>
            {tiposParaRol.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
              </option>
            ))}
          </select>

          <select
            value={filtroEstado}
            onChange={(e) => {
              setFiltroEstado(e.target.value)
              setPaginaActual(1)
            }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Todos los estados</option>
            <option value="borrador">Borrador</option>
            <option value="enviado_para_revision">En Revisión</option>
            <option value="aprobado">Aprobado</option>
            <option value="rechazado">Rechazado</option>
            <option value="finalizado">Finalizado</option>
          </select>

          <button
            onClick={cargarDocumentos}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Tabla */}
      {cargando ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : documentosPaginados.length === 0 ? (
        <div className="text-center py-12">
          <FileText size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 text-sm">No hay documentos para mostrar</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Registros</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Versión</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Creado</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {documentosPaginados.map((doc) => (
                  <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <TipoDocumentoBadge tipo={doc.tipo_documento} />
                    </td>
                    <td className="px-6 py-4">
                      <EstadoaBadge estado={doc.estado} />
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{doc.cantidad_registros || 0}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">v{doc.version}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">
                        {new Date(doc.creado_en).toLocaleDateString('es-CO', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onSelectDocumento(doc.id)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Ver detalles"
                        >
                          <Eye size={18} />
                        </button>
                        {doc.archivo_url && (
                          <a
                            href={doc.archivo_url}
                            download
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                            title="Descargar archivo"
                          >
                            <Download size={18} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPaginas > 1 && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <button
                onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                disabled={paginaActual === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-100"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-600">
                Página {paginaActual} de {totalPaginas}
              </span>
              <button
                onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaActual === totalPaginas}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-100"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}

      {/* Estadísticas */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-xs font-medium text-gray-600 mb-1">Total Documentos</p>
          <p className="text-2xl font-bold text-gray-900">{documentos.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-xs font-medium text-gray-600 mb-1">Borradores</p>
          <p className="text-2xl font-bold text-gray-500">{documentos.filter((d) => d.estado === 'borrador').length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-xs font-medium text-gray-600 mb-1">En Revisión</p>
          <p className="text-2xl font-bold text-blue-600">{documentos.filter((d) => d.estado === 'enviado_para_revision').length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-xs font-medium text-gray-600 mb-1">Aprobados</p>
          <p className="text-2xl font-bold text-green-600">{documentos.filter((d) => d.estado === 'aprobado').length}</p>
        </div>
      </div>
    </div>
  )
}

export default DocumentosCargueIndex
