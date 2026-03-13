import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BellRing,
  CheckCircle,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Search,
  XCircle,
} from 'lucide-react';
import { showErrorAlert, showSuccessAlert } from '../lib/alerts';
import { getSafeSession, supabase } from '../lib/supabase';
import DocViewerModal from '../components/DocViewerModal';

// ─── helpers ─────────────────────────────────────────────────────────────────

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO');
};

const estadoClassName = (status) => {
  if (status === 'aprobada') return 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200';
  if (status === 'en_revision') return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200';
  if (status === 'rechazada') return 'bg-red-100 text-red-700 ring-1 ring-red-200';
  return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
};

const estadoLabel = (status) => {
  if (status === 'aprobada') return 'Aprobada';
  if (status === 'en_revision') return 'En revisión';
  if (status === 'rechazada') return 'Rechazada';
  return status || '—';
};

// ─── MetricCard ──────────────────────────────────────────────────────────────

const MetricCard = ({ title, value, icon, tone }) => (
  <div className={`${tone} rounded-2xl p-4 flex items-center gap-3 shadow-sm`}>
    <div className="p-2 bg-white rounded-xl shadow-sm">{icon}</div>
    <div>
      <p className="text-xs text-slate-500">{title}</p>
      <p className="text-2xl font-black text-slate-800">{value}</p>
    </div>
  </div>
);

// ─── DocRow ───────────────────────────────────────────────────────────────────

const DOC_LABELS = {
  certificado_bancario: 'Certificado bancario',
  certificado_notas: 'Certificado de notas',
  certificado_matricula: 'Certificado de matrícula',
};

const DocRow = ({ doc, onView }) => (
  <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
    <span className="text-sm text-slate-700">{DOC_LABELS[doc.tipo_documento] || doc.tipo_documento}</span>
    <button
      onClick={() => onView(doc)}
      className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
    >
      <Eye size={14} />
      Ver
    </button>
  </div>
);

// ─── UpdateModal ─────────────────────────────────────────────────────────────

const UPDATE_STATUS_OPTIONS = ['en_revision', 'aprobada', 'rechazada'];

