import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SignaturePad from 'signature_pad';
import { supabase } from '../lib/supabase';
import {
  showConfirmAlert,
  showErrorAlert,
  showSuccessAlert,
  showWarningAlert,
} from '../lib/alerts';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FileUp,
  HelpCircle,
  Loader2,
  Mail,
  PencilLine,
  Search,
  ShieldCheck,
} from 'lucide-react';

const EMPTY_FORM = {
  email: '',
  nombre_completo: '',
  tipo_documento: '',
  n_documento: '',
  genero: '',
  fecha_nacimiento: '',
  pais_nacimiento: '',
  dpto_nacimiento: '',
  municipio_nacimiento: '',
  dpto_residencia: '',
  municipio_residencia: '',
  direccion_residencia: '',
  n_celular: '',
  recibe_subsidio: '',
  cual_subsidio: '',
  sisben_grupo: '',
  enfoque_diferencial: '',
  labora_actualmente: '',
  zona_residencia: '',
  barrio_corregimiento: '',
  nombre_padre: '',
  documento_padre: '',
  ocupacion_padre: '',
  ingresos_padre: '',
  nombre_madre: '',
  documento_madre: '',
  ocupacion_madre: '',
  ingresos_madre: '',
  titulo_obtenido: '',
  ano_graduacion: '',
  establecimiento_educativo: '',
  puntaje_icfes: '',
  institucion_superior: '',
  programa_academico: '',
  nivel_formacion: '',
  semestre_ingreso: '',
  promedio_anterior: '',
  ciudad_institucion: '',
  modalidad: '',
  soportes: {
    documento_identidad: null,
    acta_grado: null,
    diploma: null,
    pruebas_saber: null,
    cert_matricula: null,
    cert_notas: null,
    ficha_sisben: null,
    cert_enfoque: null,
  },
  acepta_terminos: false,
  acepta_datos: false,
};

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_FILE_TYPES = ['application/pdf'];
const SIGNATURE_ALLOWED_TYPES = ['image/png', 'image/jpeg'];
const SIGNATURE_MAX_MB = 5;
const SIGNATURE_MAX_BYTES = SIGNATURE_MAX_MB * 1024 * 1024;
const BANK_CERT_MAX_AGE_DAYS = 15;
const STATUS_REPLACEABLE_DOC_TYPES = [
  'documento_identidad',
  'acta_grado',
  'diploma',
  'pruebas_saber',
  'cert_matricula',
  'cert_notas',
  'ficha_sisben',
  'cert_enfoque',
];

const DOCUMENT_TYPE_LABELS = {
  documento_identidad: 'Documento de identidad',
  acta_grado: 'Acta de grado',
  diploma: 'Diploma',
  pruebas_saber: 'Pruebas Saber',
  cert_matricula: 'Certificado de matrícula',
  cert_notas: 'Certificado de notas',
  ficha_sisben: 'Ficha Sisbén',
  cert_enfoque: 'Certificado de enfoque diferencial',
  certificado_bancario: 'Certificado bancario',
};

const getDocumentLabel = (tipoDocumento) => DOCUMENT_TYPE_LABELS[tipoDocumento] || tipoDocumento || 'Documento';

const formatDateTimeLabel = (value) => {
  if (!value) return 'No disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('es-CO');
};

const getInscripcionStatusBadgeClasses = (status) => {
  const normalized = String(status || '')
    .trim()
    .toLowerCase();

  if (!normalized) {
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }

  if (normalized.includes('radic')) {
    return 'bg-blue-100 text-blue-700 border-blue-200';
  }

  if (normalized.includes('revision') || normalized.includes('revisión')) {
    return 'bg-sky-100 text-sky-700 border-sky-200';
  }

  if (normalized.includes('legaliz')) {
    return 'bg-amber-100 text-amber-700 border-amber-200';
  }

  if (normalized.includes('admit') || normalized.includes('aprob') || normalized.includes('complet')) {
    return 'bg-green-100 text-green-700 border-green-200';
  }

  if (
    normalized.includes('pendient') ||
    normalized.includes('subsan') ||
    normalized.includes('observ') ||
    normalized.includes('espera')
  ) {
    return 'bg-orange-100 text-orange-700 border-orange-200';
  }

  if (normalized.includes('rechaz') || normalized.includes('anulad') || normalized.includes('cancel')) {
    return 'bg-red-100 text-red-700 border-red-200';
  }

  return 'bg-primary/10 text-primary border-primary/20';
};

const normalizeCatalogValue = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const buildUppercaseUniqueOptions = (values = []) => {
  const unique = Array.from(
    new Set(
      values
        .map((value) => normalizeCatalogValue(value))
        .filter(Boolean)
    )
  );

  return unique.sort((a, b) => a.localeCompare(b, 'es-CO'));
};

const normalizeDraftStepForResume = (value) => {
  const safeStep = Math.min(Math.max(Number(value) || 2, 2), 6);
  if (safeStep >= 5) return 4;
  return safeStep;
};

const getDraftStorageKey = (email) => `focades:draft:${String(email || '').trim().toLowerCase()}`;
const OTP_SESSION_EXPIRED_MESSAGE =
  'Tu sesión de verificación expiró. Solicita un nuevo código OTP y verifica tu correo nuevamente.';

const DUPLICATE_SUBMISSION_ERROR_CODES = new Set([
  'DUPLICATE_INSCRIPCION',
  'EMAIL_DOCUMENT_MISMATCH',
]);

const isDuplicateSubmissionError = ({ code, message }) => {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const normalizedMessage = String(message || '').trim().toLowerCase();

  if (DUPLICATE_SUBMISSION_ERROR_CODES.has(normalizedCode)) {
    return true;
  }

  return (
    normalizedMessage.includes('ya existe una inscripción') ||
    normalizedMessage.includes('duplicate key') ||
    normalizedMessage.includes('unique constraint') ||
    normalizedMessage.includes('personas_email_key') ||
    normalizedMessage.includes('email_document_mismatch') ||
    normalizedMessage.includes('correo ya está asociado a otro documento')
  );
};

const sanitizePathSegment = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');

const toHex = (bytes) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const sha256Text = async (value) => {
  const encoded = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return toHex(new Uint8Array(digest));
};

const toNumberOrNull = (value, integer = false) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const parsed = Number(raw.replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;

  return integer ? Math.trunc(parsed) : parsed;
};

const buildVersionedStoragePath = ({ documento, radicado, tipoDocumento, fileName }) => {
  const timestamp = Date.now();
  const cleanDocumento = sanitizePathSegment(documento) || 'sin-documento';
  const cleanRadicado = sanitizePathSegment(radicado) || 'sin-radicado';
  const cleanTipo = sanitizePathSegment(tipoDocumento) || 'soporte';
  const cleanFileName = sanitizePathSegment(fileName?.replace(/\.[^/.]+$/, '')) || 'archivo';
  return `expedientes/${cleanDocumento}/${cleanRadicado}/${cleanTipo}/${timestamp}-${cleanFileName}.pdf`;
};

const extractExpedienteBasePath = (storagePath) => {
  const value = String(storagePath || '').trim();
  if (!value) return '';

  const match = value.match(/^expedientes\/[^/]+\/[^/]+/i);
  return match?.[0] || '';
};

const buildVersionedStoragePathFromBase = ({ basePath, tipoDocumento, fileName }) => {
  const timestamp = Date.now();
  const cleanTipo = sanitizePathSegment(tipoDocumento) || 'soporte';
  const cleanFileName = sanitizePathSegment(fileName?.replace(/\.[^/.]+$/, '')) || 'archivo';
  return `${String(basePath || '').replace(/\/+$/, '')}/${cleanTipo}/${timestamp}-${cleanFileName}.pdf`;
};

const pickPreferredExpedienteBasePath = (paths = []) => {
  const bases = paths
    .map((path) => extractExpedienteBasePath(path))
    .filter(Boolean);

  if (bases.length === 0) return '';

  const preferred = bases.find((base) => !/\/sin-documento\//i.test(`/${base}/`));
  return preferred || bases[0] || '';
};

const validatePdfFile = (file, label) => {
  if (!file) return;

  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    throw new Error(`${label} debe estar en formato PDF.`);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`${label} supera el tamaño máximo de ${MAX_FILE_SIZE_MB}MB.`);
  }
};

const validatePdfNotEncrypted = async (file, label) => {
  if (!file) return;

  const buffer = await file.arrayBuffer();
  const probeSize = Math.min(buffer.byteLength, 250000);
  const probeBytes = new Uint8Array(buffer, 0, probeSize);
  const text = new TextDecoder('latin1').decode(probeBytes);

  if (/\/Encrypt\b/i.test(text)) {
    throw new Error(`${label} no debe estar protegido con contraseña ni cifrado.`);
  }
};

const maskDocumentNumber = (value) => {
  const clean = String(value || '').replace(/\s+/g, '').trim();
  if (!clean) return 'No disponible';
  if (clean.length <= 4) return `***${clean}`;
  return `${'*'.repeat(Math.max(clean.length - 4, 3))}${clean.slice(-4)}`;
};

const inferStage = (record) => {
  const explicitStage = String(record?.etapa || '').trim().toLowerCase();
  if (explicitStage) return explicitStage;

  const status = String(record?.estado || '').trim().toLowerCase();
  if (status.includes('legaliz')) return 'legalizacion';
  if (status.includes('admitid')) return 'admitido';
  return 'aspirante';
};

const isBankCertificateRequired = (record, stage) => {
  if (record?.cert_bancario_requerido === true) return true;
  return stage === 'legalizacion';
};

const isDateWithinDays = (dateValue, maxDays) => {
  if (!dateValue) return false;
  const issuedAt = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(issuedAt.getTime())) return false;

  const now = new Date();
  const issuedUtc = Date.UTC(issuedAt.getFullYear(), issuedAt.getMonth(), issuedAt.getDate());
  const nowUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((nowUtc - issuedUtc) / 86400000);
  return diffDays >= 0 && diffDays <= maxDays;
};

const validateSignatureImageFile = (file) => {
  if (!file) return;

  if (!SIGNATURE_ALLOWED_TYPES.includes(file.type)) {
    throw new Error('La firma subida debe ser PNG o JPG.');
  }

  if (file.size > SIGNATURE_MAX_BYTES) {
    throw new Error(`La imagen de firma supera el tamaño máximo de ${SIGNATURE_MAX_MB}MB.`);
  }
};

const imageFileToPngBlob = (file) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('No se pudo procesar la imagen de firma.'));
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) {
            reject(new Error('No se pudo convertir la firma a PNG.'));
            return;
          }
          resolve(blob);
        },
        'image/png',
        1
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen de firma.'));
    };

    image.src = objectUrl;
  });

const signaturePadToPngBlob = async (pad) => {
  if (!pad || pad.isEmpty?.()) {
    return null;
  }

  const dataUrl = pad.toDataURL('image/png');
  const response = await fetch(dataUrl);
  return await response.blob();
};

const PAISES_NACIMIENTO = ['Colombia'];
const ZONA_RESIDENCIA_OPTIONS = ['Zona Urbana', 'Zona Rural'];
const SUBSIDIO_OPTIONS = ['Sí', 'No'];
const SISBEN_OPTIONS = [
  'Grupo A (Pobreza extrema)',
  'Grupo B (Pobreza moderada)',
  'Grupo C (Vulnerable)',
  'Grupo D (No pobre)',
  'No tengo SISBEN',
];
const ENFOQUE_OPTIONS = [
  'Ninguno',
  'Víctima del Conflicto',
  'Indígena',
  'Afrocolombiano',
  'Población con Discapacidad',
];
const OCUPACION_OPTIONS = [
  'Fallecido',
  'Hogar',
  'Empleado',
  'Independiente',
  'Pensionado',
  'Desempleado',
  'No sabe/No responde',
];
const INGRESOS_OPTIONS = [
  'Sin ingresos',
  'Menos de 1 SMLV',
  'Entre 1 y 2 SMLV',
  'Entre 2 y 3 SMLV',
  'Más de 3 SMLV',
];
const TITULO_BACHILLER_OPTIONS = [
  'Bachiller Académico',
  'Bachiller Técnico',
  'Bachiller Comercial',
  'Bachiller Pedagógico',
  'Normalista Superior',
  'Bachiller Rural',
  'Bachiller con Profundización',
];
const NIVEL_FORMACION_OPTIONS = ['Técnico Profesional', 'Tecnológico', 'Universitario (Pregrado)'];
const MODALIDAD_ASPIRA_OPTIONS = ['Sueño Educativo', 'Mérito Educativo'];
const SEMESTRE_OPTIONS = Array.from({ length: 10 }, (_, index) => `${index + 1}`);
const COLOMBIAN_BANKS = [
  'Bancolombia',
  'Banco de Bogotá',
  'Davivienda',
  'BBVA Colombia',
  'Banco de Occidente',
  'Scotiabank Colpatria',
  'GNB Sudameris',
  'Banco Popular',
  'Banco Agrario de Colombia',
  'Banco Caja Social',
  'Bancamía',
  'Banco Falabella Colombia',
  'Banco Pichincha',
  'Banco Serfinanza',
  'Finandina',
  'Banco Cooperativo Coopcentral',
  'Coofinep Cooperativa Financiera',
  'Cotrafa Cooperativa Financiera',
  'Confiar Cooperativa Financiera',
  'JFK Cooperativa Financiera',
  'Coltefinanciera',
  'Banco W',
  'Lulo Bank',
  'Nubank',
  'Nequi',
  'Daviplata',
  'Movii',
  'RappiPay',
  'Dale',
  'Iris',
  'Otro',
];
const SUPPORT_SUBJECT_OPTIONS = [
  'Dificultad para adjuntar documentos',
  'Error en información registrada',
  'Consulta sobre estado de inscripción',
  'Problema con radicado',
  'Otro',
];
const SUPPORT_STATUS_LABELS = {
  recibido: 'Recibido',
  en_revision: 'En revisión',
  respondido: 'Respondido',
  cerrado: 'Cerrado',
};

// Textos legales movidos a src/lib/legalTexts.js para reutilización en el onboarding de beneficiarios
import { TERMS_AND_CONDITIONS_TEXT, DATA_POLICY_TEXT } from '../lib/legalTexts';

