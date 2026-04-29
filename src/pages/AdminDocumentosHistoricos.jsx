import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSafeSession } from '../lib/supabase'
import ImportStepper from '../components/ImportStepper'
import LoteInfoBanner from '../components/LoteInfoBanner'
import {
  CheckCircle2,
  Clock,
  Upload,
  Eye,
  X,
  FileText,
  AlertCircle,
  Search,
} from 'lucide-react'
import DocViewerModal from '../components/DocViewerModal'

// Tipos de documentos del flujo de aspirantes (los mismos que sube el estudiante)
// Excluye: firma_digital, tratamiento_datos, aceptacion_terminos (se generan en primer login)
const TIPO_DOC_ASPIRANTE = [
  { value: 'documento_identidad', label: 'Documento de identidad', requerido: true },
  { value: 'acta_grado', label: 'Acta de grado', requerido: true },
  { value: 'diploma', label: 'Diploma', requerido: true },
  { value: 'pruebas_saber', label: 'Pruebas Saber 11', requerido: true },
  { value: 'cert_matricula', label: 'Certificado de matrícula', requerido: true },
  { value: 'ficha_sisben', label: 'Ficha Sisbén', requerido: true },
  { value: 'cert_notas', label: 'Certificado de notas', requerido: false },
  { value: 'cert_enfoque', label: 'Cert. enfoque diferencial', requerido: false },
  { value: 'certificado_bancario', label: 'Certificado bancario', requerido: false },
  { value: 'otro', label: 'Otro documento', requerido: false },
]

const TIPO_DOC_MAP = Object.fromEntries(TIPO_DOC_ASPIRANTE.map((t) => [t.value, t.label]))

const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_SIZE_MB = 10

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── DocStatusBadge ─────────────────────────────────────────────────────────
function DocStatusBadge({ estado }) {
  if (estado === 'cargado') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-2 py-0.5 rounded-full">
        <CheckCircle2 size={11} /> Cargado
      </span>
    )
  }
  if (estado === 'pendiente') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-2 py-0.5 rounded-full">
        <Clock size={11} /> Pendiente
      </span>
    )
  }
  return null
}