const UpdateModal = ({ update, beneficiario, ventana, adminUsers, onClose, onSaved }) => {
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [reviewEstado, setReviewEstado] = useState(update.estado || 'en_revision');
  const [reviewObs, setReviewObs] = useState(update.observacion_admin || '');
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [assigningReviewer, setAssigningReviewer] = useState(false);
  const [reviewerUserId, setReviewerUserId] = useState(update.revisor_asignado_user_id || '');
  const [viewingDoc, setViewingDoc] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetchDocs = async () => {
      setLoadingDocs(true);
      try {
        const { data } = await supabase
          .from('portal_actualizacion_documentos')
          .select('*')
          .eq('actualizacion_id', update.id)
          .order('created_at', { ascending: false });
        if (mounted) setDocs(Array.isArray(data) ? data : []);
      } catch {
        if (mounted) setDocs([]);
      } finally {
        if (mounted) setLoadingDocs(false);
      }
    };
    fetchDocs();
    return () => { mounted = false; };
  }, [update.id]);

  const payload = update.payload_formulario || {};

  const persistReview = async () => {
    if (reviewEstado === 'rechazada' && !String(reviewObs || '').trim()) {
      await showErrorAlert({ title: 'Observación requerida', text: 'Al rechazar una actualización debes indicar el motivo.' });
      return { ok: false };
    }

    try {
      const { session } = await getSafeSession();
      const { error } = await supabase
        .from('portal_actualizaciones')
        .update({
          estado: reviewEstado,
          observacion_admin: String(reviewObs || '').trim() || null,
          revisado_por_user_id: session?.user?.id || null,
          revisado_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', update.id);
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || 'Ocurrió un error.' };
    }
  };

  const saveReview = async () => {
    setSaving(true);
    try {
      const result = await persistReview();
      if (!result.ok) {
        await showErrorAlert({ title: 'Error al guardar', text: result.error || 'No se pudo guardar la revisión.' });
        return;
      }

      await showSuccessAlert({ title: 'Revisión guardada', text: 'El estado de la actualización fue actualizado.' });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const notifyBeneficiario = async () => {
    if (!beneficiario?.email) {
      await showErrorAlert({ title: 'Sin correo', text: 'El beneficiario no tiene correo registrado para notificar.' });
      return;
    }

    setNotifying(true);
    setNotifyMessage('');
    try {
      const reviewResult = await persistReview();
      if (!reviewResult.ok) {
        await showErrorAlert({ title: 'No se pudo preparar la notificación', text: reviewResult.error || 'No se pudo guardar la revisión.' });
        return;
      }

      const { session } = await getSafeSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error('No hay sesión activa de administrador. Inicia sesión de nuevo.');
      }

      const payload = {
        email: String(beneficiario.email || '').trim().toLowerCase(),
        nombre_estudiante: beneficiario.nombre_completo || 'Estudiante',
        numero_peticion: `ACT-${update.id}`,
        estado: estadoLabel(reviewEstado),
        nota: String(reviewObs || '').trim(),
        portal_url: `${window.location.origin}/beneficiario/login`,
      };

      const { data, error } = await supabase.functions.invoke('notify-beneficiario-novedad', {
        body: payload,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (error) {
        throw new Error(error.message || 'No se pudo invocar la función de notificación.');
      }

      if (!data?.ok) {
        throw new Error(data?.message || 'La notificación no pudo ser enviada.');
      }

      setNotifyMessage('Notificación enviada al beneficiario correctamente.');
      await showSuccessAlert({
        title: 'Notificación enviada',
        text: `Se envió correo a ${beneficiario.email} con el estado ${estadoLabel(reviewEstado)}.`,
      });
      onSaved();
    } catch (err) {
      const detail = err?.message || 'No se pudo enviar la notificación.';
      setNotifyMessage(detail);
      await showErrorAlert({ title: 'Error al notificar', text: detail });
    } finally {
      setNotifying(false);
    }
  };

  const assignReviewer = async () => {
    if (!reviewerUserId) {
      await showErrorAlert({ title: 'Revisor requerido', text: 'Selecciona un administrador revisor.' });
      return;
    }

    setAssigningReviewer(true);
    try {
      const { data, error } = await supabase.rpc('asignar_revisor_actualizacion', {
        p_actualizacion_id: update.id,
        p_revisor_user_id: reviewerUserId,
        p_note: 'Asignación desde panel de actualizaciones',
      });

      if (error || !data?.ok) {
        throw new Error(error?.message || data?.message || 'No se pudo asignar el revisor.');
      }

      await showSuccessAlert({
        title: 'Revisor asignado',
        text: 'La asignación quedó registrada en historial.',
      });
      onSaved();
    } catch (err) {
      await showErrorAlert({
        title: 'No se pudo asignar',
        text: err?.message || 'Ocurrió un error al asignar el revisor.',
      });
    } finally {
      setAssigningReviewer(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 rounded-t-3xl flex items-start justify-between z-10">
          <div>
            <h2 className="text-lg font-black text-slate-800">Detalle de actualización #{update.id}</h2>
            <p className="text-sm text-slate-500">{formatDateTime(update.created_at)}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl font-bold leading-none mt-1"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Beneficiario info */}
          <section className="bg-slate-50 rounded-2xl p-4 space-y-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Beneficiario</p>
            <p className="font-bold text-slate-800">{beneficiario?.nombre_completo || '—'}</p>
            <p className="text-sm text-slate-500">{beneficiario?.n_documento || '—'} · {beneficiario?.email || '—'}</p>
            {ventana?.nombre && (
              <p className="text-sm text-slate-500">Ventana: <span className="font-medium">{ventana.nombre}</span></p>
            )}
            <Link
              to={`/admin/beneficiarios/${beneficiario?.id}`}
              onClick={onClose}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium mt-1"
            >
              Ver ficha 360 <ChevronRight size={12} />
            </Link>
          </section>

          {/* Datos enviados */}
          <section>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Datos de la actualización</p>
            <div className="grid grid-cols-2 gap-3">
              <DataField label="Semestre actual" value={update.semestre_actual ?? payload.semestre_actual} />
              <DataField label="Promedio semestre anterior" value={update.promedio_semestre_anterior ?? payload.promedio_semestre_anterior} />
              <DataField label="Correo reportado" value={update.email || payload.email} />
              <DataField label="Teléfono reportado" value={update.telefono || payload.telefono} />
              <DataField label="Dirección reportada" value={update.direccion || payload.direccion} />
            </div>

            {/* Datos adicionales del payload */}
            {Object.keys(payload).length > 0 && (
              <details className="mt-3">
                <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700 font-medium">
                  Ver datos completos del formulario
                </summary>
                <pre className="mt-2 bg-slate-50 rounded-xl p-3 text-xs text-slate-600 overflow-x-auto whitespace-pre-wrap break-words">
                  {JSON.stringify(payload, null, 2)}
                </pre>
              </details>
            )}
          </section>

          {/* Documentos */}
          <section>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Documentos adjuntos</p>
            {loadingDocs ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin" /> Cargando…
              </div>
            ) : docs.length === 0 ? (
              <p className="text-sm text-slate-400">Sin documentos adjuntos.</p>
            ) : (
              <div className="bg-slate-50 rounded-2xl px-4 py-1">
                {docs.map((doc) => <DocRow key={doc.id} doc={doc} onView={setViewingDoc} />)}
              </div>
            )}
          </section>

          {/* Revisión admin */}
          <section className="border border-slate-200 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Revisión administrativa</p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Admin revisor asignado</label>
              <div className="flex items-center gap-2">
                <select
                  value={reviewerUserId}
                  onChange={(e) => setReviewerUserId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
                >
                  <option value="">Selecciona admin...</option>
                  {(adminUsers || []).map((admin) => (
                    <option key={admin.user_id} value={admin.user_id}>
                      {admin.user_id.slice(0, 8)}...{admin.user_id.slice(-4)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={assignReviewer}
                  disabled={assigningReviewer || saving || notifying}
                  className="px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold disabled:opacity-50"
                >
                  {assigningReviewer ? '...' : 'Asignar'}
                </button>
              </div>
            </div>
            {update.revisado_at && (
              <p className="text-xs text-slate-500">
                Última revisión: {formatDateTime(update.revisado_at)}
              </p>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
              <select
                value={reviewEstado}
                onChange={(e) => setReviewEstado(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
              >
                {UPDATE_STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{estadoLabel(opt)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Observación {reviewEstado === 'rechazada' ? <span className="text-red-500">*</span> : '(opcional)'}
              </label>
              <textarea
                rows={3}
                value={reviewObs}
                onChange={(e) => setReviewObs(e.target.value)}
                placeholder="Escribe aquí las observaciones de la revisión..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-secondary"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={saveReview}
                disabled={saving || notifying}
                className="flex items-center gap-2 bg-secondary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-secondary/90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Guardar revisión
              </button>
              <button
                onClick={notifyBeneficiario}
                disabled={saving || notifying}
                className="flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-xl text-sm font-semibold hover:brightness-110 disabled:opacity-50"
              >
                {notifying ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />}
                Notificar beneficiario
              </button>
            </div>
            {notifyMessage && (
              <p className={`text-xs ${notifyMessage.includes('correctamente') ? 'text-emerald-600' : 'text-red-600'}`}>
                {notifyMessage}
              </p>
            )}
          </section>
        </div>
      </div>

      {viewingDoc && (
        <DocViewerModal doc={viewingDoc} onClose={() => setViewingDoc(null)} />
      )}
    </div>
  );
};

const DataField = ({ label, value }) => (
  <div className="bg-white border border-slate-100 rounded-xl px-3 py-2">
    <p className="text-xs text-slate-400">{label}</p>
    <p className="text-sm font-medium text-slate-800 truncate">{value !== undefined && value !== null && value !== '' ? String(value) : '—'}</p>
  </div>
);

// ─── AdminActualizaciones ────────────────────────────────────────────────────

const AdminActualizaciones = () => {
  const [rows, setRows] = useState([]);
  const [ventanas, setVentanas] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [beneficiariosMap, setBeneficiariosMap] = useState({});
  const [ventanasMap, setVentanasMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('all');
  const [ventanaFilter, setVentanaFilter] = useState('all');
  const [selectedRow, setSelectedRow] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ data: updatesData }, { data: benefData }, { data: ventData }, { data: adminsData }] = await Promise.all([
        supabase
          .from('portal_actualizaciones')
          .select('id,beneficiario_id,ventana_id,estado,semestre_actual,promedio_semestre_anterior,observacion_admin,revisado_at,created_at,updated_at,payload_formulario,email,telefono,direccion,revisado_por_user_id,revisor_asignado_user_id,revisor_asignado_at')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('portal_beneficiarios')
          .select('id,nombre_completo,n_documento,email,estado_beneficiario')
          .limit(1000),
        supabase
          .from('portal_ventanas_actualizacion')
          .select('id,nombre,fecha_inicio,fecha_fin')
          .order('fecha_inicio', { ascending: false }),
        supabase
          .from('portal_admin_users')
          .select('user_id,created_at')
          .order('created_at', { ascending: true }),
      ]);

      setRows(Array.isArray(updatesData) ? updatesData : []);
      setVentanas(Array.isArray(ventData) ? ventData : []);
      setAdminUsers(Array.isArray(adminsData) ? adminsData : []);

      const bMap = {};
      (benefData || []).forEach((b) => { bMap[b.id] = b; });
      setBeneficiariosMap(bMap);

      const vMap = {};
      (ventData || []).forEach((v) => { vMap[v.id] = v; });
      setVentanasMap(vMap);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return rows.filter((item) => {
      const b = beneficiariosMap[item.beneficiario_id];
      if (estadoFilter !== 'all' && item.estado !== estadoFilter) return false;
      if (ventanaFilter !== 'all' && String(item.ventana_id || '') !== ventanaFilter) return false;
      if (!query) return true;
      return [b?.nombre_completo, b?.n_documento, b?.email]
        .map((v) => String(v || '').toLowerCase())
        .some((v) => v.includes(query));
    });
  }, [rows, searchTerm, estadoFilter, ventanaFilter, beneficiariosMap]);

  const metrics = useMemo(() => {
    return rows.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.estado === 'en_revision') acc.en_revision += 1;
        if (item.estado === 'aprobada') acc.aprobadas += 1;
        if (item.estado === 'rechazada') acc.rechazadas += 1;
        return acc;
      },
      { total: 0, en_revision: 0, aprobadas: 0, rechazadas: 0 }
    );
  }, [rows]);

  const handleSaved = () => {
    setSelectedRow(null);
    loadData();
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-2xl font-black text-slate-800">Actualizaciones</h2>
        <p className="text-sm text-slate-500 mt-1">
          Todas las actualizaciones periódicas enviadas por los beneficiarios. Filtra por periodo, estado o busca por nombre/documento.
        </p>
      </section>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total"
          value={metrics.total}
          icon={<FileText size={18} className="text-blue-600" />}
          tone="bg-blue-50"
        />
        <MetricCard
          title="En revisión"
          value={metrics.en_revision}
          icon={<Clock size={18} className="text-amber-500" />}
          tone="bg-amber-50"
        />
        <MetricCard
          title="Aprobadas"
          value={metrics.aprobadas}
          icon={<CheckCircle size={18} className="text-emerald-600" />}
          tone="bg-emerald-50"
        />
        <MetricCard
          title="Rechazadas"
          value={metrics.rechazadas}
          icon={<XCircle size={18} className="text-red-500" />}
          tone="bg-red-50"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, documento o correo…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary"
          />
        </div>
        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
        >
          <option value="all">Todos los estados</option>
          <option value="en_revision">En revisión</option>
          <option value="aprobada">Aprobada</option>
          <option value="rechazada">Rechazada</option>
        </select>
        <select
          value={ventanaFilter}
          onChange={(e) => setVentanaFilter(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
        >
          <option value="all">Todos los periodos</option>
          {ventanas.map((v) => (
            <option key={v.id} value={String(v.id)}>{v.nombre}</option>
          ))}
        </select>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Cargando actualizaciones…</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <FileText size={32} strokeWidth={1.5} />
            <p className="text-sm">No hay actualizaciones con esos filtros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Beneficiario</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Periodo</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Semestre</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Promedio</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Enviada</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Revisada</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((item) => {
                  const b = beneficiariosMap[item.beneficiario_id];
                  const v = item.ventana_id ? ventanasMap[item.ventana_id] : null;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedRow(item)}
                    >
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-800 truncate max-w-[200px]">{b?.nombre_completo || '—'}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[200px]">{b?.n_documento || '—'}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-slate-700 truncate max-w-[160px]">{v?.nombre || <span className="text-slate-400">Sin periodo</span>}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-700">{item.semestre_actual ?? '—'}</td>
                      <td className="px-4 py-3 text-center text-slate-700">
                        {item.promedio_semestre_anterior !== null && item.promedio_semestre_anterior !== undefined
                          ? Number(item.promedio_semestre_anterior).toFixed(2)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${estadoClassName(item.estado)}`}>
                          {estadoLabel(item.estado)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(item.created_at)}</td>
                      <td className="px-4 py-3 text-center">
                        {item.revisado_at ? (
                          <CheckCircle size={16} className="text-emerald-500 mx-auto" />
                        ) : (
                          <Clock size={16} className="text-amber-400 mx-auto" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedRow(item); }}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium ml-auto"
                        >
                          <Eye size={14} />
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
              {filteredRows.length} de {rows.length} actualizaciones
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedRow && (
        <UpdateModal
          update={selectedRow}
          beneficiario={beneficiariosMap[selectedRow.beneficiario_id]}
          ventana={selectedRow.ventana_id ? ventanasMap[selectedRow.ventana_id] : null}
          adminUsers={adminUsers}
          onClose={() => setSelectedRow(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default AdminActualizaciones;
