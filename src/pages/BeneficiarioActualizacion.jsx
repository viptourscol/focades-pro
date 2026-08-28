import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { showErrorAlert, showWarningAlert } from '../lib/alerts';
import { compressPDF, getFileInfo } from '../lib/fileCompression';
import { AlertCircle, CheckCircle2, Loader2, Info, AlertTriangle } from 'lucide-react';

const MAX_FILE_MB = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const BANKS_DATASET_ID = '35qi-guj5';
const BANKS_V3_QUERY_URL = `https://www.datos.gov.co/api/v3/views/${BANKS_DATASET_ID}/query.json`;
const BANKS_V2_FALLBACK_URL = `https://www.datos.gov.co/resource/${BANKS_DATASET_ID}.json?$select=nombre&$where=nombre%20is%20not%20null&$limit=5000`;

const mapBankNames = (rows) => {
  const unique = new Set();
  (Array.isArray(rows) ? rows : []).forEach((item) => {
    const rawName = String(item?.nombre || '').trim();
    if (!rawName) return;
    if (!rawName.toUpperCase().startsWith('BANCO')) return;
    unique.add(rawName);
  });

  return Array.from(unique).sort((a, b) => a.localeCompare(b, 'es-CO'));
};

const fetchBanksCatalog = async () => {
  // 1) Cache local principal (no depende de API externa).
  const { data: cachedRows, error: cachedError } = await supabase
    .from('catalog_bancos')
    .select('nombre')
    .eq('is_active', true)
    .order('nombre', { ascending: true })
    .limit(5000);

  if (!cachedError) {
    const cachedNames = mapBankNames(cachedRows || []);
    if (cachedNames.length) return cachedNames;
  }

  // 2) Fallback remoto: solo si cache local viene vacío.
  const appToken = String(import.meta.env.VITE_DATOS_GOV_CO_APP_TOKEN || '').trim();

  // Intento 1: API v3 (requiere app token en muchos casos).
  try {
    const response = await fetch(BANKS_V3_QUERY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(appToken ? { 'X-App-Token': appToken } : {}),
      },
      body: JSON.stringify({
        query: "SELECT `nombre` WHERE `nombre` IS NOT NULL AND starts_with(upper(`nombre`), 'BANCO') ORDER BY `nombre`",
        page: {
          pageNumber: 1,
          pageSize: 5000,
        },
        includeSynthetic: false,
      }),
    });

    if (response.ok) {
      const payload = await response.json();
      const rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];
      const names = mapBankNames(rows);
      if (names.length) return names;
    }
  } catch {
    // Si falla v3, usamos fallback público v2.
  }

  // Intento 2 (fallback): API v2 pública.
  const fallbackResponse = await fetch(BANKS_V2_FALLBACK_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!fallbackResponse.ok) {
    throw new Error('No se pudo consultar el catálogo de bancos en datos.gov.co.');
  }

  const fallbackRows = await fallbackResponse.json();
  return mapBankNames(fallbackRows);
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

const normalizeAccountNumber = (value) => String(value || '').replace(/\D/g, '');

const getVentanaEstado = (ventana) => {
  if (!ventana) {
    return {
      key: 'sin_periodo',
      label: 'Sin período activo',
      className: 'bg-slate-100 text-slate-700 ring-slate-200',
      bgClassName: 'bg-slate-50',
    };
  }

  const now = new Date();
  const start = ventana?.fecha_inicio ? new Date(ventana.fecha_inicio) : null;
  const end = ventana?.fecha_fin ? new Date(ventana.fecha_fin) : null;

  if (!ventana.is_active) {
    return {
      key: 'inactiva',
      label: 'Inactiva',
      className: 'bg-slate-100 text-slate-700 ring-slate-200',
      bgClassName: 'bg-slate-50',
    };
  }

  if (start && now < start) {
    return {
      key: 'proxima',
      label: 'Próxima',
      className: 'bg-blue-100 text-blue-700 ring-blue-200',
      bgClassName: 'bg-blue-50',
    };
  }

  if (end && now > end) {
    return {
      key: 'cerrada',
      label: 'Cerrada',
      className: 'bg-amber-100 text-amber-700 ring-amber-200',
      bgClassName: 'bg-amber-50',
    };
  }

  return {
    key: 'activa',
    label: 'Activa',
    className: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    bgClassName: 'bg-emerald-50',
  };
};

const BeneficiarioActualizacion = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [submittedPeriodo, setSubmittedPeriodo] = useState('');
  const [windowInfo, setWindowInfo] = useState(null);
  const [config, setConfig] = useState(null);
  const [profile, setProfile] = useState(null);
  const [previousUpdate, setPreviousUpdate] = useState(null);
  const [form, setForm] = useState({
    email: '',
    telefono: '',
    direccion: '',
    semestre_actual: '',
    promedio_semestre_anterior: '',
    banco: '',
    tipo_cuenta: '',
    cuenta_bancaria: '',
    fecha_expedicion_cert_bancario: '',
  });
  const [files, setFiles] = useState({
    certificado_bancario: null,
    certificado_notas: null,
    certificado_matricula: null,
  });
  const [banksOptions, setBanksOptions] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [banksError, setBanksError] = useState('');
  const [cuentaBancariaConfirm, setCuentaBancariaConfirm] = useState('');

  // Estado de subsanación: edición puntual de una actualización marcada por el admin.
  const [subsanacionForm, setSubsanacionForm] = useState({
    email: '',
    telefono: '',
    direccion: '',
    semestre_actual: '',
    promedio_semestre_anterior: '',
    banco: '',
    tipo_cuenta: '',
    cuenta_bancaria: '',
    fecha_expedicion_cert_bancario: '',
  });
  const [subsanacionFiles, setSubsanacionFiles] = useState({
    certificado_bancario: null,
    certificado_notas: null,
    certificado_matricula: null,
  });
  const [subsanacionDocsActuales, setSubsanacionDocsActuales] = useState([]);
  const [subsanacionCuentaConfirm, setSubsanacionCuentaConfirm] = useState('');
  const [subsanacionSaving, setSubsanacionSaving] = useState(false);
  const [subsanacionDone, setSubsanacionDone] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      // Obtener beneficiario_id desde localStorage (login con documento)
      let beneficiarioId = null;
      try {
        const sessionStr = localStorage.getItem('focades:beneficiario-session');
        if (sessionStr) {
          const documentSession = JSON.parse(sessionStr);
          const sessionTime = new Date(documentSession.timestamp).getTime();
          const maxAge = 24 * 60 * 60 * 1000;
          
          if (Date.now() - sessionTime <= maxAge && documentSession.beneficiario_id) {
            beneficiarioId = documentSession.beneficiario_id;
          }
        }
      } catch (error) {
        // Error leyendo sesión
      }

      // Cargar perfil usando Edge Function (bypasses RLS)
      let profileData = null;
      if (beneficiarioId) {
        try {
          const { data: result, error } = await supabase.functions.invoke('get-beneficiario-profile', {
            body: { beneficiario_id: beneficiarioId },
          });

          if (!error && result?.ok && result.profile) {
            profileData = result.profile;
          }
        } catch (err) {
          // Error invocando get-beneficiario-profile
        }
      } else {
        // Fallback: Si no hay beneficiario_id, intentar con Supabase Auth (Google OAuth)
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) {
          if (mounted) setLoading(false);
          return;
        }

        const { data } = await supabase
          .from('portal_beneficiarios')
          .select('*')
          .eq('auth_user_id', userId)
          .maybeSingle();
        
        profileData = data;
        beneficiarioId = data?.id || null;
      }

      if (!profileData) {
        if (mounted) setLoading(false);
        return;
      }

      // Cargar ventana activa y configuración usando Edge Function (bypasses RLS)
      let ventanaData = null;
      let configData = null;
      try {
        const { data: result, error } = await supabase.functions.invoke('get-ventana-actualizacion');

        if (!error && result?.ok) {
          ventanaData = result.ventana || null;
          configData = result.config || null;
        }
      } catch (err) {
        // Error invocando get-ventana-actualizacion
      }

      if (!mounted) return;

      setProfile(profileData);
      setConfig(configData);
      setWindowInfo(ventanaData);

      // Consultar si existe actualización previa en esta ventana
      if (beneficiarioId && ventanaData?.id) {
        try {
          const { data: prevUpdate } = await supabase
            .from('portal_actualizaciones')
            .select('id, estado, created_at, observacion_admin, campos_a_corregir, documentos_a_corregir, marcado_subsanacion_at, semestre_actual, promedio_semestre_anterior, email, telefono, direccion, payload_formulario')
            .eq('beneficiario_id', beneficiarioId)
            .eq('ventana_id', ventanaData.id)
            .in('estado', ['en_revision', 'aprobada', 'rechazada', 'subsanacion'])
            .order('created_at', { ascending: false })
            .maybeSingle();
          
          if (prevUpdate) {
            setPreviousUpdate(prevUpdate);

            if (prevUpdate.estado === 'subsanacion') {
              const payloadPrevio = prevUpdate.payload_formulario || {};
              setSubsanacionForm({
                email: prevUpdate.email || '',
                telefono: prevUpdate.telefono || '',
                direccion: prevUpdate.direccion || '',
                semestre_actual: String(prevUpdate.semestre_actual || ''),
                promedio_semestre_anterior: String(prevUpdate.promedio_semestre_anterior ?? ''),
                banco: payloadPrevio.banco || '',
                tipo_cuenta: payloadPrevio.tipo_cuenta || '',
                cuenta_bancaria: payloadPrevio.cuenta_bancaria || '',
                fecha_expedicion_cert_bancario: payloadPrevio.fecha_expedicion_cert_bancario || '',
              });

              const { data: docsPrevios } = await supabase
                .from('portal_actualizacion_documentos')
                .select('tipo_documento, nombre_original')
                .eq('actualizacion_id', prevUpdate.id);
              if (docsPrevios) setSubsanacionDocsActuales(docsPrevios);
            }
          }
        } catch (err) {
          // Error consultando actualización previa
        }
      }

      setForm({
        email: profileData?.email || '',
        telefono: profileData?.telefono || '',
        direccion: profileData?.direccion_residencia || profileData?.direccion || '',
        semestre_actual: String(profileData?.semestre_actual || ''),
        promedio_semestre_anterior: '',
        banco: profileData?.nombre_banco || profileData?.banco || '',
        tipo_cuenta: profileData?.tipo_cuenta_bancaria || profileData?.tipo_cuenta || '',
        cuenta_bancaria: profileData?.numero_cuenta || profileData?.cuenta_bancaria || '',
        fecha_expedicion_cert_bancario: '',
      });
      setCuentaBancariaConfirm('');

      setLoading(false);
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadBanks = async () => {
      setLoadingBanks(true);
      setBanksError('');
      try {
        const names = await fetchBanksCatalog();
        if (!mounted) return;
        setBanksOptions(names);
      } catch {
        if (!mounted) return;
        setBanksOptions([]);
        setBanksError('No se pudo cargar cache local ni API externa. Puedes escribir el banco manualmente.');
      } finally {
        if (mounted) setLoadingBanks(false);
      }
    };

    loadBanks();

    return () => {
      mounted = false;
    };
  }, []);

  const canUpdate = useMemo(() => {
    if (!profile) return false;
    if (profile.estado_beneficiario !== 'activo') return false;
    if (!windowInfo) return false;
    // No puede enviar una actualización nueva si ya existe una en revisión, aprobada
    // o pendiente de subsanación (esta última se corrige, no se reenvía desde cero).
    if (previousUpdate && ['en_revision', 'aprobada', 'subsanacion'].includes(previousUpdate.estado)) {
      return false;
    }
    return true;
  }, [profile, windowInfo, previousUpdate]);

  const isSubsanacionMode = previousUpdate?.estado === 'subsanacion';
  const camposASubsanar = Array.isArray(previousUpdate?.campos_a_corregir) ? previousUpdate.campos_a_corregir : [];
  const documentosASubsanar = Array.isArray(previousUpdate?.documentos_a_corregir) ? previousUpdate.documentos_a_corregir : [];

  const validateFile = (file, label) => {
    if (!file) {
      throw new Error(`Debes adjuntar ${label}.`);
    }

    if (file.type !== 'application/pdf') {
      throw new Error(`${label} debe estar en PDF.`);
    }

    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`${label} supera ${MAX_FILE_MB}MB.`);
    }
  };

  const handleSubmit = async () => {
    if (!profile) return;
    if (!canUpdate) {
      await showWarningAlert({
        title: 'Actualización no disponible',
        text: 'Tu estado o la ventana de fechas no permite enviar actualización en este momento.',
      });
      return;
    }

    try {
      // Campos obligatorios de datos personales y bancarios
      const email = String(form.email || '').trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        throw new Error('Ingresa un correo electrónico válido.');
      }
      if (!String(form.telefono || '').trim()) {
        throw new Error('El teléfono es obligatorio.');
      }
      if (!String(form.direccion || '').trim()) {
        throw new Error('La dirección es obligatoria.');
      }
      if (!String(form.banco || '').trim()) {
        throw new Error('Selecciona o escribe el banco.');
      }
      if (!String(form.tipo_cuenta || '').trim()) {
        throw new Error('Selecciona el tipo de cuenta.');
      }

      const semestre = Number(form.semestre_actual);
      if (!Number.isInteger(semestre) || semestre < 1 || semestre > 10) {
        throw new Error('El semestre que actualiza debe ser un número entre 1 y 10.');
      }

      // Validación detallada de documentos
      const documentosFaltantes = [];
      if (!files.certificado_bancario) documentosFaltantes.push('Certificado Bancario');
      if (!files.certificado_notas) documentosFaltantes.push('Certificado de Notas');
      if (!files.certificado_matricula) documentosFaltantes.push('Certificado de Matrícula');

      if (documentosFaltantes.length > 0) {
        const docList = documentosFaltantes.join(', ');
        await showErrorAlert({
          title: '⚠️ Documentos incompletos',
          text: `Te falta(n): ${docList}. Todos los documentos son obligatorios para procesar tu actualización.`,
        });
        return;
      }

      const promedio = Number(String(form.promedio_semestre_anterior || '').replace(',', '.'));

      if (!Number.isFinite(promedio)) {
        throw new Error('Ingresa un promedio válido para el semestre anterior.');
      }

      if (promedio < 0 || promedio > 5) {
        throw new Error('El promedio debe estar entre 0 y 5.');
      }

      // No se bloquea el envío si el promedio está por debajo del mínimo vigente:
      // el beneficiario debe poder reportarlo igualmente para dejar trazabilidad,
      // y la actualización queda en revisión administrativa por ese motivo.

      const accountNumber = normalizeAccountNumber(form.cuenta_bancaria);
      const accountConfirm = normalizeAccountNumber(cuentaBancariaConfirm);

      if (!accountNumber) {
        throw new Error('Ingresa el número de cuenta bancaria.');
      }

      if (accountNumber.length < 6 || accountNumber.length > 20) {
        throw new Error('El número de cuenta debe tener entre 6 y 20 dígitos.');
      }

      if (!accountConfirm) {
        throw new Error('Repite el número de cuenta para confirmar.');
      }

      if (accountNumber !== accountConfirm) {
        throw new Error('Los números de cuenta no coinciden. Verifica e inténtalo nuevamente.');
      }

      // Validar fecha de expedición del certificado bancario
      if (!form.fecha_expedicion_cert_bancario) {
        throw new Error('Debes indicar la fecha de expedición del certificado bancario.');
      }

      const fechaExpedicion = new Date(form.fecha_expedicion_cert_bancario);
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      fechaExpedicion.setHours(0, 0, 0, 0);

      if (fechaExpedicion > hoy) {
        throw new Error('La fecha de expedición del certificado bancario no puede ser futura.');
      }

      const maxDiasVigencia = Number(config?.cert_bancario_max_dias || 15);
      const diasDiferencia = Math.floor((hoy.getTime() - fechaExpedicion.getTime()) / (1000 * 60 * 60 * 24));

      if (diasDiferencia > maxDiasVigencia) {
        throw new Error(`El certificado bancario está vencido. La fecha de expedición debe ser máximo ${maxDiasVigencia} días antes de hoy. Tu certificado tiene ${diasDiferencia} días de antigüedad.`);
      }

      setSaving(true);

      // Convertir archivos a base64
      const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      };

      const [certBancarioB64, certNotasB64, certMatriculaB64] = await Promise.all([
        fileToBase64(files.certificado_bancario),
        fileToBase64(files.certificado_notas),
        fileToBase64(files.certificado_matricula),
      ]);

      // Enviar actualización usando Edge Function (bypasses RLS)
      const { data: result, error: invokeError } = await supabase.functions.invoke('enviar-actualizacion-beneficiario', {
        body: {
          beneficiario_id: profile.id,
          ventana_id: windowInfo.id,
          form_data: {
            email: String(form.email || '').trim().toLowerCase(),
            telefono: String(form.telefono || '').trim(),
            direccion: String(form.direccion || '').trim(),
            semestre_actual: Number(form.semestre_actual || 0),
            promedio_semestre_anterior: String(form.promedio_semestre_anterior || ''),
            banco: String(form.banco || '').trim(),
            tipo_cuenta: String(form.tipo_cuenta || '').trim(),
            cuenta_bancaria: accountNumber,
            fecha_expedicion_cert_bancario: form.fecha_expedicion_cert_bancario,
          },
          files_base64: {
            certificado_bancario: {
              data: certBancarioB64,
              name: files.certificado_bancario.name,
            },
            certificado_notas: {
              data: certNotasB64,
              name: files.certificado_notas.name,
            },
            certificado_matricula: {
              data: certMatriculaB64,
              name: files.certificado_matricula.name,
            },
          },
        },
      });

      if (invokeError) {
        
        // El status HTTP está en context (Response object)
        const httpStatus = invokeError.context?.status;
        
        // Si es 409 Conflict, intentar leer el body
        if (httpStatus === 409) {
          // Cerrar modal de loading ANTES de mostrar error
          setSaving(false);
          // Dar tiempo a React para actualizar el DOM
          await new Promise(resolve => setTimeout(resolve, 50));
          
          try {
            // Clonar el Response para poder leerlo (solo se puede leer una vez)
            const responseClone = invokeError.context.clone();
            const errorBody = await responseClone.json();
            
            if (errorBody.code === 'DUPLICATE_SUBMISSION') {
              const statusText = errorBody.existing_status === 'aprobada' 
                ? 'aprobada'
                : 'siendo revisada';
              throw new Error(`Ya enviaste una actualización para esta ventana que está ${statusText}. No se permite reenvío hasta que sea procesada.`);
            }
          } catch (e) {
            throw new Error('Ya existe una actualización pendiente para esta ventana.');
          }
        }

        // Error genérico para otros casos
        throw new Error(invokeError.message || 'Error al comunicarse con el servidor');
      }

      if (!result) {
        throw new Error('No se recibió respuesta del servidor');
      }

      if (!result.ok) {
        // Manejar errores específicos
        if (result.code === 'DUPLICATE_SUBMISSION') {
          const statusText = result.existing_status === 'aprobada' 
            ? 'aprobada'
            : 'siendo revisada';
          throw new Error(`Ya enviaste una actualización para esta ventana que está ${statusText}. No se permite reenvío hasta que sea procesada.`);
        }
        throw new Error(result.error || 'Error al procesar la actualización');
      }

      // Notificación por correo (no bloquea si falla)
      supabase.functions.invoke('notify-beneficiario', {
        body: {
          email: form.email,
          nombre: profile.primer_nombre || profile.nombre_completo || 'Beneficiario',
          ventana_nombre: windowInfo?.nombre || 'Periodo vigente',
          semestre: form.semestre_actual,
        },
      }).catch(() => {});

      setSubmittedPeriodo(windowInfo?.nombre || 'Periodo vigente');
      setSubmitDone(true);
      setFiles({ certificado_bancario: null, certificado_notas: null, certificado_matricula: null });
      setCuentaBancariaConfirm('');
      setForm((prev) => ({ ...prev, promedio_semestre_anterior: '' }));
    } catch (error) {
      await showErrorAlert({
        title: 'No se pudo enviar la actualización',
        text: error.message || 'Ocurrió un error inesperado.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSubsanar = async () => {
    if (!profile || !previousUpdate || previousUpdate.estado !== 'subsanacion') return;

    try {
      if (camposASubsanar.includes('email')) {
        const email = String(subsanacionForm.email || '').trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new Error('Ingresa un correo electrónico válido.');
        }
      }
      if (camposASubsanar.includes('telefono') && !String(subsanacionForm.telefono || '').trim()) {
        throw new Error('El teléfono es obligatorio.');
      }
      if (camposASubsanar.includes('direccion') && !String(subsanacionForm.direccion || '').trim()) {
        throw new Error('La dirección es obligatoria.');
      }
      if (camposASubsanar.includes('semestre_actual')) {
        const semestre = Number(subsanacionForm.semestre_actual);
        if (!Number.isInteger(semestre) || semestre < 1 || semestre > 10) {
          throw new Error('El semestre debe ser un número entre 1 y 10.');
        }
      }
      if (camposASubsanar.includes('promedio_semestre_anterior')) {
        const promedio = Number(String(subsanacionForm.promedio_semestre_anterior || '').replace(',', '.'));
        if (!Number.isFinite(promedio) || promedio < 0 || promedio > 5) {
          throw new Error('El promedio debe ser un número entre 0 y 5.');
        }
      }

      let cuentaNormalizada = '';
      if (camposASubsanar.includes('datos_bancarios')) {
        if (!String(subsanacionForm.banco || '').trim()) throw new Error('Selecciona o escribe el banco.');
        if (!String(subsanacionForm.tipo_cuenta || '').trim()) throw new Error('Selecciona el tipo de cuenta.');

        cuentaNormalizada = normalizeAccountNumber(subsanacionForm.cuenta_bancaria);
        if (!cuentaNormalizada || cuentaNormalizada.length < 6 || cuentaNormalizada.length > 20) {
          throw new Error('El número de cuenta debe tener entre 6 y 20 dígitos.');
        }
        const confirmNormalizada = normalizeAccountNumber(subsanacionCuentaConfirm);
        if (cuentaNormalizada !== confirmNormalizada) {
          throw new Error('Los números de cuenta no coinciden. Verifica e inténtalo nuevamente.');
        }
        if (!subsanacionForm.fecha_expedicion_cert_bancario) {
          throw new Error('Debes indicar la fecha de expedición del certificado bancario.');
        }
      }

      const documentosFaltantes = documentosASubsanar.filter((tipo) => !subsanacionFiles[tipo]);
      if (documentosFaltantes.length > 0) {
        throw new Error('Debes adjuntar todos los documentos solicitados por el equipo administrativo.');
      }

      setSubsanacionSaving(true);

      const fileToBase64 = (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

      const filesBase64 = {};
      for (const tipo of documentosASubsanar) {
        const file = subsanacionFiles[tipo];
        // eslint-disable-next-line no-await-in-loop
        filesBase64[tipo] = { data: await fileToBase64(file), name: file.name };
      }

      const { data: result, error: invokeError } = await supabase.functions.invoke('subsanar-actualizacion-beneficiario', {
        body: {
          beneficiario_id: profile.id,
          actualizacion_id: previousUpdate.id,
          form_data: {
            email: subsanacionForm.email,
            telefono: subsanacionForm.telefono,
            direccion: subsanacionForm.direccion,
            semestre_actual: subsanacionForm.semestre_actual,
            promedio_semestre_anterior: subsanacionForm.promedio_semestre_anterior,
            banco: subsanacionForm.banco,
            tipo_cuenta: subsanacionForm.tipo_cuenta,
            cuenta_bancaria: cuentaNormalizada || normalizeAccountNumber(subsanacionForm.cuenta_bancaria),
            fecha_expedicion_cert_bancario: subsanacionForm.fecha_expedicion_cert_bancario,
          },
          files_base64: filesBase64,
        },
      });

      if (invokeError) {
        throw new Error(invokeError.message || 'Error al comunicarse con el servidor.');
      }
      if (!result?.ok) {
        throw new Error(result?.error || 'No se pudo enviar la corrección.');
      }

      setSubsanacionDone(true);
    } catch (error) {
      await showErrorAlert({
        title: 'No se pudo enviar la corrección',
        text: error.message || 'Ocurrió un error inesperado.',
      });
    } finally {
      setSubsanacionSaving(false);
    }
  };

  const validateAndSetFile = async (selectedFile, fieldName, setFileCallback) => {
    if (!selectedFile) return;

    // Validar tipo
    if (selectedFile.type !== 'application/pdf') {
      await showErrorAlert({
        title: 'Archivo inválido',
        text: `${fieldName} debe estar en PDF.`,
      });
      return;
    }

    // Validar tamaño
    if (selectedFile.size > MAX_FILE_BYTES) {
      await showErrorAlert({
        title: 'Archivo muy grande',
        text: `${fieldName} supera ${MAX_FILE_MB}MB.`,
      });
      return;
    }

    // Validar si está protegido
    try {
      await validatePdfNotEncrypted(selectedFile, fieldName);
    } catch (error) {
      await showErrorAlert({
        title: 'Archivo protegido',
        text: error.message,
      });
      return;
    }

    // Comprimir archivo si es mayor a 2 MB
    let finalFile = selectedFile;
    const fileSizeMB = selectedFile.size / 1024 / 1024;
    
    if (fileSizeMB > 2) {
      try {
        const compressedFile = await compressPDF(selectedFile, {
          targetSizeKB: 2048, // 2 MB máximo
        });
        
        const reduction = ((1 - compressedFile.size / selectedFile.size) * 100).toFixed(1);
        
        finalFile = compressedFile;
      } catch (error) {
        finalFile = selectedFile;
      }
    }

    // Setear el archivo (comprimido o original)
    setFileCallback(finalFile);
  };

  const handleCertificadoBancarioChange = (file) => {
    validateAndSetFile(file, 'Certificado bancario', (f) =>
      setFiles((prev) => ({ ...prev, certificado_bancario: f }))
    );
  };

  const handleCertificadoNotasChange = (file) => {
    validateAndSetFile(file, 'Certificado de notas', (f) =>
      setFiles((prev) => ({ ...prev, certificado_notas: f }))
    );
  };

  const handleCertificadoMatriculaChange = (file) => {
    validateAndSetFile(file, 'Certificado de matrícula', (f) =>
      setFiles((prev) => ({ ...prev, certificado_matricula: f }))
    );
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="bg-white border border-border rounded-3xl p-8 text-center text-slate-500 animate-pulse">Cargando...</div>
      </div>
    );
  }

  if (!profile) {
    return <div className="bg-white border border-border rounded-3xl p-8">No se encontró perfil de beneficiario vinculado.</div>;
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Overlay bloqueante durante el envío */}
      {saving && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-900/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-10 flex flex-col items-center gap-4 max-w-sm w-full shadow-2xl mx-4 animate-scale-up">
            <Loader2 className="animate-spin text-secondary" size={48} />
            <p className="text-xl font-extrabold text-primary text-center">Enviando actualización...</p>
            <p className="text-sm text-slate-600 text-center">No cierres ni recargues la página mientras se procesa.</p>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mt-2">
              <div className="h-full bg-accent rounded-full animate-[progress_2s_ease-in-out_infinite]" />
            </div>
          </div>
        </div>
      )}

      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 md:p-7 animate-slide-up">
        <div className="absolute -top-16 -right-12 w-44 h-44 rounded-full bg-blue-100/50 blur-2xl" />
        <div className="absolute -bottom-16 -left-12 w-40 h-40 rounded-full bg-amber-100/40 blur-2xl" />
        <div className="relative">
          <p className="inline-flex px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest bg-primary/10 text-primary">
            Actualización Semestral
          </p>
          <h2 className="text-xl md:text-2xl font-extrabold text-primary mt-3">Mantén tu beneficio al día</h2>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">Precarga tus datos actuales y adjunta los documentos requeridos para el semestre vigente.</p>
        </div>
      </section>

      <div className="bg-white border border-border rounded-3xl p-6 animate-slide-up" style={{ animationDelay: '50ms' }}>

        {/* Estado de ventana activa - Section mejorada */}
        {(() => {
          const ventanaEstado = getVentanaEstado(windowInfo);
          return (
            <div className={`mt-4 rounded-2xl border-2 p-4 ${ventanaEstado.bgClassName} transition-all duration-300 animate-slide-up hover:shadow-sm`}>
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Ventana de actualización</p>
                    {windowInfo ? (
                      <>
                        <h3 className="text-lg font-black text-slate-900">{windowInfo.nombre}</h3>
                        <p className="text-xs text-slate-600 mt-1">
                          {new Date(windowInfo.fecha_inicio).toLocaleDateString('es-CO')} a{' '}
                          {new Date(windowInfo.fecha_fin).toLocaleDateString('es-CO')}
                        </p>
                      </>
                    ) : (
                      <h3 className="text-lg font-black text-slate-600">Sin período activo</h3>
                    )}
                  </div>
                  <span
                    className={`inline-flex px-3 py-1.5 rounded-full text-xs font-bold ring-1 whitespace-nowrap transition-all duration-300 ${ventanaEstado.className}`}
                  >
                    {ventanaEstado.label}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-300 border-opacity-50">
                  <div className="transform transition-all duration-300 hover:scale-105">
                    <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Estado beneficiario</p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">{profile.estado_beneficiario || 'No disponible'}</p>
                  </div>
                  <div className="transform transition-all duration-300 hover:scale-105">
                    <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Promedio mínimo vigente</p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">{config?.promedio_minimo || 3.5}</p>
                  </div>
                  <div className="transform transition-all duration-300 hover:scale-105">
                    <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Vigencia cert. bancario</p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">{config?.cert_bancario_max_dias || 15} días</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Banner de estado de actualización previa */}
        {previousUpdate && previousUpdate.estado === 'subsanacion' && (
          <div className="mt-4 p-4 rounded-xl border border-blue-300 bg-blue-50 text-blue-900 flex items-start gap-3">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-blue-600" />
            <div className="flex-1">
              <p className="font-semibold text-sm">Debes corregir tu actualización</p>
              <p className="text-xs text-blue-800 mt-1">El equipo administrativo ha solicitado correcciones en tu actualización. Sigue las indicaciones abajo para completarlas.</p>
              {previousUpdate.observacion_admin && (
                <p className="text-xs mt-2 p-2 bg-blue-100 rounded border border-blue-200"><strong>Observaciones:</strong> {previousUpdate.observacion_admin}</p>
              )}
              {(camposASubsanar.length > 0 || documentosASubsanar.length > 0) && (
                <div className="text-xs text-blue-700 mt-2 space-y-1">
                  {camposASubsanar.length > 0 && (
                    <p><strong>Campos a corregir:</strong> {camposASubsanar.map((c) => CAMPO_LABELS_SUBSANACION[c] || c).join(', ')}</p>
                  )}
                  {documentosASubsanar.length > 0 && (
                    <p><strong>Documentos a reemplazar:</strong> {documentosASubsanar.map((d) => DOCUMENTO_LABELS_SUBSANACION[d] || d).join(', ')}</p>
                  )}
                </div>
              )}
              <p className="text-xs text-blue-700 mt-2 opacity-75">Marcada para subsanación: {new Date(previousUpdate.marcado_subsanacion_at || previousUpdate.created_at).toLocaleDateString('es-CO')}</p>
            </div>
          </div>
        )}

        {previousUpdate && previousUpdate.estado === 'en_revision' && (
          <div className="mt-4 p-4 rounded-xl border border-blue-300 bg-blue-50 text-blue-900 flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <div className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-200">
                <Loader2 size={12} className="text-blue-600 animate-spin" />
              </div>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Actualización en revisión</p>
              <p className="text-xs text-blue-800 mt-1">Tu actualización está siendo revisada por nuestro equipo. El proceso toma entre 5 a 7 días hábiles.</p>
              <p className="text-xs text-blue-700 mt-2 opacity-75">Enviada: {new Date(previousUpdate.created_at).toLocaleDateString('es-CO')}</p>
            </div>
          </div>
        )}

        {previousUpdate && previousUpdate.estado === 'aprobada' && (
          <div className="mt-4 p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 flex items-start gap-3">
            <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-semibold text-sm">✓ Actualización aprobada</p>
              <p className="text-xs text-emerald-800 mt-1">Tu actualización fue procesada y aprobada correctamente.</p>
              <p className="text-xs text-emerald-700 mt-2 opacity-75">Aprobada: {new Date(previousUpdate.created_at).toLocaleDateString('es-CO')}</p>
            </div>
          </div>
        )}

        {previousUpdate && previousUpdate.estado === 'rechazada' && (
          <div className="mt-4 p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 flex items-start gap-3">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-amber-600" />
            <div className="flex-1">
              <p className="font-semibold text-sm">⚠️ Actualización rechazada</p>
              {previousUpdate.observacion_admin && (
                <p className="text-xs mt-2 p-2 bg-amber-100 rounded border border-amber-200">{previousUpdate.observacion_admin}</p>
              )}
              <p className="text-xs text-amber-800 mt-2">Puedes enviar una nueva actualización para corregir los problemas.</p>
            </div>
          </div>
        )}

        {isSubsanacionMode && !subsanacionDone && (
          <SubsanacionCard
            previousUpdate={previousUpdate}
            camposASubsanar={camposASubsanar}
            documentosASubsanar={documentosASubsanar}
            subsanacionForm={subsanacionForm}
            setSubsanacionForm={setSubsanacionForm}
            subsanacionFiles={subsanacionFiles}
            setSubsanacionFiles={setSubsanacionFiles}
            subsanacionDocsActuales={subsanacionDocsActuales}
            subsanacionCuentaConfirm={subsanacionCuentaConfirm}
            setSubsanacionCuentaConfirm={setSubsanacionCuentaConfirm}
            saving={subsanacionSaving}
            onSubmit={handleSubsanar}
            banksOptions={banksOptions}
            loadingBanks={loadingBanks}
            validateAndSetFile={validateAndSetFile}
          />
        )}

        {subsanacionDone && (
          <div className="mt-6 p-8 rounded-2xl bg-blue-50 border border-blue-200 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="text-blue-600" size={56} />
            <h3 className="text-2xl font-extrabold text-blue-800">¡Corrección enviada!</h3>
            <p className="text-sm text-blue-700 max-w-md">
              Tu actualización volvió a quedar en <strong>revisión administrativa</strong> con los cambios que realizaste.
            </p>
          </div>
        )}

        {!canUpdate && !previousUpdate && profile && (
          <div className={`mt-4 p-4 rounded-xl border flex items-start gap-3 text-sm ${
            profile.estado_beneficiario === 'suspendido'
              ? 'border-rose-300 bg-rose-50 text-rose-900'
              : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}>
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              {profile.estado_beneficiario === 'suspendido' ? (
                <>
                  <p className="font-semibold mb-1">Tu estado actual es SUSPENDIDO</p>
                  <p className="mb-2">No puedes enviar actualizaciones semestrales en este momento.</p>
                  {profile.razon_suspension && (
                    <div className="p-2 rounded bg-white border border-rose-200 mb-2">
                      <p className="text-xs font-semibold mb-1">Motivo:</p>
                      <p className="text-sm">{profile.razon_suspension}</p>
                    </div>
                  )}
                  <p>Para resolver tu situación o solicitar información sobre tu estado, por favor contacta al equipo de administración a través del <a href="/beneficiario/tickets" className="underline font-semibold hover:text-rose-700">sistema de tickets</a>.</p>
                </>
              ) : (
                <p>Solo beneficiarios con estado <strong>ACTIVO</strong> y ventana de actualización vigente pueden enviar actualizaciones. Puedes consultar tu historial en el menú lateral.</p>
              )}
            </div>
          </div>
        )}

        {submitDone && (
          <div className="mt-6 p-8 rounded-2xl bg-green-50 border border-green-200 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="text-green-600" size={56} />
            <h3 className="text-2xl font-extrabold text-green-800">¡Actualización enviada!</h3>
            <p className="text-sm text-green-700 max-w-md">
              Tu actualización del periodo <strong>{submittedPeriodo}</strong> quedó registrada y está en{' '}
              <strong>revisión administrativa</strong>. Te enviaremos una confirmación a tu correo electrónico.
            </p>
            <p className="text-xs text-green-600">Puedes revisar el estado de tus envíos en la sección <strong>Historial</strong> del menú lateral.</p>
          </div>
        )}

        {!submitDone && !isSubsanacionMode && (
          <>
            <div className="mt-5">
              <p className="text-xs uppercase tracking-wide font-black text-slate-500 mb-2">Datos Personales</p>
            </div>
            <div className="mt-5 grid md:grid-cols-2 gap-3">
              <Input label="Correo" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} disabled={!canUpdate} required />
              <Input label="Teléfono" value={form.telefono} onChange={(value) => setForm((prev) => ({ ...prev, telefono: value }))} disabled={!canUpdate} required />
              <Input label="Dirección" value={form.direccion} onChange={(value) => setForm((prev) => ({ ...prev, direccion: value }))} disabled={!canUpdate} required />
              <SemestreInput
                value={form.semestre_actual}
                onChange={(value) => setForm((prev) => ({ ...prev, semestre_actual: value }))}
                disabled={!canUpdate}
              />
            </div>

            {/* Campo de Promedio con validación en tiempo real */}
            <div className="mt-5">
              <PromedioInput
                value={form.promedio_semestre_anterior}
                onChange={(value) => setForm((prev) => ({ ...prev, promedio_semestre_anterior: value }))}
                disabled={!canUpdate}
                promedioMinimo={config?.promedio_minimo || 3.5}
              />
            </div>

            {/* Datos bancarios */}
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 md:p-5 animate-slide-up" style={{ animationDelay: '100ms' }}>
              <p className="text-xs uppercase tracking-wide font-bold text-slate-600 mb-2">Datos Bancarios</p>
              <div className="grid md:grid-cols-3 gap-3">
                <label className="grid gap-1 text-sm">
                  <span className="text-xs uppercase tracking-wide font-bold text-slate-600">Banco *</span>
                  <input
                    value={form.banco}
                    onChange={(event) => setForm((prev) => ({ ...prev, banco: event.target.value }))}
                    disabled={!canUpdate}
                    placeholder={loadingBanks ? 'Cargando bancos…' : 'Selecciona o escribe banco'}
                    list="bancos-colombia-list"
                    className="border border-border rounded-lg px-3 py-2 disabled:bg-slate-100 transition-all duration-200 focus:ring-2 focus:ring-secondary/25 focus:border-secondary"
                  />
                  <datalist id="bancos-colombia-list">
                    {banksOptions.map((bankName) => (
                      <option key={bankName} value={bankName} />
                    ))}
                  </datalist>
                  {loadingBanks && <span className="text-[11px] text-slate-500">Cargando catálogo de bancos...</span>}
                  {banksError && <span className="text-[11px] text-amber-600">{banksError}</span>}
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-xs uppercase tracking-wide font-bold text-slate-600">Tipo de cuenta *</span>
                  <select
                    value={form.tipo_cuenta}
                    onChange={(event) => setForm((prev) => ({ ...prev, tipo_cuenta: event.target.value }))}
                    disabled={!canUpdate}
                    className="border border-border rounded-lg px-3 py-2 disabled:bg-slate-100 transition-all duration-200 focus:ring-2 focus:ring-secondary/25 focus:border-secondary"
                  >
                    <option value="">Seleccionar…</option>
                    <option value="Ahorros">Ahorros</option>
                    <option value="Corriente">Corriente</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-xs uppercase tracking-wide font-bold text-slate-600">Número de cuenta</span>
                  <input
                    value={form.cuenta_bancaria}
                    onChange={(event) => setForm((prev) => ({ ...prev, cuenta_bancaria: normalizeAccountNumber(event.target.value) }))}
                    disabled={!canUpdate}
                    placeholder="Solo números"
                    inputMode="numeric"
                    autoComplete="off"
                    className="border border-border rounded-lg px-3 py-2 disabled:bg-slate-100 transition-all duration-200 focus:ring-2 focus:ring-secondary/25 focus:border-secondary"
                  />
                </label>
              </div>

              <div className="grid md:grid-cols-3 gap-3 mt-3">
                <label className="grid gap-1 text-sm md:col-span-2">
                  <span className="text-xs uppercase tracking-wide font-bold text-slate-600">Confirmar número de cuenta</span>
                  <input
                    value={cuentaBancariaConfirm}
                    onChange={(event) => setCuentaBancariaConfirm(normalizeAccountNumber(event.target.value))}
                    disabled={!canUpdate}
                    placeholder="Vuelve a escribir el número de cuenta"
                    inputMode="numeric"
                    autoComplete="off"
                    className="border border-border rounded-lg px-3 py-2 disabled:bg-slate-100 transition-all duration-200 focus:ring-2 focus:ring-secondary/25 focus:border-secondary"
                  />
                  {cuentaBancariaConfirm && normalizeAccountNumber(form.cuenta_bancaria) !== normalizeAccountNumber(cuentaBancariaConfirm) && (
                    <span className="text-[11px] text-red-600">Los números no coinciden.</span>
                  )}
                  {cuentaBancariaConfirm && normalizeAccountNumber(form.cuenta_bancaria) === normalizeAccountNumber(cuentaBancariaConfirm) && (
                    <span className="text-[11px] text-emerald-600">Cuenta confirmada.</span>
                  )}
                </label>
              </div>

              {/* Fecha de expedición del certificado bancario */}
              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="bg-amber-50 border-l-4 border-amber-400 p-3 mb-3 rounded">
                  <div className="flex items-start gap-2">
                    <Info size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-900 mb-1">Importante: Vigencia del Certificado Bancario</p>
                      <p className="text-xs text-amber-800">
                        La fecha de expedición que indiques debe coincidir <strong>exactamente</strong> con la fecha que aparece en el certificado bancario adjunto. 
                        El certificado debe tener una vigencia máxima de <strong>{config?.cert_bancario_max_dias || 15} días</strong> desde su expedición. 
                        Certificados con fechas que no coincidan o vencidos serán causa de <strong>rechazo inmediato</strong> de tu actualización.
                      </p>
                    </div>
                  </div>
                </div>
                <label className="grid gap-1 text-sm max-w-xs">
                  <span className="text-xs uppercase tracking-wide font-bold text-slate-600">Fecha de expedición del certificado bancario *</span>
                  <input
                    type="date"
                    value={form.fecha_expedicion_cert_bancario}
                    onChange={(event) => setForm((prev) => ({ ...prev, fecha_expedicion_cert_bancario: event.target.value }))}
                    disabled={!canUpdate}
                    max={new Date().toISOString().split('T')[0]}
                    className="border border-border rounded-lg px-3 py-2 disabled:bg-slate-100 transition-all duration-200 focus:ring-2 focus:ring-secondary/25 focus:border-secondary"
                  />
                  {form.fecha_expedicion_cert_bancario && (() => {
                    const fechaExpedicion = new Date(form.fecha_expedicion_cert_bancario);
                    const hoy = new Date();
                    hoy.setHours(0, 0, 0, 0);
                    fechaExpedicion.setHours(0, 0, 0, 0);
                    const diasDiferencia = Math.floor((hoy.getTime() - fechaExpedicion.getTime()) / (1000 * 60 * 60 * 24));
                    const maxDias = Number(config?.cert_bancario_max_dias || 15);
                    
                    if (diasDiferencia > maxDias) {
                      return <span className="text-[11px] text-red-600 font-semibold">⚠️ Certificado vencido ({diasDiferencia} días). Máximo permitido: {maxDias} días.</span>;
                    } else if (diasDiferencia >= 0) {
                      return <span className="text-[11px] text-emerald-600">✓ Certificado válido ({diasDiferencia} días de antigüedad)</span>;
                    }
                    return null;
                  })()}
                </label>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs uppercase tracking-wide font-black text-slate-500 mb-2">Documentos Requeridos</p>
              <div className="grid md:grid-cols-3 gap-3 animate-slide-up" style={{ animationDelay: '150ms' }}>
              <FileInput label="Certificado bancario (PDF sin contraseña)" file={files.certificado_bancario} onChange={handleCertificadoBancarioChange} disabled={!canUpdate} />
              <FileInput label="Certificado de notas (PDF sin contraseña)" file={files.certificado_notas} onChange={handleCertificadoNotasChange} disabled={!canUpdate} />
              <FileInput label="Certificado de matrícula (PDF sin contraseña)" file={files.certificado_matricula} onChange={handleCertificadoMatriculaChange} disabled={!canUpdate} />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canUpdate || saving}
              className="mt-5 bg-accent text-white px-6 py-3 rounded-xl font-bold disabled:opacity-50 flex items-center gap-2 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:brightness-110 active:scale-95 disabled:hover:scale-100 disabled:hover:brightness-100 disabled:hover:shadow-none"
              style={{ animationDelay: '200ms' }}
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? 'Enviando...' : 'Enviar actualización'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const PromedioInput = ({ value, onChange, disabled = false, promedioMinimo = 3.5 }) => {
  const promedio = Number(String(value || '').replace(',', '.'));
  const hasValue = value && String(value).trim() !== '';
  const isValid = hasValue && !isNaN(promedio) && promedio >= 0 && promedio <= 5;

  // Solo permite dígitos y un único punto decimal; la coma se normaliza a punto y se limita a 5.
  const handleChange = (rawValue) => {
    let sanitized = rawValue.replace(',', '.').replace(/[^0-9.]/g, '');
    const firstDotIndex = sanitized.indexOf('.');
    if (firstDotIndex !== -1) {
      sanitized = sanitized.slice(0, firstDotIndex + 1) + sanitized.slice(firstDotIndex + 1).replace(/\./g, '');
    }
    const numeric = Number(sanitized);
    if (sanitized !== '' && sanitized !== '.' && Number.isFinite(numeric) && numeric > 5) {
      sanitized = '5';
    }
    onChange(sanitized);
  };
  
  // Determinar el estado del promedio
  let estado = 'neutral'; // neutral, bajo, bueno
  let mensaje = '';
  let colorClasses = {
    border: 'border-slate-300',
    bg: 'bg-white',
    text: 'text-slate-700',
    ring: 'focus:ring-secondary/25 focus:border-secondary',
  };
  
  if (isValid) {
    if (promedio < promedioMinimo) {
      estado = 'bajo';
      colorClasses = {
        border: 'border-red-400',
        bg: 'bg-red-50',
        text: 'text-red-900',
        ring: 'focus:ring-red-200 focus:border-red-500',
      };
      mensaje = `⚠️ Tu promedio está por debajo del mínimo requerido (${promedioMinimo}). Tu actualización será enviada pero entrará en período de revisión por los administradores. Recuerda que el bajo promedio académico es causal de no pago según el reglamento del programa.`;
    } else {
      estado = 'bueno';
      colorClasses = {
        border: 'border-emerald-400',
        bg: 'bg-emerald-50',
        text: 'text-emerald-900',
        ring: 'focus:ring-emerald-200 focus:border-emerald-500',
      };
      mensaje = `🎉 ¡Excelente trabajo! Tu promedio cumple con los requisitos académicos. Sigue así, tu esfuerzo y dedicación son el motor de tu éxito. ¡Estamos orgullosos de ti!`;
    }
  }
  
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide font-bold text-slate-600">
          Promedio semestre anterior *
        </span>
        <div className="group relative">
          <Info size={14} className="text-blue-600 cursor-help" />
          <div className="absolute left-0 top-6 z-10 hidden group-hover:block w-72 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-xl">
            <strong>Importante:</strong> El promedio que ingreses debe coincidir exactamente con el que aparece en el certificado de notas que vas a adjuntar para esta actualización.
            <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-900 transform rotate-45"></div>
          </div>
        </div>
      </div>
      
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        disabled={disabled}
        required
        placeholder={`Mínimo ${promedioMinimo}, máximo 5`}
        className={`
          border rounded-lg px-3 py-2.5 transition-all duration-300
          disabled:bg-slate-100 disabled:text-slate-500
          ${colorClasses.border} ${colorClasses.bg} ${colorClasses.text} ${colorClasses.ring}
          ${isValid && estado !== 'neutral' ? 'font-semibold' : ''}
        `}
      />
      
      {/* Mensaje contextual */}
      {isValid && estado !== 'neutral' && (
        <div
          className={`
            rounded-xl px-4 py-3 text-sm animate-fade-in
            ${estado === 'bajo' 
              ? 'bg-red-100 border border-red-300 text-red-800' 
              : 'bg-emerald-100 border border-emerald-300 text-emerald-800'
            }
          `}
        >
          {mensaje}
        </div>
      )}
    </div>
  );
};

const SemestreInput = ({ value, onChange, disabled = false }) => {
  const numeric = Number(value);
  const hasValue = value !== '' && value !== null && value !== undefined;
  const isInvalid = hasValue && (!Number.isInteger(numeric) || numeric < 1 || numeric > 10);

  const handleChange = (rawValue) => {
    const sanitized = rawValue.replace(/[^0-9]/g, '').slice(0, 2);
    onChange(sanitized);
  };

  const handleBlur = () => {
    if (!hasValue) return;
    const clamped = Math.min(10, Math.max(1, Math.round(numeric) || 1));
    onChange(String(clamped));
  };

  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs uppercase tracking-wide font-bold text-slate-600">Semestre que actualiza *</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={handleBlur}
        disabled={disabled}
        required
        placeholder="1 a 10"
        className={`border rounded-lg px-3 py-2 disabled:bg-slate-100 transition-all duration-200 focus:ring-2 ${
          isInvalid
            ? 'border-red-400 bg-red-50 focus:ring-red-200 focus:border-red-500'
            : 'border-border focus:ring-secondary/25 focus:border-secondary'
        }`}
      />
      {isInvalid && (
        <span className="text-[11px] text-red-600">El semestre debe estar entre 1 y 10.</span>
      )}
    </label>
  );
};

const Input = ({ label, value, onChange, disabled = false, placeholder = '', required = false }) => (
  <label className="grid gap-1 text-sm">
    <span className="text-xs uppercase tracking-wide font-bold text-slate-600">{label}{required ? ' *' : ''}</span>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      required={required}
      className="border border-border rounded-lg px-3 py-2 disabled:bg-slate-100 transition-all duration-200 focus:ring-2 focus:ring-secondary/25 focus:border-secondary"
    />
  </label>
);

const FileInput = ({ label, file, onChange, disabled = false }) => {
  const hasFile = Boolean(file);
  const borderColorClass = disabled ? 'border-slate-200' : hasFile ? 'border-emerald-300' : 'border-red-300';
  const bgColorClass = disabled ? 'bg-slate-100' : hasFile ? 'bg-emerald-50' : 'bg-red-50';
  const textColorClass = disabled ? 'text-slate-500' : hasFile ? 'text-emerald-700' : 'text-red-700';
  const hoverClass = disabled ? '' : 'hover:bg-opacity-70 cursor-pointer';

  return (
    <label className={`border border-dashed rounded-xl p-3 text-sm transition-all duration-300 hover:shadow-sm ${borderColorClass} ${bgColorClass} ${hoverClass}`}>
      <p className={`font-semibold ${textColorClass}`}>{label}</p>
      <p className={`text-xs mt-1 truncate ${textColorClass}`}>
        {file?.name ? (
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            {file.name}
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500"></span>
            Seleccionar PDF
          </span>
        )}
      </p>
      <input
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
    </label>
  );
};

const CAMPO_LABELS_SUBSANACION = {
  email: 'Correo',
  telefono: 'Teléfono',
  direccion: 'Dirección',
  semestre_actual: 'Semestre que actualiza',
  promedio_semestre_anterior: 'Promedio semestre anterior',
  datos_bancarios: 'Datos bancarios',
};

const DOCUMENTO_LABELS_SUBSANACION = {
  certificado_bancario: 'Certificado bancario',
  certificado_notas: 'Certificado de notas',
  certificado_matricula: 'Certificado de matrícula',
};

const SubsanacionCard = ({
  previousUpdate,
  camposASubsanar,
  documentosASubsanar,
  subsanacionForm,
  setSubsanacionForm,
  subsanacionFiles,
  setSubsanacionFiles,
  subsanacionDocsActuales,
  subsanacionCuentaConfirm,
  setSubsanacionCuentaConfirm,
  saving,
  onSubmit,
  banksOptions,
  loadingBanks,
  validateAndSetFile,
}) => {
  const nombreDocActual = (tipo) =>
    subsanacionDocsActuales.find((d) => d.tipo_documento === tipo)?.nombre_original;

  return (
    <div className="mt-4 rounded-2xl border-2 border-blue-300 bg-blue-50/60 p-5 space-y-5 animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center">
          <AlertCircle size={16} className="text-blue-700" />
        </div>
        <div>
          <h3 className="font-extrabold text-blue-900">Debes corregir tu actualización</h3>
          <p className="text-xs text-blue-700 mt-0.5">
            El equipo administrativo revisó tu envío y solicita ajustar lo siguiente antes de continuar.
          </p>
        </div>
      </div>

      {previousUpdate?.observacion_admin && (
        <div className="p-3 rounded-xl bg-white border border-blue-200 text-sm text-blue-900">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-500 mb-1">Observación del equipo</p>
          {previousUpdate.observacion_admin}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {camposASubsanar.map((campo) => (
          <span key={campo} className="text-[11px] font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-700 ring-1 ring-blue-200">
            {CAMPO_LABELS_SUBSANACION[campo] || campo}
          </span>
        ))}
        {documentosASubsanar.map((doc) => (
          <span key={doc} className="text-[11px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-200">
            {DOCUMENTO_LABELS_SUBSANACION[doc] || doc}
          </span>
        ))}
      </div>

      {(camposASubsanar.includes('email') || camposASubsanar.includes('telefono') || camposASubsanar.includes('direccion') || camposASubsanar.includes('semestre_actual')) && (
        <div className="grid md:grid-cols-2 gap-3">
          {camposASubsanar.includes('email') && (
            <Input label="Correo" required value={subsanacionForm.email} onChange={(v) => setSubsanacionForm((p) => ({ ...p, email: v }))} />
          )}
          {camposASubsanar.includes('telefono') && (
            <Input label="Teléfono" required value={subsanacionForm.telefono} onChange={(v) => setSubsanacionForm((p) => ({ ...p, telefono: v }))} />
          )}
          {camposASubsanar.includes('direccion') && (
            <Input label="Dirección" required value={subsanacionForm.direccion} onChange={(v) => setSubsanacionForm((p) => ({ ...p, direccion: v }))} />
          )}
          {camposASubsanar.includes('semestre_actual') && (
            <SemestreInput value={subsanacionForm.semestre_actual} onChange={(v) => setSubsanacionForm((p) => ({ ...p, semestre_actual: v }))} />
          )}
        </div>
      )}

      {camposASubsanar.includes('promedio_semestre_anterior') && (
        <PromedioInput
          value={subsanacionForm.promedio_semestre_anterior}
          onChange={(v) => setSubsanacionForm((p) => ({ ...p, promedio_semestre_anterior: v }))}
        />
      )}

      {camposASubsanar.includes('datos_bancarios') && (
        <div className="rounded-xl border border-blue-200 bg-white p-4 space-y-3">
          <p className="text-xs uppercase tracking-wide font-bold text-slate-600">Datos bancarios</p>
          <div className="grid md:grid-cols-3 gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-xs uppercase tracking-wide font-bold text-slate-600">Banco *</span>
              <input
                value={subsanacionForm.banco}
                onChange={(e) => setSubsanacionForm((p) => ({ ...p, banco: e.target.value }))}
                placeholder={loadingBanks ? 'Cargando bancos…' : 'Selecciona o escribe banco'}
                list="bancos-colombia-list-subsanacion"
                className="border border-border rounded-lg px-3 py-2 transition-all duration-200 focus:ring-2 focus:ring-secondary/25 focus:border-secondary"
              />
              <datalist id="bancos-colombia-list-subsanacion">
                {banksOptions.map((bankName) => <option key={bankName} value={bankName} />)}
              </datalist>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs uppercase tracking-wide font-bold text-slate-600">Tipo de cuenta *</span>
              <select
                value={subsanacionForm.tipo_cuenta}
                onChange={(e) => setSubsanacionForm((p) => ({ ...p, tipo_cuenta: e.target.value }))}
                className="border border-border rounded-lg px-3 py-2 transition-all duration-200 focus:ring-2 focus:ring-secondary/25 focus:border-secondary"
              >
                <option value="">Seleccionar…</option>
                <option value="Ahorros">Ahorros</option>
                <option value="Corriente">Corriente</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs uppercase tracking-wide font-bold text-slate-600">Número de cuenta *</span>
              <input
                value={subsanacionForm.cuenta_bancaria}
                onChange={(e) => setSubsanacionForm((p) => ({ ...p, cuenta_bancaria: normalizeAccountNumber(e.target.value) }))}
                placeholder="Solo números"
                inputMode="numeric"
                className="border border-border rounded-lg px-3 py-2 transition-all duration-200 focus:ring-2 focus:ring-secondary/25 focus:border-secondary"
              />
            </label>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-xs uppercase tracking-wide font-bold text-slate-600">Confirmar número de cuenta *</span>
              <input
                value={subsanacionCuentaConfirm}
                onChange={(e) => setSubsanacionCuentaConfirm(normalizeAccountNumber(e.target.value))}
                placeholder="Repite el número"
                inputMode="numeric"
                className="border border-border rounded-lg px-3 py-2 transition-all duration-200 focus:ring-2 focus:ring-secondary/25 focus:border-secondary"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs uppercase tracking-wide font-bold text-slate-600">Fecha expedición cert. bancario *</span>
              <input
                type="date"
                value={subsanacionForm.fecha_expedicion_cert_bancario}
                onChange={(e) => setSubsanacionForm((p) => ({ ...p, fecha_expedicion_cert_bancario: e.target.value }))}
                max={new Date().toISOString().split('T')[0]}
                className="border border-border rounded-lg px-3 py-2 transition-all duration-200 focus:ring-2 focus:ring-secondary/25 focus:border-secondary"
              />
            </label>
          </div>
        </div>
      )}

      {documentosASubsanar.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide font-bold text-slate-600">Documentos a reemplazar</p>
          <div className="grid md:grid-cols-3 gap-3">
            {documentosASubsanar.map((tipo) => (
              <div key={tipo}>
                {nombreDocActual(tipo) && !subsanacionFiles[tipo] && (
                  <p className="text-[11px] text-slate-500 mb-1 truncate">Actual: {nombreDocActual(tipo)}</p>
                )}
                <FileInput
                  label={`${DOCUMENTO_LABELS_SUBSANACION[tipo]} (PDF sin contraseña)`}
                  file={subsanacionFiles[tipo]}
                  onChange={(file) =>
                    validateAndSetFile(file, DOCUMENTO_LABELS_SUBSANACION[tipo], (f) =>
                      setSubsanacionFiles((prev) => ({ ...prev, [tipo]: f }))
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={saving}
        className="w-full md:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
        {saving ? 'Enviando corrección…' : 'Enviar corrección a revisión'}
      </button>
    </div>
  );
};

export default BeneficiarioActualizacion;
