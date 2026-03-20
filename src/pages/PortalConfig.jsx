import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Edit2, Eye, EyeOff, Loader2, Plus, Search, ShieldCheck, ShieldX, Trash2, UserPlus, X } from 'lucide-react';
import { getSafeSession, supabase } from '../lib/supabase';
import { showConfirmAlert, showErrorAlert, showSuccessAlert, showTextareaConfirmAlert } from '../lib/alerts';

const emptyNews = {
  title: '',
  summary: '',
  content: '',
  image_url: '',
  button_label: '',
  button_url: '',
};

const NEWS_IMAGE_MAX_MB = 5;
const NEWS_IMAGE_MAX_BYTES = NEWS_IMAGE_MAX_MB * 1024 * 1024;
const NEWS_IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const sanitizePathSegment = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');

const emptyModal = {
  title: '',
  content: '',
  priority: 100,
};

const emptyBeneficiario = {
  radicado_inscripcion: '',
  nombre_completo: '',
  tipo_documento: 'CC',
  n_documento: '',
  email: '',
  telefono: '',
  direccion: '',
  semestre_actual: '1',
  estado_beneficiario: 'activo',
};

const emptyAdminForm = {
  email: '',
  nombre_completo: '',
  role: 'admin',
  notes: '',
};

const ADMIN_ROLE_OPTIONS = ['admin', 'super_admin'];

const formatDateTime = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('es-CO');
};

const getAdminRoleLabel = (role) => (role === 'super_admin' ? 'Super admin' : 'Admin');

