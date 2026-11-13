import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import DocumentosCargueIndex from '../components/DocumentosCargueIndex'
import EditorDocumentoCargue from '../components/EditorDocumentoCargue'
import BotonesFlujoCargue from '../components/BotonesFlujoCargue'
import ValidacionesDisplay from '../components/ValidacionesDisplay'
import DashboardPorRol from '../components/DashboardPorRol'
import { ArrowLeft, FileText, AlertCircle, CalendarDays, ClipboardList, FolderOpen, HelpCircle, Landmark, Users, Wallet } from 'lucide-react'

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
  const [errorDetalle, setErrorDetalle] = useState(null)
  const [convocatorias, setConvocatorias] = useState([])
  const [convocatoriaId, setConvocatoriaId] = useState('')
  const [documentoTipo, setDocumentoTipo] = useState(null)
  const [creando, setCreando] = useState(false)
  const [errorCreacion, setErrorCreacion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('editor') // 'editor' | 'validaciones' | 'historial'
  const [cambiosTerceros, setCambiosTerceros] = useState(false)

  useEffect(() => {
    cargarUsuario()
  }, [])

  useEffect(() => {
    let activo = true
    if (!documentoSeleccionado || documentoSeleccionado === 'nuevo') return
    const cargarDetalle = async () => {
      const { data, error: errorConsulta } = await supabase
        .from('portal_documentos_cargue')
        .select('id, tipo_documento, estado, comentarios_rechazo')
        .eq('id', documentoSeleccionado)
        .single()
      if (!activo) return
      if (errorConsulta) setErrorDetalle(`No se pudo consultar el estado del documento: ${errorConsulta.message}`)
      else {
        setErrorDetalle(null)
        setDocumentoDetalle(data)
      }
    }
    cargarDetalle().catch((err) => {
      if (activo) setErrorDetalle(`No se pudo consultar el estado del documento: ${err.message}`)
    })
    return () => { activo = false }
  }, [documentoSeleccionado])

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

    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  const crearDocumento = async (tipo) => {
    // RP es Registro Presupuestal y requiere la aprobación previa de TERCEROS.
    if (tipo === 'rp') {
      try {
        setErrorCreacion(null)
        const { data, error: errorRequisito } = await supabase.from('portal_documentos_cargue')
          .select('id').eq('convocatoria_id', convocatoriaId).eq('tipo_documento', 'terceros')
          .in('estado', ['aprobado', 'finalizado']).not('aprobado_por', 'is', null).limit(1)
        if (errorRequisito) throw errorRequisito
        if (!data?.length) throw new Error('Presupuesto debe aprobar un documento TERCEROS de esta convocatoria antes de crear RP.')
      } catch (err) {
        setErrorCreacion(err.message)
        return
      }
    }

    await realizarCreacionDocumento(tipo)
  }

  const realizarCreacionDocumento = async (tipo) => {
    let nuevoDocumentoId = null
    try {
      setCreando(true)
      setErrorCreacion(null)
      const { data: nuevoId, error: errorRpc } = await supabase.rpc('fn_crear_documento_cargue', {
        p_convocatoria_id: convocatoriaId,
        p_tipo_documento: tipo,
        p_cantidad_registros: 0
      })
      if (errorRpc) throw errorRpc

      nuevoDocumentoId = nuevoId
    } catch (err) {
      setErrorCreacion(err.message)
    } finally {
      if (nuevoDocumentoId) {
        setDocumentoTipo(tipo)
        setDocumentoSeleccionado(nuevoDocumentoId)
      }
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
      <div className="min-h-screen bg-[#f5f6f4] text-slate-800">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-end justify-between gap-6 px-4 py-7 sm:px-8 sm:py-8">
            <div className="min-w-0">
              <p className="mb-3 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-800"><FolderOpen size={14} aria-hidden="true" />Gestión documental · FOCADES</p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Cargue de documentos</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">Información organizada, revisión trazable y continuidad del proceso.</p>
            </div>
            <div className="w-full sm:w-72">
              <label htmlFor="select-convocatoria" className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><CalendarDays size={13} aria-hidden="true" />Convocatoria activa en la vista</label>
              <select id="select-convocatoria" value={convocatoriaId} onChange={(e) => setConvocatoriaId(e.target.value)}
                className="min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-800 outline-none transition focus-visible:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-100">
                <option value="">Seleccionar convocatoria…</option>
                {convocatorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-8 sm:py-8">
          <DashboardPorRol userRole={userRole} />
          {convocatoriaId ? (
            <DocumentosCargueIndex
              key={convocatoriaId}
              onSelectDocumento={(id, tipo) => {
                setDocumentoDetalle(null)
                setErrorDetalle(null)
                setDocumentoTipo(tipo)
                setDocumentoSeleccionado(id)
              }}
              userRole={userRole}
              convocatoriaId={convocatoriaId}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <CalendarDays size={28} className="text-slate-400" aria-hidden="true" />
              <h2 className="font-bold text-slate-800">Selecciona una convocatoria</h2>
              <p className="text-sm text-slate-500">Usa el selector superior para consultar sus documentos y estados.</p>
            </div>
          )}
        </main>
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
                if (cambiosTerceros && !window.confirm('Tienes cambios sin guardar. ¿Salir y descartarlos?')) return
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
                {documentoSeleccionado === 'nuevo' ? 'Nuevo Documento' : userRole === 'admin_presupuesto' ? 'Revisar Documento' : 'Editar Documento'}
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
        {errorDetalle && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorDetalle}</p>}
        {documentoDetalle?.id === documentoSeleccionado && documentoDetalle.comentarios_rechazo && ['rechazado', 'borrador'].includes(documentoDetalle.estado) && (
          <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Motivo de devolución: </strong>{documentoDetalle.comentarios_rechazo}</p>
        )}
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
                admin_presupuesto: [],
                admin_contabilidad: ['op', 'contabilidad'],
                admin_pagos: ['siafe'],
                admin_visualizacion: []
              }

              if (!tiposPermitidos[userRole]?.includes(tipo)) {
                return null
              }

              const tipoConfig = {
                terceros: { icon: Users, label: 'TERCEROS', desc: 'Datos de aspirantes y terceros' },
                rp: { icon: Wallet, label: 'RP', desc: 'Registros presupuestales' },
                op: { icon: ClipboardList, label: 'OP', desc: 'Órdenes de pago' },
                contabilidad: { icon: FileText, label: 'CONTABILIDAD', desc: 'Asientos contables' },
                siafe: { icon: Landmark, label: 'SIAFE', desc: 'Datos bancarios' }
              }

              const config = tipoConfig[tipo]
              const Icono = config.icon

              return (
                <button
                  key={tipo}
                  onClick={() => crearDocumento(tipo)}
                  disabled={creando}
                  className="rounded-2xl border border-slate-200 bg-white p-6 text-left transition hover:border-emerald-700 hover:shadow-sm focus-visible:outline-emerald-700 disabled:opacity-50"
                >
                  <span className="mb-4 inline-flex rounded-xl bg-emerald-50 p-3 text-emerald-800"><Icono size={26} aria-hidden="true" /></span>
                  <h3 className="font-bold text-lg text-gray-900">{config.label}</h3>
                  <p className="text-sm text-gray-600 mt-1">{config.desc}</p>
                </button>
              )
            })}
          </div>
        ) : (
          // Editor de documento
          <div className={`grid grid-cols-1 gap-6 ${['terceros', 'rp'].includes(documentoTipo) ? '' : 'lg:grid-cols-4'}`}>
            {/* Main editor */}
            <div className={`min-w-0 space-y-6 ${['terceros', 'rp'].includes(documentoTipo) ? '' : 'lg:col-span-3'}`}>
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
                  {documentoTipo === 'terceros' && userRole === 'admin_presupuesto' ? 'Lista de Terceros' : 'Editor de Datos'}
                </button>
                <button
                  onClick={() => {
                    if (cambiosTerceros && !window.confirm('Tienes cambios sin guardar. ¿Abrir validaciones y descartarlos?')) return
                    setActiveTab('validaciones')
                  }}
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
                {activeTab === 'editor' && (documentoDetalle?.id === documentoSeleccionado ? (
                  <EditorDocumentoCargue
                    key={`${documentoSeleccionado}-${documentoDetalle?.estado || 'cargando'}`}
                    documentoId={documentoSeleccionado}
                    tipoDocumento={documentoTipo || 'terceros'}
                    userRole={userRole}
                    onCambiosPendientes={setCambiosTerceros}
                    onGuardado={(data) => {
                      console.log('Documento guardado:', data)
                    }}
                    onCancelado={() => setDocumentoSeleccionado(null)}
                  />
                ) : <p className="text-sm text-gray-500">{errorDetalle ? 'Editor no disponible hasta consultar el documento.' : 'Consultando estado del documento…'}</p>)}

                {activeTab === 'validaciones' && (
                  <ValidacionesDisplay key={documentoSeleccionado} documentoId={documentoSeleccionado} tipoDocumento={documentoTipo} />
                )}
              </div>
            </div>

            {/* Sidebar - Acciones y flujo */}
            <div className="lg:col-span-1">
              <div className={['terceros', 'rp'].includes(documentoTipo) ? 'grid grid-cols-1 gap-6 md:grid-cols-3' : 'sticky top-24 space-y-6'}>
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
                  {cambiosTerceros ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                      Guarda o cancela los cambios del editor antes de continuar con las acciones del documento.
                    </p>
                  ) : documentoDetalle?.id === documentoSeleccionado ? (
                    <BotonesFlujoCargue
                      key={`${documentoSeleccionado}-${documentoDetalle.estado}`}
                      documentoId={documentoSeleccionado}
                      estado={documentoDetalle.estado}
                      tipoDocumento={documentoTipo || 'terceros'}
                      userRole={userRole}
                      onAccionCompletada={(data) => {
                        setDocumentoDetalle((actual) => ({ ...actual, estado: data.nuevo_estado }))
                      }}
                    />
                  ) : <p className="text-sm text-gray-500">{errorDetalle ? 'Acciones no disponibles hasta consultar el estado.' : 'Consultando estado del documento…'}</p>}
                </div>

                {/* Ayuda */}
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-blue-800"><HelpCircle size={15} aria-hidden="true" />Guía de trabajo</p>
                  {documentoTipo === 'terceros' && userRole === 'admin_presupuesto' ? <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                    <li>Revisa las 22 columnas del listado.</li>
                    <li>En revisión, corrige celdas con motivo e historial.</li>
                    <li>Agregar o eliminar personas corresponde a Educación.</li>
                    <li>Descarga el Excel para importar en tu programa.</li>
                    <li>Descargar no aprueba: usa Aprobar o Rechazar.</li>
                    <li>La aprobación habilita RP de esta convocatoria.</li>
                  </ul> : documentoTipo === 'rp' ? <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                    <li>Selecciona el documento TERCEROS aprobado de origen.</li>
                    <li>Educación digita y confirma el valor por persona.</li>
                    <li>Presupuesto completa sus campos durante la revisión.</li>
                    <li>Los consecutivos requieren vista previa y confirmación.</li>
                    <li>Verifica la existencia del tercero y códigos en el sistema externo.</li>
                    <li>Guardar, descargar y aprobar son acciones separadas.</li>
                  </ul> : <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                    <li>Completa todos los campos requeridos (*)</li>
                    <li>Valida antes de enviar</li>
                    <li>Resuelve los errores reportados</li>
                    <li>Envía para revisión cuando esté listo</li>
                  </ul>}
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
