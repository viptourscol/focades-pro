import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import DocumentosCargueIndex from '../components/DocumentosCargueIndex'
import EditorDocumentoCargue from '../components/EditorDocumentoCargue'
import BotonesFlujoCargue from '../components/BotonesFlujoCargue'
import ValidacionesDisplay from '../components/ValidacionesDisplay'
import DashboardPorRol from '../components/DashboardPorRol'
import { ArrowLeft, FileText, AlertCircle } from 'lucide-react'

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
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('editor') // 'editor' | 'validaciones' | 'historial'
  const [estadisticas, setEstadisticas] = useState(null)

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
        .select('id, nombre, activa')
        .order('nombre')
      if (convError) throw convError
      setConvocatorias(listaConvocatorias || [])
      const activa = (listaConvocatorias || []).find((c) => c.activa) || listaConvocatorias?.[0]
      if (activa) setConvocatoriaId(activa.id)

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
                      {c.nombre}{c.activa ? '' : ' (inactiva)'}
                    </option>
                  ))}
                </select>
              </div>

              {convocatoriaId ? (
                <DocumentosCargueIndex
                  onSelectDocumento={setDocumentoSeleccionado}
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
                  onClick={() => setDocumentoSeleccionado(`nuevo-${tipo}`)}
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
                    tipoDocumento={documentoDetalle?.tipo_documento || documentoSeleccionado?.split('-')[1] || 'terceros'}
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
                        {documentoSeleccionado?.split('-')[1]?.toUpperCase() || 'NUEVO'}
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
                    tipoDocumento={documentoSeleccionado?.split('-')[1] || 'terceros'}
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
