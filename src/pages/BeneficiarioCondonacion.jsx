import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileCheck2,
  FileText,
  GraduationCap,
  Printer,
  ScrollText,
  Upload,
  XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { loadActiveCertificateSignatures, openPazYSalvoPrintView } from '../lib/certificadoPazYSalvo';
import { showWarningAlert } from '../lib/alerts';

const FINAL_DOC_TYPES = [
  { key: 'diploma', label: 'Diploma' },
  { key: 'acta_grado', label: 'Acta de grado' },
  { key: 'historico_notas', label: 'Historico de notas' },
];

const formatCurrency = (value) => {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(numeric);
};

const formatDateTime = (value) => {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const estadoBadgeClass = (estado) => {
  if (estado === 'condonada') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (estado === 'no_condonada') return 'bg-rose-100 text-rose-700 border-rose-200';
  return 'bg-amber-100 text-amber-700 border-amber-200';
};

const estadoLabel = (estado) => {
  if (estado === 'condonada') return 'Condonada';
  if (estado === 'no_condonada') return 'No condonada';
  return 'Pendiente';
};

const normalizeLevel = (nivel) => {
  const value = String(nivel || '').trim().toLowerCase();
  if (!value) return null;
  if (value.includes('tecnol')) return 'tecnologo';
  if (value.includes('tecnic')) return 'tecnico';
  if (value.includes('universi') || value.includes('pregrado') || value.includes('profesional')) return 'profesional';
  return null;
};

/**
 * Lee los primeros 4 KB del archivo buscando la entrada /Encrypt en el PDF.
 * Si existe, el documento está protegido con contraseña.
 */
const isPdfEncrypted = (file) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const bytes = new Uint8Array(e.target.result);
      // Convertir a texto ASCII para buscar la clave /Encrypt
      let text = '';
      for (let i = 0; i < bytes.length; i++) {
        text += String.fromCharCode(bytes[i]);
      }
      resolve(text.includes('/Encrypt'));
    };
    reader.onerror = () => resolve(false);
    // Leer solo los primeros 4 KB basta para la mayoría de PDFs
    reader.readAsArrayBuffer(file.slice(0, 4096));
  });

const paymentCapForLevel = (nivel) => {
  switch (normalizeLevel(nivel)) {
    case 'tecnico':
      return 4;
    case 'tecnologo':
      return 6;
    case 'profesional':
      return 10;
    default:
      return null;
  }
};

