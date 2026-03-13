import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { showErrorAlert, showSuccessAlert, showWarningAlert } from '../lib/alerts';

const MAX_FILE_MB = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

const BeneficiarioActualizacion = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

      await showSuccessAlert({
        title: 'Actualización enviada',
        text: 'Tu actualización semestral quedó en revisión administrativa.',
      });

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
          <FileInput label="Certificado bancario" file={files.certificado_bancario} onChange={(file) => setFiles((prev) => ({ ...prev, certificado_bancario: file }))} disabled={!canUpdate} />
          <FileInput label="Certificado de notas" file={files.certificado_notas} onChange={(file) => setFiles((prev) => ({ ...prev, certificado_notas: file }))} disabled={!canUpdate} />
          <FileInput label="Certificado de matrícula" file={files.certificado_matricula} onChange={(file) => setFiles((prev) => ({ ...prev, certificado_matricula: file }))} disabled={!canUpdate} />
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canUpdate || saving}
          className="mt-5 bg-accent text-white px-6 py-3 rounded-xl font-bold disabled:opacity-50"
        >
          {saving ? 'Enviando...' : 'Enviar actualización'}
        </button>
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
