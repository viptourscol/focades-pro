import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import DocumentosCargueIndex from '../components/DocumentosCargueIndex'
import EditorDocumentoCargue from '../components/EditorDocumentoCargue'
import BotonesFlujoCargue from '../components/BotonesFlujoCargue'
import ValidacionesDisplay from '../components/ValidacionesDisplay'
import DashboardPorRol from '../components/DashboardPorRol'
import { ArrowLeft, FileText, AlertCircle, X } from 'lucide-react'

const ROLES_VALIDOS = [
  'admin_educacion',
  'admin_presupuesto',
  'admin_contabilidad',
  'admin_pagos',
  'admin_visualizacion'
]

const obtenerRolActivo = (authUser) => {
  const candidatos = [
    authUser?.user_metadata?.roles,
    authUser?.app_metadata?.roles,
    authUser?.user_metadata?.role,
    authUser?.app_metadata?.role
  ]
  const lista = candidatos.flatMap((c) => (Array.isArray(c) ? c : c ? [c] : []))
  return lista.find((r) => ROLES_VALIDOS.includes(r)) || null
}

const AdminCargueDocumentos = () => {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [documentoSeleccionado, setDocumentoSeleccionado] = useState(null)
  const [documentoDetalle, setDocumentoDetalle] = useState(null)
  const [convocatorias, setConvocatorias] = useState([])
  const [convocatoriaId, setConvocatoriaId] = useState('')
  const [documentoTipo, setDocumentoTipo] = useState(null)
  const [creando, setCreando] = useState(false)
  const [errorCreacion, setErrorCreacion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('editor') // 'editor' | 'validaciones' | 'historial'
  const [estadisticas, setEstadisticas] = useState(null)
  // Nuevos estados para el modal de filtros
  const [mostrarModalFiltros, setMostrarModalFiltros] = useState(false)
  const [modalidadBeca, setModalidadBeca] = useState('')
  const [tipoDocumentoEnCreacion, setTipoDocumentoEnCreacion] = useState(null)

  useEffect(() => {
    cargarUsuario()
  }, [])

  const cargarUsuario = async () => {
    try {
      const {
        data: { session },
        error: authError
      } = await supabase.auth.getSession()

      if (authError || !session) {
        setError('No autorizado')
        return
      }

      const {
        data: { user: authUser }
      } = await supabase.auth.getUser()

      setUser(authUser)
      const role = obtenerRolActivo(authUser)
      if (!role) {
        setError('Tu usuario no tiene un rol asignado. Contacta al administrador.')
        return
      }
      setUserRole(role)

      const { data: listaConvocatorias, error: convError } = await supabase
        .from('convocatorias')
        .select('id, nombre, anio')
        .order('anio', { ascending: false })
      if (convError) throw convError
      setConvocatorias(listaConvocatorias || [])
      if (listaConvocatorias?.[0]) setConvocatoriaId(listaConvocatorias[0].id)

      // Cargar estadísticas
      // En caso real, esto vendría de una función SQL o Edge Function
      setEstadisticas({
        total_documentos: 0,
        documentos_borrador: 0,
        documentos_revision: 0,
        documentos_aprobados: 0
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  const crearDocumento = async (tipo) => {
    // Si es RP (Resolución y Promoción), mostrar modal de filtros por modalidad
    if (tipo === 'rp') {
      setTipoDocumentoEnCreacion(tipo)
      setMostrarModalFiltros(true)
      return
    }

    // Para otros tipos, crear directamente
    await realizarCreacionDocumento(tipo, null)
  }

  const realizarCreacionDocumento = async (tipo, modalidad = null) => {
    try {
      setCreando(true)
      setErrorCreacion(null)
      const { data: nuevoId, error: errorRpc } = await supabase.rpc('fn_crear_documento_cargue', {
        p_convocatoria_id: convocatoriaId,
        p_tipo_documento: tipo,
        p_cantidad_registros: 0
      })
      if (errorRpc) throw errorRpc

      if (tipo === 'rp') {
        const modalidadFiltro = modalidad || null
        const { data: resultadoPrecarga, error: errorPrecarga } = await supabase.rpc(
          'precargar_rp_convocatoria',
          {
            p_documento_id: nuevoId,
            p_modalidad_beca: modalidadFiltro
          }
        )
        if (errorPrecarga) throw errorPrecarga
        
        // Mostrar resultado de precarga
        if (resultadoPrecarga && resultadoPrecarga.length > 0) {
          console.log('Precarga completada:', resultadoPrecarga[0].mensaje)
        }
      }

      setDocumentoTipo(tipo)
      setDocumentoSeleccionado(nuevoId)
      setMostrarModalFiltros(false)
      setModalidadBeca('')  // Resetear modalidad para próximo uso
    } catch (err) {
      setErrorCreacion(err.message)
    } finally {
      setCreando(false)
    }
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-red-200 max-w-md">
          <div className="flex gap-3">
            <AlertCircle size={24} className="text-red-600 flex-shrink-0" />
            <div>
              <h2 className="font-bold text-red-800">Error</h2>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Vista de dashboard de rol
  if (!documentoSeleccionado) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Sistema de Cargue de Documentos</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Bienvenido, <span className="font-semibold">{userRole?.replace(/_/g, ' ').toUpperCase()}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Sidebar - Dashboard por rol */}
            <div className="lg:col-span-1">
              <div className="sticky top-20">
                <DashboardPorRol userRole={userRole} estadisticas={estadisticas} />
              </div>
            </div>

            {/* Main content - Lista de documentos */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <label htmlFor="select-convocatoria" className="block text-xs font-semibold text-gray-600 mb-2">
                  CONVOCATORIA
                </label>
                <select
                  id="select-convocatoria"
                  value={convocatoriaId}
                  onChange={(e) => setConvocatoriaId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar convocatoria...</option>
                  {convocatorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {convocatoriaId ? (
                <DocumentosCargueIndex
                  onSelectDocumento={(id, tipo) => {
                  setDocumentoTipo(tipo)
                  setDocumentoSeleccionado(id)
                }}
                  userRole={userRole}
                  convocatoriaId={convocatoriaId}
                />
              ) : (
                <p className="text-sm text-gray-600 bg-white p-4 rounded-lg border border-gray-200">
                  Selecciona una convocatoria para ver sus documentos.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Modal de filtros para crear RP */}
        {mostrarModalFiltros && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 pointer-events-none">
            <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 pointer-events-auto">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Crear Documento: RP (Resolución y Promoción)</h2>
                <button
                  onClick={() => setMostrarModalFiltros(false)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition"
                  disabled={creando}
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Modalidad de Beca (Opcional)
                  </label>
                  <select
                    value={modalidadBeca}
                    onChange={(e) => setModalidadBeca(e.target.value)}
                    disabled={creando}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Todas las modalidades</option>
                    <option value="SUEÑOS">Sueños Educativos</option>
                    <option value="MÉRITO">Mérito Educativo</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Se precargará aspirantes ADMITIDOS de la convocatoria seleccionada
                  </p>
                </div>

                {errorCreacion && (
                  <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                    {errorCreacion}
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end p-6 border-t border-gray-200">
                <button
                  onClick={() => setMostrarModalFiltros(false)}
                  disabled={creando}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => realizarCreacionDocumento(
                    'rp',
                    modalidadBeca || null
                  )}
                  disabled={creando}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                >
                  {creando ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Creando...
                    </>
                  ) : (
                    'Crear Documento'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Vista de edición de documento
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setDocumentoSeleccionado(null)
                setDocumentoDetalle(null)
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
              title="Volver"
            >
              <ArrowLeft size={24} className="text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                {documentoSeleccionado === 'nuevo' ? 'Nuevo Documento' : 'Editar Documento'}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {documentoSeleccionado === 'nuevo'
                  ? 'Selecciona el tipo de documento a crear'
                  : `Documento: ${documentoSeleccionado?.substring(0, 8)}...`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {errorCreacion && (
          <p className="mb-4 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{errorCreacion}</p>
        )}
        {documentoSeleccionado === 'nuevo' ? (
          // Selector de tipo de documento
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {['terceros', 'rp', 'op', 'contabilidad', 'siafe'].map((tipo) => {
              // Solo mostrar tipos permitidos para el rol
              const tiposPermitidos = {
                admin_educacion: ['terceros', 'rp'],
                admin_presupuesto: ['terceros', 'rp'],
                admin_contabilidad: ['op', 'contabilidad'],
                admin_pagos: ['siafe'],
                admin_visualizacion: []
              }

              if (!tiposPermitidos[userRole]?.includes(tipo)) {
                return null
              }

              const tipoConfig = {
                terceros: { icon: '👥', label: 'TERCEROS', desc: 'Beneficiarios y terceros' },
                rp: { icon: '💰', label: 'RP', desc: 'Registros presupuestales' },
                op: { icon: '📋', label: 'OP', desc: 'Órdenes de pago' },
                contabilidad: { icon: '📊', label: 'CONTABILIDAD', desc: 'Asientos contables' },
                siafe: { icon: '🏦', label: 'SIAFE', desc: 'Datos bancarios' }
              }

              const config = tipoConfig[tipo]

              return (
                <button
                  key={tipo}
                  onClick={() => crearDocumento(tipo)}
                  disabled={creando}
                  className="p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-lg transition text-left"
                >
                  <div className="text-4xl mb-3">{config.icon}</div>
                  <h3 className="font-bold text-lg text-gray-900">{config.label}</h3>
                  <p className="text-sm text-gray-600 mt-1">{config.desc}</p>
                </button>
              )
            })}
          </div>
        ) : (
          // Editor de documento
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Main editor */}
            <div className="lg:col-span-3 space-y-6">
              {/* Tabs */}
              <div className="flex gap-2 border-b border-gray-200">
                <button
                  onClick={() => setActiveTab('editor')}
                  className={`px-4 py-2 font-medium text-sm border-b-2 transition ${
                    activeTab === 'editor'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <FileText size={18} className="inline mr-2" />
                  Editor de Datos
                </button>
                <button
                  onClick={() => setActiveTab('validaciones')}
                  className={`px-4 py-2 font-medium text-sm border-b-2 transition ${
                    activeTab === 'validaciones'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <AlertCircle size={18} className="inline mr-2" />
                  Validaciones
                </button>
              </div>

              {/* Tab content */}
              <div className="bg-white p-6 rounded-lg border border-gray-200">
                {activeTab === 'editor' && (
                  <EditorDocumentoCargue
                    documentoId={documentoSeleccionado}
                    tipoDocumento={documentoTipo || 'terceros'}
                    userRole={userRole}
                    onGuardado={(data) => {
                      console.log('Documento guardado:', data)
                    }}
                    onCancelado={() => setDocumentoSeleccionado(null)}
                  />
                )}

                {activeTab === 'validaciones' && (
                  <ValidacionesDisplay documentoId={documentoSeleccionado} />
                )}
              </div>
            </div>

            {/* Sidebar - Acciones y flujo */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Información del documento */}
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <p className="text-xs font-semibold text-gray-600 mb-3">INFORMACIÓN</p>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-gray-600 text-xs">Tipo</dt>
                      <dd className="font-medium text-gray-900">
                        {documentoTipo?.toUpperCase() || 'NUEVO'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-600 text-xs">Rol</dt>
                      <dd className="font-medium text-gray-900">{userRole?.replace(/_/g, ' ').toUpperCase()}</dd>
                    </div>
                  </dl>
                </div>

                {/* Botones de flujo */}
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-3">ACCIONES</p>
                  <BotonesFlujoCargue
                    documentoId={documentoSeleccionado}
                    estado="borrador"
                    tipoDocumento={documentoTipo || 'terceros'}
                    userRole={userRole}
                    onAccionCompletada={(data) => {
                      console.log('Acción completada:', data)
                    }}
                  />
                </div>

                {/* Ayuda */}
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-800 font-semibold mb-2">💡 Ayuda</p>
                  <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                    <li>Completa todos los campos requeridos (*)</li>
                    <li>Valida antes de enviar</li>
                    <li>Resuelve los errores reportados</li>
                    <li>Envía para revisión cuando esté listo</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminCargueDocumentos
