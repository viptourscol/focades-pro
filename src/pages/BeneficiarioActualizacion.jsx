import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { showErrorAlert, showWarningAlert } from '../lib/alerts';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

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
  const [form, setForm] = useState({
    email: '',
    telefono: '',
    direccion: '',
    semestre_actual: '',
    promedio_semestre_anterior: '',
    banco: '',
    tipo_cuenta: '',
    cuenta_bancaria: '',
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
        console.error('Error leyendo sesión de localStorage:', error);
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
          console.error('Error invocando get-beneficiario-profile:', err);
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
        console.error('Error invocando get-ventana-actualizacion:', err);
      }

      if (!mounted) return;

      setProfile(profileData);
      setConfig(configData);
      setWindowInfo(ventanaData);

      setForm({
        email: profileData?.email || '',
        telefono: profileData?.telefono || '',
        direccion: profileData?.direccion_residencia || profileData?.direccion || '',
        semestre_actual: String(profileData?.semestre_actual || ''),
        promedio_semestre_anterior: '',
        banco: profileData?.nombre_banco || profileData?.banco || '',
        tipo_cuenta: profileData?.tipo_cuenta_bancaria || profileData?.tipo_cuenta || '',
        cuenta_bancaria: profileData?.numero_cuenta || profileData?.cuenta_bancaria || '',
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
    return Boolean(windowInfo);
  }, [profile, windowInfo]);

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

      const minPromedio = Number(config?.promedio_minimo || 3.5);
      const promedio = Number(String(form.promedio_semestre_anterior || '').replace(',', '.'));

      if (!Number.isFinite(promedio)) {
        throw new Error('Ingresa un promedio válido para el semestre anterior.');
      }

      if (promedio < minPromedio) {
        throw new Error(`El promedio no puede ser menor a ${minPromedio}.`);
      }

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

      setSaving(true);

      const payload = {
        beneficiario_id: profile.id,
        ventana_id: windowInfo.id,
        estado: 'en_revision',
        email: String(form.email || '').trim().toLowerCase(),
        telefono: String(form.telefono || '').trim(),
        direccion: String(form.direccion || '').trim(),
        semestre_actual: Number(form.semestre_actual || 0),
        promedio_semestre_anterior: promedio,
        payload_formulario: form,
      };

      const { data: insertData, error: insertError } = await supabase
        .from('portal_actualizaciones')
        .insert(payload)
        .select('id')
        .single();

      if (insertError) {
        throw new Error(insertError.message || 'No se pudo guardar la actualización.');
      }

      const updateId = insertData.id;

      const uploadOne = async (key, file) => {
        const storagePath = `beneficiarios/${profile.id}/${updateId}/${key}-${Date.now()}.pdf`;
        const { error: uploadError } = await supabase.storage.from('soportes').upload(storagePath, file, {
          upsert: false,
          contentType: 'application/pdf',
        });

        if (uploadError) {
          throw new Error(`No se pudo subir ${key}: ${uploadError.message}`);
        }

        const { error: docError } = await supabase.from('portal_actualizacion_documentos').insert({
          actualizacion_id: updateId,
          tipo_documento: key,
          storage_path: storagePath,
          nombre_original: file.name,
          mime_type: file.type || 'application/pdf',
          size_bytes: file.size || 0,
        });

        if (docError) {
          throw new Error(`No se pudo registrar ${key}: ${docError.message}`);
        }
      };

      await uploadOne('certificado_bancario', files.certificado_bancario);
      await uploadOne('certificado_notas', files.certificado_notas);
      await uploadOne('certificado_matricula', files.certificado_matricula);

      const { error: profileError } = await supabase
        .from('portal_beneficiarios')
        .update({
          email: payload.email,
          telefono: payload.telefono,
          direccion: payload.direccion,
          semestre_actual: payload.semestre_actual,
          banco: String(form.banco || '').trim() || null,
          tipo_cuenta: String(form.tipo_cuenta || '').trim() || null,
          cuenta_bancaria: accountNumber || null,
        })
        .eq('id', profile.id);

      if (profileError) {
        throw new Error(profileError.message || 'No se pudo actualizar datos básicos del beneficiario.');
      }

      // Notificación por correo (no bloquea si falla)
      supabase.functions.invoke('notify-beneficiario', {
        body: {
          email: payload.email,
          nombre: profile.primer_nombre || profile.nombre_completo || 'Beneficiario',
          ventana_nombre: windowInfo?.nombre || 'Periodo vigente',
          semestre: payload.semestre_actual,
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

    // Si todo está bien, setear el archivo
    setFileCallback(selectedFile);
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

        {!canUpdate && (
          <div className="mt-4 p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-sm flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <p>Solo beneficiarios activos con ventana vigente pueden enviar actualización. Puedes consultar tu historial en el menú lateral.</p>
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

        {!submitDone && (
          <>
            <div className="mt-5">
              <p className="text-xs uppercase tracking-wide font-black text-slate-500 mb-2">Datos Personales</p>
            </div>
            <div className="mt-5 grid md:grid-cols-2 gap-3">
              <Input label="Correo" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} disabled={!canUpdate} />
              <Input label="Teléfono" value={form.telefono} onChange={(value) => setForm((prev) => ({ ...prev, telefono: value }))} disabled={!canUpdate} />
              <Input label="Dirección" value={form.direccion} onChange={(value) => setForm((prev) => ({ ...prev, direccion: value }))} disabled={!canUpdate} />
              <Input label="Semestre que actualiza" value={form.semestre_actual} onChange={(value) => setForm((prev) => ({ ...prev, semestre_actual: value }))} disabled={!canUpdate} />
              <Input
                label="Promedio semestre anterior"
                value={form.promedio_semestre_anterior}
                onChange={(value) => setForm((prev) => ({ ...prev, promedio_semestre_anterior: value }))}
                disabled={!canUpdate}
                placeholder={`Mínimo ${config?.promedio_minimo || 3.5}`}
              />
            </div>

            {/* Datos bancarios */}
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 md:p-5 animate-slide-up" style={{ animationDelay: '100ms' }}>
              <p className="text-xs uppercase tracking-wide font-bold text-slate-600 mb-2">Datos Bancarios</p>
              <div className="grid md:grid-cols-3 gap-3">
                <label className="grid gap-1 text-sm">
                  <span className="text-xs uppercase tracking-wide font-bold text-slate-600">Banco</span>
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
                  <span className="text-xs uppercase tracking-wide font-bold text-slate-600">Tipo de cuenta</span>
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

const Input = ({ label, value, onChange, disabled = false, placeholder = '' }) => (
  <label className="grid gap-1 text-sm">
    <span className="text-xs uppercase tracking-wide font-bold text-slate-600">{label}</span>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
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

export default BeneficiarioActualizacion;