const Registro = () => {
  const [activeView, setActiveView] = useState('landing');
  const [loading, setLoading] = useState(true);
  const [activeConv, setActiveConv] = useState(null);
  const [isConvOpen, setIsConvOpen] = useState(false);

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const [otpStep, setOtpStep] = useState('enter-email');
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpSuccess, setOtpSuccess] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [emailVerified, setEmailVerified] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [completedRadicado, setCompletedRadicado] = useState('');
  const [completionNotice, setCompletionNotice] = useState('');
  const [copyRadicadoMessage, setCopyRadicadoMessage] = useState('');
  const [docsGenerationContext, setDocsGenerationContext] = useState(null);
  const [docsGenerationLoading, setDocsGenerationLoading] = useState(false);

  const [radicadoSearch, setRadicadoSearch] = useState('');
  const [radicadoResult, setRadicadoResult] = useState(null);
  const [radicadoLoading, setRadicadoLoading] = useState(false);
  const [statusUploadType, setStatusUploadType] = useState('');
  const [statusUploadFile, setStatusUploadFile] = useState(null);
  const [statusUploadLoading, setStatusUploadLoading] = useState(false);
  const [statusUploadError, setStatusUploadError] = useState('');
  const [statusUploadSuccess, setStatusUploadSuccess] = useState('');
  const [bankCertificateFile, setBankCertificateFile] = useState(null);
  const [bankCertificateDate, setBankCertificateDate] = useState('');
  const [bankCertificateLoading, setBankCertificateLoading] = useState(false);
  const [bankCertificateError, setBankCertificateError] = useState('');
  const [bankCertificateSuccess, setBankCertificateSuccess] = useState('');
  const [bankNombre, setBankNombre] = useState('');
  const [bankTipoCuenta, setBankTipoCuenta] = useState('');
  const [bankNumeroCuenta, setBankNumeroCuenta] = useState('');
  const [bankNumeroCuentaConf, setBankNumeroCuentaConf] = useState('');

  const [savingDraft, setSavingDraft] = useState(false);
  const [missingFields, setMissingFields] = useState([]);

  const [departamentos, setDepartamentos] = useState([]);
  const [municipiosByDepto, setMunicipiosByDepto] = useState({});
  const [ciudadesColombia, setCiudadesColombia] = useState([]);
  const [establecimientosList, setEstablecimientosList] = useState([]);

  const signatureRef = useRef(null);
  const [signaturePad, setSignaturePad] = useState(null);
  const [signatureMode, setSignatureMode] = useState('draw');
  const [uploadedSignatureFile, setUploadedSignatureFile] = useState(null);
  const [uploadedSignaturePreview, setUploadedSignaturePreview] = useState('');
  const [legalModalType, setLegalModalType] = useState(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportLookupLoading, setSupportLookupLoading] = useState(false);
  const [supportError, setSupportError] = useState('');
  const [supportSuccess, setSupportSuccess] = useState('');
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportForm, setSupportForm] = useState({
    radicado: '',
    nombre_contacto: '',
    email_contacto: '',
    asunto: '',
    mensaje: '',
  });
  const [supportCaptchaToken, setSupportCaptchaToken] = useState('');
  const supportCaptchaContainerRef = useRef(null);
  const supportCaptchaWidgetRef = useRef(null);
  const turnstileSiteKey = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();

  const missingFieldsSet = useMemo(() => new Set(missingFields), [missingFields]);

  useEffect(() => {
    const loadConv = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('convocatorias')
        .select('*')
        .eq('is_activa', true)
        .order('fecha_inicio', { ascending: false })
        .limit(1)
        .maybeSingle();

      setActiveConv(data || null);

      if (data?.fecha_inicio && data?.fecha_fin) {
        const now = new Date();
        const start = new Date(data.fecha_inicio);
        const end = new Date(data.fecha_fin);
        setIsConvOpen(data.is_activa && now >= start && now <= end);
      } else {
        setIsConvOpen(false);
      }

      setLoading(false);
    };

    loadConv();
  }, []);

  // Detecta si el usuario llega a /registro desde el magic link de confirmación
  // de cuenta (primera vez). En ese caso ya tiene sesión activa, recuperamos
  // el email guardado y saltamos directamente al formulario sin pedir OTP.
  useEffect(() => {
    const checkMagicLinkReturn = async () => {
      const pendingEmail = sessionStorage.getItem('focades_otp_email');
      if (!pendingEmail) return;

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;

      // El usuario confirmó su cuenta vía magic link — limpiar y avanzar
      try { sessionStorage.removeItem('focades_otp_email'); } catch { /* ignore */ }

      const normalizedEmail = pendingEmail.trim().toLowerCase();

      // Rellenar email en el formulario
      setFormData((prev) => ({ ...prev, email: pendingEmail.trim() }));

      // Verificar si ya tiene una inscripción enviada
      try {
        let existingQuery = supabase
          .from('inscripciones')
          .select('id,radicado,estado,convocatoria_id,created_at')
          .ilike('email', normalizedEmail)
          .order('created_at', { ascending: false })
          .limit(1);

        // activeConv puede no estar cargado aún; se hace la consulta sin filtro de convocatoria
        const { data: existingInscripcion } = await existingQuery.maybeSingle();

        if (existingInscripcion?.id) {
          const radicadoExistente = existingInscripcion.radicado || 'No disponible';
          const estadoExistente = existingInscripcion.estado || 'Radicado';
          try { localStorage.removeItem(`focades_draft_${normalizedEmail}`); } catch { /* ignore */ }
          try { await supabase.from('inscripciones_drafts').delete().eq('email', normalizedEmail); } catch { /* ignore */ }

          await showConfirmAlert({
            title: 'Ya enviaste tu inscripción',
            text: `Este correo ya tiene una inscripción registrada (Radicado: ${radicadoExistente}, Estado: ${estadoExistente}). No es posible enviar una nueva inscripción con el mismo correo.`,
            confirmButtonText: 'Consultar mi radicado',
            cancelButtonText: 'Cerrar',
          });

          await supabase.auth.signOut();
          setOtpStep('enter-email');
          setEmailVerified(false);
          return;
        }
      } catch {
        // Si falla la verificación, continuar de todas formas
      }

      // Cargar borrador si existe
      await loadDraftAfterVerification(pendingEmail.trim());

      setEmailVerified(true);
      setOtpStep('enter-email'); // ya no necesario visualmente, emailVerified salta el OTP
      setOtpSuccess('Correo verificado correctamente. Continúa con tu inscripción.');
    };

    checkMagicLinkReturn();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadCatalogos = async () => {
      const { data: departamentosData, error: departamentosError } = await supabase
        .from('vw_catalog_departamentos_colombia')
        .select('nombre')
        .order('nombre');

      if (departamentosError) {
        setDepartamentos([]);
      } else {
        setDepartamentos(buildUppercaseUniqueOptions((departamentosData || []).map((item) => item.nombre)));
      }

      const { data: municipiosData, error: municipiosError } = await supabase
        .from('vw_catalog_municipios_colombia')
        .select('nombre,departamento')
        .order('departamento')
        .order('nombre');

      if (municipiosError) {
        setMunicipiosByDepto({});
        setCiudadesColombia([]);
      } else {
        const byDept = {};
        const allCities = [];

        (municipiosData || []).forEach((row) => {
          const dep = normalizeCatalogValue(row.departamento);
          const mun = String(row.nombre || '').trim();
          if (!dep || !mun) return;
          if (!byDept[dep]) byDept[dep] = [];
          byDept[dep].push(mun);
          allCities.push(mun);
        });

        Object.keys(byDept).forEach((dep) => {
          byDept[dep] = Array.from(new Set(byDept[dep])).sort((a, b) => a.localeCompare(b));
        });

        setMunicipiosByDepto(byDept);
        setCiudadesColombia(Array.from(new Set(allCities)).sort((a, b) => a.localeCompare(b)));
      }

      const establecimientosSources = [
        { table: 'vw_catalog_establecimientos', select: 'nombre' },
        { table: 'catalog_establecimientos_educativos', select: 'nombre,activo' },
      ];

      let establecimientosLoaded = false;

      for (const source of establecimientosSources) {
        const { data, error } = await supabase
          .from(source.table)
          .select(source.select)
          .order('nombre');

        if (error || !Array.isArray(data) || data.length === 0) continue;

        const normalized = data
          .filter((item) => item?.nombre)
          .filter((item) => item.activo === undefined || item.activo === true)
          .map((item) => String(item.nombre).trim());

        const unique = Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b));
        setEstablecimientosList(unique);
        establecimientosLoaded = true;
        break;
      }

      if (!establecimientosLoaded) {
        setEstablecimientosList([]);
      }
    };

    loadCatalogos();
  }, []);

  useEffect(() => {
    if (otpTimer <= 0) return;
    const timer = setTimeout(() => setOtpTimer((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [otpTimer]);

  useEffect(() => {
    if (activeView !== 'form') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeView, step]);

  useEffect(() => {
    if (!supportOpen || !turnstileSiteKey) return;

    const renderWidget = () => {
      if (!window.turnstile || !supportCaptchaContainerRef.current) return;

      if (supportCaptchaWidgetRef.current !== null) {
        try {
          window.turnstile.reset(supportCaptchaWidgetRef.current);
        } catch {
          // ignore reset errors
        }
        return;
      }

      supportCaptchaWidgetRef.current = window.turnstile.render(supportCaptchaContainerRef.current, {
        sitekey: turnstileSiteKey,
        theme: 'light',
        callback: (token) => setSupportCaptchaToken(token || ''),
        'expired-callback': () => setSupportCaptchaToken(''),
        'error-callback': () => setSupportCaptchaToken(''),
      });
    };

    if (window.turnstile) {
      renderWidget();
      return;
    }

    const existingScript = document.getElementById('cf-turnstile-script');
    if (existingScript) {
      existingScript.addEventListener('load', renderWidget, { once: true });
      return () => existingScript.removeEventListener('load', renderWidget);
    }

    const script = document.createElement('script');
    script.id = 'cf-turnstile-script';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = renderWidget;
    document.body.appendChild(script);

    return () => {
      script.onload = null;
    };
  }, [supportOpen, turnstileSiteKey]);

  useEffect(() => {
    if (step !== 6 || !signatureRef.current) return undefined;

    const canvas = signatureRef.current;
    const pad =
      signaturePad ||
      new SignaturePad(canvas, {
        backgroundColor: 'rgb(255,255,255)',
        penColor: 'rgb(13,44,84)',
        minWidth: 0.8,
        maxWidth: 2.4,
        throttle: 8,
        velocityFilterWeight: 0.6,
        onEnd: () => {
          setSignatureMode('draw');
          setUploadedSignatureFile(null);
        },
      });

    const resizeCanvas = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.isEmpty() ? null : pad.toData();

      canvas.width = Math.floor(canvas.offsetWidth * ratio);
      canvas.height = Math.floor(canvas.offsetHeight * ratio);
      canvas.getContext('2d')?.scale(ratio, ratio);
      pad.clear();

      if (data && data.length > 0) {
        pad.fromData(data);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    if (!signaturePad) {
      setSignaturePad(pad);
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [step, signaturePad]);

  useEffect(() => {
    if (!uploadedSignatureFile) {
      setUploadedSignaturePreview('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(uploadedSignatureFile);
    setUploadedSignaturePreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [uploadedSignatureFile]);

  const stepLabels = useMemo(
    () => ['Validación', 'Personal', 'Entorno', 'Académico', 'Soportes', 'Firma'],
    []
  );

  const handleInputChange = (event) => {
    const { id, value, type, checked } = event.target;
    const nextValueRaw = type === 'checkbox' ? checked : value;
    const nextValue =
      id === 'dpto_nacimiento' || id === 'dpto_residencia'
        ? normalizeCatalogValue(nextValueRaw)
        : nextValueRaw;

    setMissingFields((prev) => prev.filter((field) => field !== id));
    if (id === 'dpto_nacimiento') {
      setMissingFields((prev) => prev.filter((field) => field !== 'municipio_nacimiento'));
    }
    if (id === 'dpto_residencia') {
      setMissingFields((prev) => prev.filter((field) => field !== 'municipio_residencia'));
    }

    setFormData((prev) => {
      const next = { ...prev, [id]: nextValue };

      if (id === 'recibe_subsidio' && nextValue !== 'Sí') {
        next.cual_subsidio = '';
      }

      if (id === 'dpto_nacimiento') {
        next.municipio_nacimiento = '';
      }

      if (id === 'dpto_residencia') {
        next.municipio_residencia = '';
      }

      if (id === 'semestre_ingreso' && Number(nextValue) < 2) {
        next.promedio_anterior = '';
      }

      if (id === 'ano_graduacion') {
        next.ano_graduacion = String(nextValue || '').replace(/\D/g, '').slice(0, 4);
      }

      if (id === 'puntaje_icfes') {
        const sanitized = String(nextValue || '').replace(/\D/g, '');
        if (!sanitized) {
          next.puntaje_icfes = '';
        } else {
          const numeric = Math.min(500, Number(sanitized));
          next.puntaje_icfes = String(numeric);
        }
      }

      if (id === 'promedio_anterior') {
        next.promedio_anterior = String(nextValue || '').replace(/[^\d.]/g, '').slice(0, 4);
      }

      return next;
    });
  };

  const handleFileChange = (key, file) => {
    setMissingFields((prev) => prev.filter((field) => field !== key));
    setFormData((prev) => ({
      ...prev,
      soportes: {
        ...prev.soportes,
        [key]: file || null,
      },
    }));
  };

  const handleSignatureUpload = (file) => {
    try {
      if (!file) {
        setUploadedSignatureFile(null);
        return;
      }

      validateSignatureImageFile(file);
      signaturePad?.clear();
      setUploadedSignatureFile(file);
      setSignatureMode('upload');
      setSubmitError('');
    } catch (error) {
      setSubmitError(error?.message || 'No se pudo cargar la firma.');
    }
  };

  const clearDrawSignature = () => {
    signaturePad?.clear();
  };

  const clearUploadedSignature = () => {
    setUploadedSignatureFile(null);
  };

  const activateSignatureMode = (mode) => {
    setSignatureMode(mode);
    setSubmitError('');

    if (mode === 'draw') {
      setUploadedSignatureFile(null);
      return;
    }

    signaturePad?.clear();
  };

  const openLegalModal = (type) => {
    setLegalModalType(type);
  };

  const closeLegalModal = () => {
    setLegalModalType(null);
  };

  const openSupportModal = () => {
    setSupportError('');
    setSupportSuccess('');
    setSupportOpen(true);
    setSupportForm((prev) => ({
      ...prev,
      radicado: prev.radicado || radicadoSearch.trim(),
      nombre_contacto: prev.nombre_contacto || formData.nombre_completo || '',
      email_contacto: prev.email_contacto || formData.email || '',
    }));
  };

  const closeSupportModal = () => {
    setSupportOpen(false);
    setSupportError('');
    setSupportSuccess('');
    setSupportCaptchaToken('');
    if (window.turnstile && supportCaptchaWidgetRef.current !== null) {
      try {
        window.turnstile.reset(supportCaptchaWidgetRef.current);
      } catch {
        // ignore reset errors
      }
    }
  };

  const handleSupportInputChange = (event) => {
    const { id, value } = event.target;
    setSupportForm((prev) => ({ ...prev, [id]: value }));
    setSupportError('');
    setSupportSuccess('');
  };

  const invokeSupportTickets = async (payload) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = String(sessionData?.session?.access_token || '').trim();
    let detail = '';

    try {
      const baseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
      const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

      if (baseUrl && anonKey) {
        const headers = {
          'Content-Type': 'application/json',
          apikey: anonKey,
        };

        if (accessToken) {
          headers.Authorization = `Bearer ${accessToken}`;
        }

        const response = await fetch(`${baseUrl}/functions/v1/support-tickets`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }

        if (response.ok && json?.ok !== false) {
          return { ok: true, data: json };
        }

        if (response.status === 401) {
          detail =
            'La función de soporte está protegida con JWT. Despliega support-tickets con --no-verify-jwt o habilita sesión antes de usar Ayuda.';
        } else {
          detail = json?.error || json?.message || `${response.status} ${response.statusText}`;
        }
      }
    } catch (httpError) {
      detail = httpError?.message || detail;
    }

    return {
      ok: false,
      error: detail || 'No se pudo comunicar con el servicio de soporte.',
    };
  };

  const handleSupportFetchTickets = async () => {
    const radicado = String(supportForm.radicado || '').trim();
    const emailContacto = String(supportForm.email_contacto || '').trim().toLowerCase();

    if (!radicado) {
      setSupportError('Ingresa tu radicado para consultar el estado de tus tickets.');
      return;
    }

    if (!emailContacto) {
      setSupportError('Ingresa el correo registrado en tu ticket para consultar respuestas.');
      return;
    }

    setSupportLookupLoading(true);
    setSupportError('');
    try {
      const result = await invokeSupportTickets({
        action: 'list',
        radicado,
        email_contacto: emailContacto,
      });

      if (!result.ok) {
        throw new Error(result.error || 'No se pudo consultar tus tickets.');
      }

      const data = result.data;

      setSupportTickets(Array.isArray(data?.tickets) ? data.tickets : []);
      if (!Array.isArray(data?.tickets) || data.tickets.length === 0) {
        setSupportSuccess('Aún no tienes tickets registrados con ese radicado y correo.');
      }
    } catch (lookupError) {
      setSupportError(lookupError?.message || 'No se pudo consultar el estado de tus tickets.');
    } finally {
      setSupportLookupLoading(false);
    }
  };

  const handleSupportSubmitTicket = async () => {
    const radicado = String(supportForm.radicado || '').trim();
    const nombreContacto = String(supportForm.nombre_contacto || '').trim();
    const emailContacto = String(supportForm.email_contacto || '').trim().toLowerCase();
    const asunto = String(supportForm.asunto || '').trim();
    const mensaje = String(supportForm.mensaje || '').trim();

    if (!radicado || !emailContacto || !asunto || !mensaje) {
      setSupportError('Completa radicado, correo, asunto y mensaje para crear el ticket.');
      return;
    }

    if (mensaje.length < 20) {
      setSupportError('Describe tu solicitud con mayor detalle (mínimo 20 caracteres).');
      return;
    }

    if (turnstileSiteKey && !supportCaptchaToken) {
      setSupportError('Completa la validación CAPTCHA para enviar tu ticket.');
      return;
    }

    setSupportLoading(true);
    setSupportError('');
    setSupportSuccess('');
    try {
      const result = await invokeSupportTickets({
        action: 'create',
        radicado,
        nombre_contacto: nombreContacto,
        email_contacto: emailContacto,
        asunto,
        mensaje,
        captcha_token: supportCaptchaToken,
      });

      if (!result.ok) {
        throw new Error(result.error || 'No se pudo registrar el ticket.');
      }

      const data = result.data;

      const newTicket = data?.ticket;
      setSupportSuccess(
        data?.message ||
          `Ticket ${newTicket?.ticket_codigo || ''} registrado correctamente. Te responderemos por este mismo canal.`
      );

      if (newTicket) {
        setSupportTickets((prev) => [newTicket, ...prev]);
      }

      setSupportForm((prev) => ({
        ...prev,
        asunto: '',
        mensaje: '',
      }));
      setSupportCaptchaToken('');
      if (window.turnstile && supportCaptchaWidgetRef.current !== null) {
        try {
          window.turnstile.reset(supportCaptchaWidgetRef.current);
        } catch {
          // ignore reset errors
        }
      }
    } catch (submitError) {
      setSupportError(submitError?.message || 'No se pudo enviar tu ticket de ayuda.');
    } finally {
      setSupportLoading(false);
    }
  };

  const resetRegistrationFlow = () => {
    try { sessionStorage.removeItem('focades_otp_email'); } catch { /* ignore */ }
    setFormData(EMPTY_FORM);
    setOtpStep('enter-email');
    setOtpCode('');
    setEmailVerified(false);
    setStep(1);
    setSubmitError('');
    setSubmitSuccess('');
    setCompletedRadicado('');
    setCompletionNotice('');
    setCopyRadicadoMessage('');
    setDocsGenerationContext(null);
    setDocsGenerationLoading(false);
    setSignatureMode('draw');
    setUploadedSignatureFile(null);
    signaturePad?.clear();
  };

  const handleCopyRadicado = async () => {
    if (!completedRadicado) return;
    try {
      await navigator.clipboard.writeText(completedRadicado);
      setCopyRadicadoMessage('Radicado copiado al portapapeles.');
    } catch {
      setCopyRadicadoMessage('No se pudo copiar automáticamente. Copia el radicado manualmente.');
    }
  };

  const handleBackToLandingAfterSuccess = () => {
    resetRegistrationFlow();
    setActiveView('landing');
  };

  const invokeGeneratedDocs = async (payload, retries = 1) => {
    let lastError = '';
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = String(sessionData?.session?.access_token || '').trim();

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const { data, error } = await supabase.functions.invoke('generate-inscripcion-docs', {
        body: payload,
      });

      if (!error && data?.ok !== false) {
        return {
          ok: true,
          emailSent: data?.email?.sent === true,
          emailReason: data?.email?.reason || '',
        };
      }

      lastError = error?.message || data?.error || 'Error desconocido al generar documentos automáticos.';

      if (error || data?.ok === false) {
        try {
          const baseUrl = import.meta.env.VITE_SUPABASE_URL;
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

          const headers = {
            'Content-Type': 'application/json',
            apikey: anonKey,
          };

          if (accessToken) {
            headers.Authorization = `Bearer ${accessToken}`;
          }

          const fallbackResponse = await fetch(`${baseUrl}/functions/v1/generate-inscripcion-docs`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          });

          let fallbackJson = null;
          try {
            fallbackJson = await fallbackResponse.json();
          } catch {
            fallbackJson = null;
          }

          if (fallbackResponse.ok && fallbackJson?.ok !== false) {
            return {
              ok: true,
              emailSent: fallbackJson?.email?.sent === true,
              emailReason: fallbackJson?.email?.reason || '',
            };
          }

          const fallbackDetail = fallbackJson?.error || fallbackJson?.message || fallbackResponse.statusText;
          lastError = `HTTP ${fallbackResponse.status}: ${fallbackDetail}`;
        } catch (httpError) {
          lastError = httpError?.message || lastError;
        }
      }

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
    }

    return { ok: false, error: lastError };
  };

  const resolveValidAccessToken = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    let session = sessionData?.session || null;

    if (!session?.access_token) {
      return { ok: false, token: '', reason: 'NO_SESSION' };
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = Number(session.expires_at || 0);
    const isNearExpiry = expiresAt > 0 && expiresAt - now <= 60;

    if (isNearExpiry) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshed?.session?.access_token) {
        session = refreshed.session;
      }
    }

    const token = String(session?.access_token || '').trim();
    if (!token) {
      return { ok: false, token: '', reason: 'NO_TOKEN' };
    }

    const { error: userError } = await supabase.auth.getUser(token);
    if (!userError) {
      return { ok: true, token, reason: '' };
    }

    const message = String(userError.message || '').toLowerCase();
    const invalidJwt =
      userError.status === 401 ||
      message.includes('invalid jwt') ||
      message.includes('jwt expired') ||
      message.includes('token has expired');

    if (!invalidJwt) {
      return { ok: true, token, reason: '' };
    }

    const { data: refreshedAgain, error: secondRefreshError } = await supabase.auth.refreshSession();
    if (!secondRefreshError && refreshedAgain?.session?.access_token) {
      return {
        ok: true,
        token: String(refreshedAgain.session.access_token || '').trim(),
        reason: 'REFRESHED',
      };
    }

    await supabase.auth.signOut();
    setEmailVerified(false);
    setOtpStep('enter-email');
    setOtpCode('');
    return { ok: false, token: '', reason: 'INVALID_JWT' };
  };

  const invokeSecureRegistration = async (payload, retries = 1) => {
    let lastError = '';
    let lastCode = '';

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const tokenState = await resolveValidAccessToken();
      if (!tokenState.ok || !tokenState.token) {
        return {
          ok: false,
          error: OTP_SESSION_EXPIRED_MESSAGE,
          code: 'OTP_REQUIRED',
        };
      }

      const accessToken = tokenState.token;
      const payloadWithAuth = {
        ...payload,
        access_token: accessToken,
      };
      const { data, error } = await supabase.functions.invoke('register-inscripcion', {
        body: payloadWithAuth,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!error && data?.ok !== false && data?.inscripcion?.id) {
        return {
          ok: true,
          inscripcion: data.inscripcion,
        };
      }

      let errorFromContext = '';
      let codeFromContext = '';
      let contextJsonDump = null;
      if (error?.context?.json) {
        try {
          const contextJson = await error.context.json();
          contextJsonDump = contextJson;
          errorFromContext = contextJson?.error || contextJson?.message || '';
          codeFromContext = contextJson?.code || '';
        } catch (jsonErr) {
          errorFromContext = '';
          codeFromContext = '';
          // eslint-disable-next-line no-console
          console.warn('[register-inscripcion] No se pudo parsear context.json()', jsonErr);
        }
      }

      // eslint-disable-next-line no-console
      console.error('[register-inscripcion] Respuesta backend', {
        attempt,
        sdkError: error,
        sdkErrorMessage: error?.message,
        contextStatus: error?.context?.status,
        contextJson: contextJsonDump,
        data,
        payloadKeys: Object.keys(payloadWithAuth || {}),
        inscripcionFieldsKeys: Object.keys(payloadWithAuth?.inscripcion_fields || {}),
        personaKeys: Object.keys(payloadWithAuth?.persona || {}),
      });

      lastError =
        errorFromContext ||
        error?.message ||
        data?.error ||
        'Error desconocido al registrar la inscripción.';
      lastCode = codeFromContext || data?.code || '';

      if (error || data?.ok === false) {
        try {
          const baseUrl = import.meta.env.VITE_SUPABASE_URL;
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

          const headers = {
            'Content-Type': 'application/json',
            apikey: anonKey,
          };

          if (accessToken) {
            headers.Authorization = `Bearer ${accessToken}`;
          }

          const fallbackResponse = await fetch(`${baseUrl}/functions/v1/register-inscripcion`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payloadWithAuth),
          });

          let fallbackJson = null;
          let fallbackText = '';
          try {
            fallbackText = await fallbackResponse.text();
            fallbackJson = fallbackText ? JSON.parse(fallbackText) : null;
          } catch {
            fallbackJson = null;
          }

          // eslint-disable-next-line no-console
          console.error('[register-inscripcion] Fallback fetch response', {
            status: fallbackResponse.status,
            statusText: fallbackResponse.statusText,
            bodyText: fallbackText,
            bodyJson: fallbackJson,
          });

          if (fallbackResponse.ok && fallbackJson?.ok !== false && fallbackJson?.inscripcion?.id) {
            return {
              ok: true,
              inscripcion: fallbackJson.inscripcion,
            };
          }

          lastCode = fallbackJson?.code || lastCode;
          const fallbackDetail = fallbackJson?.error || fallbackJson?.message || fallbackResponse.statusText;
          lastError = lastCode
            ? `HTTP ${fallbackResponse.status} (${lastCode}): ${fallbackDetail}`
            : `HTTP ${fallbackResponse.status}: ${fallbackDetail}`;
        } catch (httpError) {
          lastError = httpError?.message || lastError;
        }
      }

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
    }

    return { ok: false, error: lastError, code: lastCode };
  };

  const handleRetryGeneratedDocs = async () => {
    if (!docsGenerationContext || docsGenerationLoading) return;

    setDocsGenerationLoading(true);
    const result = await invokeGeneratedDocs(docsGenerationContext, 1);

    if (result.ok) {
      setDocsGenerationContext(null);
      setCompletionNotice('Documentos automáticos generados correctamente.');
    } else {
      setCompletionNotice(`La inscripción quedó registrada, pero los documentos automáticos están pendientes de generación. Detalle: ${result.error}`);
    }

    setDocsGenerationLoading(false);
  };

  const acceptLegalModal = (type) => {
    const field = type === 'terms' ? 'acepta_terminos' : 'acepta_datos';
    setFormData((prev) => ({ ...prev, [field]: true }));
    setLegalModalType(null);
  };

  const resolveSignatureSource = () => {
    if (signatureMode === 'draw') {
      return signaturePad && !signaturePad.isEmpty() ? 'draw' : null;
    }

    if (signatureMode === 'upload') {
      return uploadedSignatureFile ? 'upload' : null;
    }

    return null;
  };

  const saveDraft = async (nextStep = step) => {
    if (!formData.email || !emailVerified) return;

    const normalizedEmail = String(formData.email || '').trim().toLowerCase();
    const payload = {
      ...formData,
      email: normalizedEmail,
      dpto_nacimiento: normalizeCatalogValue(formData.dpto_nacimiento),
      dpto_residencia: normalizeCatalogValue(formData.dpto_residencia),
      soportes: Object.fromEntries(
        Object.entries(formData.soportes).map(([k, f]) => [k, f?.name || null])
      ),
    };

    const draftRecord = {
      email: normalizedEmail,
      form_data: payload,
      current_step: nextStep,
      updated_at: new Date().toISOString(),
    };

    setSavingDraft(true);
    setSubmitError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const hasSession = Boolean(sessionData?.session?.access_token);

      try {
        localStorage.setItem(getDraftStorageKey(normalizedEmail), JSON.stringify(draftRecord));
      } catch {
        // Ignorar fallos de almacenamiento local
      }

      if (hasSession) {
        const { error } = await supabase.from('inscripciones_drafts').upsert(draftRecord, { onConflict: 'email' });
        if (error) {
          throw error;
        }
      }
    } catch (error) {
      setSubmitError(error?.message || 'No se pudo guardar el borrador en la base de datos. Se conservó una copia local en este navegador.');
    } finally {
      setSavingDraft(false);
    }
  };

  const loadDraftAfterVerification = async (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const { data: sessionData } = await supabase.auth.getSession();
    const hasSession = Boolean(sessionData?.session?.access_token);

    let data = null;
    let error = null;

    if (hasSession) {
      const remoteDraftResponse = await supabase
        .from('inscripciones_drafts')
        .select('form_data,current_step,updated_at')
        .eq('email', normalizedEmail)
        .maybeSingle();

      data = remoteDraftResponse.data;
      error = remoteDraftResponse.error;
    }

    let localDraft = null;
    try {
      const rawLocal = localStorage.getItem(getDraftStorageKey(normalizedEmail));
      if (rawLocal) {
        localDraft = JSON.parse(rawLocal);
      }
    } catch {
      localDraft = null;
    }

    const remoteDraft = data
      ? {
          form_data: data.form_data,
          current_step: data.current_step,
          updated_at: data.updated_at,
        }
      : null;

    let selectedDraft = remoteDraft;

    const localTime = localDraft?.updated_at ? new Date(localDraft.updated_at).getTime() : 0;
    const remoteTime = remoteDraft?.updated_at ? new Date(remoteDraft.updated_at).getTime() : 0;

    if (localDraft?.form_data && localTime >= remoteTime) {
      selectedDraft = localDraft;
    }

    if (error && !selectedDraft) {
      setStep(2);
      return;
    }

    if (!selectedDraft) {
      setStep(2);
      return;
    }

    const updatedAt = selectedDraft.updated_at ? new Date(selectedDraft.updated_at) : null;
    const now = new Date();
    const hours = updatedAt ? (now.getTime() - updatedAt.getTime()) / 36e5 : 999;

    if (!updatedAt || hours > 48) {
      if (hasSession) {
        await supabase.from('inscripciones_drafts').delete().eq('email', normalizedEmail);
      }
      try {
        localStorage.removeItem(getDraftStorageKey(normalizedEmail));
      } catch {
        // Ignorar limpieza local
      }
      setStep(2);
      return;
    }

    const keep = await showConfirmAlert({
      title: 'Borrador encontrado',
      text: 'Encontramos un borrador reciente. ¿Deseas continuar donde ibas?',
      confirmButtonText: 'Sí, continuar',
      cancelButtonText: 'No, iniciar de nuevo',
    });

    if (!keep) {
      if (hasSession) {
        await supabase.from('inscripciones_drafts').delete().eq('email', normalizedEmail);
      }
      try {
        localStorage.removeItem(getDraftStorageKey(normalizedEmail));
      } catch {
        // Ignorar limpieza local
      }
      setStep(2);
      return;
    }

    const draftFormData = selectedDraft.form_data || {};

    setFormData((prev) => ({
      ...prev,
      ...draftFormData,
      email: normalizedEmail,
      dpto_nacimiento: normalizeCatalogValue(draftFormData.dpto_nacimiento),
      dpto_residencia: normalizeCatalogValue(draftFormData.dpto_residencia),
      soportes: {
        ...EMPTY_FORM.soportes,
      },
    }));
    setMissingFields([]);
    setStep(normalizeDraftStepForResume(selectedDraft.current_step || 2));
  };

  const handleSendOTP = async () => {
    const email = formData.email?.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setOtpError('Ingresa un correo válido.');
      return;
    }

    setOtpLoading(true);
    setOtpError('');
    setOtpSuccess('');

    // Guardar el email en sessionStorage para recuperarlo si Supabase redirige
    // al usuario a /registro después de confirmar su cuenta por primera vez.
    try { sessionStorage.setItem('focades_otp_email', email); } catch { /* ignore */ }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/registro`,
      },
    });

    if (error) {
      setOtpError(error.message || 'No se pudo enviar el código OTP.');
      setOtpLoading(false);
      return;
    }

    setOtpSuccess('Código enviado. Revisa tu bandeja o spam.');
    setOtpStep('verify-code');
    setOtpTimer(60);
    setOtpLoading(false);
  };

  const handleVerifyOTP = async () => {
    const email = formData.email?.trim();
    const code = otpCode?.trim();

    if (!code || code.length !== 6) {
      setOtpError('Ingresa un código de 6 dígitos.');
      return;
    }

    setOtpLoading(true);
    setOtpError('');

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });

    if (error) {
      setOtpError(error.message || 'Código inválido o expirado.');
      setOtpLoading(false);
      return;
    }

    setEmailVerified(true);
    setOtpSuccess('Correo validado correctamente.');
    setOtpLoading(false);

    // Bloquear si ya existe una inscripción enviada para este correo (en convocatoria activa)
    try {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      let existingQuery = supabase
        .from('inscripciones')
        .select('id,radicado,estado,convocatoria_id,created_at')
        .ilike('email', normalizedEmail)
        .order('created_at', { ascending: false })
        .limit(1);

      if (activeConv?.id) {
        existingQuery = existingQuery.eq('convocatoria_id', activeConv.id);
      }

      const { data: existingInscripcion } = await existingQuery.maybeSingle();

      if (existingInscripcion?.id) {
        const radicadoExistente = existingInscripcion.radicado || 'No disponible';
        const estadoExistente = existingInscripcion.estado || 'Radicado';

        // Limpiar borrador si existe (ya no aplica)
        try {
          localStorage.removeItem(getDraftStorageKey(normalizedEmail));
        } catch {
          // Ignorar
        }
        try {
          await supabase.from('inscripciones_drafts').delete().eq('email', normalizedEmail);
        } catch {
          // Ignorar
        }

        await showConfirmAlert({
          title: 'Ya enviaste tu inscripción',
          text: `Este correo ya tiene una inscripción registrada (Radicado: ${radicadoExistente}, Estado: ${estadoExistente}). No es posible enviar una nueva inscripción con el mismo correo. Si necesitas modificar tus datos, contacta a soporte o consulta tu radicado.`,
          confirmButtonText: 'Consultar mi radicado',
          cancelButtonText: 'Cerrar',
        });

        await supabase.auth.signOut();
        setEmailVerified(false);
        setOtpStep('enter-email');
        setOtpCode('');
        resetRegistrationFlow();
        setActiveView('landing');
        return;
      }
    } catch (blockError) {
      // eslint-disable-next-line no-console
      console.warn('No se pudo verificar inscripción previa, continuando:', blockError);
    }

    await loadDraftAfterVerification(email);
  };

  const handleSearchRadicado = async () => {
    if (!radicadoSearch.trim()) return;

    setRadicadoLoading(true);
    setRadicadoResult(null);

    const query = radicadoSearch.trim();
    let data = null;
    let error = null;
    let bankCertificateUploadedAt = null;
    let bankCertificateStoragePath = '';

    const buildRadicadoResult = (record, options = {}) => {
      const stage = inferStage(record);
      const resolvedRaw = options.raw !== undefined ? options.raw : record;
      const resolvedId = options.id !== undefined ? options.id : record?.id || null;
      const resolvedBankUploadedAt =
        options.bankCertificateUploadedAt !== undefined
          ? options.bankCertificateUploadedAt
          : record?.certificado_bancario_uploaded_at || null;
      const resolvedBankStoragePath =
        options.bankCertificateStoragePath !== undefined
          ? options.bankCertificateStoragePath
          : String(record?.certificado_bancario_storage_path || '').trim();

      return {
        raw: resolvedRaw,
        id: resolvedId,
        radicado: record?.radicado || record?.numero_radicado || query,
        documento: record?.n_documento || record?.documento_persona || record?.documento || '',
        nombre_completo: record?.nombre_completo || 'No disponible',
        modalidad: record?.modalidad || record?.modalidad_aspira || 'No disponible',
        programa: record?.programa_academico || record?.programa || record?.institucion_superior || 'No disponible',
        estado: record?.estado || 'En revisión',
        observacion: record?.observacion_publica || record?.observacion || record?.observaciones || '',
        updated_at: record?.updated_at || record?.created_at || null,
        etapa: stage,
        permite_reemplazo_soportes:
          record?.permite_reemplazo_soportes === true ||
          record?.autoriza_reemplazo_documentos === true ||
          record?.autoriza_reemplazo === true,
        cert_bancario_requerido: isBankCertificateRequired(record, stage),
        certificado_bancario_uploaded_at: resolvedBankUploadedAt,
        certificado_bancario_storage_path: resolvedBankStoragePath,
      };
    };

    const byRadicado = await supabase
      .from('inscripciones')
      .select('*')
      .eq('radicado', query)
      .maybeSingle();

    data = byRadicado.data;
    error = byRadicado.error;
    // Nota: no consultamos por `numero_radicado` directamente porque la columna no existe en
    // todos los entornos y produce 400 ruidoso en consola. El RPC público
    // `lookup_inscripcion_publica_status` ya cubre ambas variantes.

    if (error || !data) {
      const { data: publicStatus, error: publicStatusError } = await supabase.rpc('lookup_inscripcion_publica_status', {
        p_radicado: query,
      });

      if (!publicStatusError && publicStatus) {
        setRadicadoResult(
          buildRadicadoResult(publicStatus, {
            raw: null,
            id: null,
            bankCertificateUploadedAt: publicStatus.certificado_bancario_uploaded_at || null,
            bankCertificateStoragePath: String(publicStatus.certificado_bancario_storage_path || '').trim(),
          })
        );
      } else {
        setRadicadoResult({ error: 'No se encontró una inscripción con ese radicado.' });
      }
    } else {
      const bankDocQueryAttempts = [
        { select: 'uploaded_at,storage_path', orderBy: 'uploaded_at' },
        { select: 'created_at,storage_path', orderBy: 'created_at' },
        { select: 'updated_at,storage_path', orderBy: 'updated_at' },
        { select: 'storage_path', orderBy: '' },
      ];

      let bankCertificateResolved = false;

      for (const attempt of bankDocQueryAttempts) {
        let bankQuery = supabase
          .from('inscripciones_documentos')
          .select(attempt.select)
          .eq('inscripcion_id', data.id)
          .eq('tipo_documento', 'certificado_bancario');

        if (attempt.orderBy) {
          bankQuery = bankQuery.order(attempt.orderBy, { ascending: false });
        }

        const { data: bankCertificateRow, error: bankCertificateRowError } = await bankQuery.limit(1).maybeSingle();

        if (!bankCertificateRowError) {
          if (bankCertificateRow) {
            bankCertificateUploadedAt =
              bankCertificateRow.uploaded_at || bankCertificateRow.created_at || bankCertificateRow.updated_at || null;
            bankCertificateStoragePath = String(bankCertificateRow.storage_path || '').trim();
          }
          bankCertificateResolved = true;
          break;
        }

        const errorMessage = String(bankCertificateRowError.message || '');
        const isMissingColumn =
          /column\s+inscripciones_documentos\.[a-z_]+\s+does not exist/i.test(errorMessage) ||
          /Could not find the '([a-z_]+)' column/i.test(errorMessage);
        const isMissingTable =
          bankCertificateRowError.code === '42P01' ||
          /relation\s+'inscripciones_documentos'\s+does not exist/i.test(errorMessage);

        if (isMissingTable) {
          bankCertificateResolved = true;
          break;
        }

        if (!isMissingColumn) {
          console.warn('No se pudo consultar el historial del certificado bancario:', bankCertificateRowError.message);
          bankCertificateResolved = true;
          break;
        }
      }

      if (!bankCertificateResolved) {
        console.warn('No se pudo resolver una consulta compatible para historial de certificado bancario.');
      }

      setRadicadoResult(
        buildRadicadoResult(data, {
          bankCertificateUploadedAt,
          bankCertificateStoragePath,
        })
      );
    }

    setStatusUploadType('');
    setStatusUploadFile(null);
    setStatusUploadError('');
    setStatusUploadSuccess('');
    setBankCertificateFile(null);
    setBankCertificateDate('');
    setBankCertificateError('');
    setBankCertificateSuccess('');
    setBankNombre('');
    setBankTipoCuenta('');
    setBankNumeroCuenta('');
    setBankNumeroCuentaConf('');
    setRadicadoLoading(false);
  };

  const uploadAdditionalDocument = async ({ inscripcion, tipoDocumento, file, requireExistingPath = false }) => {
    if (!inscripcion?.id) {
      throw new Error('No se encontró el identificador de la inscripción para adjuntar el documento.');
    }

    const { data: existingDocRow, error: existingDocError } = await supabase
      .from('inscripciones_documentos')
      .select('id,version,storage_path')
      .eq('inscripcion_id', inscripcion.id)
      .eq('tipo_documento', tipoDocumento)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingDocError) {
      throw new Error(`No se pudo consultar el documento actual: ${existingDocError.message}`);
    }

    const documentoPersona =
      inscripcion.documento ||
      inscripcion.raw?.n_documento ||
      inscripcion.raw?.documento_persona ||
      inscripcion.raw?.documento ||
      'sin-documento';

    const soportesMap =
      inscripcion.raw?.soportes && typeof inscripcion.raw.soportes === 'object' ? inscripcion.raw.soportes : {};

    const formSoportesMap =
      inscripcion.raw?.datos_formulario?.soportes && typeof inscripcion.raw.datos_formulario.soportes === 'object'
        ? inscripcion.raw.datos_formulario.soportes
        : {};

    const currentPathFromInscripcion =
      existingDocRow?.storage_path ||
      soportesMap?.[tipoDocumento] ||
      formSoportesMap?.[tipoDocumento] ||
      inscripcion.raw?.[tipoDocumento] ||
      '';

    const existingSoportesPaths = [
      ...Object.values(soportesMap || {}),
      ...Object.values(formSoportesMap || {}),
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    const fallbackBaseFromMaps = pickPreferredExpedienteBasePath([
      currentPathFromInscripcion,
      ...existingSoportesPaths,
    ]);

    let fallbackBaseFromHistory = '';
    if (!fallbackBaseFromMaps) {
      const { data: anyExistingDocRows, error: anyExistingDocError } = await supabase
        .from('inscripciones_documentos')
        .select('storage_path')
        .eq('inscripcion_id', inscripcion.id)
        .not('storage_path', 'is', null)
        .limit(100);

      if (anyExistingDocError) {
        console.warn('No se pudo consultar rutas base de documentos existentes:', anyExistingDocError.message);
      } else {
        const historyPaths = (anyExistingDocRows || [])
          .map((row) => String(row?.storage_path || '').trim())
          .filter(Boolean);

        fallbackBaseFromHistory = pickPreferredExpedienteBasePath(historyPaths);
      }
    }

    const expedienteBasePath = fallbackBaseFromMaps || fallbackBaseFromHistory || '';

    if (requireExistingPath && !currentPathFromInscripcion) {
      throw new Error(
        'No se encontró la ruta del documento actual para reemplazar. Actualiza la inscripción base o selecciona un documento ya existente.'
      );
    }

    const path = currentPathFromInscripcion
      ? currentPathFromInscripcion
      : expedienteBasePath
        ? buildVersionedStoragePathFromBase({
            basePath: expedienteBasePath,
            tipoDocumento,
            fileName: file.name,
          })
        : buildVersionedStoragePath({
            documento: documentoPersona,
            radicado: inscripcion.radicado,
            tipoDocumento,
            fileName: file.name,
          });

    const { error: uploadError } = await supabase.storage
      .from('soportes')
      .upload(path, file, { upsert: true, contentType: 'application/pdf' });

    if (uploadError) {
      throw new Error(`No se pudo subir el documento: ${uploadError.message}`);
    }

    if (existingDocRow?.id) {
      const { error: updateDocError } = await supabase
        .from('inscripciones_documentos')
        .update({
          storage_path: path,
          nombre_original: file.name,
          mime_type: file.type || 'application/pdf',
          size_bytes: file.size || 0,
        })
        .eq('id', existingDocRow.id);

      if (updateDocError) {
        throw new Error(`No se pudo actualizar el documento existente: ${updateDocError.message}`);
      }
    } else {
      const { error: insertError } = await supabase.from('inscripciones_documentos').insert({
        inscripcion_id: inscripcion.id,
        tipo_documento: tipoDocumento,
        storage_path: path,
        nombre_original: file.name,
        mime_type: file.type || 'application/pdf',
        size_bytes: file.size || 0,
        version: 1,
      });

      if (insertError) {
        throw new Error(`No se pudo registrar el historial del documento: ${insertError.message}`);
      }
    }

    const currentSoportes =
      inscripcion.raw?.soportes && typeof inscripcion.raw.soportes === 'object'
        ? inscripcion.raw.soportes
        : {};

    const currentForm =
      inscripcion.raw?.datos_formulario && typeof inscripcion.raw.datos_formulario === 'object'
        ? inscripcion.raw.datos_formulario
        : {};

    const mergedSoportes = {
      ...currentSoportes,
      [tipoDocumento]: path,
    };

    const mergedDatosFormulario = {
      ...currentForm,
      soportes: {
        ...(currentForm?.soportes && typeof currentForm.soportes === 'object' ? currentForm.soportes : {}),
        [tipoDocumento]: path,
      },
    };

    const rawInscripcion = inscripcion.raw && typeof inscripcion.raw === 'object' ? inscripcion.raw : {};
    const hasDirectDocColumn = Object.prototype.hasOwnProperty.call(rawInscripcion, tipoDocumento);
    const hasSoportesColumn = Object.prototype.hasOwnProperty.call(rawInscripcion, 'soportes');
    const hasDatosFormularioColumn = Object.prototype.hasOwnProperty.call(rawInscripcion, 'datos_formulario');

    const updatePayloadCandidates = [];

    if (hasSoportesColumn && hasDatosFormularioColumn && hasDirectDocColumn) {
      updatePayloadCandidates.push({
        [tipoDocumento]: path,
        soportes: mergedSoportes,
        datos_formulario: mergedDatosFormulario,
      });
    }

    if (hasSoportesColumn && hasDatosFormularioColumn) {
      updatePayloadCandidates.push({
        soportes: mergedSoportes,
        datos_formulario: mergedDatosFormulario,
      });
    }

    if (hasSoportesColumn) {
      updatePayloadCandidates.push({ soportes: mergedSoportes });
    }

    if (hasDatosFormularioColumn) {
      updatePayloadCandidates.push({ datos_formulario: mergedDatosFormulario });
    }

    if (hasDirectDocColumn) {
      updatePayloadCandidates.push({ [tipoDocumento]: path });
    }

    let lastPointerError = null;
    let pointerUpdated = false;

    for (const payload of updatePayloadCandidates) {
      const { error: patchError } = await supabase.from('inscripciones').update(payload).eq('id', inscripcion.id);
      if (!patchError) {
        pointerUpdated = true;
        break;
      }
      lastPointerError = patchError;
    }

    if (!pointerUpdated && lastPointerError) {
      console.warn(
        'El archivo se reemplazó en Storage e historial, pero no se pudo actualizar el puntero en inscripciones:',
        lastPointerError.message
      );
    }

    return {
      path,
      pointerUpdated,
      pointerError: pointerUpdated ? '' : lastPointerError?.message || '',
    };
  };

  const markInscripcionAsReviewPending = async (inscripcionId) => {
    if (!inscripcionId) return { ok: false, error: 'Inscripción no disponible.' };

    const { error } = await supabase
      .from('inscripciones')
      .update({ estado: 'En revisión' })
      .eq('id', inscripcionId);

    if (error) {
      return { ok: false, error: error.message || 'No se pudo actualizar el estado a En revisión.' };
    }

    return { ok: true };
  };

  const handleUploadReplacementDocument = async () => {
    if (!radicadoResult || radicadoResult.error) return;

    if (!radicadoResult.permite_reemplazo_soportes || radicadoResult.etapa !== 'aspirante') {
      setStatusUploadError('Esta inscripción no tiene autorización activa para reemplazo de soportes.');
      return;
    }

    if (!statusUploadType) {
      setStatusUploadError('Selecciona el tipo de documento que deseas reemplazar.');
      return;
    }

    if (!statusUploadFile) {
      setStatusUploadError('Selecciona un archivo PDF para reemplazar.');
      return;
    }

    setStatusUploadLoading(true);
    setStatusUploadError('');
    setStatusUploadSuccess('');

    try {
      validatePdfFile(statusUploadFile, statusUploadType);
      await validatePdfNotEncrypted(statusUploadFile, statusUploadType);

      const replacementResult = await uploadAdditionalDocument({
        inscripcion: radicadoResult,
        tipoDocumento: statusUploadType,
        file: statusUploadFile,
        requireExistingPath: true,
      });
      const reviewUpdateResult = await markInscripcionAsReviewPending(radicadoResult.id);

      const documentLabel = getDocumentLabel(statusUploadType);
      const reviewUpdateWarning = reviewUpdateResult.ok
        ? ''
        : ` Nota: no se pudo actualizar el estado automáticamente a "En revisión" (${reviewUpdateResult.error}).`;

      setStatusUploadSuccess(
        replacementResult.pointerUpdated
          ? `Documento reemplazado y registrado correctamente. Estado actualizado a En revisión.${reviewUpdateWarning}`
          : `Documento reemplazado correctamente. Nota: no se pudo actualizar el puntero en la fila principal de inscripción.${reviewUpdateWarning}`
      );
      await showSuccessAlert({
        title: 'Documento reemplazado',
        text: replacementResult.pointerUpdated
          ? `${documentLabel} fue actualizado correctamente y tu estado pasó a En revisión para nueva validación administrativa.${reviewUpdateWarning}`
          : `${documentLabel} fue reemplazado, pero no se actualizó el puntero en la fila principal de inscripción.${reviewUpdateWarning}`,
      });
      setStatusUploadFile(null);
      setStatusUploadType('');
      await handleSearchRadicado();
    } catch (error) {
      const detail = error?.message || 'No se pudo reemplazar el documento.';
      setStatusUploadError(detail);
      await showErrorAlert({
        title: 'No se pudo reemplazar',
        text: `${getDocumentLabel(statusUploadType)}: ${detail}`,
      });
    } finally {
      setStatusUploadLoading(false);
    }
  };

  const handleUploadBankCertificate = async () => {
    if (!radicadoResult || radicadoResult.error) return;

    if (radicadoResult.etapa !== 'legalizacion' || !radicadoResult.cert_bancario_requerido) {
      setBankCertificateError('Esta inscripción no está en etapa de legalización con certificado requerido.');
      return;
    }

    if (!bankNombre) {
      setBankCertificateError('Selecciona el banco al que pertenece la cuenta.');
      return;
    }

    if (!bankTipoCuenta) {
      setBankCertificateError('Selecciona el tipo de cuenta (Ahorro o Corriente).');
      return;
    }

    if (!bankNumeroCuenta.trim()) {
      setBankCertificateError('Ingresa el número de cuenta bancaria.');
      return;
    }

    if (!/^\d{5,20}$/.test(bankNumeroCuenta.trim())) {
      setBankCertificateError('El número de cuenta debe contener solo dígitos (entre 5 y 20 caracteres).');
      return;
    }

    if (bankNumeroCuentaConf !== bankNumeroCuenta) {
      setBankCertificateError('Los números de cuenta no coinciden. Verifica e intenta de nuevo.');
      return;
    }

    if (!bankCertificateFile) {
      setBankCertificateError('Debes seleccionar el certificado bancario en PDF.');
      return;
    }

    if (!bankCertificateDate) {
      setBankCertificateError('Debes indicar la fecha de expedición del certificado bancario.');
      return;
    }

    if (!isDateWithinDays(bankCertificateDate, BANK_CERT_MAX_AGE_DAYS)) {
      setBankCertificateError(`El certificado bancario no puede tener más de ${BANK_CERT_MAX_AGE_DAYS} días de expedido.`);
      return;
    }

    setBankCertificateLoading(true);
    setBankCertificateError('');
    setBankCertificateSuccess('');

    try {
      validatePdfFile(bankCertificateFile, 'Certificado bancario');
      await validatePdfNotEncrypted(bankCertificateFile, 'Certificado bancario');

      const bankResult = await uploadAdditionalDocument({
        inscripcion: radicadoResult,
        tipoDocumento: 'certificado_bancario',
        file: bankCertificateFile,
        requireExistingPath: false,
      });

      // Guardar datos bancarios en la inscripción (no bloquea si la columna no existe)
      supabase
        .from('inscripciones')
        .update({
          datos_bancarios: {
            banco: bankNombre,
            tipo_cuenta: bankTipoCuenta,
            numero_cuenta: bankNumeroCuenta,
          },
        })
        .eq('id', radicadoResult.id)
        .then(({ error: bankDataError }) => {
          if (bankDataError) console.warn('No se pudieron guardar datos bancarios:', bankDataError.message);
        });

      const reviewUpdateResult = await markInscripcionAsReviewPending(radicadoResult.id);
      const reviewUpdateWarning = reviewUpdateResult.ok
        ? ''
        : ` Nota: no se pudo actualizar el estado automáticamente a "En revisión" (${reviewUpdateResult.error}).`;

      setBankCertificateSuccess(
        bankResult.pointerUpdated
          ? `Certificado bancario cargado correctamente. Estado actualizado a En revisión para validación administrativa.${reviewUpdateWarning}`
          : `Certificado cargado correctamente. Nota: no se pudo actualizar el puntero en la fila principal de inscripción y la validación administrativa seguirá pendiente.${reviewUpdateWarning}`
      );
      await showSuccessAlert({
        title: 'Certificado cargado',
        text: bankResult.pointerUpdated
          ? `El certificado bancario se cargó correctamente y quedó en revisión administrativa para completar la legalización.${reviewUpdateWarning}`
          : `El certificado bancario se cargó, pero no se actualizó el puntero en la fila principal de inscripción. La validación administrativa seguirá pendiente.${reviewUpdateWarning}`,
      });
      setBankCertificateFile(null);
      setBankCertificateDate('');
      setBankNombre('');
      setBankTipoCuenta('');
      setBankNumeroCuenta('');
      setBankNumeroCuentaConf('');
      await handleSearchRadicado();
    } catch (error) {
      const detail = error?.message || 'No se pudo subir el certificado bancario.';
      setBankCertificateError(detail);
      await showErrorAlert({
        title: 'Error al cargar certificado',
        text: detail,
      });
    } finally {
      setBankCertificateLoading(false);
    }
  };

  const buildRadicado = () => {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `ASP-${year}-${random}`;
  };

  const uploadSoportes = async ({ documento, radicado }) => {
    const uploaded = {};
    const historial = [];
    const entries = Object.entries(formData.soportes || {});

    for (const [key, file] of entries) {
      if (!file) {
        uploaded[key] = null;
        continue;
      }

      validatePdfFile(file, key);

      const path = buildVersionedStoragePath({
        documento,
        radicado,
        tipoDocumento: key,
        fileName: file.name,
      });

      const { error } = await supabase.storage
        .from('soportes')
        .upload(path, file, { upsert: false, contentType: 'application/pdf' });

      if (error) {
        throw new Error(`Error subiendo ${key}: ${error.message}`);
      }

      uploaded[key] = path;
      historial.push({
        tipo_documento: key,
        storage_path: path,
        nombre_original: file.name,
        mime_type: file.type || 'application/pdf',
        size_bytes: file.size || 0,
      });
    }

    return { uploaded, historial };
  };

  const handleFinalize = async () => {
    if (!emailVerified) {
      setSubmitError('Debes validar tu correo antes de finalizar.');
      return;
    }

    if (!formData.acepta_terminos || !formData.acepta_datos) {
      setSubmitError('Debes aceptar términos y tratamiento de datos.');
      return;
    }

    const signatureSource = resolveSignatureSource();
    if (!signatureSource) {
      setSubmitError('Debes registrar tu firma digital o subir una imagen de firma.');
      return;
    }

    setSubmitLoading(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      if (!activeConv?.id) {
        throw new Error('No hay convocatoria activa para registrar la inscripción. Contacta al administrador para habilitar una convocatoria vigente.');
      }

      if (!isConvOpen) {
        throw new Error('La convocatoria no se encuentra vigente en este momento. Verifica las fechas publicadas e inténtalo nuevamente.');
      }

      const tokenState = await resolveValidAccessToken();
      if (!tokenState.ok || !tokenState.token) {
        throw new Error(OTP_SESSION_EXPIRED_MESSAGE);
      }

      let generatedDocsWarning = '';
      const email = formData.email?.trim();
      const radicado = buildRadicado();
      const documentoPersona = formData.n_documento?.trim() || email;
      const { uploaded: soportes, historial } = await uploadSoportes({
        documento: documentoPersona,
        radicado,
      });

      const firmaBlob =
        signatureSource === 'upload'
          ? await imageFileToPngBlob(uploadedSignatureFile)
          : await signaturePadToPngBlob(signaturePad);

      if (!firmaBlob) {
        throw new Error('No fue posible procesar la firma digital.');
      }

      const firmaPath = `expedientes/${sanitizePathSegment(documentoPersona) || 'sin-documento'}/${sanitizePathSegment(radicado)}/firma/${Date.now()}-firma.png`;
      const { error: firmaError } = await supabase.storage.from('soportes').upload(firmaPath, firmaBlob, {
        upsert: false,
        contentType: 'image/png',
      });

      if (firmaError) {
        throw new Error(`Error subiendo firma: ${firmaError.message}`);
      }

      const personaPayload = {
        nombre_completo: formData.nombre_completo,
        tipo_documento: formData.tipo_documento,
        n_documento: formData.n_documento,
        genero: formData.genero,
        fecha_nacimiento: formData.fecha_nacimiento || null,
        pais_nacimiento: formData.pais_nacimiento,
        dpto_nacimiento: formData.dpto_nacimiento,
        municipio_nacimiento: formData.municipio_nacimiento,
        dpto_residencia: formData.dpto_residencia,
        municipio_residencia: formData.municipio_residencia,
        direccion_residencia: formData.direccion_residencia,
        n_celular: formData.n_celular,
        email,
      };

      const puntaje = Number(formData.puntaje_icfes || 0);
      const puntajeTotal = Number.isFinite(puntaje) ? Math.max(0, Math.min(100, Math.round((puntaje / 500) * 100))) : 0;
      const firmaHashDatos = await sha256Text(
        JSON.stringify({
          radicado,
          n_documento: formData.n_documento,
          nombre_completo: formData.nombre_completo,
          tipo_documento: formData.tipo_documento,
          email,
          modalidad: formData.modalidad,
        })
      );

      const inscripcionFormFields = {
        nombre_completo: formData.nombre_completo,
        tipo_documento: formData.tipo_documento,
        n_documento: formData.n_documento,
        email,
        n_celular: formData.n_celular,
        dpto_nacimiento: formData.dpto_nacimiento,
        municipio_nacimiento: formData.municipio_nacimiento,
        dpto_residencia: formData.dpto_residencia,
        municipio_residencia: formData.municipio_residencia,
        direccion_residencia: formData.direccion_residencia,
        establecimiento_educativo: formData.establecimiento_educativo,
        titulo_obtenido: formData.titulo_obtenido,
        ano_graduacion: toNumberOrNull(formData.ano_graduacion, true),
        ciudad_institucion: formData.ciudad_institucion,
        labora_actualmente: formData.labora_actualmente,
        firma_hash_datos: firmaHashDatos,
        recibe_subsidio: formData.recibe_subsidio,
        sisben_grupo: formData.sisben_grupo,
        enfoque_diferencial: formData.enfoque_diferencial,
        zona_residencia: formData.zona_residencia,
        barrio_corregimiento: formData.barrio_corregimiento,
        nombre_padre: formData.nombre_padre,
        documento_padre: formData.documento_padre,
        ocupacion_padre: formData.ocupacion_padre,
        ingresos_padre: formData.ingresos_padre,
        nombre_madre: formData.nombre_madre,
        documento_madre: formData.documento_madre,
        ocupacion_madre: formData.ocupacion_madre,
        ingresos_madre: formData.ingresos_madre,
        modalidad: formData.modalidad,
        nivel_formacion: formData.nivel_formacion,
        institucion_superior: formData.institucion_superior,
        programa_academico: formData.programa_academico,
        semestre_ingreso: toNumberOrNull(formData.semestre_ingreso, true),
        promedio_anterior: toNumberOrNull(formData.promedio_anterior, false),
        puntaje_icfes: toNumberOrNull(formData.puntaje_icfes, true),
      };

      const inscripcionPayload = {
        radicado,
        convocatoria_id: activeConv?.id || null,
        puntaje_total: puntajeTotal,
        persona: personaPayload,
        inscripcion_fields: inscripcionFormFields,
        soportes,
        firma_url: firmaPath,
        datos_formulario: {
          ...formData,
          soportes,
          firma_storage_path: firmaPath,
        },
      };

      const registerResult = await invokeSecureRegistration(inscripcionPayload, 1);
      if (!registerResult.ok) {
        if (isDuplicateSubmissionError({ code: registerResult.code, message: registerResult.error })) {
          const duplicateMessage =
            registerResult.error ||
            'Ya existe un registro previo asociado a esta información. Verifica tu radicado antes de volver a intentarlo.';

          setSubmitError(duplicateMessage);

          const goToStart = await showConfirmAlert({
            title: 'Registro duplicado detectado',
            text: `${duplicateMessage}\n\nSi ya habías enviado tu inscripción, te recomendamos volver al inicio y consultar el estado con tu radicado para no seguir enviando el formulario.`,
            confirmButtonText: 'Volver al inicio',
            cancelButtonText: 'Quedarme aquí',
          });

          if (goToStart) {
            resetRegistrationFlow();
            setActiveView('landing');
          }

          return;
        }
        throw new Error(registerResult.error || 'No se pudo registrar la inscripción en el servidor.');
      }

      const inscripcionData = registerResult.inscripcion;

      if (inscripcionData?.id) {
        const inscripcionId = String(inscripcionData.id || '').trim();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (!uuidRegex.test(inscripcionId)) {
          throw new Error('El identificador de inscripción no tiene formato UUID válido.');
        }

        const documentosPayload = [
          ...historial.map((doc) => ({
            inscripcion_id: inscripcionId,
            tipo_documento: doc.tipo_documento,
            storage_path: doc.storage_path,
            nombre_original: doc.nombre_original,
            mime_type: doc.mime_type,
            size_bytes: doc.size_bytes,
            version: 1,
          })),
          {
            inscripcion_id: inscripcionId,
            tipo_documento: 'firma_digital',
            storage_path: firmaPath,
            nombre_original: signatureSource === 'upload' ? uploadedSignatureFile?.name || 'firma.png' : 'firma-trazada.png',
            mime_type: 'image/png',
            size_bytes: firmaBlob.size || 0,
            version: 1,
          },
        ];

        if (documentosPayload.length > 0) {
          const { error: documentosError } = await supabase.from('inscripciones_documentos').insert(documentosPayload);
          if (documentosError && documentosError.code !== '42P01') {
            throw new Error(documentosError.message || 'No se pudo guardar el historial de documentos.');
          }
        }

        const generatedDocsPayload = {
          inscripcion_id: inscripcionId,
          radicado: inscripcionData?.radicado || radicado,
          firma_path: firmaPath,
          documento_persona: documentoPersona,
          form_data: {
            ...formData,
            soportes,
          },
        };

        const generatedDocsResult = await invokeGeneratedDocs(generatedDocsPayload, 1);
        if (!generatedDocsResult.ok) {
          generatedDocsWarning = `La inscripción quedó registrada, pero los documentos automáticos están pendientes de generación. Detalle: ${generatedDocsResult.error}`;
          setDocsGenerationContext(generatedDocsPayload);
        } else {
          setDocsGenerationContext(null);

          if (!generatedDocsResult.emailSent) {
            generatedDocsWarning = generatedDocsResult.emailReason
              ? `La inscripción quedó registrada, pero no se pudo enviar el correo de confirmación. Detalle: ${generatedDocsResult.emailReason}`
              : 'La inscripción quedó registrada, pero el correo de confirmación no pudo enviarse en este momento.';
          }
        }
      }

      await supabase.from('inscripciones_drafts').delete().eq('email', email);

      const finalRadicado = inscripcionData?.radicado || radicado;
      setCompletedRadicado(finalRadicado);
      setCompletionNotice(generatedDocsWarning || '');
      setSubmitSuccess(`Inscripción finalizada. Tu radicado es ${finalRadicado}.`);
      setStep(6);
    } catch (error) {
      setSubmitError(error?.message || 'Ocurrió un error al finalizar la inscripción.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleNext = async () => {
    if (step === 1) return;

    const requiredByStep = {
      2: [
        'nombre_completo',
        'tipo_documento',
        'n_documento',
        'genero',
        'fecha_nacimiento',
        'pais_nacimiento',
        'dpto_nacimiento',
        'municipio_nacimiento',
        'dpto_residencia',
        'municipio_residencia',
        'direccion_residencia',
        'n_celular',
      ],
      3: [
        'recibe_subsidio',
        'sisben_grupo',
        'enfoque_diferencial',
        'labora_actualmente',
        'zona_residencia',
        'barrio_corregimiento',
        'nombre_padre',
        'documento_padre',
        'ocupacion_padre',
        'ingresos_padre',
        'nombre_madre',
        'documento_madre',
        'ocupacion_madre',
        'ingresos_madre',
      ],
      4: [
        'modalidad',
        'titulo_obtenido',
        'ano_graduacion',
        'establecimiento_educativo',
        'puntaje_icfes',
        'nivel_formacion',
        'institucion_superior',
        'programa_academico',
        'semestre_ingreso',
        'ciudad_institucion',
      ],
      5: [
        'documento_identidad',
        'acta_grado',
        'diploma',
        'pruebas_saber',
        'cert_matricula',
        'ficha_sisben',
      ],
    };

    const conditionalRequired = [];
    if (step === 3 && formData.recibe_subsidio === 'Sí') {
      conditionalRequired.push('cual_subsidio');
    }
    if (step === 4 && Number(formData.semestre_ingreso || 0) >= 2) {
      conditionalRequired.push('promedio_anterior');
    }
    if (step === 5 && formData.enfoque_diferencial && formData.enfoque_diferencial !== 'Ninguno') {
      conditionalRequired.push('cert_enfoque');
    }
    if (step === 5 && Number(formData.semestre_ingreso || 0) >= 2) {
      conditionalRequired.push('cert_notas');
    }

    const requiredFields = [...(requiredByStep[step] || []), ...conditionalRequired];

    const soporteFields = new Set([
      'documento_identidad',
      'acta_grado',
      'diploma',
      'pruebas_saber',
      'cert_matricula',
      'cert_notas',
      'ficha_sisben',
      'cert_enfoque',
    ]);

    const missing = requiredFields.filter((field) => {
      if (soporteFields.has(field)) {
        return !formData.soportes?.[field];
      }
      return !String(formData[field] || '').trim();
    });

    const hasEmpty = missing.length > 0;

    if (hasEmpty) {
      setMissingFields(missing);
      await showWarningAlert({
        title: 'Campos obligatorios',
        text: 'Por favor, completa todos los campos obligatorios resaltados en rojo.',
      });
      return;
    }

    setMissingFields([]);
    const next = Math.min(step + 1, 6);
    await saveDraft(next);
    setStep(next);
  };

  const handlePrevious = () => {
    if (step <= 1) return;
    setMissingFields([]);
    setStep((prev) => prev - 1);
  };

  const showDocumentUploadOverlay = statusUploadLoading || bankCertificateLoading;
  const bankCertificatePointerPath =
    String(radicadoResult?.certificado_bancario_storage_path || '').trim() ||
    String(radicadoResult?.raw?.soportes?.certificado_bancario || '').trim() ||
    String(radicadoResult?.raw?.datos_formulario?.soportes?.certificado_bancario || '').trim() ||
    String(radicadoResult?.raw?.certificado_bancario || '').trim();
  const hasBankCertificateUploaded = Boolean(
    radicadoResult?.certificado_bancario_uploaded_at || bankCertificatePointerPath
  );
  const isLegalizacionCompletada = Boolean(
    radicadoResult &&
      !radicadoResult.error &&
      hasBankCertificateUploaded &&
      (radicadoResult.etapa !== 'legalizacion' || !radicadoResult.cert_bancario_requerido)
  );
  const bankCertificateUploadedAtLabel = radicadoResult?.certificado_bancario_uploaded_at
    ? formatDateTimeLabel(radicadoResult.certificado_bancario_uploaded_at)
    : 'No disponible';
  const inscripcionStatusBadgeClasses = getInscripcionStatusBadgeClasses(radicadoResult?.estado);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={42} />
      </div>
    );
  }

  if (activeView === 'landing') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="h-[72px] bg-white border-b border-border px-8 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
            <img src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logofocades-solo.png" alt="FOCADES" className="h-10" />
            <h1 className="text-primary font-bold text-lg">Portal de Inscripción para Aspirantes</h1>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary transition-colors"
          >
            <ArrowLeft size={16} />
            Volver al inicio
          </Link>
        </header>

        <main className="flex-1 p-6 md:p-10">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="lg:col-span-2 bg-white border border-border rounded-2xl p-8 shadow-sm">
              <img src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logofocades-letras.png" alt="Logo FOCADES" className="h-20 mb-4" />
              <h2 className="text-3xl font-extrabold text-primary mb-2">Programa FOCADES</h2>
              <p className="text-slate-600 mb-6">Inicia una nueva solicitud o consulta el estado de tu proceso de inscripción.</p>

              <div className="rounded-xl border border-border p-4 mb-6 bg-slate-50">
                <p className="text-sm text-slate-600">Estado convocatoria:</p>
                <p className={`font-bold ${isConvOpen ? 'text-success' : 'text-error'}`}>
                  {isConvOpen ? 'Abierta' : 'Cerrada'}
                </p>
                {activeConv?.fecha_fin && (
                  <p className="text-xs text-slate-500 mt-1">Vigente hasta: {activeConv.fecha_fin}</p>
                )}
              </div>

              <button
                onClick={() => {
                  resetRegistrationFlow();
                  setActiveView('form');
                }}
                disabled={!isConvOpen}
                className="bg-accent text-white px-8 py-3 rounded-full font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 transition-all inline-flex items-center gap-2"
              >
                <PencilLine size={18} /> Iniciar Nueva Inscripción
              </button>
            </section>

            <section className="bg-white border border-border rounded-2xl p-6 shadow-sm">
              <h3 className="text-primary font-bold mb-4">Documentos de Interés</h3>
              <div className="grid gap-3">
                <DocCard 
                  icon={<ClipboardCheck size={16} className="text-secondary" />} 
                  title="Requisitos por modalidad" 
                  subtitle="Circular oficial" 
                  to="/requisitos"
                />
                <DocCard 
                  icon={<FileText size={16} className="text-secondary" />} 
                  title="Guía de inscripción" 
                  subtitle="Paso a paso" 
                  to="/guia-inscripcion"
                />
              </div>
            </section>

            <section className="lg:col-span-3 bg-white border border-border rounded-2xl p-6 shadow-sm">
              <h3 className="text-primary font-bold mb-4 flex items-center gap-2"><Search size={18} /> Consultar Estado por Radicado</h3>
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  value={radicadoSearch}
                  onChange={(e) => setRadicadoSearch(e.target.value)}
                  className="flex-1 border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-secondary"
                  placeholder="Ej: ASP-2026-0001"
                />
                <button
                  onClick={handleSearchRadicado}
                  disabled={radicadoLoading}
                  className="bg-primary text-white rounded-xl px-6 py-3 font-bold hover:bg-secondary transition-all disabled:opacity-50"
                >
                  {radicadoLoading ? 'Consultando...' : 'Consultar'}
                </button>
              </div>

              {radicadoResult && (
                <div className="mt-4 p-4 rounded-xl border border-border bg-slate-50 text-sm">
                  {radicadoResult.error ? (
                    <p className="text-error">{radicadoResult.error}</p>
                  ) : (
                    <div className="space-y-4 text-slate-700">
                      <div className="grid md:grid-cols-2 gap-2">
                        <p><strong>Radicado:</strong> {radicadoResult.radicado}</p>
                        <p><strong>Número de documento:</strong> {maskDocumentNumber(radicadoResult.documento)}</p>
                        <p><strong>Nombre completo:</strong> {radicadoResult.nombre_completo}</p>
                        <p><strong>Modalidad:</strong> {radicadoResult.modalidad}</p>
                        <p><strong>Programa:</strong> {radicadoResult.programa}</p>
                        <p className="flex items-center gap-2 flex-wrap">
                          <strong>Etapa:</strong> <span className="uppercase">{radicadoResult.etapa}</span>
                          {isLegalizacionCompletada && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700 border border-green-200">
                              ✅ Completada
                            </span>
                          )}
                          {!isLegalizacionCompletada && hasBankCertificateUploaded && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                              ⏳ En revisión
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="border-t border-border pt-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Estado de la inscripción</p>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${inscripcionStatusBadgeClasses}`}>
                          {radicadoResult.estado}
                        </span>
                        {hasBankCertificateUploaded && !isLegalizacionCompletada && (
                          <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                            <p className="text-xs uppercase tracking-wide text-amber-700 font-semibold">Legalización en revisión</p>
                            <p className="text-sm text-amber-900 mt-1">
                              Tu certificado bancario ya fue cargado y está pendiente de validación administrativa.
                            </p>
                            <p className="text-[11px] text-amber-700 mt-2">Fecha de carga: {bankCertificateUploadedAtLabel}</p>
                          </div>
                        )}
                        {isLegalizacionCompletada && (
                          <div className="mt-3 p-3 rounded-lg bg-green-50 border border-green-200">
                            <p className="text-xs uppercase tracking-wide text-green-700 font-semibold">Legalización completada</p>
                            <p className="text-sm text-green-800 mt-1">
                              Tu proceso de legalización fue completado por el equipo administrativo.
                            </p>
                            <p className="text-[11px] text-green-700 mt-2">Certificado cargado: {bankCertificateUploadedAtLabel}</p>
                          </div>
                        )}
                        {radicadoResult.observacion && (
                          <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                            <p className="text-xs uppercase tracking-wide text-amber-700 font-semibold">Observación</p>
                            <p className="text-sm text-amber-800 mt-1">{radicadoResult.observacion}</p>
                          </div>
                        )}
                      </div>

                      <div className="border-t border-border pt-3 space-y-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Acciones disponibles para el aspirante</p>

                        {radicadoResult.permite_reemplazo_soportes && radicadoResult.etapa === 'aspirante' ? (
                          <div className="rounded-lg border border-border p-3 bg-white space-y-3">
                            <p className="font-semibold text-primary text-sm">Reemplazar documento autorizado</p>
                            <div className="grid md:grid-cols-3 gap-2">
                              <select
                                value={statusUploadType}
                                onChange={(event) => setStatusUploadType(event.target.value)}
                                className="border border-border rounded-lg px-3 py-2"
                              >
                                <option value="">Tipo de documento...</option>
                                {STATUS_REPLACEABLE_DOC_TYPES.map((docType) => (
                                  <option key={docType} value={docType}>{docType}</option>
                                ))}
                              </select>
                              <input
                                type="file"
                                accept=".pdf,application/pdf"
                                onChange={(event) => setStatusUploadFile(event.target.files?.[0] || null)}
                                className="border border-border rounded-lg px-3 py-2"
                              />
                              <button
                                type="button"
                                onClick={handleUploadReplacementDocument}
                                disabled={statusUploadLoading}
                                className="bg-secondary text-white rounded-lg px-3 py-2 font-semibold disabled:opacity-50"
                              >
                                {statusUploadLoading ? 'Subiendo...' : 'Reemplazar'}
                              </button>
                            </div>
                            {statusUploadError && <p className="text-error text-xs">{statusUploadError}</p>}
                            {statusUploadSuccess && <p className="text-success text-xs">{statusUploadSuccess}</p>}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">No hay reemplazo de soportes habilitado por el administrador para esta etapa.</p>
                        )}

                        {(radicadoResult.etapa === 'legalizacion' || hasBankCertificateUploaded || isLegalizacionCompletada) && (
                          <div className="rounded-lg border border-border p-3 bg-white space-y-3">
                            <p className="font-semibold text-primary text-sm">Legalización: certificado bancario</p>
                            {hasBankCertificateUploaded && (
                              <p className="text-xs text-slate-600">Último certificado cargado: {bankCertificateUploadedAtLabel}</p>
                            )}
                            {isLegalizacionCompletada ? (
                              <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
                                Ya completaste el proceso de legalización. No necesitas volver a cargar el certificado bancario.
                              </div>
                            ) : (
                              <>
                                <p className="text-xs text-slate-600">
                                  Debes adjuntar certificado bancario en PDF, sin contraseña y con fecha de expedición no mayor a {BANK_CERT_MAX_AGE_DAYS} días.
                                  También ingresa los datos de la cuenta bancaria donde recibirás el desembolso.
                                </p>
                                {hasBankCertificateUploaded && (
                                  <p className="text-xs text-amber-700">
                                    Ya registraste un certificado. Si lo necesitas, puedes reemplazarlo antes de la aprobación final.
                                  </p>
                                )}

                                {/* Datos bancarios */}
                                <div className="grid md:grid-cols-2 gap-2 pt-1">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-xs text-slate-500 font-semibold">Banco</label>
                                    <select
                                      value={bankNombre}
                                      onChange={(e) => setBankNombre(e.target.value)}
                                      className="border border-border rounded-lg px-3 py-2 text-sm"
                                    >
                                      <option value="">Selecciona el banco...</option>
                                      {COLOMBIAN_BANKS.map((b) => (
                                        <option key={b} value={b}>{b}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-xs text-slate-500 font-semibold">Tipo de cuenta</label>
                                    <select
                                      value={bankTipoCuenta}
                                      onChange={(e) => setBankTipoCuenta(e.target.value)}
                                      className="border border-border rounded-lg px-3 py-2 text-sm"
                                    >
                                      <option value="">Tipo de cuenta...</option>
                                      <option value="ahorro">Cuenta de Ahorro</option>
                                      <option value="corriente">Cuenta Corriente</option>
                                    </select>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-xs text-slate-500 font-semibold">Número de cuenta</label>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={bankNumeroCuenta}
                                      onChange={(e) => setBankNumeroCuenta(e.target.value.replace(/\D/g, ''))}
                                      placeholder="Solo dígitos"
                                      className="border border-border rounded-lg px-3 py-2 text-sm"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-xs text-slate-500 font-semibold">Confirmar número de cuenta</label>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={bankNumeroCuentaConf}
                                      onChange={(e) => setBankNumeroCuentaConf(e.target.value.replace(/\D/g, ''))}
                                      placeholder="Repite el número"
                                      className={`border rounded-lg px-3 py-2 text-sm ${
                                        bankNumeroCuentaConf && bankNumeroCuentaConf !== bankNumeroCuenta
                                          ? 'border-red-400 bg-red-50'
                                          : bankNumeroCuentaConf && bankNumeroCuentaConf === bankNumeroCuenta
                                            ? 'border-green-400 bg-green-50'
                                            : 'border-border'
                                      }`}
                                    />
                                    {bankNumeroCuentaConf && bankNumeroCuentaConf !== bankNumeroCuenta && (
                                      <p className="text-red-600 text-xs">Los números no coinciden</p>
                                    )}
                                    {bankNumeroCuentaConf && bankNumeroCuentaConf === bankNumeroCuenta && bankNumeroCuenta.length >= 5 && (
                                      <p className="text-green-600 text-xs">✓ Los números coinciden</p>
                                    )}
                                  </div>
                                </div>

                                {/* Certificado y fecha */}
                                <div className="grid md:grid-cols-3 gap-2 pt-1">
                                  <input
                                    type="date"
                                    value={bankCertificateDate}
                                    onChange={(event) => setBankCertificateDate(event.target.value)}
                                    className="border border-border rounded-lg px-3 py-2"
                                  />
                                  <input
                                    type="file"
                                    accept=".pdf,application/pdf"
                                    onChange={(event) => setBankCertificateFile(event.target.files?.[0] || null)}
                                    className="border border-border rounded-lg px-3 py-2"
                                  />
                                  <button
                                    type="button"
                                    onClick={handleUploadBankCertificate}
                                    disabled={bankCertificateLoading}
                                    className="bg-accent text-white rounded-lg px-3 py-2 font-semibold disabled:opacity-50"
                                  >
                                    {bankCertificateLoading
                                      ? 'Subiendo...'
                                      : hasBankCertificateUploaded
                                        ? 'Reemplazar certificado'
                                        : 'Enviar certificado'}
                                  </button>
                                </div>
                              </>
                            )}
                            {bankCertificateError && <p className="text-error text-xs">{bankCertificateError}</p>}
                            {bankCertificateSuccess && <p className="text-success text-xs">{bankCertificateSuccess}</p>}
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-slate-500">
                        Última actualización: {radicadoResult.updated_at ? new Date(radicadoResult.updated_at).toLocaleString('es-CO') : 'No disponible'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </main>

        <footer className="bg-primary text-white px-8 py-6 text-center text-sm">
          <img src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logoalcaldiasecretariablanco.png" alt="Alcaldía" className="h-14 mx-auto mb-3" />
          <p>© 2026 Alcaldía de Montelíbano - Secretaría de Educación</p>
          <button type="button" onClick={openSupportModal} className="fixed bottom-6 right-6 z-[130] bg-accent text-white border border-accent px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 hover:brightness-110 transition-all shadow-sm">
            <HelpCircle size={14} /> Ayuda
          </button>
        </footer>

        <SupportHelpModal
          open={supportOpen}
          onClose={closeSupportModal}
          form={supportForm}
          onChange={handleSupportInputChange}
          onSubmit={handleSupportSubmitTicket}
          onLookup={handleSupportFetchTickets}
          tickets={supportTickets}
          loading={supportLoading}
          lookupLoading={supportLookupLoading}
          error={supportError}
          success={supportSuccess}
          subjectOptions={SUPPORT_SUBJECT_OPTIONS}
          statusLabels={SUPPORT_STATUS_LABELS}
          showCaptcha={Boolean(turnstileSiteKey)}
          captchaContainerRef={supportCaptchaContainerRef}
        />

        {showDocumentUploadOverlay && (
          <div className="fixed inset-0 bg-slate-900/45 z-[120] flex flex-col items-center justify-center gap-3 text-white">
            <Loader2 className="animate-spin" size={34} />
            <p className="font-semibold">Subiendo documento, por favor espera...</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 md:px-8 py-8 overflow-x-hidden">

      {/* ── Overlay bloqueante durante envío ─────────────── */}
      {submitLoading && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl px-10 py-10 flex flex-col items-center gap-5 max-w-sm w-full mx-4 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center">
              <Loader2 size={32} className="text-secondary animate-spin" />
            </div>
            <div>
              <p className="text-lg font-extrabold text-primary">Enviando inscripción</p>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                Estamos procesando tu formulario y subiendo los documentos.<br />
                <strong>No cierres ni recargues la página.</strong>
              </p>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-secondary h-1.5 rounded-full animate-[progress_2s_ease-in-out_infinite]" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto bg-white border border-border rounded-2xl shadow-sm p-4 md:p-10 overflow-hidden">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (step > 0 && !submitLoading) {
                  showConfirmAlert({
                    title: '¿Volver a la landing?',
                    text: 'Tu progreso se guardará como borrador. Podrás continuar después.',
                    confirmButtonText: 'Sí, volver',
                    cancelButtonText: 'Continuar aquí',
                  }).then((confirmed) => {
                    if (confirmed) {
                      setActiveView('landing');
                    }
                  });
                } else {
                  setActiveView('landing');
                }
              }}
              disabled={submitLoading}
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Volver al inicio"
            >
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <h2 className="text-2xl md:text-3xl font-extrabold text-primary">Formulario de Inscripción</h2>
          </div>
          {savingDraft && <span className="text-xs text-slate-500">Guardando borrador...</span>}
        </div>

        {completedRadicado ? (
          <div className="max-w-2xl mx-auto border border-border rounded-2xl bg-slate-50 p-6 md:p-8 space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-100 border border-green-200 flex items-center justify-center">
                <CheckCircle2 className="text-green-600" size={34} />
              </div>
            </div>
            <h2 className="text-2xl font-extrabold text-primary">¡Inscripción Completada!</h2>
            <p className="text-slate-700">Hemos recibido tu solicitud correctamente. Tu número de radicado es:</p>
            <h3 className="text-accent text-2xl font-black mt-2 bg-white border border-border p-4 rounded-xl">{completedRadicado}</h3>
            <p className="text-slate-700">Hemos enviado una copia de este radicado a tu correo electrónico.</p>
            {completionNotice && (
              <p className={`${completionNotice.includes('pendientes') ? 'text-amber-700' : 'text-success'} text-sm`}>
                {completionNotice.trim()}
              </p>
            )}

            <div className="flex flex-col md:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={handleCopyRadicado}
                className="flex-1 bg-primary text-white py-3 rounded-full font-bold"
              >
                Copiar radicado
              </button>
              <button
                type="button"
                onClick={handleBackToLandingAfterSuccess}
                className="flex-1 bg-slate-200 text-slate-700 py-3 rounded-full font-bold"
              >
                Volver al inicio
              </button>
            </div>

            {docsGenerationContext && (
              <button
                type="button"
                onClick={handleRetryGeneratedDocs}
                disabled={docsGenerationLoading}
                className="w-full bg-accent text-white py-3 rounded-full font-bold disabled:opacity-50"
              >
                {docsGenerationLoading ? 'Reintentando generación...' : 'Reintentar generación de documentos'}
              </button>
            )}

            {copyRadicadoMessage && <p className="text-sm text-success font-semibold">{copyRadicadoMessage}</p>}
          </div>
        ) : (
          <>

        <div className="mb-8 md:mb-10">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold tracking-wide uppercase text-slate-500">Progreso del formulario</p>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 border border-border text-slate-700">
              Paso {step} de 6
            </span>
          </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
          {stepLabels.map((label, index) => {
            const number = index + 1;
            const done = step > number;
            const current = step === number;
            const isLast = number === stepLabels.length;
            return <StepDot key={label} number={number} label={label} done={done} current={current} isLast={isLast} />;
          })}
        </div>
        </div>

        <div className="mb-8">
          {step === 1 && (
            <section className="max-w-xl mx-auto">
              <SectionHeader title="Validación de correo" desc="Verifica tu email para continuar." />

              {otpStep === 'enter-email' && (
                <div className="space-y-4">
                  <Input label="Correo electrónico" id="email" type="email" value={formData.email} onChange={handleInputChange} placeholder="tu@correo.com" />
                  {otpError && <ErrorAlert message={otpError} />}
                  {otpSuccess && <SuccessAlert message={otpSuccess} />}
                  <button onClick={handleSendOTP} disabled={otpLoading} className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-secondary disabled:opacity-50 flex items-center justify-center gap-2">
                    {otpLoading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                    Enviar código OTP
                  </button>
                </div>
              )}

              {otpStep === 'verify-code' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-border text-sm text-slate-700 flex items-center gap-2">
                    <Mail size={16} className="text-secondary" /> Código enviado a <strong>{formData.email}</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                    <HelpCircle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                    <span>
                      <strong>¿Primera vez registrándote?</strong> Es posible que recibas primero un correo de confirmación de cuenta. Haz clic en el enlace de ese correo y serás redirigido automáticamente a esta página para continuar sin necesidad de ingresar el código.
                    </span>
                  </div>
                  <Input label="Código OTP (6 dígitos)" id="otpCode" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} />
                  {otpError && <ErrorAlert message={otpError} />}
                  {otpSuccess && <SuccessAlert message={otpSuccess} />}
                  <button onClick={handleVerifyOTP} disabled={otpLoading || otpCode.length !== 6} className="w-full bg-success text-white py-3 rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                    {otpLoading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                    Verificar OTP
                  </button>
                  <button onClick={handleSendOTP} disabled={otpTimer > 0 || otpLoading} className="w-full text-secondary font-bold py-2 disabled:opacity-50">
                    {otpTimer > 0 ? `Reenviar en ${otpTimer}s` : 'Reenviar código'}
                  </button>
                </div>
              )}
            </section>
          )}

          {step === 2 && (
            <BentoGrid>
              <Card title="Datos Personales" span="md:col-span-2">
                <Input label="Nombre completo" id="nombre_completo" value={formData.nombre_completo} onChange={handleInputChange} invalid={missingFieldsSet.has('nombre_completo')} />
                <Select label="Tipo documento" id="tipo_documento" value={formData.tipo_documento} onChange={handleInputChange} options={['CC', 'TI', 'CE', 'PAS']} invalid={missingFieldsSet.has('tipo_documento')} />
                <Input label="Número documento" id="n_documento" value={formData.n_documento} onChange={handleInputChange} invalid={missingFieldsSet.has('n_documento')} />
                <Select label="Género" id="genero" value={formData.genero} onChange={handleInputChange} options={['Femenino', 'Masculino', 'Otro']} invalid={missingFieldsSet.has('genero')} />
                <Input label="Fecha nacimiento" id="fecha_nacimiento" type="date" value={formData.fecha_nacimiento} onChange={handleInputChange} invalid={missingFieldsSet.has('fecha_nacimiento')} />
                <Select label="País nacimiento" id="pais_nacimiento" value={formData.pais_nacimiento} onChange={handleInputChange} options={PAISES_NACIMIENTO} invalid={missingFieldsSet.has('pais_nacimiento')} />
                <Select label="Dpto nacimiento" id="dpto_nacimiento" value={formData.dpto_nacimiento} onChange={handleInputChange} options={departamentos} invalid={missingFieldsSet.has('dpto_nacimiento')} />
                <Select label="Municipio nacimiento" id="municipio_nacimiento" value={formData.municipio_nacimiento} onChange={handleInputChange} options={municipiosByDepto[formData.dpto_nacimiento] || []} disabled={!formData.dpto_nacimiento} invalid={missingFieldsSet.has('municipio_nacimiento')} />
              </Card>
              <Card title="Residencia" span="md:col-span-2">
                <Select label="Dpto residencia" id="dpto_residencia" value={formData.dpto_residencia} onChange={handleInputChange} options={departamentos} invalid={missingFieldsSet.has('dpto_residencia')} />
                <Select label="Municipio residencia" id="municipio_residencia" value={formData.municipio_residencia} onChange={handleInputChange} options={municipiosByDepto[formData.dpto_residencia] || []} disabled={!formData.dpto_residencia} invalid={missingFieldsSet.has('municipio_residencia')} />
                <Input label="Dirección" id="direccion_residencia" value={formData.direccion_residencia} onChange={handleInputChange} invalid={missingFieldsSet.has('direccion_residencia')} />
                <Input label="Celular" id="n_celular" value={formData.n_celular} onChange={handleInputChange} invalid={missingFieldsSet.has('n_celular')} />
              </Card>
            </BentoGrid>
          )}

          {step === 3 && (
            <BentoGrid>
              <Card title="Entorno Socioeconómico" span="md:col-span-2">
                <Select label="Recibe subsidio" id="recibe_subsidio" value={formData.recibe_subsidio} onChange={handleInputChange} options={SUBSIDIO_OPTIONS} invalid={missingFieldsSet.has('recibe_subsidio')} />
                {formData.recibe_subsidio === 'Sí' && (
                  <Input label="¿Cuál subsidio recibe?" id="cual_subsidio" value={formData.cual_subsidio} onChange={handleInputChange} invalid={missingFieldsSet.has('cual_subsidio')} />
                )}
                <Select label="Grupo SISBEN" id="sisben_grupo" value={formData.sisben_grupo} onChange={handleInputChange} options={SISBEN_OPTIONS} invalid={missingFieldsSet.has('sisben_grupo')} />
                <Select label="Enfoque diferencial" id="enfoque_diferencial" value={formData.enfoque_diferencial} onChange={handleInputChange} options={ENFOQUE_OPTIONS} invalid={missingFieldsSet.has('enfoque_diferencial')} />
                <Select label="Labora actualmente" id="labora_actualmente" value={formData.labora_actualmente} onChange={handleInputChange} options={['Sí', 'No']} invalid={missingFieldsSet.has('labora_actualmente')} />
                <Select label="Zona de Residencia" id="zona_residencia" value={formData.zona_residencia} onChange={handleInputChange} options={ZONA_RESIDENCIA_OPTIONS} invalid={missingFieldsSet.has('zona_residencia')} />
                <Input label="Barrio o Corregimiento" id="barrio_corregimiento" value={formData.barrio_corregimiento} onChange={handleInputChange} invalid={missingFieldsSet.has('barrio_corregimiento')} />
              </Card>

              <Card title="Declaración de Veracidad" span="md:col-span-2">
                <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 flex gap-3">
                  <AlertCircle size={20} className="shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed">
                    <strong>Declaración de Veracidad:</strong><br />
                    La información aquí diligenciada será cruzada con bases de datos oficiales (SISBEN IV, ADRES, PILA y otras entidades). Cualquier falsedad, omisión o inconsistencia en los ingresos y ocupación declarados será causal de no selección inmediata o revocación del beneficio.
                  </p>
                </div>
              </Card>
              <Card title="Datos del Padre">
                <Input label="Nombres y Apellidos Completos" id="nombre_padre" value={formData.nombre_padre} onChange={handleInputChange} invalid={missingFieldsSet.has('nombre_padre')} />
                <Input label="Documento" id="documento_padre" value={formData.documento_padre} onChange={handleInputChange} invalid={missingFieldsSet.has('documento_padre')} />
                <Select label="Ocupación" id="ocupacion_padre" value={formData.ocupacion_padre} onChange={handleInputChange} options={OCUPACION_OPTIONS} invalid={missingFieldsSet.has('ocupacion_padre')} />
                <Select label="Ingresos" id="ingresos_padre" value={formData.ingresos_padre} onChange={handleInputChange} options={INGRESOS_OPTIONS} invalid={missingFieldsSet.has('ingresos_padre')} />
              </Card>
              <Card title="Datos de la Madre">
                <Input label="Nombres y Apellidos Completos" id="nombre_madre" value={formData.nombre_madre} onChange={handleInputChange} invalid={missingFieldsSet.has('nombre_madre')} />
                <Input label="Documento" id="documento_madre" value={formData.documento_madre} onChange={handleInputChange} invalid={missingFieldsSet.has('documento_madre')} />
                <Select label="Ocupación" id="ocupacion_madre" value={formData.ocupacion_madre} onChange={handleInputChange} options={OCUPACION_OPTIONS} invalid={missingFieldsSet.has('ocupacion_madre')} />
                <Select label="Ingresos" id="ingresos_madre" value={formData.ingresos_madre} onChange={handleInputChange} options={INGRESOS_OPTIONS} invalid={missingFieldsSet.has('ingresos_madre')} />
              </Card>
            </BentoGrid>
          )}

          {step === 4 && (
            <BentoGrid>
              <Card title="Modalidad a la que Aspiras" span="md:col-span-2">
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm mb-2">
                  <strong>Importante:</strong> La elección incorrecta puede ser causal de no aceptación.
                </div>
                <Select label="Modalidad" id="modalidad" value={formData.modalidad} onChange={handleInputChange} options={MODALIDAD_ASPIRA_OPTIONS} invalid={missingFieldsSet.has('modalidad')} />
              </Card>

              <Card title="Información Académica" span="md:col-span-2">
                <Select label="Título obtenido" id="titulo_obtenido" value={formData.titulo_obtenido} onChange={handleInputChange} options={TITULO_BACHILLER_OPTIONS} invalid={missingFieldsSet.has('titulo_obtenido')} />
                <Input label="Año graduación" id="ano_graduacion" value={formData.ano_graduacion} onChange={handleInputChange} maxLength={4} invalid={missingFieldsSet.has('ano_graduacion')} />
                <Select label="Establecimiento educativo" id="establecimiento_educativo" value={formData.establecimiento_educativo} onChange={handleInputChange} options={establecimientosList} invalid={missingFieldsSet.has('establecimiento_educativo')} />
                <Input label="Puntaje ICFES (0 a 500)" id="puntaje_icfes" value={formData.puntaje_icfes} onChange={handleInputChange} invalid={missingFieldsSet.has('puntaje_icfes')} />
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm">
                  Este puntaje debe ser idéntico al reportado en tu certificado oficial de las pruebas Saber 11. Cualquier inconsistencia podría invalidar tu solicitud.
                </div>
              </Card>
              <Card title="Educación Superior" span="md:col-span-2">
                <Select label="Nivel de Formación" id="nivel_formacion" value={formData.nivel_formacion} onChange={handleInputChange} options={NIVEL_FORMACION_OPTIONS} invalid={missingFieldsSet.has('nivel_formacion')} />
                <Input label="Institución superior" id="institucion_superior" value={formData.institucion_superior} onChange={handleInputChange} invalid={missingFieldsSet.has('institucion_superior')} />
                <Input label="Programa académico" id="programa_academico" value={formData.programa_academico} onChange={handleInputChange} invalid={missingFieldsSet.has('programa_academico')} />
                <Select label="Semestre ingreso" id="semestre_ingreso" value={formData.semestre_ingreso} onChange={handleInputChange} options={SEMESTRE_OPTIONS} invalid={missingFieldsSet.has('semestre_ingreso')} />
                <Input label="Promedio semestre anterior" id="promedio_anterior" value={formData.promedio_anterior} onChange={handleInputChange} disabled={Number(formData.semestre_ingreso || 0) < 2} placeholder={Number(formData.semestre_ingreso || 0) < 2 ? 'Se habilita desde semestre 2' : 'Ejemplo: 4.5'} invalid={missingFieldsSet.has('promedio_anterior')} />
                {Number(formData.semestre_ingreso || 0) >= 2 && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm">
                    Este valor debe coincidir exactamente con el certificado que adjuntarás en el próximo paso.
                  </div>
                )}
                <Select label="Ciudad institución" id="ciudad_institucion" value={formData.ciudad_institucion} onChange={handleInputChange} options={ciudadesColombia} invalid={missingFieldsSet.has('ciudad_institucion')} />
              </Card>
            </BentoGrid>
          )}

          {step === 5 && (
            <BentoGrid>
              <Card title="Carga de Soportes" span="md:col-span-2">
                <div className="grid md:grid-cols-2 gap-4">
                  <FileCard label="Documento identidad" file={formData.soportes.documento_identidad} onChange={(f) => handleFileChange('documento_identidad', f)} invalid={missingFieldsSet.has('documento_identidad')} />
                  <FileCard label="Acta de grado" file={formData.soportes.acta_grado} onChange={(f) => handleFileChange('acta_grado', f)} invalid={missingFieldsSet.has('acta_grado')} />
                  <FileCard label="Diploma" file={formData.soportes.diploma} onChange={(f) => handleFileChange('diploma', f)} invalid={missingFieldsSet.has('diploma')} />
                  <FileCard label="Pruebas Saber" file={formData.soportes.pruebas_saber} onChange={(f) => handleFileChange('pruebas_saber', f)} invalid={missingFieldsSet.has('pruebas_saber')} />
                  
                  <FileCard label="Ficha SISBEN" file={formData.soportes.ficha_sisben} onChange={(f) => handleFileChange('ficha_sisben', f)} invalid={missingFieldsSet.has('ficha_sisben')} />
                  <FileCard label="Cert. matrícula" file={formData.soportes.cert_matricula} onChange={(f) => handleFileChange('cert_matricula', f)} invalid={missingFieldsSet.has('cert_matricula')} />
                  <div className="md:col-span-2 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm">
                        <strong>Certificado de matrícula Oficial Requerido:</strong> Debe ser un certificado expedido por la universidad (con firmas o código QR de verificación). No se aceptan recibos de pago ni capturas de pantalla de la matrícula.
                  </div>
                  {formData.enfoque_diferencial && formData.enfoque_diferencial !== 'Ninguno' && (
                    <>
                      
                      
                      <FileCard label="Certificado Enfoque Diferencial" file={formData.soportes.cert_enfoque} onChange={(f) => handleFileChange('cert_enfoque', f)} invalid={missingFieldsSet.has('cert_enfoque')} />
                    </>
                  )}

                  {Number(formData.semestre_ingreso || 0) >= 2 && (
                    <>
                      <div className="md:col-span-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm">
                        <strong>Certificado Académico Oficial:</strong> No se admiten capturas de pantalla de plataformas o portales estudiantiles. El documento debe ser un certificado formal emitido por la oficina de Registro y Control Académico.
                      </div>
                      <FileCard label="Certificado de Notas" file={formData.soportes.cert_notas} onChange={(f) => handleFileChange('cert_notas', f)} invalid={missingFieldsSet.has('cert_notas')} />
                    </>
                  )}
                </div>
              </Card>
            </BentoGrid>
          )}

          {step === 6 && (
            <BentoGrid>
              <Card title="Firma Digital" span="md:col-span-2">
                <div className="grid md:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => activateSignatureMode('draw')}
                    className={`px-4 py-2 rounded-lg border font-semibold text-sm ${
                      signatureMode === 'draw'
                        ? 'bg-secondary text-white border-secondary'
                        : 'border-border text-secondary'
                    }`}
                  >
                    Trazar firma
                  </button>
                  <button
                    type="button"
                    onClick={() => activateSignatureMode('upload')}
                    className={`px-4 py-2 rounded-lg border font-semibold text-sm ${
                      signatureMode === 'upload'
                        ? 'bg-secondary text-white border-secondary'
                        : 'border-border text-secondary'
                    }`}
                  >
                    Subir imagen firma
                  </button>
                </div>

                <div className={`mt-3 ${signatureMode === 'draw' ? 'block' : 'hidden'}`}>
                  <div className="border-2 border-dashed border-border rounded-xl bg-white p-3">
                    <canvas ref={signatureRef} className="w-full h-48" />
                  </div>

                  <div className="mt-3 flex gap-3 flex-wrap">
                    <button type="button" onClick={clearDrawSignature} className="px-4 py-2 rounded-lg border border-border text-secondary font-semibold">
                      Limpiar trazo
                    </button>
                  </div>
                </div>

                {signatureMode === 'upload' && (
                  <>
                    <div className="mt-3 flex gap-3 flex-wrap">
                      <label className="px-4 py-2 rounded-lg border border-border text-secondary font-semibold cursor-pointer">
                        Subir PNG/JPG
                        <input
                          type="file"
                          className="hidden"
                          accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                          onChange={(e) => handleSignatureUpload(e.target.files?.[0] || null)}
                        />
                      </label>

                      {uploadedSignatureFile && (
                        <button type="button" onClick={clearUploadedSignature} className="px-4 py-2 rounded-lg border border-border text-secondary font-semibold">
                          Quitar imagen
                        </button>
                      )}
                    </div>

                    {uploadedSignaturePreview ? (
                      <div className="mt-4 p-3 rounded-xl border border-border bg-slate-50">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">Previsualización firma subida</p>
                        <img src={uploadedSignaturePreview} alt="Firma subida" className="max-h-40 rounded-lg border border-border bg-white" />
                        <p className="text-xs text-slate-500 mt-2 truncate">{uploadedSignatureFile?.name}</p>
                      </div>
                    ) : (
                      <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-border text-xs text-slate-600">
                        Debes subir una imagen de firma en formato PNG o JPG para continuar.
                      </div>
                    )}
                  </>
                )}

                <div className="p-3 rounded-lg bg-slate-50 border border-border text-xs text-slate-600">
                  La firma es obligatoria y solo se usará el modo activo que selecciones.
                </div>

                <div className="mt-6 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={formData.acepta_terminos} readOnly disabled />
                      He leído y acepto Términos y Condiciones.
                    </label>
                    <button type="button" onClick={() => openLegalModal('terms')} className="px-3 py-1.5 rounded-lg border border-border text-secondary font-semibold text-xs">
                      {formData.acepta_terminos ? 'Ver términos' : 'Leer y aceptar'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={formData.acepta_datos} readOnly disabled />
                      Autorizo tratamiento de datos personales.
                    </label>
                    <button type="button" onClick={() => openLegalModal('data')} className="px-3 py-1.5 rounded-lg border border-border text-secondary font-semibold text-xs">
                      {formData.acepta_datos ? 'Ver política' : 'Leer y aceptar'}
                    </button>
                  </div>
                </div>
              </Card>
            </BentoGrid>
          )}
        </div>

        <div className="flex gap-3 pt-6 border-t border-border">
          <button
            onClick={step === 1 ? () => setActiveView('landing') : handlePrevious}
            className="flex-1 bg-slate-200 text-slate-700 py-3 rounded-full font-bold inline-flex justify-center items-center gap-2"
          >
            <ArrowLeft size={18} /> {step === 1 ? 'Volver al inicio' : 'Anterior'}
          </button>

          {step > 1 && step < 6 && (
            <button
              onClick={handleNext}
              disabled={submitLoading}
              className="flex-1 bg-accent text-white py-3 rounded-full font-bold inline-flex justify-center items-center gap-2 disabled:opacity-50"
            >
              Siguiente <ArrowRight size={18} />
            </button>
          )}

          {step === 6 && (
            <button
              onClick={handleFinalize}
              disabled={submitLoading}
              className="flex-1 bg-success text-white py-3 rounded-full font-bold inline-flex justify-center items-center gap-2 disabled:opacity-50"
            >
              {submitLoading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              {submitLoading ? 'Finalizando...' : 'Finalizar Inscripción'}
            </button>
          )}
        </div>

        {submitError && (
          <div className="mt-4">
            <ErrorAlert message={submitError} />
          </div>
        )}

        {submitSuccess && (
          <div className="mt-4">
            <SuccessAlert message={submitSuccess} />
          </div>
        )}
          </>
        )}
      </div>

      <LegalModal
        open={legalModalType === 'terms'}
        title="Términos y Condiciones FOCADES"
        paragraphs={TERMS_AND_CONDITIONS_TEXT}
        onClose={closeLegalModal}
        onAccept={() => acceptLegalModal('terms')}
        acceptLabel="He leído y acepto términos"
      />

      <LegalModal
        open={legalModalType === 'data'}
        title="Política de Tratamiento de Datos Personales"
        paragraphs={DATA_POLICY_TEXT}
        onClose={closeLegalModal}
        onAccept={() => acceptLegalModal('data')}
        acceptLabel="He leído y autorizo tratamiento"
      />

      <SupportHelpModal
        open={supportOpen}
        onClose={closeSupportModal}
        form={supportForm}
        onChange={handleSupportInputChange}
        onSubmit={handleSupportSubmitTicket}
        onLookup={handleSupportFetchTickets}
        tickets={supportTickets}
        loading={supportLoading}
        lookupLoading={supportLookupLoading}
        error={supportError}
        success={supportSuccess}
        subjectOptions={SUPPORT_SUBJECT_OPTIONS}
        statusLabels={SUPPORT_STATUS_LABELS}
        showCaptcha={Boolean(turnstileSiteKey)}
        captchaContainerRef={supportCaptchaContainerRef}
      />

      {showDocumentUploadOverlay && (
        <div className="fixed inset-0 bg-slate-900/45 z-[120] flex flex-col items-center justify-center gap-3 text-white">
          <Loader2 className="animate-spin" size={34} />
          <p className="font-semibold">Subiendo documento, por favor espera...</p>
        </div>
      )}
    </div>
  );
};

const DocCard = ({ icon, title, subtitle, to }) => (
  <Link 
    to={to}
    className="block border border-border rounded-xl p-4 hover:bg-slate-50 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 transition-all group"
  >
    <div className="mb-2 group-hover:scale-110 transition-transform">{icon}</div>
    <p className="font-bold text-primary text-sm group-hover:text-secondary transition-colors">{title}</p>
    <p className="text-xs text-slate-500">{subtitle}</p>
  </Link>
);

const StepDot = ({ number, label, done, current, isLast }) => {
  const connectorClasses = done ? 'bg-success/45' : 'bg-slate-200';

  const circleClasses = done
    ? 'bg-success text-white border-success shadow-sm'
    : current
      ? 'bg-accent text-white border-accent scale-105 shadow-sm animate-pulse'
      : 'bg-white text-slate-500 border-slate-300';

  const labelClasses = current ? 'text-primary' : done ? 'text-success' : 'text-slate-500';

  return (
    <div className="relative flex flex-col items-center gap-1.5 sm:gap-2 text-center" aria-current={current ? 'step' : undefined}>
      {!isLast && (
        <span
          className={`hidden sm:block absolute top-5 left-[calc(50%+20px)] w-[calc(100%-40px)] h-px transition-colors duration-300 ${connectorClasses}`}
          aria-hidden="true"
        />
      )}

      <span
        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border text-sm sm:text-base font-bold flex items-center justify-center transition-all duration-300 ${circleClasses}`}
      >
        {number}
      </span>
      <p className={`text-[10px] sm:text-[11px] font-semibold leading-tight transition-colors duration-200 ${labelClasses}`}>{label}</p>
    </div>
  );
};

const SectionHeader = ({ title, desc }) => (
  <div className="mb-4">
    <h3 className="text-xl font-bold text-primary">{title}</h3>
    <p className="text-slate-500 text-sm">{desc}</p>
  </div>
);

const BentoGrid = ({ children }) => <div className="grid md:grid-cols-2 gap-4 w-full min-w-0">{children}</div>;

const Card = ({ title, children, span = '' }) => (
  <div className={`border border-border rounded-xl p-4 bg-white min-w-0 overflow-hidden ${span}`}>
    <h4 className="font-bold text-primary mb-4">{title}</h4>
    <div className="grid gap-3">{children}</div>
  </div>
);

const Input = ({ label, id, value, onChange, type = 'text', placeholder = '', maxLength, disabled = false, invalid = false }) => (
  <div className="grid gap-1 min-w-0">
    <label className={`text-xs uppercase tracking-wide font-bold ${invalid ? 'text-error' : 'text-slate-600'}`}>{label}</label>
    <input
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      className={`w-full min-w-0 border rounded-lg px-3 py-2 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 ${
        invalid ? 'border-error focus:border-error bg-red-50' : 'border-border focus:border-secondary'
      }`}
    />
  </div>
);

const Select = ({ label, id, value, onChange, options, disabled = false, invalid = false }) => (
  <div className="grid gap-1 min-w-0">
    <label className={`text-xs uppercase tracking-wide font-bold ${invalid ? 'text-error' : 'text-slate-600'}`}>{label}</label>
    <select
      id={id}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={`w-full min-w-0 border rounded-lg px-3 py-2 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 ${
        invalid ? 'border-error focus:border-error bg-red-50' : 'border-border focus:border-secondary'
      }`}
    >
      <option value="">Selecciona...</option>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  </div>
);

const FileCard = ({ label, onChange, file, invalid = false }) => {
  const isSelected = Boolean(file);
  const fileName = file?.name || '';

  return (
    <label
      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
        isSelected
          ? 'border-green-500 bg-green-50 text-green-700'
          : invalid
            ? 'border-error bg-red-50 text-error'
            : 'border-border hover:bg-slate-50 text-primary'
      }`}
    >
      {isSelected ? (
        <CheckCircle2 className="mx-auto text-green-600 mb-2" size={20} />
      ) : (
        <FileUp className="mx-auto text-secondary mb-2" size={20} />
      )}

      <p className={`text-sm font-semibold ${isSelected ? 'text-green-700' : 'text-primary'}`}>
        {label}
      </p>

      {isSelected && (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-medium text-green-700 truncate">{fileName}</p>
          <p className="text-[11px] font-bold text-green-600 uppercase tracking-wide">Archivo cargado</p>
        </div>
      )}

      <input type="file" className="hidden" accept=".pdf" onChange={(e) => onChange(e.target.files?.[0])} />
    </label>
  );
};

const ErrorAlert = ({ message }) => (
  <div className="p-3 rounded-lg border border-error/50 bg-red-50 text-error text-sm font-medium flex items-start gap-2">
    <AlertCircle size={16} className="mt-0.5" />
    <span>{message}</span>
  </div>
);

const SuccessAlert = ({ message }) => (
  <div className="p-3 rounded-lg border border-success/50 bg-green-50 text-success text-sm font-medium flex items-start gap-2">
    <CheckCircle2 size={16} className="mt-0.5" />
    <span>{message}</span>
  </div>
);

const LegalModal = ({ open, title, paragraphs, onClose, onAccept, acceptLabel }) => {
  const [canAccept, setCanAccept] = useState(false);

  useEffect(() => {
    if (open) {
      setCanAccept(false);
    }
  }, [open]);

  if (!open) return null;

  const handleScroll = (event) => {
    const target = event.currentTarget;
    const reachedBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 8;
    if (reachedBottom) {
      setCanAccept(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-border shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-lg font-bold text-primary">{title}</h3>
          <p className="text-xs text-slate-500 mt-1">Debes leer hasta el final para habilitar la aceptación.</p>
        </div>

        <div onScroll={handleScroll} className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-4 text-sm text-slate-700 leading-relaxed">
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-secondary font-semibold text-sm">
            Cerrar
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={!canAccept}
            className="px-4 py-2 rounded-lg bg-success text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {canAccept ? acceptLabel : 'Desplázate al final para aceptar'}
          </button>
        </div>
      </div>
    </div>
  );
};

const SupportHelpModal = ({
  open,
  onClose,
  form,
  onChange,
  onSubmit,
  onLookup,
  tickets,
  loading,
  lookupLoading,
  error,
  success,
  subjectOptions,
  statusLabels,
  showCaptcha,
  captchaContainerRef,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] bg-slate-900/60 p-4 flex items-end md:items-center justify-end md:justify-center">
      <div className="w-full md:max-w-2xl bg-white rounded-2xl border border-border shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-primary">Centro de Ayuda FOCADES</h3>
            <p className="text-xs text-slate-500">Crea tu ticket con radicado y consulta respuestas del equipo.</p>
          </div>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-border text-secondary font-semibold text-xs">
            Cerrar
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[78vh] overflow-y-auto">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="grid gap-1">
              <label className="text-xs uppercase tracking-wide font-bold text-slate-600">Radicado</label>
              <input
                id="radicado"
                value={form.radicado}
                onChange={onChange}
                placeholder="Ej: ASP-2026-0001"
                className="border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-secondary"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs uppercase tracking-wide font-bold text-slate-600">Correo de contacto</label>
              <input
                id="email_contacto"
                value={form.email_contacto}
                onChange={onChange}
                type="email"
                placeholder="tu@correo.com"
                className="border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-secondary"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="grid gap-1">
              <label className="text-xs uppercase tracking-wide font-bold text-slate-600">Nombre de contacto</label>
              <input
                id="nombre_contacto"
                value={form.nombre_contacto}
                onChange={onChange}
                placeholder="Tu nombre completo"
                className="border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-secondary"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs uppercase tracking-wide font-bold text-slate-600">Asunto</label>
              <select
                id="asunto"
                value={form.asunto}
                onChange={onChange}
                className="border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-secondary"
              >
                <option value="">Selecciona...</option>
                {subjectOptions.map((subject) => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-1">
            <label className="text-xs uppercase tracking-wide font-bold text-slate-600">Mensaje</label>
            <textarea
              id="mensaje"
              value={form.mensaje}
              onChange={onChange}
              rows={4}
              placeholder="Describe claramente tu solicitud (mínimo 20 caracteres)."
              className="border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-secondary resize-none"
            />
          </div>

          {showCaptcha && (
            <div className="rounded-lg border border-border bg-slate-50 p-3">
              <p className="text-xs text-slate-600 mb-2">Verificación de seguridad</p>
              <div ref={captchaContainerRef} />
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-2">
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading}
              className="flex-1 bg-primary text-white rounded-lg px-4 py-2.5 font-semibold disabled:opacity-50"
            >
              {loading ? 'Enviando ticket...' : 'Enviar ticket'}
            </button>
            <button
              type="button"
              onClick={onLookup}
              disabled={lookupLoading}
              className="flex-1 bg-slate-200 text-slate-700 rounded-lg px-4 py-2.5 font-semibold disabled:opacity-50"
            >
              {lookupLoading ? 'Consultando...' : 'Ver mis respuestas'}
            </button>
          </div>

          {error && <ErrorAlert message={error} />}
          {success && <SuccessAlert message={success} />}

          <div className="space-y-3">
            {tickets.map((ticket) => {
              const statusLabel = statusLabels[ticket.estado] || ticket.estado || 'Sin estado';
              const hasResponse = Boolean(ticket.respuesta_admin);
              return (
                <div key={ticket.id || ticket.ticket_codigo} className="rounded-xl border border-border p-3 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="text-sm font-bold text-primary">{ticket.ticket_codigo}</p>
                    <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">Creado: {ticket.created_at_label || ticket.created_at || 'No disponible'}</p>
                  <p className="text-sm text-slate-800"><strong>Asunto:</strong> {ticket.asunto}</p>
                  <p className="text-sm text-slate-700 mt-1"><strong>Tu mensaje:</strong> {ticket.mensaje_aspirante}</p>

                  {hasResponse ? (
                    <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Respuesta del equipo FOCADES</p>
                      <p className="text-sm text-emerald-900 mt-1">{ticket.respuesta_admin}</p>
                      <p className="text-[11px] text-emerald-700 mt-2">Respondido: {ticket.respondido_at_label || ticket.respondido_at || 'No disponible'}</p>
                    </div>
                  ) : (
                    <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-sm text-amber-900">
                        Tu ticket está en gestión. Te notificaremos por correo cuando tengamos una respuesta y también podrás verla aquí.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Registro;
