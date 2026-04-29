import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import SignaturePad from 'signature_pad'
import { supabase } from '../lib/supabase'
import { resolvePortalAccess } from '../lib/portalAuth'
import { TERMS_AND_CONDITIONS_TEXT, DATA_POLICY_TEXT } from '../lib/legalTexts'
import { CheckCircle2, ChevronRight, ChevronLeft, X, FileText, PenLine, Upload } from 'lucide-react'

// ─── Helper ──────────────────────────────────────────────────────────────────
const signaturePadToPngBlob = async (pad) => {
  if (!pad || pad.isEmpty?.()) return null
  const dataUrl = pad.toDataURL('image/png')
  const response = await fetch(dataUrl)
  return await response.blob()
}

// ─── StepIndicator ───────────────────────────────────────────────────────────
function StepIndicator({ step }) {
  const steps = ['Bienvenida', 'Términos', 'Firma']
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                i < step
                  ? 'bg-emerald-500 text-white'
                  : i === step
                  ? 'bg-blue-600 text-white ring-2 ring-blue-200'
                  : 'bg-slate-200 text-slate-400'
              }`}
            >
              {i < step ? <CheckCircle2 size={16} /> : i + 1}
            </div>
            <span className={`text-[10px] mt-1 font-semibold ${i === step ? 'text-blue-600' : 'text-slate-400'}`}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-12 h-0.5 mb-3 rounded ${i < step ? 'bg-emerald-400' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── LegalModal ──────────────────────────────────────────────────────────────
function LegalModal({ title, lines, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-black text-slate-800 text-sm">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-4 text-sm text-slate-700 leading-relaxed">
          {lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BeneficiarioOnboarding() {
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  // Step 2: términos
  const [aceptaTerminos, setAceptaTerminos] = useState(false)
  const [aceptaDatos, setAceptaDatos] = useState(false)
  const [legalModal, setLegalModal] = useState(null) // 'terminos' | 'datos'

  // Step 3: firma
  const signatureRef = useRef(null)
  const [signaturePad, setSignaturePad] = useState(null)
  const [signatureMode, setSignatureMode] = useState('draw') // 'draw' | 'upload'
  const [hasDrawn, setHasDrawn] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [uploadPreview, setUploadPreview] = useState('')
  const uploadFileRef = useRef(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // ── Auth / profile check ──────────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      const access = await resolvePortalAccess({ attemptClaim: false })
      if (!access.ok) {
        navigate('/beneficiario/login', { replace: true })
        return
      }
      if (access.profile?.onboarding_completado) {
        navigate('/beneficiario', { replace: true })
        return
      }
      setProfile(access.profile)
      setAuthLoading(false)
    }
    check()
  }, [navigate])

  // ── SignaturePad init ─────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 2 || signatureMode !== 'draw' || !signatureRef.current) return undefined

    const canvas = signatureRef.current
    const pad =
      signaturePad ||
      new SignaturePad(canvas, {
        backgroundColor: 'rgb(255,255,255)',
        penColor: 'rgb(13,44,84)',
        minWidth: 0.8,
        maxWidth: 2.4,
        throttle: 8,
        velocityFilterWeight: 0.6,
      })

    // En signature_pad v4+ onEnd/onBegin se registran como eventos
    const onEndStroke = () => setHasDrawn(true)
    pad.addEventListener('endStroke', onEndStroke)

    const resizeCanvas = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      const data = pad.isEmpty() ? null : pad.toData()
      canvas.width = Math.floor(canvas.offsetWidth * ratio)
      canvas.height = Math.floor(canvas.offsetHeight * ratio)
      canvas.getContext('2d')?.scale(ratio, ratio)
      pad.clear()
      if (data && data.length > 0) pad.fromData(data)
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    if (!signaturePad) setSignaturePad(pad)

    return () => {
      pad.removeEventListener('endStroke', onEndStroke)
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [step, signatureMode, signaturePad])

  // ── Upload preview ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uploadedFile) { setUploadPreview(''); return undefined }
    const url = URL.createObjectURL(uploadedFile)
    setUploadPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [uploadedFile])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const clearSignature = useCallback(() => {
    signaturePad?.clear()
    setHasDrawn(false)
  }, [signaturePad])

  const handleUploadFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(f.type)) {
      setSubmitError('Solo se permiten imágenes (JPG, PNG, WebP) para la firma.')
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      setSubmitError('La imagen no debe superar 5 MB.')
      return
    }
    setSubmitError(null)
    setUploadedFile(f)
    setSignatureMode('upload')
  }

  const canAdvanceStep1 = aceptaTerminos && aceptaDatos

  const canSubmit = () => {
    if (signatureMode === 'upload') return !!uploadedFile
    return hasDrawn && signaturePad && !signaturePad.isEmpty()
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!profile?.id) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      // 1. Obtener firma como blob
      let firmaBlob = null
      if (signatureMode === 'upload' && uploadedFile) {
        firmaBlob = uploadedFile
      } else {
        firmaBlob = await signaturePadToPngBlob(signaturePad)
      }

      if (!firmaBlob) {
        setSubmitError('Debes proporcionar tu firma para continuar.')
        setSubmitting(false)
        return
      }

      // 2. Subir firma al Storage
      const ts = Date.now()
      const ext = signatureMode === 'upload' ? uploadedFile.name.split('.').pop() : 'png'
      // bucketPath: ruta dentro del bucket (sin nombre del bucket)
      const bucketPath = `beneficiarios_historicos/${profile.id}/firma-digital-${ts}.${ext}`
      // dbPath: incluye el nombre del bucket para cumplir el CHECK constraint
      const dbPath = `soportes/${bucketPath}`

      const { error: storageError } = await supabase.storage
        .from('soportes')
        .upload(bucketPath, firmaBlob, { contentType: firmaBlob.type || 'image/png', upsert: false })

      if (storageError) throw new Error(`Error al guardar firma: ${storageError.message}`)

      // 3. Generar PDFs desde GAS y registrar documentos en backend
      const { data: generatedData, error: generatedError } = await supabase.functions.invoke(
        'generate-beneficiario-onboarding-docs',
        {
          body: {
            beneficiario_id: profile.id,
            firma_path: bucketPath,
            signature_file_name: signatureMode === 'upload' ? uploadedFile?.name || '' : 'firma-digital.png',
          },
        },
      )

      if (generatedError || generatedData?.ok === false) {
        throw new Error(
          generatedError?.message ||
            generatedData?.error ||
            'No se pudieron generar los documentos de onboarding en este momento.',
        )
      }

      const now = new Date().toISOString()

      // 4. Marcar onboarding como completado
      const { error: updateError } = await supabase
        .from('portal_beneficiarios')
        .update({
          onboarding_completado: true,
          acepta_terminos_at: now,
          acepta_datos_at: now,
          firma_digital_path: dbPath,
        })
        .eq('id', profile.id)

      if (updateError) throw new Error(`Error al actualizar perfil: ${updateError.message}`)

      navigate('/beneficiario', { replace: true })
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading / error states ────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <p className="text-red-600 text-sm">{authError}</p>
          <button
            onClick={() => navigate('/beneficiario/login', { replace: true })}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 pt-10">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg p-8">
        {/* Logo / branding */}
        <div className="text-center mb-6">
          <span className="text-2xl font-black text-blue-700 tracking-tight">FOCADES</span>
          <span className="text-2xl font-black text-slate-600 tracking-tight"> Pro</span>
        </div>

        <StepIndicator step={step} />

        {/* ── Step 0: Bienvenida ── */}
        {step === 0 && (
          <div className="text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 mb-2">
                ¡Bienvenido al portal del beneficiario!
              </h1>
              <p className="text-slate-500 text-sm leading-relaxed">
                Hola, <strong className="text-slate-700">{profile?.nombre_completo || 'beneficiario'}</strong>.
                Antes de acceder al portal, necesitamos que leas y aceptes los{' '}
                <strong>términos y condiciones</strong> y la{' '}
                <strong>política de datos personales</strong>, y que proporciones tu{' '}
                <strong>firma digital</strong>.
              </p>
              <p className="text-slate-400 text-xs mt-3">
                Este proceso se realiza una sola vez y no podrás acceder al portal sin completarlo.
              </p>
            </div>
            <button
              onClick={() => setStep(1)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Comenzar <ChevronRight size={17} />
            </button>
          </div>
        )}

        {/* ── Step 1: Términos ── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-black text-slate-800 mb-1">Términos y política de datos</h2>
              <p className="text-slate-500 text-sm">
                Lee los documentos y marca tu aceptación para continuar.
              </p>
            </div>

            {/* Términos y condiciones */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-700 text-sm">Términos y condiciones</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Condiciones de uso del programa de crédito educativo condonable FOCADES.
                  </p>
                </div>
                <button
                  onClick={() => setLegalModal('terminos')}
                  className="shrink-0 text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <FileText size={13} /> Leer
                </button>
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aceptaTerminos}
                  onChange={(e) => setAceptaTerminos(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-blue-600"
                />
                <span className="text-sm text-slate-700">
                  He leído y acepto los{' '}
                  <button
                    type="button"
                    onClick={() => setLegalModal('terminos')}
                    className="text-blue-600 underline"
                  >
                    términos y condiciones
                  </button>{' '}
                  del programa.
                </span>
              </label>
            </div>

            {/* Datos personales */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-700 text-sm">Política de datos personales</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tratamiento de tus datos por parte de la Alcaldía de Montelíbano.
                  </p>
                </div>
                <button
                  onClick={() => setLegalModal('datos')}
                  className="shrink-0 text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <FileText size={13} /> Leer
                </button>
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aceptaDatos}
                  onChange={(e) => setAceptaDatos(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-blue-600"
                />
                <span className="text-sm text-slate-700">
                  Autorizo el{' '}
                  <button
                    type="button"
                    onClick={() => setLegalModal('datos')}
                    className="text-blue-600 underline"
                  >
                    tratamiento de mis datos personales
                  </button>{' '}
                  según la política indicada.
                </span>
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(0)}
                className="flex items-center gap-1.5 px-4 py-2.5 text-slate-600 font-semibold rounded-xl hover:bg-slate-100"
              >
                <ChevronLeft size={16} /> Atrás
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!canAdvanceStep1}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                Continuar: Firma digital <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Firma ── */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-black text-slate-800 mb-1">Firma digital</h2>
              <p className="text-slate-500 text-sm">
                Dibuja tu firma en el recuadro o sube una imagen de tu firma.
              </p>
            </div>

            {/* Toggle draw / upload */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSignatureMode('draw')
                  setUploadedFile(null)
                  if (uploadFileRef.current) uploadFileRef.current.value = ''
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  signatureMode === 'draw'
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <PenLine size={14} /> Dibujar
              </button>
              <button
                onClick={() => {
                  setSignatureMode('upload')
                  signaturePad?.clear()
                  uploadFileRef.current?.click()
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  signatureMode === 'upload'
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Upload size={14} /> Subir imagen
              </button>
              <input
                ref={uploadFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUploadFileChange}
                className="hidden"
              />
            </div>

            {/* Canvas (draw mode) */}
            {signatureMode === 'draw' && (
              <div className="border-2 border-slate-300 rounded-xl overflow-hidden bg-white relative">
                <canvas
                  ref={signatureRef}
                  className="w-full h-44 touch-none cursor-crosshair block"
                />
                <button
                  onClick={clearSignature}
                  className="absolute top-2 right-2 text-xs text-slate-400 hover:text-slate-600 bg-white/80 rounded px-2 py-0.5"
                >
                  Limpiar
                </button>
              </div>
            )}

            {/* Upload preview */}
            {signatureMode === 'upload' && (
              <div className="border-2 border-slate-300 rounded-xl overflow-hidden bg-slate-50 flex items-center justify-center h-44">
                {uploadPreview ? (
                  <img src={uploadPreview} alt="Firma" className="max-h-full max-w-full object-contain p-2" />
                ) : (
                  <div className="text-center text-slate-400 text-sm">
                    <Upload size={24} className="mx-auto mb-2" />
                    <p>Haz clic en "Subir imagen" para seleccionar</p>
                  </div>
                )}
              </div>
            )}

            {submitError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
                {submitError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 px-4 py-2.5 text-slate-600 font-semibold rounded-xl hover:bg-slate-100"
              >
                <ChevronLeft size={16} /> Atrás
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !canSubmit()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? 'Guardando…' : <><CheckCircle2 size={16} /> Completar y acceder al portal</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals legales */}
      {legalModal === 'terminos' && (
        <LegalModal
          title="Términos y Condiciones"
          lines={TERMS_AND_CONDITIONS_TEXT}
          onClose={() => setLegalModal(null)}
        />
      )}
      {legalModal === 'datos' && (
        <LegalModal
          title="Política de Tratamiento de Datos Personales"
          lines={DATA_POLICY_TEXT}
          onClose={() => setLegalModal(null)}
        />
      )}
    </div>
  )
}
