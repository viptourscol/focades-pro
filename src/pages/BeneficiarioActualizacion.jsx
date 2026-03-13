import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { showErrorAlert, showWarningAlert } from '../lib/alerts';
import { CheckCircle2, Loader2 } from 'lucide-react';

const MAX_FILE_MB = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

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
  });
  const [files, setFiles] = useState({
    certificado_bancario: null,
    certificado_notas: null,
    certificado_matricula: null,
  });

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) {
        if (mounted) setLoading(false);
        return;
      }

      const nowIso = new Date().toISOString();

      const [profileResp, configResp, windowResp] = await Promise.all([
        supabase.from('portal_beneficiarios').select('*').eq('auth_user_id', userId).maybeSingle(),
        supabase.from('portal_configuracion').select('*').eq('is_active', true).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase
          .from('portal_ventanas_actualizacion')
          .select('*')
          .eq('is_active', true)
          .lte('fecha_inicio', nowIso)
          .gte('fecha_fin', nowIso)
          .order('fecha_inicio', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!mounted) return;

      const profileData = profileResp.data || null;
      setProfile(profileData);
      setConfig(configResp.data || null);
      setWindowInfo(windowResp.data || null);

      setForm({
        email: profileData?.email || '',
        telefono: profileData?.telefono || '',
        direccion: profileData?.direccion || '',
        semestre_actual: String(profileData?.semestre_actual || ''),
        promedio_semestre_anterior: '',
      });

      setLoading(false);
    };

    loadData();

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
      validateFile(files.certificado_bancario, 'el certificado bancario');
      validateFile(files.certificado_notas, 'el certificado de notas');
      validateFile(files.certificado_matricula, 'el certificado de matrícula');

      await validatePdfNotEncrypted(files.certificado_bancario, 'El certificado bancario');
      await validatePdfNotEncrypted(files.certificado_notas, 'El certificado de notas');
      await validatePdfNotEncrypted(files.certificado_matricula, 'El certificado de matrícula');

      const minPromedio = Number(config?.promedio_minimo || 3.5);
      const promedio = Number(String(form.promedio_semestre_anterior || '').replace(',', '.'));

      if (!Number.isFinite(promedio)) {
        throw new Error('Ingresa un promedio válido para el semestre anterior.');
      }

      if (promedio < minPromedio) {
        throw new Error(`El promedio no puede ser menor a ${minPromedio}.`);
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

  if (loading) {
    return <div className="bg-white border border-border rounded-2xl p-8 text-center text-slate-500">Cargando...</div>;
  }

  if (!profile) {
    return <div className="bg-white border border-border rounded-2xl p-8">No se encontró perfil de beneficiario vinculado.</div>;
  }

  return (
    <div className="space-y-4">

      {/* Overlay bloqueante durante el envío */}
      {saving && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-10 flex flex-col items-center gap-4 max-w-sm w-full shadow-2xl mx-4">
            <Loader2 className="animate-spin text-secondary" size={48} />
            <p className="text-xl font-extrabold text-primary text-center">Enviando actualización...</p>
            <p className="text-sm text-slate-600 text-center">No cierres ni recargues la página mientras se procesa.</p>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mt-2">
              <div className="h-full bg-accent rounded-full animate-[progress_2s_ease-in-out_infinite]" />
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-border rounded-2xl p-6">
        <h2 className="text-xl font-extrabold text-primary">Actualización Semestral</h2>
        <p className="text-sm text-slate-600 mt-1">Precarga tus datos actuales y actualiza documentos del semestre.</p>

        <div className="mt-4 p-3 rounded-xl border text-sm bg-slate-50 border-border text-slate-700">
          <p><strong>Estado:</strong> {profile.estado_beneficiario || 'No disponible'}</p>
          <p><strong>Ventana activa:</strong> {windowInfo ? `${windowInfo.nombre || 'Periodo activo'} (${new Date(windowInfo.fecha_inicio).toLocaleDateString('es-CO')} - ${new Date(windowInfo.fecha_fin).toLocaleDateString('es-CO')})` : 'No hay ventana activa'}</p>
          <p><strong>Promedio mínimo vigente:</strong> {config?.promedio_minimo || 3.5}</p>
          <p><strong>Vigencia certificado bancario:</strong> {config?.cert_bancario_max_dias || 15} días</p>
        </div>

        {!canUpdate && (
          <div className="mt-4 p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-sm">
            Solo beneficiarios activos con ventana vigente pueden enviar actualización. Puedes consultar tu historial en el menú lateral.
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

            <div className="mt-4 grid md:grid-cols-3 gap-3">
              <FileInput label="Certificado bancario (PDF sin contraseña)" file={files.certificado_bancario} onChange={(file) => setFiles((prev) => ({ ...prev, certificado_bancario: file }))} disabled={!canUpdate} />
              <FileInput label="Certificado de notas (PDF sin contraseña)" file={files.certificado_notas} onChange={(file) => setFiles((prev) => ({ ...prev, certificado_notas: file }))} disabled={!canUpdate} />
              <FileInput label="Certificado de matrícula (PDF sin contraseña)" file={files.certificado_matricula} onChange={(file) => setFiles((prev) => ({ ...prev, certificado_matricula: file }))} disabled={!canUpdate} />
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canUpdate || saving}
              className="mt-5 bg-accent text-white px-6 py-3 rounded-xl font-bold disabled:opacity-50 flex items-center gap-2"
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
      className="border border-border rounded-lg px-3 py-2 disabled:bg-slate-100"
    />
  </label>
);

const FileInput = ({ label, file, onChange, disabled = false }) => (
  <label className={`border border-dashed rounded-xl p-3 text-sm ${disabled ? 'bg-slate-100 text-slate-500' : 'cursor-pointer hover:bg-slate-50'}`}>
    <p className="font-semibold text-primary">{label}</p>
    <p className="text-xs text-slate-500 mt-1 truncate">{file?.name || 'Seleccionar PDF'}</p>
    <input
      type="file"
      accept=".pdf,application/pdf"
      className="hidden"
      disabled={disabled}
      onChange={(event) => onChange(event.target.files?.[0] || null)}
    />
  </label>
);

export default BeneficiarioActualizacion;