const PortalConfig = () => {
  const [config, setConfig] = useState({ promedio_minimo: 3.5, cert_bancario_max_dias: 15 });
  const [news, setNews] = useState([]);
  const [beneficiarios, setBeneficiarios] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [newsForm, setNewsForm] = useState(emptyNews);
  const [newsFormOpen, setNewsFormOpen] = useState(false);
  const [editNewsId, setEditNewsId] = useState(null);
  const [newsImageFile, setNewsImageFile] = useState(null);
  const [newsImagePreview, setNewsImagePreview] = useState('');
  const [newsSaving, setNewsSaving] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [modalForm, setModalForm] = useState(emptyModal);
  const [beneficiarioForm, setBeneficiarioForm] = useState(emptyBeneficiario);
  const [adminForm, setAdminForm] = useState(emptyAdminForm);
  const [adminUserQuery, setAdminUserQuery] = useState('');
  const [adminUserCandidates, setAdminUserCandidates] = useState([]);
  const [adminCandidateLoading, setAdminCandidateLoading] = useState(false);
  const [selectedAdminCandidateId, setSelectedAdminCandidateId] = useState('');
  const [configSaving, setConfigSaving] = useState(false);
  const [beneficiarioSaving, setBeneficiarioSaving] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminActionUserId, setAdminActionUserId] = useState('');

  const loadData = async () => {
    try {
      const { session } = await getSafeSession();
      const currentUserId = String(session?.user?.id || '').trim();

      const [{ data: cfg }, { data: nws }, { data: beneficiariosData }, { data: adminsData }] = await Promise.all([
        supabase.from('portal_configuracion').select('*').eq('is_active', true).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('portal_noticias').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('publish_at', { ascending: false }).limit(50),
        supabase.from('portal_beneficiarios').select('*').order('created_at', { ascending: false }).limit(50),
        supabase
          .from('portal_admin_users')
          .select('user_id,nombre_completo,email,role,is_active,created_at,updated_at,deactivated_at,notes')
          .order('is_active', { ascending: false })
          .order('role', { ascending: true })
          .order('created_at', { ascending: true }),
      ]);

      if (cfg) {
        setConfig({
          promedio_minimo: cfg.promedio_minimo ?? 3.5,
          cert_bancario_max_dias: cfg.cert_bancario_max_dias ?? 15,
        });
      }

      setNews(Array.isArray(nws) ? nws : []);
      setBeneficiarios(Array.isArray(beneficiariosData) ? beneficiariosData : []);
      const safeAdmins = Array.isArray(adminsData) ? adminsData : [];
      setAdminUsers(safeAdmins);
      setCurrentAdmin(safeAdmins.find((item) => item.user_id === currentUserId) || null);
    } catch {
      setNews([]);
      setBeneficiarios([]);
      setAdminUsers([]);
      setCurrentAdmin(null);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const query = String(adminUserQuery || '').trim();
    if (!query || query.length < 2 || currentAdmin?.role !== 'super_admin') {
      setAdminUserCandidates([]);
      setAdminCandidateLoading(false);
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setAdminCandidateLoading(true);
        const { data, error } = await supabase.rpc('admin_search_users_for_management', {
          p_query: query,
          p_limit: 12,
        });

        if (!active) return;

        if (error) {
          setAdminUserCandidates([]);
          return;
        }

        setAdminUserCandidates(Array.isArray(data) ? data : []);
      } catch {
        if (active) setAdminUserCandidates([]);
      } finally {
        if (active) setAdminCandidateLoading(false);
      }
    }, 320);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [adminUserQuery, currentAdmin?.role]);

  useEffect(() => {
    if (!newsImageFile) {
      setNewsImagePreview('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(newsImageFile);
    setNewsImagePreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [newsImageFile]);

  const saveConfig = async () => {
    try {
      setConfigSaving(true);
      const { error } = await supabase.from('portal_configuracion').insert({
        promedio_minimo: Number(config.promedio_minimo || 3.5),
        cert_bancario_max_dias: Number(config.cert_bancario_max_dias || 15),
        is_active: true,
      });

      if (error) {
        throw error;
      }

      await showSuccessAlert({
        title: 'Configuración guardada',
        text: 'Las reglas globales del portal fueron actualizadas.',
      });
      await loadData();
    } catch (error) {
      await showErrorAlert({
        title: 'No se pudo guardar',
        text: error.message || 'Ocurrió un error al guardar la configuración.',
      });
    } finally {
      setConfigSaving(false);
    }
  };

  const openCreateNews = () => {
    setEditNewsId(null);
    setNewsForm(emptyNews);
    setNewsImageFile(null);
    setNewsFormOpen(true);
  };

  const openEditNews = (item) => {
    setEditNewsId(item.id);
    setNewsForm({
      title: item.title || '',
      summary: item.summary || '',
      content: item.content || '',
      image_url: item.image_url || '',
      button_label: item.button_label || '',
      button_url: item.button_url || '',
    });
    setNewsImageFile(null);
    setNewsFormOpen(true);
  };

  const cancelNewsForm = () => {
    setNewsFormOpen(false);
    setEditNewsId(null);
    setNewsImageFile(null);
    setNewsForm(emptyNews);
  };

  const handleNewsImageFileChange = async (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setNewsImageFile(null);
      return;
    }

    if (!NEWS_IMAGE_ALLOWED_TYPES.includes(file.type)) {
      await showErrorAlert({
        title: 'Formato no permitido',
        text: 'La imagen debe ser JPG, PNG o WEBP.',
      });
      event.target.value = '';
      return;
    }

    if (file.size > NEWS_IMAGE_MAX_BYTES) {
      await showErrorAlert({
        title: 'Imagen demasiado grande',
        text: `La imagen supera el tamaño máximo de ${NEWS_IMAGE_MAX_MB}MB.`,
      });
      event.target.value = '';
      return;
    }

    setNewsImageFile(file);
  };

  const uploadNewsImage = async (file) => {
    const extension = String(file.name || '').includes('.')
      ? String(file.name).split('.').pop().toLowerCase()
      : file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
          ? 'webp'
          : 'jpg';

    const safeName = sanitizePathSegment(newsForm.title) || 'noticia';
    const storagePath = `portal/noticias/${Date.now()}-${safeName}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('soportes')
      .upload(storagePath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      throw new Error(uploadError.message || 'No se pudo subir la imagen de la noticia.');
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from('soportes')
      .createSignedUrl(storagePath, 31536000);

    if (signedError || !signedData?.signedUrl) {
      throw new Error('La imagen se subió, pero no fue posible generar una URL de acceso.');
    }

    return signedData.signedUrl;
  };

  const saveNews = async () => {
    if (!newsForm.title.trim()) {
      await showErrorAlert({ title: 'Título requerido', text: 'Ingresa un título para la noticia.' });
      return;
    }
    try {
      setNewsSaving(true);
      const uploadedImageUrl = newsImageFile ? await uploadNewsImage(newsImageFile) : newsForm.image_url;
      const payload = { ...newsForm, image_url: uploadedImageUrl || '' };

      if (editNewsId) {
        const { error } = await supabase
          .from('portal_noticias')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editNewsId);
        if (error) throw error;
        await showSuccessAlert({ title: 'Noticia actualizada', text: 'Los cambios fueron guardados.' });
      } else {
        const maxResp = await supabase
          .from('portal_noticias')
          .select('sort_order')
          .order('sort_order', { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextOrder = (maxResp?.data?.sort_order ?? 0) + 1;
        const { error } = await supabase.from('portal_noticias').insert({
          ...payload,
          is_active: true,
          publish_at: new Date().toISOString(),
          sort_order: nextOrder,
        });
        if (error) throw error;
        await showSuccessAlert({ title: 'Noticia publicada', text: 'La noticia ya es visible en el portal.' });
      }
      cancelNewsForm();
      await loadData();
    } catch (error) {
      await showErrorAlert({ title: 'Error al guardar', text: error.message || 'No se pudo guardar la noticia.' });
    } finally {
      setNewsSaving(false);
    }
  };

  const deleteNews = async (id) => {
    const confirmed = await showConfirmAlert({
      title: '¿Eliminar noticia?',
      text: 'Esta acción no se puede deshacer.',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!confirmed) return;
    setNewsLoading(true);
    const { error } = await supabase.from('portal_noticias').delete().eq('id', id);
    if (error) {
      await showErrorAlert({ title: 'Error al eliminar', text: error.message });
    }
    await loadData();
    setNewsLoading(false);
  };

  const toggleNewsActive = async (item) => {
    setNewsLoading(true);
    await supabase
      .from('portal_noticias')
      .update({ is_active: !item.is_active, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    await loadData();
    setNewsLoading(false);
  };

  const moveNews = async (index, direction) => {
    const sorted = [...news];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;
    setNewsLoading(true);
    const a = sorted[index];
    const b = sorted[swapIndex];
    const orderA = a.sort_order ?? index + 1;
    const orderB = b.sort_order ?? swapIndex + 1;
    await Promise.all([
      supabase.from('portal_noticias').update({ sort_order: orderB, updated_at: new Date().toISOString() }).eq('id', a.id),
      supabase.from('portal_noticias').update({ sort_order: orderA, updated_at: new Date().toISOString() }).eq('id', b.id),
    ]);
    await loadData();
    setNewsLoading(false);
  };

  const createModal = async () => {
    await supabase.from('portal_modal_anuncios').insert({
      ...modalForm,
      is_active: true,
      visible_desde: new Date().toISOString(),
      visible_hasta: null,
    });
    setModalForm(emptyModal);
  };

  const createBeneficiario = async () => {
    const email = String(beneficiarioForm.email || '').trim().toLowerCase();

    if (!beneficiarioForm.nombre_completo || !email || !beneficiarioForm.n_documento) {
      await showErrorAlert({
        title: 'Datos incompletos',
        text: 'Debes registrar nombre completo, correo y número de documento del beneficiario.',
      });
      return;
    }

    try {
      setBeneficiarioSaving(true);
      const { error } = await supabase.from('portal_beneficiarios').insert({
        radicado_inscripcion: String(beneficiarioForm.radicado_inscripcion || '').trim() || null,
        nombre_completo: String(beneficiarioForm.nombre_completo || '').trim(),
        tipo_documento: String(beneficiarioForm.tipo_documento || 'CC').trim(),
        n_documento: String(beneficiarioForm.n_documento || '').trim(),
        email,
        telefono: String(beneficiarioForm.telefono || '').trim() || null,
        direccion: String(beneficiarioForm.direccion || '').trim() || null,
        semestre_actual: Number(beneficiarioForm.semestre_actual || 1),
        estado_beneficiario: String(beneficiarioForm.estado_beneficiario || 'activo').trim(),
      });

      if (error) {
        throw error;
      }

      setBeneficiarioForm(emptyBeneficiario);
      await loadData();
      await showSuccessAlert({
        title: 'Beneficiario registrado',
        text: 'El beneficiario quedó listo para vincularse con Google usando el mismo correo autorizado.',
      });
    } catch (error) {
      await showErrorAlert({
        title: 'No se pudo registrar',
        text: error.message || 'Ocurrió un error al crear el beneficiario.',
      });
    } finally {
      setBeneficiarioSaving(false);
    }
  };

  const releaseBeneficiarioAccess = async (beneficiarioId) => {
    try {
      const { error } = await supabase
        .from('portal_beneficiarios')
        .update({ auth_user_id: null, updated_at: new Date().toISOString() })
        .eq('id', beneficiarioId);

      if (error) {
        throw error;
      }

      await loadData();
      await showSuccessAlert({
        title: 'Vinculación liberada',
        text: 'El beneficiario podrá volver a vincularse con su correo autorizado.',
      });
    } catch (error) {
      await showErrorAlert({
        title: 'No se pudo liberar',
        text: error.message || 'Ocurrió un error al liberar la vinculación.',
      });
    }
  };

  const createOrActivateAdmin = async () => {
    const email = String(adminForm.email || '').trim().toLowerCase();

    if (!email) {
      await showErrorAlert({
        title: 'Correo requerido',
        text: 'Debes indicar el correo del usuario que tendrá acceso administrativo.',
      });
      return;
    }

    try {
      setAdminSaving(true);
      const { data, error } = await supabase.rpc('admin_upsert_portal_admin', {
        p_email: email,
        p_role: adminForm.role,
        p_nombre_completo: String(adminForm.nombre_completo || '').trim() || null,
        p_note: String(adminForm.notes || '').trim() || null,
      });

      if (error || !data?.ok) {
        throw new Error(error?.message || data?.message || 'No se pudo registrar el administrador.');
      }

      setAdminForm(emptyAdminForm);
      await loadData();
      await showSuccessAlert({
        title: data.action === 'admin_created' ? 'Administrador creado' : 'Administrador actualizado',
        text: `${data.nombre_completo || data.email} ya tiene acceso con rol ${getAdminRoleLabel(data.role)}.`,
      });
    } catch (error) {
      await showErrorAlert({
        title: 'No se pudo gestionar el admin',
        text: error.message || 'Ocurrió un error al guardar el administrador.',
      });
    } finally {
      setAdminSaving(false);
    }
  };

  const applyCandidateToForm = (candidate) => {
    if (!candidate) return;

    const nextRole = String(candidate.admin_role || '').trim();
    const resolvedRole = ADMIN_ROLE_OPTIONS.includes(nextRole) ? nextRole : 'admin';

    setAdminForm((prev) => ({
      ...prev,
      email: String(candidate.email || '').trim().toLowerCase(),
      nombre_completo: String(candidate.nombre_sugerido || '').trim(),
      role: resolvedRole,
    }));
    setSelectedAdminCandidateId(String(candidate.user_id || ''));
    setAdminUserQuery(String(candidate.email || candidate.nombre_sugerido || '').trim());
    setAdminUserCandidates([]);
  };

  const updateAdminRole = async (adminUserId, nextRole) => {
    try {
      setAdminActionUserId(adminUserId);
      const { data, error } = await supabase.rpc('admin_update_portal_admin_role', {
        p_target_user_id: adminUserId,
        p_role: nextRole,
        p_note: `Cambio de rol desde configuración: ${nextRole}`,
      });

      if (error || !data?.ok) {
        throw new Error(error?.message || data?.message || 'No se pudo cambiar el rol.');
      }

      await loadData();
      await showSuccessAlert({
        title: 'Rol actualizado',
        text: `El rol fue actualizado a ${getAdminRoleLabel(nextRole)}.`,
      });
    } catch (error) {
      await showErrorAlert({
        title: 'No se pudo cambiar el rol',
        text: error.message || 'Ocurrió un error al actualizar el rol.',
      });
    } finally {
      setAdminActionUserId('');
    }
  };

  const toggleAdminActive = async (item) => {
    const actionLabel = item.is_active ? 'desactivar' : 'reactivar';
    const confirmed = await showConfirmAlert({
      title: `¿Deseas ${actionLabel} este admin?`,
      text: item.is_active
        ? 'Perderá acceso al portal administrativo hasta que sea reactivado.'
        : 'Recuperará acceso al portal administrativo.',
      confirmButtonText: item.is_active ? 'Sí, desactivar' : 'Sí, reactivar',
      cancelButtonText: 'Cancelar',
    });

    if (!confirmed) return;

    let note = null;
    if (item.is_active) {
      note = await showTextareaConfirmAlert({
        title: 'Motivo de desactivación',
        text: 'Registra una nota corta para la auditoría.',
        inputLabel: 'Motivo',
        inputPlaceholder: 'Ejemplo: cambio de equipo o salida del proceso',
        confirmButtonText: 'Desactivar admin',
      });
      if (note === null) return;
    }

    try {
      setAdminActionUserId(item.user_id);
      const rpcName = item.is_active ? 'admin_deactivate_portal_admin' : 'admin_reactivate_portal_admin';
      const { data, error } = await supabase.rpc(rpcName, {
        p_target_user_id: item.user_id,
        p_note: note,
      });

      if (error || !data?.ok) {
        throw new Error(error?.message || data?.message || `No se pudo ${actionLabel} el administrador.`);
      }

      await loadData();
      await showSuccessAlert({
        title: item.is_active ? 'Administrador desactivado' : 'Administrador reactivado',
        text: `${item.nombre_completo || item.email || 'El administrador'} fue ${item.is_active ? 'desactivado' : 'reactivado'} correctamente.`,
      });
    } catch (error) {
      await showErrorAlert({
        title: `No se pudo ${actionLabel}`,
        text: error.message || 'Ocurrió un error en la operación.',
      });
    } finally {
      setAdminActionUserId('');
    }
  };

  const newsPreviewSrc = newsImagePreview || newsForm.image_url;
  const canManageAdmins = currentAdmin?.role === 'super_admin';

  return (
    <div className="space-y-6">
      <section className="bg-white border border-border rounded-2xl p-6">
        <h2 className="text-xl font-black text-primary">Configuración Portal Beneficiarios</h2>
        <p className="text-sm text-slate-600 mt-1">Administra reglas, noticias y modal informativo. Las ventanas de actualización se gestionan en el módulo de Actualizaciones.</p>
      </section>

      <section className="bg-white border border-border rounded-2xl p-6 space-y-3">
        <h3 className="font-bold text-primary">Reglas globales</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Promedio mínimo" value={config.promedio_minimo} onChange={(value) => setConfig((prev) => ({ ...prev, promedio_minimo: value }))} />
          <Field label="Vigencia certificado bancario (días)" value={config.cert_bancario_max_dias} onChange={(value) => setConfig((prev) => ({ ...prev, cert_bancario_max_dias: value }))} />
        </div>
        <button type="button" onClick={saveConfig} disabled={configSaving} className="bg-secondary text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50">{configSaving ? 'Guardando...' : 'Guardar reglas'}</button>
      </section>

      <section className="bg-white border border-border rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="font-bold text-primary">Administradores del portal</h3>
          <p className="text-sm text-slate-600 mt-1">
            Alta y revocación de acceso administrativo. Para registrar un nuevo admin, el usuario debe haber iniciado sesión al menos una vez con Google.
          </p>
        </div>

        {canManageAdmins ? (
          <div className="border border-secondary/20 bg-secondary/5 rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2 text-secondary text-sm font-semibold">
              <UserPlus size={16} /> Alta o reactivación de admin
            </div>
            <div className="space-y-2">
              <label className="grid gap-1">
                <span className="text-xs uppercase font-bold text-slate-500">Buscar usuario del sistema</span>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={adminUserQuery}
                    onChange={(event) => {
                      setAdminUserQuery(event.target.value);
                      setSelectedAdminCandidateId('');
                    }}
                    placeholder="Busca por correo o nombre (mínimo 2 caracteres)"
                    className="w-full border border-border rounded-lg pl-9 pr-9 py-2 text-sm bg-white"
                  />
                  {adminCandidateLoading && (
                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
                  )}
                </div>
              </label>

              {adminUserCandidates.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {adminUserCandidates.map((candidate) => {
                    const isSelected = selectedAdminCandidateId === String(candidate.user_id || '');
                    const candidateRole = candidate.admin_role === 'super_admin' ? 'Super admin' : 'Admin';
                    const candidateStatus = candidate.is_portal_admin
                      ? candidate.admin_is_active
                        ? `${candidateRole} activo`
                        : `${candidateRole} inactivo`
                      : 'Sin rol admin';

                    return (
                      <button
                        key={candidate.user_id}
                        type="button"
                        onClick={() => applyCandidateToForm(candidate)}
                        className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 transition ${isSelected ? 'bg-secondary/10' : ''}`}
                      >
                        <p className="text-sm font-semibold text-slate-800 truncate">{candidate.nombre_sugerido || candidate.email || 'Usuario'}</p>
                        <p className="text-xs text-slate-500 truncate">{candidate.email || 'Sin correo'} · {candidateStatus}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Correo del usuario" type="email" value={adminForm.email} onChange={(value) => setAdminForm((prev) => ({ ...prev, email: value }))} />
              <Field label="Nombre completo (opcional)" value={adminForm.nombre_completo} onChange={(value) => setAdminForm((prev) => ({ ...prev, nombre_completo: value }))} />
              <SelectField label="Rol" value={adminForm.role} onChange={(value) => setAdminForm((prev) => ({ ...prev, role: value }))} options={ADMIN_ROLE_OPTIONS} renderOptionLabel={getAdminRoleLabel} />
              <Field label="Nota interna (opcional)" value={adminForm.notes} onChange={(value) => setAdminForm((prev) => ({ ...prev, notes: value }))} />
            </div>
            <button type="button" onClick={createOrActivateAdmin} disabled={adminSaving} className="inline-flex items-center gap-2 bg-secondary text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50">
              <UserPlus size={16} /> {adminSaving ? 'Guardando admin...' : 'Guardar admin'}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Solo un super admin puede crear, cambiar rol o desactivar administradores.
          </div>
        )}

        <div className="space-y-2">
          {adminUsers.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no hay administradores registrados.</p>
          ) : (
            adminUsers.map((item) => {
              const isCurrentUser = currentAdmin?.user_id === item.user_id;
              const isBusy = adminActionUserId === item.user_id;
              return (
                <div key={item.user_id} className={`border rounded-2xl px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${item.is_active ? 'border-border bg-white' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-primary truncate">{item.nombre_completo || item.email || item.user_id}</p>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${item.role === 'super_admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                        {item.role === 'super_admin' ? <ShieldCheck size={12} /> : <ShieldX size={12} />}
                        {getAdminRoleLabel(item.role)}
                      </span>
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${item.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                        {item.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                      {isCurrentUser && (
                        <span className="inline-flex px-2 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">Tu cuenta</span>
                      )}
                    </div>
                    <p className="text-slate-600 text-sm truncate mt-1">{item.email || 'Sin correo registrado'}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Alta: {formatDateTime(item.created_at)} · Última actualización: {formatDateTime(item.updated_at)}
                      {item.deactivated_at ? ` · Desactivado: ${formatDateTime(item.deactivated_at)}` : ''}
                    </p>
                    {item.notes && <p className="text-xs text-slate-500 mt-1 truncate">Nota: {item.notes}</p>}
                  </div>

                  {canManageAdmins && !isCurrentUser && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <select
                        value={item.role || 'admin'}
                        onChange={(event) => updateAdminRole(item.user_id, event.target.value)}
                        disabled={isBusy}
                        className="border border-border rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50"
                      >
                        {ADMIN_ROLE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{getAdminRoleLabel(option)}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => toggleAdminActive(item)}
                        disabled={isBusy}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${item.is_active ? 'border border-red-200 text-red-600 hover:bg-red-50' : 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}
                      >
                        {isBusy ? 'Procesando...' : item.is_active ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="bg-white border border-border rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="font-bold text-primary">Beneficiarios autorizados</h3>
          <p className="text-sm text-slate-600 mt-1">Registra el correo autorizado. Cuando el estudiante ingrese con Google usando ese mismo correo, el portal lo vinculará automáticamente.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Radicado" value={beneficiarioForm.radicado_inscripcion} onChange={(value) => setBeneficiarioForm((prev) => ({ ...prev, radicado_inscripcion: value }))} />
          <Field label="Nombre completo" value={beneficiarioForm.nombre_completo} onChange={(value) => setBeneficiarioForm((prev) => ({ ...prev, nombre_completo: value }))} />
          <Field label="Correo autorizado" type="email" value={beneficiarioForm.email} onChange={(value) => setBeneficiarioForm((prev) => ({ ...prev, email: value }))} />
          <Field label="Número documento" value={beneficiarioForm.n_documento} onChange={(value) => setBeneficiarioForm((prev) => ({ ...prev, n_documento: value }))} />
          <SelectField label="Tipo documento" value={beneficiarioForm.tipo_documento} onChange={(value) => setBeneficiarioForm((prev) => ({ ...prev, tipo_documento: value }))} options={['CC', 'TI', 'CE', 'PAS']} />
          <Field label="Teléfono" value={beneficiarioForm.telefono} onChange={(value) => setBeneficiarioForm((prev) => ({ ...prev, telefono: value }))} />
          <Field label="Dirección" value={beneficiarioForm.direccion} onChange={(value) => setBeneficiarioForm((prev) => ({ ...prev, direccion: value }))} />
          <Field label="Semestre actual" value={beneficiarioForm.semestre_actual} onChange={(value) => setBeneficiarioForm((prev) => ({ ...prev, semestre_actual: value }))} />
          <SelectField
            label="Estado"
            value={beneficiarioForm.estado_beneficiario}
            onChange={(value) => setBeneficiarioForm((prev) => ({ ...prev, estado_beneficiario: value }))}
            options={['activo', 'suspendido', 'retirado', 'condonado', 'egresado']}
          />
        </div>

        <button type="button" onClick={createBeneficiario} disabled={beneficiarioSaving} className="bg-secondary text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50">
          {beneficiarioSaving ? 'Guardando beneficiario...' : 'Registrar beneficiario'}
        </button>

        <div className="space-y-2">
          {beneficiarios.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no hay beneficiarios cargados en el portal.</p>
          ) : (
            beneficiarios.map((item) => (
              <div key={item.id} className="border border-border rounded-xl px-4 py-3 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-primary truncate">{item.nombre_completo || 'Sin nombre'}</p>
                  <p className="text-slate-600 truncate">{item.email || 'Sin correo'} · {item.n_documento || 'Sin documento'}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Estado: {item.estado_beneficiario || 'No definido'} · Semestre: {item.semestre_actual || 'No definido'} · Vinculación: {item.auth_user_id ? 'Activa' : 'Pendiente'}
                  </p>
                </div>

                {item.auth_user_id && (
                  <button
                    type="button"
                    onClick={() => releaseBeneficiarioAccess(item.id)}
                    className="shrink-0 border border-border rounded-lg px-3 py-2 font-semibold text-secondary hover:bg-slate-50"
                  >
                    Liberar vínculo
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* NOTICIAS – Administración completa                            */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-white border border-border rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-primary">Noticias del portal</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Las noticias se muestran en la página pública de login y en el home del portal. Usa las flechas para cambiar el orden.
            </p>
          </div>
          {!newsFormOpen && (
            <button
              type="button"
              onClick={openCreateNews}
              className="shrink-0 inline-flex items-center gap-2 bg-secondary text-white px-4 py-2 rounded-xl font-semibold text-sm"
            >
              <Plus size={15} /> Nueva noticia
            </button>
          )}
        </div>

        {/* Formulario crear / editar */}
        {newsFormOpen && (
          <div className="border border-secondary/30 bg-secondary/5 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-secondary text-sm">
                {editNewsId ? 'Editar noticia' : 'Nueva noticia'}
              </h4>
              <button type="button" onClick={cancelNewsForm} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <Field
                label="Título *"
                value={newsForm.title}
                onChange={(v) => setNewsForm((p) => ({ ...p, title: v }))}
              />
              <label className="grid gap-1">
                <span className="text-xs uppercase font-bold text-slate-500">Imagen de la noticia</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleNewsImageFileChange}
                  className="border border-border rounded-lg px-3 py-2 text-sm bg-white"
                />
                <span className="text-[11px] text-slate-400">Formatos: JPG, PNG, WEBP · Máximo {NEWS_IMAGE_MAX_MB}MB</span>
              </label>
              <Field
                label="Texto del botón"
                value={newsForm.button_label}
                onChange={(v) => setNewsForm((p) => ({ ...p, button_label: v }))}
              />
              <Field
                label="URL del botón"
                value={newsForm.button_url}
                onChange={(v) => setNewsForm((p) => ({ ...p, button_url: v }))}
              />
            </div>

            <label className="grid gap-1">
              <span className="text-xs uppercase font-bold text-slate-500">Resumen (se muestra en la tarjeta)</span>
              <textarea
                value={newsForm.summary}
                onChange={(e) => setNewsForm((p) => ({ ...p, summary: e.target.value }))}
                className="border border-border rounded-lg px-3 py-2 text-sm"
                rows={2}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs uppercase font-bold text-slate-500">Contenido completo (opcional)</span>
              <textarea
                value={newsForm.content}
                onChange={(e) => setNewsForm((p) => ({ ...p, content: e.target.value }))}
                className="border border-border rounded-lg px-3 py-2 text-sm"
                rows={4}
              />
            </label>

            {newsPreviewSrc && (
              <div className="rounded-xl overflow-hidden border border-border w-full max-h-40">
                <img
                  src={newsPreviewSrc}
                  alt="Preview"
                  className="w-full h-40 object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            )}

            {(newsForm.image_url || newsImageFile) && (
              <button
                type="button"
                onClick={() => {
                  setNewsImageFile(null);
                  setNewsForm((prev) => ({ ...prev, image_url: '' }));
                }}
                className="w-fit text-xs font-semibold text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50"
              >
                Quitar imagen
              </button>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={saveNews}
                disabled={newsSaving}
                className="bg-secondary text-white px-5 py-2 rounded-xl font-bold text-sm disabled:opacity-50"
              >
                {newsSaving ? 'Guardando...' : editNewsId ? 'Guardar cambios' : 'Publicar noticia'}
              </button>
              <button
                type="button"
                onClick={cancelNewsForm}
                className="border border-border px-4 py-2 rounded-xl font-semibold text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Lista de noticias */}
        {newsLoading && (
          <p className="text-xs text-slate-500 animate-pulse">Actualizando...</p>
        )}

        {!newsLoading && news.length === 0 && (
          <p className="text-sm text-slate-500 py-2">Aún no hay noticias publicadas.</p>
        )}

        <div className="space-y-2">
          {news.map((item, index) => (
            <div
              key={item.id}
              className={`border rounded-2xl px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 transition-opacity ${
                item.is_active ? 'border-border bg-white' : 'border-border bg-slate-50 opacity-60'
              }`}
            >
              {/* Orden */}
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  type="button"
                  disabled={index === 0 || newsLoading}
                  onClick={() => moveNews(index, -1)}
                  className="p-1 rounded-lg border border-border hover:bg-slate-100 disabled:opacity-30"
                  title="Subir"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  disabled={index === news.length - 1 || newsLoading}
                  onClick={() => moveNews(index, 1)}
                  className="p-1 rounded-lg border border-border hover:bg-slate-100 disabled:opacity-30"
                  title="Bajar"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              {/* Imagen miniatura */}
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt=""
                  className="w-16 h-12 rounded-xl object-cover border border-border shrink-0"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <div className="w-16 h-12 rounded-xl bg-slate-100 border border-border shrink-0" />
              )}

              {/* Datos */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-primary text-sm truncate">{item.title || 'Sin título'}</p>
                <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                  {item.summary || item.content || 'Sin descripción'}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Orden: #{item.sort_order ?? '—'} ·{' '}
                  {item.is_active
                    ? <span className="text-green-600 font-semibold">Visible</span>
                    : <span className="text-slate-400">Oculta</span>
                  }
                </p>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleNewsActive(item)}
                  className="p-2 rounded-lg border border-border hover:bg-slate-50"
                  title={item.is_active ? 'Ocultar' : 'Mostrar'}
                >
                  {item.is_active ? <EyeOff size={15} className="text-slate-500" /> : <Eye size={15} className="text-secondary" />}
                </button>
                <button
                  type="button"
                  onClick={() => openEditNews(item)}
                  className="p-2 rounded-lg border border-border hover:bg-slate-50"
                  title="Editar"
                >
                  <Edit2 size={15} className="text-primary" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteNews(item.id)}
                  className="p-2 rounded-lg border border-red-200 hover:bg-red-50"
                  title="Eliminar"
                >
                  <Trash2 size={15} className="text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-border rounded-2xl p-6 space-y-3">
        <h3 className="font-bold text-primary">Modal importante al iniciar</h3>
        <Field label="Título" value={modalForm.title} onChange={(value) => setModalForm((prev) => ({ ...prev, title: value }))} />
        <label className="grid gap-1">
          <span className="text-xs uppercase font-bold text-slate-500">Contenido</span>
          <textarea value={modalForm.content} onChange={(event) => setModalForm((prev) => ({ ...prev, content: event.target.value }))} className="border border-border rounded-lg px-3 py-2" rows={4} />
        </label>
        <Field label="Prioridad" value={modalForm.priority} onChange={(value) => setModalForm((prev) => ({ ...prev, priority: value }))} />
        <button type="button" onClick={createModal} className="bg-secondary text-white px-4 py-2 rounded-lg font-semibold">Publicar modal</button>
      </section>

    </div>
  );
};

const Field = ({ label, value, onChange, type = 'text' }) => (
  <label className="grid gap-1">
    <span className="text-xs uppercase font-bold text-slate-500">{label}</span>
    <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="border border-border rounded-lg px-3 py-2" />
  </label>
);

const SelectField = ({ label, value, onChange, options = [], renderOptionLabel }) => (
  <label className="grid gap-1">
    <span className="text-xs uppercase font-bold text-slate-500">{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} className="border border-border rounded-lg px-3 py-2 bg-white">
      {options.map((option) => (
        <option key={option} value={option}>{renderOptionLabel ? renderOptionLabel(option) : option}</option>
      ))}
    </select>
  </label>
);

export default PortalConfig;