export default function AdminDocumentosHistoricos() {
  const [searchParams] = useSearchParams()
  const loteId = searchParams.get('lote') || ''

  const [busqueda, setBusqueda] = useState('')
  const [beneficiarios, setBeneficiarios] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Modal
  const [modal, setModal] = useState(null) // { beneficiario }
  const [docsBeneficiario, setDocsBeneficiario] = useState([])
  const [docsLoading, setDocsLoading] = useState(false)

  // Upload form
  const [uploadTipo, setUploadTipo] = useState('documento_identidad')
  const [uploadTitulo, setUploadTitulo] = useState('')
  const [uploadFecha, setUploadFecha] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadObs, setUploadObs] = useState('')
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const fileRef = useRef(null)

  // Pendiente form
  const [pendTipo, setPendTipo] = useState('documento_identidad')
  const [pendObs, setPendObs] = useState('')
  const [pendLoading, setPendLoading] = useState(false)
  const [pendError, setPendError] = useState(null)

  // Visor de documentos (sub-modal)
  const [viewingDoc, setViewingDoc] = useState(null)
  const [pendSuccess, setPendSuccess] = useState(false)

  // Tab activo del modal
  const [modalTab, setModalTab] = useState('checklist') // 'checklist' | 'subir' | 'pendiente'
  const [showSuccessModal, setShowSuccessModal] = useState(false)

  useEffect(() => {
    const debounce = setTimeout(() => fetchBeneficiarios(), 350)
    return () => clearTimeout(debounce)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, loteId])

  const fetchBeneficiarios = async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('portal_beneficiarios')
        .select(`
          id, nombre_completo, n_documento, email,
          portal_beneficiario_documentos_historicos(count)
        `)
        .eq('origen_registro', 'historico')
        .order('nombre_completo', { ascending: true })
        .limit(100)

      if (loteId) query = query.eq('pertenece_lote_id', loteId)
      if (busqueda.trim()) {
        const term = busqueda.trim()
        query = query.or(`nombre_completo.ilike.%${term}%,n_documento.ilike.%${term}%`)
      }

      const { data, error: dbError } = await query
      if (dbError) throw dbError
      setBeneficiarios(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadDocs = useCallback(async (beneficiarioId) => {
    setDocsLoading(true)
    try {
      const { data, error: dbError } = await supabase
        .from('portal_beneficiario_documentos_historicos')
        .select('id, titulo, tipo_documento, estado, fecha_documento, storage_path, archivo_size_bytes, observacion_admin, created_at')
        .eq('beneficiario_id', beneficiarioId)
        .order('created_at', { ascending: false })
      if (!dbError) setDocsBeneficiario(data || [])
    } finally {
      setDocsLoading(false)
    }
  }, [])

  const openModal = async (beneficiario) => {
    setModal({ beneficiario })
    setModalTab('checklist')
    resetUploadForm()
    resetPendForm()
    await loadDocs(beneficiario.id)
  }

  const closeModal = () => {
    setModal(null)
    fetchBeneficiarios()
  }

  const resetUploadForm = () => {
    setUploadTipo('documento_identidad')
    setUploadTitulo('')
    setUploadFecha('')
    setUploadFile(null)
    setUploadObs('')
    setUploadError(null)
    setUploadSuccess(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const resetPendForm = () => {
    setPendTipo('documento_identidad')
    setPendObs('')
    setPendError(null)
    setPendSuccess(false)
  }

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!ALLOWED_MIME.includes(f.type)) {
      setUploadError('Tipo de archivo no permitido. Usa PDF, imagen o Word.')
      return
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setUploadError(`El archivo supera el límite de ${MAX_SIZE_MB} MB.`)
      return
    }
    setUploadError(null)
    setUploadFile(f)
  }

  const uploadDocument = async () => {
    if (!uploadFile || !modal?.beneficiario) return
    if (!uploadTitulo.trim()) {
      setUploadError('El título del documento es obligatorio.')
      return
    }
    setUploadLoading(true)
    setUploadError(null)
    setUploadSuccess(false)
    try {
      const { session } = await getSafeSession()
      if (!session?.access_token) {
        setUploadError('Sesión expirada. Inicia sesión nuevamente.')
        return
      }
      const ext = uploadFile.name.split('.').pop()
      const safeName = `${uploadTipo}-${Date.now()}.${ext}`
      // bucketPath: ruta dentro del bucket (sin el nombre del bucket)
      const bucketPath = `beneficiarios_historicos/${modal.beneficiario.id}/${safeName}`
      // dbPath: incluye el nombre del bucket para cumplir el CHECK constraint
      const dbPath = `soportes/${bucketPath}`

      const { error: storageError } = await supabase.storage
        .from('soportes')
        .upload(bucketPath, uploadFile, { contentType: uploadFile.type, upsert: false })
      if (storageError) throw new Error(`Error en almacenamiento: ${storageError.message}`)

      const { error: insertError } = await supabase
        .from('portal_beneficiario_documentos_historicos')
        .insert({
          beneficiario_id: modal.beneficiario.id,
          lote_id: loteId || null,
          titulo: uploadTitulo.trim(),
          tipo_documento: uploadTipo,
          estado: 'cargado',
          fecha_documento: uploadFecha || null,
          observacion_admin: uploadObs.trim() || null,
          storage_bucket: 'soportes',
          storage_path: dbPath,
          archivo_mime_type: uploadFile.type,
          archivo_size_bytes: uploadFile.size,
          created_by_user_id: session.user.id,
        })
      if (insertError) throw new Error(`Error al registrar documento: ${insertError.message}`)

      setUploadSuccess(true)
      setShowSuccessModal(true)
      resetUploadForm()
      await loadDocs(modal.beneficiario.id)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploadLoading(false)
    }
  }

  const marcarPendiente = async () => {
    if (!modal?.beneficiario) return
    setPendLoading(true)
    setPendError(null)
    setPendSuccess(false)
    try {
      const { session } = await getSafeSession()
      if (!session?.access_token) {
        setPendError('Sesión expirada.')
        return
      }
      const tipoLabel = TIPO_DOC_MAP[pendTipo] || pendTipo
      const { error: insertError } = await supabase
        .from('portal_beneficiario_documentos_historicos')
        .insert({
          beneficiario_id: modal.beneficiario.id,
          lote_id: loteId || null,
          titulo: `${tipoLabel} — Pendiente`,
          tipo_documento: pendTipo,
          estado: 'pendiente',
          observacion_admin: pendObs.trim() || null,
          storage_bucket: 'soportes',
          storage_path: `soportes/beneficiarios_historicos/${modal.beneficiario.id}/pendiente-${pendTipo}-${Date.now()}`,
          created_by_user_id: session.user.id,
        })
      if (insertError) throw new Error(insertError.message)
      setPendSuccess(true)
      resetPendForm()
      await loadDocs(modal.beneficiario.id)
    } catch (err) {
      setPendError(err.message)
    } finally {
      setPendLoading(false)
    }
  }

  const openDocViewer = (doc) => {
    setViewingDoc({
      storage_path: (doc.storage_path || '').replace(/^soportes\//, ''),
      tipo_documento: doc.tipo_documento,
      nombre_original: doc.titulo || doc.tipo_documento,
      mime_type: doc.archivo_mime_type,
    })
  }

  // Construir mapa tipo → último doc para el checklist
  const buildChecklistMap = () => {
    const map = {}
    for (const doc of docsBeneficiario) {
      if (!map[doc.tipo_documento]) map[doc.tipo_documento] = doc
    }
    return map
  }

  return (
    <div className="space-y-4">
      <ImportStepper currentStep={2} loteId={loteId || undefined} />
      {loteId && <LoteInfoBanner loteId={loteId} />}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-black text-slate-800">Documentos de Beneficiarios Históricos</h2>
            <p className="text-sm text-slate-500 mt-1">
              Revisión y carga de soportes por beneficiario.{' '}
              {loteId && <span className="font-mono text-xs text-blue-600">Lote: {loteId.slice(0, 8)}…</span>}
            </p>
          </div>
          {loteId && (
            <a
              href={`/admin/importar-pagos?lote=${loteId}`}
              className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700"
            >
              Siguiente: Importar pagos →
            </a>
          )}
        </div>

        <div className="relative mb-5 w-full md:w-80">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o cédula…"
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-xl mb-4">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-slate-400">Cargando beneficiarios…</div>
        ) : beneficiarios.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            {busqueda ? 'Sin coincidencias para la búsqueda.' : 'No hay beneficiarios históricos registrados.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Beneficiario</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Cédula</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Correo</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Docs</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Acción</th>
                </tr>
              </thead>
              <tbody>
                {beneficiarios.map((b) => {
                  const docsCount = b.portal_beneficiario_documentos_historicos?.[0]?.count ?? 0
                  return (
                    <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">{b.nombre_completo}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{b.n_documento}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{b.email || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${docsCount > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
                          {docsCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openModal(b)}
                          className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          Gestionar docs
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {beneficiarios.length === 100 && (
              <p className="text-xs text-slate-400 mt-2 text-right">Mostrando primeros 100. Usa la búsqueda para filtrar.</p>
            )}
          </div>
        )}
      </div>

      {/* ─── Modal de gestión ─────────────────────────────────────────── */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-black text-slate-800">{modal.beneficiario.nombre_completo}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{modal.beneficiario.n_documento}</p>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 text-2xl leading-none p-1">&times;</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 px-6">
              {[
                { key: 'checklist', label: 'Checklist' },
                { key: 'subir', label: 'Subir documento' },
                { key: 'pendiente', label: 'Marcar pendiente' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setModalTab(tab.key)}
                  className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                    modalTab === tab.key
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* TAB: Checklist */}
              {modalTab === 'checklist' && (
                <div>
                  <p className="text-xs text-slate-500 mb-4">
                    Estado de cada tipo de documento del flujo de aspirantes.
                    Los documentos de firma y consentimiento se generan automáticamente en el primer inicio de sesión del beneficiario.
                  </p>
                  {docsLoading ? (
                    <p className="text-sm text-slate-400 py-4">Cargando…</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {TIPO_DOC_ASPIRANTE.map((tipo) => {
                        const checklistMap = buildChecklistMap()
                        const doc = checklistMap[tipo.value]
                        return (
                          <div
                            key={tipo.value}
                            className={`flex items-center justify-between p-3 rounded-xl border ${
                              doc?.estado === 'cargado'
                                ? 'border-emerald-200 bg-emerald-50'
                                : doc?.estado === 'pendiente'
                                ? 'border-amber-200 bg-amber-50'
                                : 'border-slate-200 bg-white'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText size={14} className={doc?.estado === 'cargado' ? 'text-emerald-600' : doc?.estado === 'pendiente' ? 'text-amber-500' : 'text-slate-400'} />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-700 truncate">{tipo.label}</p>
                                {tipo.requerido && !doc && (
                                  <p className="text-[10px] text-slate-400">Recomendado</p>
                                )}
                                {doc?.observacion_admin && (
                                  <p className="text-[10px] text-slate-500 truncate">{doc.observacion_admin}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-2 shrink-0">
                              {doc ? (
                                <>
                                  <DocStatusBadge estado={doc.estado} />
                                  {doc.storage_path && !doc.storage_path.includes('pendiente-') && (
                                    <button
                                      onClick={() => openDocViewer(doc)}
                                      className="text-blue-600 hover:text-blue-800"
                                      title="Ver archivo"
                                    >
                                      <Eye size={14} />
                                    </button>
                                  )}
                                </>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">Sin registrar</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Documentos adicionales (tipo: otro, cv, etc.) */}
                  {docsBeneficiario.filter((d) => !TIPO_DOC_ASPIRANTE.find((t) => t.value === d.tipo_documento)).length > 0 && (
                    <div className="mt-5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Otros documentos</p>
                      <ul className="space-y-2">
                        {docsBeneficiario
                          .filter((d) => !TIPO_DOC_ASPIRANTE.find((t) => t.value === d.tipo_documento))
                          .map((doc) => (
                            <li key={doc.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3 border border-slate-200">
                              <div>
                                <p className="text-sm font-medium text-slate-800">{doc.titulo}</p>
                                <p className="text-xs text-slate-500">
                                  {TIPO_DOC_MAP[doc.tipo_documento] || doc.tipo_documento}
                                  {doc.fecha_documento && ` · ${doc.fecha_documento}`}
                                  {doc.archivo_size_bytes > 0 && ` · ${formatBytes(doc.archivo_size_bytes)}`}
                                </p>
                              </div>
                              {doc.storage_path && !doc.storage_path.includes('pendiente-') && (
                                <button onClick={() => openDocViewer(doc)} className="text-xs text-blue-600 hover:underline ml-4">
                                  <Eye size={14} />
                                </button>
                              )}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => setModalTab('subir')}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700"
                    >
                      <Upload size={13} /> Subir documento
                    </button>
                    <button
                      onClick={() => setModalTab('pendiente')}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200 rounded-xl hover:bg-amber-100"
                    >
                      <Clock size={13} /> Marcar pendiente
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: Subir documento */}
              {modalTab === 'subir' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de documento *</label>
                      <select
                        value={uploadTipo}
                        onChange={(e) => setUploadTipo(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {TIPO_DOC_ASPIRANTE.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha del documento</label>
                      <input
                        type="date"
                        value={uploadFecha}
                        onChange={(e) => setUploadFecha(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Título del documento *</label>
                    <input
                      type="text"
                      value={uploadTitulo}
                      onChange={(e) => setUploadTitulo(e.target.value)}
                      placeholder="ej: Diploma de bachiller 2019"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Observación (opcional)</label>
                    <input
                      type="text"
                      value={uploadObs}
                      onChange={(e) => setUploadObs(e.target.value)}
                      placeholder="ej: Escaneado del archivo físico"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Archivo <span className="text-slate-400 font-normal">(PDF, imagen, Word — máx. {MAX_SIZE_MB} MB)</span>
                    </label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                      onChange={handleFileSelect}
                      className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {uploadFile && (
                      <p className="text-xs text-emerald-700 mt-1.5 flex items-center gap-1">
                        <CheckCircle2 size={12} /> {uploadFile.name} ({formatBytes(uploadFile.size)})
                      </p>
                    )}
                  </div>

                  {uploadError && (
                    <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-xl">
                      <AlertCircle size={15} className="shrink-0 mt-0.5" /> {uploadError}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={uploadDocument}
                      disabled={uploadLoading || !uploadFile || !uploadTitulo.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50"
                    >
                      {uploadLoading ? 'Subiendo…' : <><Upload size={14} /> Subir documento</>}
                    </button>
                    <button
                      onClick={() => setModalTab('checklist')}
                      className="flex items-center gap-1.5 px-4 py-2 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-100"
                    >
                      Ver checklist
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: Marcar pendiente */}
              {modalTab === 'pendiente' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    Marca un tipo de documento como <strong>pendiente</strong> cuando no encuentras el archivo
                    físico o digital. Quedará registrado en el checklist para seguimiento posterior.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de documento *</label>
                    <select
                      value={pendTipo}
                      onChange={(e) => setPendTipo(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {TIPO_DOC_ASPIRANTE.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Motivo / observación (opcional)</label>
                    <input
                      type="text"
                      value={pendObs}
                      onChange={(e) => setPendObs(e.target.value)}
                      placeholder="ej: No se encontró en el archivo físico"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  {pendError && (
                    <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-xl">
                      <AlertCircle size={15} className="shrink-0 mt-0.5" /> {pendError}
                    </div>
                  )}
                  {pendSuccess && (
                    <div className="flex items-center gap-2 text-amber-700 text-sm bg-amber-50 p-3 rounded-xl">
                      <Clock size={15} /> Documento marcado como pendiente.
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={marcarPendiente}
                      disabled={pendLoading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 disabled:opacity-50"
                    >
                      {pendLoading ? 'Guardando…' : <><Clock size={14} /> Marcar pendiente</>}
                    </button>
                    <button
                      onClick={() => setModalTab('checklist')}
                      className="flex items-center gap-1.5 px-4 py-2 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-100"
                    >
                      Ver checklist
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal de éxito al subir documento ────────────────────────────── */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={36} className="text-emerald-600" />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2">¡Documento subido!</h3>
            <p className="text-sm text-slate-500 mb-6">
              El archivo se guardó correctamente y ya aparece en el checklist del beneficiario.
            </p>
            <button
              onClick={() => {
                setShowSuccessModal(false)
                setModalTab('checklist')
              }}
              className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
            >
              Ver checklist
            </button>
          </div>
        </div>
      )}

      {/* ─── Sub-modal visor de documentos ─────────────────────────────── */}
      {viewingDoc && <DocViewerModal doc={viewingDoc} onClose={() => setViewingDoc(null)} />}
    </div>
  )
}