const BeneficiarioCondonacion = () => {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingId, setGeneratingId] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState({});
  const [uploadingDocType, setUploadingDocType] = useState('');
  const [certificateSignatures, setCertificateSignatures] = useState({});
  const [beneficiarioProfile, setBeneficiarioProfile] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError('');

    console.log('[BeneficiarioCondonacion] Cargando módulo de condonación...');

    // Obtener beneficiario_id desde localStorage
    let beneficiarioId = null;
    try {
      const sessionStr = localStorage.getItem('focades:beneficiario-session');
      if (sessionStr) {
        const documentSession = JSON.parse(sessionStr);
        const sessionTime = new Date(documentSession.timestamp).getTime();
        const maxAge = 24 * 60 * 60 * 1000;
        
        if (Date.now() - sessionTime <= maxAge) {
          beneficiarioId = documentSession.beneficiario_id;
          console.log('[BeneficiarioCondonacion] beneficiario_id desde localStorage:', beneficiarioId);
        }
      }
    } catch (error) {
      console.error('[BeneficiarioCondonacion] Error leyendo sesión:', error);
    }

    // Si no hay beneficiario_id, intentar con Supabase Auth
    if (!beneficiarioId) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (userId) {
        const { data: profile } = await supabase
          .from('portal_beneficiarios')
          .select('id')
          .eq('auth_user_id', userId)
          .maybeSingle();
        
        beneficiarioId = profile?.id;
      }
    }

    if (!beneficiarioId) {
      console.log('[BeneficiarioCondonacion] No se pudo obtener beneficiario_id');
      setError('No hay beneficiario vinculado.');
      setLoading(false);
      return;
    }

    // Cargar módulo de condonación usando Edge Function (bypasses RLS)
    console.log('[BeneficiarioCondonacion] Invocando Edge Function get-condonacion-modulo...');
    const { data: result, error: invokeError } = await supabase.functions.invoke('get-condonacion-modulo', {
      body: { beneficiario_id: beneficiarioId },
    });

    if (invokeError) {
      console.error('[BeneficiarioCondonacion] Error invocando Edge Function:', invokeError);
      setError(invokeError.message || 'No se pudo cargar la información de condonaciones.');
      setLoading(false);
      return;
    }

    if (!result?.ok) {
      console.error('[BeneficiarioCondonacion] Error en respuesta:', result);
      setError(result?.message || 'No se pudo cargar la información de condonaciones.');
      setLoading(false);
      return;
    }

    console.log('[BeneficiarioCondonacion] Módulo cargado:', {
      condonaciones: result.condonaciones?.length || 0,
      documentos: result.documentos_finales?.length || 0,
    });

    setPayload(result);
    setBeneficiarioProfile(result.beneficiario_profile || null);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    loadActiveCertificateSignatures(supabase).then(setCertificateSignatures).catch(() => setCertificateSignatures({}));
  }, []);

  const docsByType = useMemo(() => {
    const map = new Map();
    const docs = Array.isArray(payload?.documentos_finales) ? payload.documentos_finales : [];
    docs.forEach((d) => {
      if (!map.has(d.tipo_documento)) {
        map.set(d.tipo_documento, d);
      }
    });
    return map;
  }, [payload]);

  const finalActivationSemester = paymentCapForLevel(beneficiarioProfile?.nivel_formacion);
  const currentSemester = Number(beneficiarioProfile?.semestre_actual || 0) || null;
  const hasFinalProcess = Boolean(payload?.condonacion_final) || docsByType.size > 0;
  const isGraduateState = String(beneficiarioProfile?.estado_beneficiario || '').toLowerCase() === 'egresado';
  const isFinalEnabled = hasFinalProcess || isGraduateState || Boolean(finalActivationSemester && currentSemester && currentSemester >= finalActivationSemester);

  const finalActivationMessage = useMemo(() => {
    if (hasFinalProcess) {
      return 'Ya tienes una solicitud de condonación final en curso, por lo que este módulo permanece habilitado.';
    }

    if (isGraduateState) {
      return 'Tu estado actual figura como egresado, por lo que ya puedes gestionar la condonación final.';
    }

    if (!finalActivationSemester) {
      return 'La condonación final se habilitará cuando administración tenga configurado tu nivel de formación y tu semestre actual.';
    }

    if (!currentSemester) {
      return `La condonación final se habilitará cuando se registre tu semestre actual. Para tu nivel, se activa en el semestre ${finalActivationSemester}.`;
    }

    if (currentSemester >= finalActivationSemester) {
      return `Ya estás habilitado para la condonación final porque registras semestre ${currentSemester}.`;
    }

    return `La condonación final se activará cuando curses el semestre ${finalActivationSemester}. Actualmente registras semestre ${currentSemester}.`;
  }, [currentSemester, finalActivationSemester, hasFinalProcess, isGraduateState]);

  const handleGenerateCert = async (condonacionId) => {
    setGeneratingId(condonacionId);
    setError('');

    const { data, error: rpcError } = await supabase.rpc('crear_certificado_condonacion_semestral', {
      p_condonacion_id: condonacionId,
    });

    setGeneratingId(null);

    if (rpcError) {
      setError(rpcError.message || 'No se pudo generar el certificado.');
      return;
    }

    const cert = Array.isArray(data) ? data[0] : null;
    if (!cert) {
      setError('El backend no devolvio datos de certificado.');
      return;
    }

    try {
      openPazYSalvoPrintView({
        ...cert,
        signatures: certificateSignatures,
      });
    } catch (openError) {
      setError(openError.message || 'No se pudo abrir el certificado.');
    }

    await loadData();
  };

  const handleUploadFinalDoc = async (docType) => {
    const file = selectedFiles[docType];
    if (!file) {
      setError(`Selecciona un archivo para ${docType}.`);
      return;
    }

    if (!payload?.beneficiario_id) {
      setError('No se encontro identificador de beneficiario.');
      return;
    }

    setUploadingDocType(docType);
    setError('');

    const safeBaseName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `beneficiarios/${payload.beneficiario_id}/condonacion-final/${docType}/${Date.now()}-${safeBaseName}`;

    const { error: uploadError } = await supabase.storage.from('soportes').upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'application/pdf',
    });

    if (uploadError) {
      setUploadingDocType('');
      setError(uploadError.message || 'No se pudo cargar el documento al almacenamiento.');
      return;
    }

    const { error: rpcError } = await supabase.rpc('beneficiario_subir_documento_condonacion_final', {
      p_tipo_documento: docType,
      p_storage_path: storagePath,
      p_nombre_original: file.name,
      p_mime_type: file.type || null,
      p_size_bytes: file.size,
    });

    setUploadingDocType('');

    if (rpcError) {
      setError(rpcError.message || 'El documento se subio, pero no se pudo registrar en la base de datos.');
      return;
    }

    setSelectedFiles((prev) => ({ ...prev, [docType]: null }));
    await loadData();
  };

  if (loading) {
    return (
      <div className="space-y-5 animate-fade-in">
        {[1, 2, 3].map((i) => (
          <section key={i} className="rounded-2xl border border-border bg-white p-6 md:p-8">
            <div className="flex items-center gap-3 mb-5">
              <div
                className="h-10 w-10 rounded-xl bg-slate-200 animate-pulse"
                style={{ animationDelay: `${i * 80}ms` }}
              />
              <div className="space-y-2">
                <div
                  className="h-4 w-40 rounded-lg bg-slate-200 animate-pulse"
                  style={{ animationDelay: `${i * 80}ms` }}
                />
                <div
                  className="h-3 w-24 rounded bg-slate-100 animate-pulse"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              </div>
            </div>
            <div className="space-y-3">
              {[1, 2].map((j) => (
                <div
                  key={j}
                  className="h-12 rounded-xl bg-slate-100 animate-pulse"
                  style={{ animationDelay: `${(i + j) * 60}ms` }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {error && (
        <div
          className="animate-slide-up flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          style={{ animationFillMode: 'both' }}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Condonación Semestral ── */}
      <section
        className="animate-slide-up overflow-hidden rounded-2xl border border-border bg-white"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-border/60 px-6 pt-6 pb-4 sm:flex-row sm:items-center sm:justify-between md:px-8 md:pt-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <ScrollText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-black leading-tight text-primary">Condonación semestral</h2>
              <p className="mt-0.5 text-xs text-slate-500">{(payload?.condonaciones || []).length} registro(s)</p>
            </div>
          </div>
          {(payload?.condonaciones?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                {payload.condonaciones.filter((c) => c.estado_condonacion === 'condonada').length} condonadas
              </span>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                {payload.condonaciones.filter(
                  (c) => c.estado_condonacion !== 'condonada' && c.estado_condonacion !== 'no_condonada',
                ).length}{' '}
                pendientes
              </span>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 md:px-8 md:pb-8">
          <p className="mt-4 text-sm text-slate-600">
            Cada pago efectuado genera una condonación pendiente de revisión administrativa. Cuando se aprueba,
            puedes generar tu certificado verificable.
          </p>

          {/* Vista móvil: tarjetas apiladas */}
          <div className="mt-5 space-y-3 sm:hidden">
            {(payload?.condonaciones || []).map((row, i) => (
              <div
                key={row.id}
                className="animate-slide-up rounded-xl border border-border p-4 transition-shadow hover:shadow-sm"
                style={{ animationDelay: `${i * 70}ms`, animationFillMode: 'both' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{row.semestre_texto}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{formatCurrency(row.monto_desembolsado)}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${estadoBadgeClass(row.estado_condonacion)}`}
                  >
                    {row.estado_condonacion === 'condonada' ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : row.estado_condonacion === 'no_condonada' ? (
                      <XCircle className="h-3 w-3" />
                    ) : (
                      <Clock className="h-3 w-3" />
                    )}
                    {estadoLabel(row.estado_condonacion)}
                  </span>
                </div>
                <div className="mt-3">
                  {row.estado_condonacion === 'condonada' ? (
                    <button
                      type="button"
                      onClick={() => handleGenerateCert(row.id)}
                      disabled={generatingId === row.id}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-xs font-bold text-white transition-all duration-150 hover:bg-secondary/90 active:scale-95 disabled:opacity-60"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      {generatingId === row.id
                        ? 'Generando...'
                        : row.codigo_certificado
                          ? 'Reimprimir certificado'
                          : 'Generar certificado'}
                    </button>
                  ) : (
                    <p className="py-1 text-center text-xs text-slate-400">Certificado no disponible aún</p>
                  )}
                </div>
              </div>
            ))}
            {(!payload?.condonaciones || payload.condonaciones.length === 0) && (
              <p className="py-6 text-center text-sm text-slate-500">
                Aún no hay condonaciones semestrales registradas.
              </p>
            )}
          </div>

          {/* Vista escritorio: tabla */}
          <div className="mt-5 hidden overflow-x-auto rounded-xl border border-border sm:block">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Semestre / Periodo</th>
                  <th className="px-4 py-3">Monto</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Certificado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(payload?.condonaciones || []).map((row, i) => (
                  <tr
                    key={row.id}
                    className="animate-slide-up transition-colors hover:bg-slate-50/70"
                    style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
                  >
                    <td className="px-4 py-3.5 font-semibold text-slate-800">{row.semestre_texto}</td>
                    <td className="px-4 py-3.5 text-slate-600">{formatCurrency(row.monto_desembolsado)}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${estadoBadgeClass(row.estado_condonacion)}`}
                      >
                        {row.estado_condonacion === 'condonada' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : row.estado_condonacion === 'no_condonada' ? (
                          <XCircle className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        {estadoLabel(row.estado_condonacion)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {row.estado_condonacion === 'condonada' ? (
                        <button
                          type="button"
                          onClick={() => handleGenerateCert(row.id)}
                          disabled={generatingId === row.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-white transition-all duration-150 hover:bg-secondary/90 active:scale-95 disabled:opacity-60"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          {generatingId === row.id ? 'Generando...' : row.codigo_certificado ? 'Reimprimir' : 'Generar'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">No disponible</span>
                      )}
                    </td>
                  </tr>
                ))}
                {(!payload?.condonaciones || payload.condonaciones.length === 0) && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-slate-500">
                      Aún no hay condonaciones semestrales registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Condonación Final ── */}
      <section
        className={`animate-slide-up overflow-hidden rounded-2xl border border-border bg-white transition-opacity duration-300 ${!isFinalEnabled ? 'opacity-80' : ''}`}
        style={{ animationDelay: '80ms', animationFillMode: 'both' }}
      >
        {/* Header */}
        <div className="border-b border-border/60 px-6 pt-6 pb-4 md:px-8 md:pt-8">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-300 ${isFinalEnabled ? 'bg-emerald-100' : 'bg-slate-100'}`}
            >
              <GraduationCap
                className={`h-5 w-5 transition-colors duration-300 ${isFinalEnabled ? 'text-emerald-700' : 'text-slate-400'}`}
              />
            </div>
            <div>
              <h2 className="text-xl font-black leading-tight text-primary">Condonación final</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Carga los documentos de grado para prevalidación del sistema.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 md:px-8 md:pb-8">
          {/* Banner de estado */}
          <div
            className={`mt-4 flex items-start gap-3 rounded-xl border px-4 py-3 transition-all duration-300 ${isFinalEnabled ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
          >
            {isFinalEnabled ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 animate-bounce-subtle text-emerald-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 animate-pulse-gentle text-amber-600" />
            )}
            <div className="text-sm">
              <p className={`font-bold ${isFinalEnabled ? 'text-emerald-800' : 'text-amber-900'}`}>
                {isFinalEnabled ? 'Condonación final habilitada' : 'Condonación final deshabilitada'}
              </p>
              <p className={`mt-0.5 ${isFinalEnabled ? 'text-emerald-700' : 'text-amber-800'}`}>
                {finalActivationMessage}
              </p>
            </div>
          </div>

          {/* Píldora de estado actual */}
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
            <div className="h-2 w-2 shrink-0 rounded-full bg-slate-400" />
            <p className="text-sm text-slate-700">
              Estado:{' '}
              <span className="font-bold capitalize">
                {(payload?.condonacion_final?.estado || 'pendiente_documentos').replace(/_/g, ' ')}
              </span>
            </p>
          </div>

          {!isFinalEnabled && finalActivationSemester ? (
            <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
              <ChevronRight className="h-3 w-3 shrink-0" />
              Activación prevista a partir del semestre {finalActivationSemester} para tu nivel de formación.
            </p>
          ) : null}

          {/* Barra de progreso de documentos */}
          {isFinalEnabled && (
            <div className="mt-4 animate-fade-in">
              <div className="mb-1.5 flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium">Documentos cargados</span>
                <span className="font-bold">
                  {docsByType.size} / {FINAL_DOC_TYPES.length}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${(docsByType.size / FINAL_DOC_TYPES.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Tarjetas de documentos */}
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {FINAL_DOC_TYPES.map((doc, i) => {
              const uploaded = docsByType.get(doc.key);
              const selectedFile = selectedFiles[doc.key];
              const isUploading = uploadingDocType === doc.key;
              return (
                <div
                  key={doc.key}
                  className={`animate-slide-up rounded-xl border p-4 transition-all duration-200 ${
                    uploaded
                      ? 'border-emerald-200 bg-emerald-50/60'
                      : !isFinalEnabled
                        ? 'border-slate-200 bg-slate-50'
                        : 'border-border bg-white hover:border-secondary/40 hover:shadow-sm'
                  }`}
                  style={{ animationDelay: `${160 + i * 70}ms`, animationFillMode: 'both' }}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${uploaded ? 'bg-emerald-100' : 'bg-slate-100'}`}
                    >
                      {uploaded ? (
                        <FileCheck2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <FileText className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-snug text-slate-800">{doc.label}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {uploaded ? (uploaded.nombre_original || uploaded.storage_path) : 'Pendiente de carga'}
                      </p>
                    </div>
                  </div>

                  {isFinalEnabled ? (
                    <div className="mt-3 space-y-2">
                      <label
                        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-2 text-xs transition-all duration-150 ${
                          selectedFile
                            ? 'border-secondary bg-secondary/5 text-secondary'
                            : 'border-slate-200 text-slate-400 hover:border-secondary/60 hover:text-secondary/70'
                        }`}
                      >
                        <Upload className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{selectedFile ? selectedFile.name : 'Seleccionar archivo'}</span>
                        <input
                          type="file"
                          accept="application/pdf"
                          disabled={!isFinalEnabled}
                          className="sr-only"
                          onChange={async (e) => {
                            const file = e.target.files?.[0] || null;
                            e.target.value = ''; // permite volver a seleccionar el mismo archivo
                            if (!file) {
                              setSelectedFiles((prev) => ({ ...prev, [doc.key]: null }));
                              return;
                            }
                            // Verificar que sea PDF por tipo MIME y extensión
                            const isPdf =
                              file.type === 'application/pdf' ||
                              file.name.toLowerCase().endsWith('.pdf');
                            if (!isPdf) {
                              await showWarningAlert({
                                title: 'Formato no permitido',
                                text: 'Solo se aceptan archivos PDF. Por favor selecciona un archivo con extensión .pdf.',
                              });
                              return;
                            }
                            // Detectar PDF con contraseña
                            const encrypted = await isPdfEncrypted(file);
                            if (encrypted) {
                              await showWarningAlert({
                                title: 'PDF protegido con contraseña',
                                text: 'El archivo seleccionado está protegido. Por favor elimina la contraseña antes de subirlo.',
                              });
                              return;
                            }
                            setSelectedFiles((prev) => ({ ...prev, [doc.key]: file }));
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => handleUploadFinalDoc(doc.key)}
                        disabled={!selectedFile || isUploading}
                        className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all duration-150 active:scale-95 ${
                          selectedFile && !isUploading
                            ? 'bg-secondary text-white hover:bg-secondary/90'
                            : 'cursor-not-allowed border border-slate-200 text-slate-400'
                        }`}
                      >
                        {isUploading ? (
                          <>
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            Subiendo...
                          </>
                        ) : (
                          <>
                            <Upload className="h-3.5 w-3.5" />
                            Subir documento
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-3 text-center text-xs text-slate-400">Disponible en último semestre</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Sugerencias de cobro coactivo ── */}
      <section
        className="animate-slide-up overflow-hidden rounded-2xl border border-border bg-white"
        style={{ animationDelay: '160ms', animationFillMode: 'both' }}
      >
        {/* Header */}
        <div className="border-b border-border/60 px-6 pt-6 pb-4 md:px-8 md:pt-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-black leading-tight text-primary">Cobro coactivo</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Sugerencias informativas — cualquier gestión requiere confirmación administrativa.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 md:px-8 md:pb-8">
          <div className="mt-5 space-y-3">
            {(payload?.sugerencias_cobro || []).map((s, i) => (
              <div
                key={s.id}
                className="animate-slide-up rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm transition-shadow hover:shadow-sm"
                style={{ animationDelay: `${i * 70}ms`, animationFillMode: 'both' }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-amber-900">Motivo: {s.motivo_causal}</p>
                    <p className="mt-0.5 text-amber-800">
                      Monto sugerido:{' '}
                      <span className="font-semibold">{formatCurrency(s.monto_sugerido)}</span>
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-200 px-2.5 py-1 text-xs font-bold capitalize text-amber-900">
                    {s.estado}
                  </span>
                </div>
                <p className="mt-2 text-xs text-amber-600/80">Registrada: {formatDateTime(s.created_at)}</p>
              </div>
            ))}
            {(!payload?.sugerencias_cobro || payload.sugerencias_cobro.length === 0) && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <CheckCircle2 className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-600">Sin sugerencias de cobro</p>
                <p className="mt-1 text-xs text-slate-400">No hay sugerencias registradas para tu caso.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default BeneficiarioCondonacion;
