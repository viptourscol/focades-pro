import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  BellRing,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  Eye,
  FileText,
  FileSpreadsheet,
  Keyboard,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  Search,
  StickyNote,
  Users,
  XCircle,
} from 'lucide-react';
import ReviewChecklist from '../components/ReviewChecklist';
import { showErrorAlert, showSuccessAlert } from '../lib/alerts';
import { clearLocalAuthSession, getSafeSession, supabase } from '../lib/supabase';
import DocViewerModal from '../components/DocViewerModal';

// ─── helpers ─────────────────────────────────────────────────────────────────

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO');
};

const getVentanaEstado = (ventana) => {
  if (!ventana) return { key: 'sin_periodo', label: 'Sin periodo', className: 'bg-slate-100 text-slate-600 ring-slate-200' };

  const now = new Date();
  const start = ventana?.fecha_inicio ? new Date(ventana.fecha_inicio) : null;
  const end = ventana?.fecha_fin ? new Date(ventana.fecha_fin) : null;

  if (!ventana.is_active) {
    return { key: 'inactiva', label: 'Inactiva', className: 'bg-slate-100 text-slate-700 ring-slate-200' };
  }

  if (start && now < start) {
    return { key: 'proxima', label: 'Próxima', className: 'bg-blue-100 text-blue-700 ring-blue-200' };
  }

  if (end && now > end) {
    return { key: 'cerrada', label: 'Cerrada', className: 'bg-amber-100 text-amber-700 ring-amber-200' };
  }

  return { key: 'activa', label: 'Activa', className: 'bg-emerald-100 text-emerald-700 ring-emerald-200' };
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

const UpdateModal = ({ update, beneficiario, ventana, adminUsers, convocatoriasMap, onClose, onSaved }) => {
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [reviewEstado, setReviewEstado] = useState(update.estado || 'en_revision');
  
  // Debug: verificar datos de convocatoria
  console.log('🔍 Debug Convocatoria:', {
    beneficiario_id: beneficiario?.id,
    convocatoria_id: beneficiario?.convocatoria_id,
    convocatoriasMap: convocatoriasMap,
    convocatoria_data: beneficiario?.convocatoria_id ? convocatoriasMap[beneficiario.convocatoria_id] : null
  });
  const [reviewObs, setReviewObs] = useState(update.observacion_admin || '');
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [assigningReviewer, setAssigningReviewer] = useState(false);
  const [reviewerUserId, setReviewerUserId] = useState(update.revisor_asignado_user_id || '');
  const [viewingDoc, setViewingDoc] = useState(null);
  const [reviewChecklist, setReviewChecklist] = useState(update.checklist_revision || {});
  const [notasAdmin, setNotasAdmin] = useState(() => {
    try { return localStorage.getItem(`notas_actualizacion_${update?.id}`) || ''; }
    catch { return ''; }
  });
  const [notasSaved, setNotasSaved] = useState(false);

  // Cargar checklist desde BD
  useEffect(() => {
    console.log('🔄 Cargando checklist desde update:', {
      update_id: update?.id,
      has_checklist_revision: !!update?.checklist_revision,
      checklist_revision_type: typeof update?.checklist_revision,
      checklist_revision: update?.checklist_revision
    });

    if (update?.checklist_revision && typeof update.checklist_revision === 'object') {
      console.log('✅ Cargando checklist desde BD:', update.checklist_revision);
      setReviewChecklist(update.checklist_revision);
    } else {
      console.log('⚠️ No hay checklist guardado, iniciando vacío');
      setReviewChecklist({});
    }
  }, [update?.id, update?.checklist_revision]);

  // Guardar checklist en BD cuando cambia
  useEffect(() => {
    if (!update?.id) return;
    
    const saveChecklistToDB = async () => {
      try {
        console.log('💾 Guardando checklist en BD:', {
          update_id: update.id,
          checklist: reviewChecklist
        });
        
        const { data, error } = await supabase
          .from('portal_actualizaciones')
          .update({
            checklist_revision: reviewChecklist || {},
            updated_at: new Date().toISOString(),
          })
          .eq('id', update.id)
          .select();
        
        if (error) {
          console.error('❌ Error guardando checklist:', error);
        } else {
          console.log('✅ Checklist guardado exitosamente:', data);
        }
      } catch (error) {
        console.error('❌ Error guardando checklist:', error);
      }
    };

    // Debounce para evitar muchas escrituras
    const timeoutId = setTimeout(() => {
      saveChecklistToDB();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [update?.id, reviewChecklist]);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (viewingDoc) return; // otra capa activa
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key.toLowerCase() === 's' && event.ctrlKey) {
        event.preventDefault();
        if (!saving) saveReview();
        return;
      }
      if (event.key.toLowerCase() === 'a' && event.ctrlKey) {
        event.preventDefault();
        if (!saving && reviewEstado !== 'aprobada') { setReviewEstado('aprobada'); }
        return;
      }
      if (event.key.toLowerCase() === 'r' && event.ctrlKey) {
        event.preventDefault();
        if (!saving && reviewEstado !== 'rechazada') { setReviewEstado('rechazada'); }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewingDoc, saving, reviewEstado, onClose]);

  const handleSaveNotasAdmin = () => {
    try {
      localStorage.setItem(`notas_actualizacion_${update?.id}`, notasAdmin);
      setNotasSaved(true);
      window.setTimeout(() => setNotasSaved(false), 1500);
    } catch {}
  };

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

      // Para estados críticos, enviar notificación automática al guardar.
      const shouldAutoNotify = ['rechazada', 'aprobada'].includes(String(reviewEstado || '').toLowerCase());
      if (shouldAutoNotify && beneficiario?.email) {
        await notifyBeneficiario({ skipPersist: true, silentSuccess: true });
      }

      await showSuccessAlert({ title: 'Revisión guardada', text: 'El estado de la actualización fue actualizado.' });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const notifyBeneficiario = async ({ skipPersist = false, silentSuccess = false } = {}) => {
    if (!beneficiario?.email) {
      await showErrorAlert({ title: 'Sin correo', text: 'El beneficiario no tiene correo registrado para notificar.' });
      return;
    }

    setNotifying(true);
    setNotifyMessage('');
    try {
      if (!skipPersist) {
        const reviewResult = await persistReview();
        if (!reviewResult.ok) {
          await showErrorAlert({ title: 'No se pudo preparar la notificación', text: reviewResult.error || 'No se pudo guardar la revisión.' });
          return;
        }
      }

      const { session } = await getSafeSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error('No hay sesión activa de administrador. Inicia sesión de nuevo.');
      }

      // Detectar documentos faltantes si es rechazado
      let documentosFaltantes = [];
      const isRechazada = reviewEstado === 'rechazada';
      if (isRechazada && Array.isArray(docs)) {
        const docsEnviados = new Set(docs.map(d => d.tipo_documento));
        const docsEsperados = ['certificado_bancario', 'certificado_notas', 'certificado_matricula'];
        documentosFaltantes = docsEsperados.filter(d => !docsEnviados.has(d));
      }

      const payload = {
        email: String(beneficiario.email || '').trim().toLowerCase(),
        nombre_estudiante: beneficiario.nombre_completo || 'Estudiante',
        numero_peticion: `ACT-${update.id}`,
        estado: estadoLabel(reviewEstado),
        nota: String(reviewObs || '').trim(),
        portal_url: `${window.location.origin}/beneficiario`,
        beneficiario_id: beneficiario.id,
        actualizacion_id: update.id,
        documentos_faltantes: documentosFaltantes,
        plazo_reenvio: isRechazada ? '7 días' : undefined,
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
      if (!silentSuccess) {
        await showSuccessAlert({
          title: 'Notificación enviada',
          text: `Se envió correo a ${beneficiario.email} con el estado ${estadoLabel(reviewEstado)}.`,
        });
      }
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
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
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

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Beneficiario info */}
          <section className="bg-slate-50 rounded-2xl p-4 space-y-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Beneficiario</p>
            <p className="font-bold text-slate-800">{beneficiario?.nombre_completo || '—'}</p>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>{beneficiario?.n_documento || '—'}</span>
              <span>·</span>
              <span>{beneficiario?.email || '—'}</span>
            </div>
            
            {/* Convocatoria - Siempre mostrar para debug */}
            <div className="flex items-center gap-1.5 pt-1 pb-0.5">
              <div className={`${beneficiario?.convocatoria_id ? 'bg-blue-500' : 'bg-slate-300'} rounded-full w-1.5 h-1.5`}></div>
              <p className="text-xs text-slate-600">
                <span className="font-semibold">Convocatoria:</span>{' '}
                {beneficiario?.convocatoria_id 
                  ? (convocatoriasMap[beneficiario.convocatoria_id]?.nombre || convocatoriasMap[beneficiario.convocatoria_id]?.anio || `ID: ${beneficiario.convocatoria_id}`)
                  : <span className="text-slate-400 italic">Sin asignar</span>
                }
              </p>
            </div>
            
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

          {/* Lista de revisión */}
          <section>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Lista de revisión</p>
            <ReviewChecklist
              aspiranteId={update.id}
              checklist={reviewChecklist}
              onChecklistChange={(newChecklist) => {
                console.log('📝 Checklist cambiado:', newChecklist);
                setReviewChecklist(newChecklist);
              }}
            />
          </section>

          {/* Notas privadas del revisor */}
          <section className="bg-amber-950 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-2">
              <StickyNote size={12} /> Notas privadas del revisor
            </p>
            <textarea
              value={notasAdmin}
              onChange={(e) => setNotasAdmin(e.target.value)}
              placeholder="Escribe tus notas internas sobre esta actualización…"
              rows={3}
              className="w-full bg-amber-900/40 border border-amber-800 rounded-xl px-3 py-2 text-sm text-amber-100 placeholder-amber-700 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <div className="flex items-center justify-between">
              <p className="text-[9px] text-amber-700 uppercase tracking-wider">Solo visible localmente</p>
              <button
                type="button"
                onClick={handleSaveNotasAdmin}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all active:scale-95 ${
                  notasSaved ? 'bg-green-700 text-white' : 'bg-amber-600 hover:bg-amber-500 text-white'
                }`}
              >
                {notasSaved ? '✓ Guardado' : 'Guardar nota'}
              </button>
            </div>
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
                      {admin.nombre_completo || (admin.user_id.slice(0, 8) + '...' + admin.user_id.slice(-4))}
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

        {/* Floating action bar */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-slate-200 px-6 py-3 rounded-b-3xl flex items-center gap-2 flex-wrap">
          <button
            onClick={saveReview}
            disabled={saving || notifying}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 ${
              reviewEstado === 'aprobada'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : reviewEstado === 'rechazada'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-secondary hover:brightness-110 text-white'
            }`}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Guardando…' : `Guardar (${estadoLabel(reviewEstado)})`}
          </button>
          <button
            onClick={() => { setReviewEstado('aprobada'); }}
            disabled={saving || notifying || reviewEstado === 'aprobada'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 transition-all"
          >
            <CheckCircle size={14} /> Aprobar
          </button>
          <button
            onClick={() => { setReviewEstado('rechazada'); }}
            disabled={saving || notifying || reviewEstado === 'rechazada'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 transition-all"
          >
            <XCircle size={14} /> Rechazar
          </button>
          <button
            onClick={notifyBeneficiario}
            disabled={saving || notifying}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-40 transition-all"
          >
            {notifying ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />}
            Notificar
          </button>
          <span className="ml-auto text-[9px] text-slate-300 uppercase tracking-wide hidden sm:block">
            Ctrl+S guardar · Ctrl+A aprobar · Ctrl+R rechazar · Esc cerrar
          </span>
        </div>
      </div>

      {viewingDoc && (
        <DocViewerModal 
          doc={viewingDoc} 
          onClose={() => setViewingDoc(null)}
          allDocs={docs}
          currentIndex={docs.findIndex(d => d.id === viewingDoc.id)}
          onNavigate={(newIndex) => setViewingDoc(docs[newIndex])}
        />
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

const alertaClassName = (tipo) => {
  if (tipo === 'no_enviado') return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200';
  if (tipo === 'rechazada') return 'bg-red-100 text-red-700 ring-1 ring-red-200';
  return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
};

const alertaLabel = (tipo) => {
  if (tipo === 'no_enviado') return 'No enviada';
  if (tipo === 'rechazada') return 'Rechazada';
  return '—';
};

const NOTIFY_TEMPLATES = [
  { code: 'ultimo_aviso', label: 'Último aviso' },
  { code: 'cierre_periodo_sin_pago', label: 'Cierre de periodo / sin pago' },
];

const SUPABASE_FUNCTIONS_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const getFreshAdminAccessToken = async () => {
  // Primero intentamos refrescar para evitar JWT expirado o desincronizado.
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (!refreshError && refreshed?.session?.access_token) {
    const refreshedToken = String(refreshed.session.access_token).trim();
    if (refreshedToken) {
      const { error: refreshedUserError } = await supabase.auth.getUser(refreshedToken);
      if (!refreshedUserError) return refreshedToken;
    }
  }

  const { session } = await getSafeSession();
  const token = String(session?.access_token || '').trim();
  if (token) {
    const { error: userError } = await supabase.auth.getUser(token);
    if (!userError) return token;
  }

  // Ultimo intento: refresh + validación explícita.
  const { data: retryRefreshed } = await supabase.auth.refreshSession();
  const retryToken = String(retryRefreshed?.session?.access_token || '').trim();
  if (retryToken) {
    const { error: retryUserError } = await supabase.auth.getUser(retryToken);
    if (!retryUserError) return retryToken;
  }

  await clearLocalAuthSession();
  throw new Error('Tu sesión expiró o es inválida. Inicia sesión nuevamente para continuar.');
};

const invokeNotifyBulkDirect = async (payload, token) => {
  const response = await fetch(`${SUPABASE_FUNCTIONS_BASE_URL}/notify-bulk-sin-actualizar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text().catch(() => '');
  let parsed = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const remoteMessage = String(parsed?.message || parsed?.error || rawText || '').trim();
    const message = remoteMessage || `Error HTTP ${response.status} al invocar notificación masiva.`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return parsed || {};
};

const ReporteSinActualizarModal = ({ ventanas, onClose }) => {
  const [ventanaId, setVentanaId] = useState('');
  const [query, setQuery] = useState('');
  const [loadingReport, setLoadingReport] = useState(false);
  const [rows, setRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [templateCode, setTemplateCode] = useState(NOTIFY_TEMPLATES[0].code);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const activeWindow = (ventanas || []).find((v) => v?.is_active) || (ventanas || [])[0];
    if (activeWindow?.id) {
      setVentanaId(String(activeWindow.id));
    }
  }, [ventanas]);

  const loadReport = async () => {
    const parsedWindowId = Number(ventanaId);
    if (!Number.isInteger(parsedWindowId) || parsedWindowId <= 0) {
      await showErrorAlert({ title: 'Periodo requerido', text: 'Selecciona un periodo para cargar el reporte.' });
      return;
    }

    setLoadingReport(true);
    setSelectedIds([]);
    try {
      const { data, error } = await supabase.rpc('admin_beneficiarios_sin_actualizar', {
        p_ventana_id: parsedWindowId,
        p_query: String(query || '').trim() || null,
        p_limit: 5000,
      });

      if (error) throw error;
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      await showErrorAlert({
        title: 'No se pudo cargar el reporte',
        text: err?.message || 'No fue posible consultar los beneficiarios sin actualizar.',
      });
    } finally {
      setLoadingReport(false);
    }
  };

  const selectedWindow = useMemo(
    () => (ventanas || []).find((v) => String(v.id) === String(ventanaId)) || null,
    [ventanas, ventanaId]
  );

  const selectedRows = useMemo(() => {
    const selected = new Set(selectedIds);
    return rows.filter((row) => selected.has(row.beneficiario_id));
  }, [rows, selectedIds]);

  const selectedWithEmail = useMemo(
    () => selectedRows.filter((row) => String(row.email || '').includes('@')),
    [selectedRows]
  );

  const toggleSelectAll = () => {
    if (selectedIds.length === rows.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(rows.map((row) => row.beneficiario_id));
  };

  const toggleOne = (beneficiarioId) => {
    setSelectedIds((prev) => {
      if (prev.includes(beneficiarioId)) {
        return prev.filter((id) => id !== beneficiarioId);
      }
      return [...prev, beneficiarioId];
    });
  };

  const exportXlsx = async () => {
    if (!rows.length) {
      await showErrorAlert({ title: 'Sin datos', text: 'Primero carga el reporte para exportar.' });
      return;
    }

    const dataForSheet = rows.map((row) => ({
      beneficiario_id: row.beneficiario_id,
      nombre_completo: row.nombre_completo || '',
      documento: row.n_documento || '',
      email: row.email || '',
      estado_beneficiario: row.estado_beneficiario || '',
      periodo: row.ventana_nombre || '',
      tipo_alerta: alertaLabel(row.tipo_alerta),
      ultimo_estado_actualizacion: row.ultimo_estado_actualizacion || '',
      ultima_actualizacion: row.ultima_actualizacion_at ? formatDateTime(row.ultima_actualizacion_at) : '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataForSheet);
    XLSX.utils.book_append_sheet(wb, ws, 'Sin actualizar');
    const safePeriodName = String(selectedWindow?.nombre || 'periodo').replace(/[^a-zA-Z0-9_-]+/g, '_');
    const fileName = `reporte_sin_actualizar_${safePeriodName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const sendNotifications = async () => {
    const parsedWindowId = Number(ventanaId);
    if (!Number.isInteger(parsedWindowId) || parsedWindowId <= 0) {
      await showErrorAlert({ title: 'Periodo requerido', text: 'Selecciona un periodo antes de notificar.' });
      return;
    }

    if (!selectedIds.length) {
      await showErrorAlert({ title: 'Sin selección', text: 'Selecciona al menos un beneficiario para notificar.' });
      return;
    }

    if (!selectedWithEmail.length) {
      await showErrorAlert({ title: 'Sin correos válidos', text: 'Ningún seleccionado tiene correo válido.' });
      return;
    }

    setSending(true);
    try {
      const token = await getFreshAdminAccessToken();

      const payload = {
        ventana_id: parsedWindowId,
        periodo_nombre: selectedWindow?.nombre || 'Periodo vigente',
        template_code: templateCode,
        recipient_ids: selectedWithEmail.map((row) => row.beneficiario_id),
        portal_url: `${window.location.origin}/beneficiario/login`,
        caller_token: token,
      };

      const data = await invokeNotifyBulkDirect(payload, token);

      if (!data?.ok) {
        const resolvedMessage = String(data?.message || 'La función devolvió un resultado inválido.');
        if (resolvedMessage.toLowerCase().includes('invalid jwt')) {
          await clearLocalAuthSession();
          await showErrorAlert({
            title: 'Sesión expirada',
            text: 'Tu sesión de administrador expiró o es inválida. Te redirigiremos al login para reingresar.',
          });
          window.location.assign('/admin/login');
          return;
        }
        throw new Error(resolvedMessage);
      }

      await showSuccessAlert({
        title: 'Notificaciones enviadas',
        text: `Campaña #${data.campania_id}. Enviados: ${data.enviados}. Fallidos: ${data.fallidos}.`,
      });
    } catch (err) {
      const message = String(err?.message || 'No fue posible enviar las notificaciones.');
      if (message.toLowerCase().includes('invalid jwt')) {
        await clearLocalAuthSession();
        await showErrorAlert({
          title: 'Sesión expirada',
          text: 'Tu sesión de administrador expiró o es inválida. Te redirigiremos al login para reingresar.',
        });
        window.location.assign('/admin/login');
        return;
      }
      await showErrorAlert({
        title: 'Error al notificar',
        text: message,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 rounded-t-3xl flex items-start justify-between z-10">
          <div>
            <h2 className="text-lg font-black text-slate-800">Reporte de beneficiarios sin actualizar</h2>
            <p className="text-sm text-slate-500">
              Incluye beneficiarios activos sin actualización enviada o con última actualización rechazada.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl font-bold leading-none mt-1"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Periodo</label>
              <select
                value={ventanaId}
                onChange={(e) => setVentanaId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
              >
                <option value="">Selecciona periodo...</option>
                {(ventanas || []).map((v) => (
                  <option key={v.id} value={String(v.id)}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-56 flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Buscar</label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nombre, documento o correo"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
              />
            </div>
            <button
              onClick={loadReport}
              disabled={loadingReport}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-bold disabled:opacity-50"
            >
              {loadingReport ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Cargar reporte
            </button>
            <button
              onClick={exportXlsx}
              disabled={loadingReport || !rows.length}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-bold disabled:opacity-50"
            >
              <FileSpreadsheet size={16} /> Exportar XLSX
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-400">Total reporte</p>
              <p className="text-2xl font-black text-slate-800 mt-1">{rows.length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-400">Seleccionados</p>
              <p className="text-2xl font-black text-slate-800 mt-1">{selectedIds.length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-400">Seleccionados con correo válido</p>
              <p className="text-2xl font-black text-slate-800 mt-1">{selectedWithEmail.length}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {loadingReport ? (
              <div className="py-16 flex items-center justify-center gap-2 text-slate-400">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Cargando reporte…</span>
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Users size={28} strokeWidth={1.6} />
                <p className="text-sm">No hay beneficiarios para mostrar.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[650px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={rows.length > 0 && selectedIds.length === rows.length}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Beneficiario</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Documento</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Correo</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Alerta</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Últ. actualización</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => {
                      const checked = selectedIds.includes(row.beneficiario_id);
                      return (
                        <tr key={row.beneficiario_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleOne(row.beneficiario_id)}
                            />
                          </td>
                          <td className="px-4 py-3 text-slate-700 font-medium">{row.nombre_completo || '—'}</td>
                          <td className="px-4 py-3 text-slate-500">{row.n_documento || '—'}</td>
                          <td className="px-4 py-3 text-slate-500">{row.email || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${alertaClassName(row.tipo_alerta)}`}>
                              {alertaLabel(row.tipo_alerta)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {row.ultima_actualizacion_at ? formatDateTime(row.ultima_actualizacion_at) : 'Sin envíos'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-700">
              <AlertTriangle size={16} className="text-amber-500" />
              <p className="text-sm font-medium">Notificación inmediata por plantilla</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-64 flex-1">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Plantilla</label>
                <select
                  value={templateCode}
                  onChange={(e) => setTemplateCode(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
                >
                  {NOTIFY_TEMPLATES.map((tpl) => (
                    <option key={tpl.code} value={tpl.code}>{tpl.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={sendNotifications}
                disabled={sending || !selectedIds.length}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold disabled:opacity-50"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                Enviar notificaciones
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Se registrará auditoría de campaña y estado por destinatario.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── AdminActualizaciones ────────────────────────────────────────────────────

const AdminActualizaciones = () => {
  const [rows, setRows] = useState([]);
  const [ventanas, setVentanas] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [convocatorias, setConvocatorias] = useState([]);
  const [beneficiariosMap, setBeneficiariosMap] = useState({});
  const [ventanasMap, setVentanasMap] = useState({});
  const [convocatoriasMap, setConvocatoriasMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('all');
  const [ventanaFilter, setVentanaFilter] = useState('all');
  const [selectedRow, setSelectedRow] = useState(null);
  const [showReporteModal, setShowReporteModal] = useState(false);
  // Sort
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  // Viewed badge (session-only)
  const [viewedIds, setViewedIds] = useState(new Set());
  // Checkbox batch
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  // Mostrar duplicados históricos
  const [showDuplicates, setShowDuplicates] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ data: updatesData }, { data: benefData }, { data: ventData }, { data: adminsData }, { data: convocData }] = await Promise.all([
        supabase
          .from('portal_actualizaciones')
          .select('id,beneficiario_id,ventana_id,estado,semestre_actual,promedio_semestre_anterior,observacion_admin,revisado_at,created_at,updated_at,payload_formulario,email,telefono,direccion,revisado_por_user_id,revisor_asignado_user_id,revisor_asignado_at,checklist_revision')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('portal_beneficiarios')
          .select('id,nombre_completo,n_documento,email,estado_beneficiario,convocatoria_id')
          .limit(1000),
        supabase
          .from('portal_ventanas_actualizacion')
          .select('id,nombre,fecha_inicio,fecha_fin,is_active')
          .order('fecha_inicio', { ascending: false }),
        supabase
          .from('portal_admin_users')
          .select('user_id,nombre_completo,created_at')
          .eq('is_active', true)
          .order('created_at', { ascending: true }),
        supabase
          .from('convocatorias')
          .select('id,nombre,anio')
          .order('anio', { ascending: false }),
      ]);

      setRows(Array.isArray(updatesData) ? updatesData : []);
      setVentanas(Array.isArray(ventData) ? ventData : []);
      setAdminUsers(Array.isArray(adminsData) ? adminsData : []);
      setConvocatorias(Array.isArray(convocData) ? convocData : []);

      const bMap = {};
      (benefData || []).forEach((b) => { bMap[b.id] = b; });
      setBeneficiariosMap(bMap);

      const vMap = {};
      (ventData || []).forEach((v) => { vMap[v.id] = v; });
      setVentanasMap(vMap);

      const cMap = {};
      (convocData || []).forEach((c) => { cMap[c.id] = c; });
      setConvocatoriasMap(cMap);
      
      // Debug: verificar carga de convocatorias
      console.log('📊 Datos cargados en AdminActualizaciones:', {
        convocatorias: convocData?.length || 0,
        beneficiarios: benefData?.length || 0,
        beneficiarios_con_convocatoria: (benefData || []).filter(b => b.convocatoria_id).length,
        convocatoriasMap: cMap
      });
    } catch (error) {
      console.error('❌ Error cargando datos:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Identificar actualizaciones activas (más reciente por beneficiario+ventana en en_revision/aprobada)
  const getActiveUpdateIds = (allRows) => {
    const activeMap = new Map(); // key: "beneficiario_id:ventana_id", value: updateId
    
    allRows.forEach((update) => {
      if (['en_revision', 'aprobada'].includes(update.estado)) {
        const key = `${update.beneficiario_id}:${update.ventana_id}`;
        const existing = allRows.find((u) => activeMap.get(key) === u.id);
        
        // Si no existe o este es más reciente, actualizar
        if (!existing || new Date(update.created_at) > new Date(existing.created_at)) {
          activeMap.set(key, update.id);
        }
      }
    });
    
    return new Set(activeMap.values());
  };

  const activeUpdateIds = useMemo(() => getActiveUpdateIds(rows), [rows]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return rows.filter((item) => {
      const b = beneficiariosMap[item.beneficiario_id];
      
      // Filtrar duplicados si no se muestran
      if (!showDuplicates && ['en_revision', 'aprobada'].includes(item.estado)) {
        if (!activeUpdateIds.has(item.id)) return false;
      }
      
      if (estadoFilter !== 'all' && item.estado !== estadoFilter) return false;
      if (ventanaFilter !== 'all' && String(item.ventana_id || '') !== ventanaFilter) return false;
      if (!query) return true;
      return [b?.nombre_completo, b?.n_documento, b?.email]
        .map((v) => String(v || '').toLowerCase())
        .some((v) => v.includes(query));
    });
  }, [rows, searchTerm, estadoFilter, ventanaFilter, beneficiariosMap, showDuplicates, activeUpdateIds]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows].sort((a, b) => {
      let av, bv;
      if (sortField === 'beneficiario') {
        av = String(beneficiariosMap[a.beneficiario_id]?.nombre_completo || '').toLowerCase();
        bv = String(beneficiariosMap[b.beneficiario_id]?.nombre_completo || '').toLowerCase();
      } else if (sortField === 'periodo') {
        av = String(ventanasMap[a.ventana_id]?.nombre || '').toLowerCase();
        bv = String(ventanasMap[b.ventana_id]?.nombre || '').toLowerCase();
      } else if (sortField === 'estado') {
        av = String(a.estado || '');
        bv = String(b.estado || '');
      } else {
        // created_at default
        av = a.created_at || '';
        bv = b.created_at || '';
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredRows, sortField, sortDir, beneficiariosMap, ventanasMap]);

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

  const activeWindow = useMemo(() => {
    const now = new Date();
    return (ventanas || []).find((v) => {
      if (!v?.is_active) return false;
      const start = v?.fecha_inicio ? new Date(v.fecha_inicio) : null;
      const end = v?.fecha_fin ? new Date(v.fecha_fin) : null;
      if (start && now < start) return false;
      if (end && now > end) return false;
      return true;
    }) || null;
  }, [ventanas]);

  const handleSaved = () => {
    setSelectedRow(null);
    loadData();
  };

  const openRow = (item) => {
    setViewedIds((prev) => new Set([...prev, item.id]));
    setSelectedRow(item);
  };

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronDown size={12} className="opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-secondary" />
      : <ChevronDown size={12} className="text-secondary" />;
  };

  const toggleCheckbox = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedRows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedRows.map((r) => r.id)));
    }
  };

  const quickAction = async (item, newEstado, e) => {
    e.stopPropagation();
    let obs = null;
    if (newEstado === 'rechazada') {
      obs = window.prompt(`Motivo de rechazo para ${beneficiariosMap[item.beneficiario_id]?.nombre_completo || 'este beneficiario'}:`);
      if (obs === null) return; // cancelado
      if (!String(obs).trim()) {
        await showErrorAlert({ title: 'Observación requerida', text: 'Debes ingresar el motivo del rechazo.' });
        return;
      }
    }
    try {
      const { session } = await getSafeSession();
      const { error } = await supabase
        .from('portal_actualizaciones')
        .update({
          estado: newEstado,
          observacion_admin: obs ? String(obs).trim() : undefined,
          revisado_por_user_id: session?.user?.id || null,
          revisado_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);
      if (error) throw error;
      await showSuccessAlert({ title: 'Estado actualizado', text: `Actualización marcada como «${estadoLabel(newEstado)}».` });
      loadData();
    } catch (err) {
      await showErrorAlert({ title: 'Error', text: err?.message || 'No se pudo actualizar el estado.' });
    }
  };

  const batchAction = async (newEstado) => {
    if (!selectedIds.size) return;
    setBatchLoading(true);
    try {
      const { session } = await getSafeSession();
      const { error } = await supabase
        .from('portal_actualizaciones')
        .update({
          estado: newEstado,
          revisado_por_user_id: session?.user?.id || null,
          revisado_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in('id', [...selectedIds]);
      if (error) throw error;
      await showSuccessAlert({ title: 'Listo', text: `${selectedIds.size} actualización(es) marcadas como «${estadoLabel(newEstado)}».` });
      setSelectedIds(new Set());
      loadData();
    } catch (err) {
      await showErrorAlert({ title: 'Error en batch', text: err?.message || 'No se pudo aplicar la acción.' });
    } finally {
      setBatchLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-2xl font-black text-slate-800">Actualizaciones</h2>
        <p className="text-sm text-slate-500 mt-1">
          Todas las actualizaciones periódicas enviadas por los beneficiarios. Filtra por periodo, estado o busca por nombre/documento.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ventana activa:</span>
          {activeWindow ? (
            <>
              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold ring-1 bg-emerald-100 text-emerald-700 ring-emerald-200">
                {activeWindow.nombre}
              </span>
              <span className="text-xs text-slate-500">
                {formatDateTime(activeWindow.fecha_inicio)} - {formatDateTime(activeWindow.fecha_fin)}
              </span>
            </>
          ) : (
            <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold ring-1 bg-amber-100 text-amber-700 ring-amber-200">
              No hay ventana activa en este momento
            </span>
          )}
        </div>
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
          {ventanas.map((v) => {
            const st = getVentanaEstado(v);
            return (
              <option key={v.id} value={String(v.id)}>
                {`${v.nombre} (${st.label})`}
              </option>
            );
          })}
        </select>
        <button
          onClick={() => setShowDuplicates(!showDuplicates)}
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
            showDuplicates
              ? 'bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-150'
              : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
          title={showDuplicates ? 'Ocultando duplicados históricos' : 'Mostrando solo actualizaciones activas'}
        >
          <Eye size={14} />
          {showDuplicates ? 'Mostrar actualizaciones activas' : 'Mostrar todas (incluido histórico)'}
        </button>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
        <button
          onClick={() => setShowReporteModal(true)}
          className="flex items-center gap-2 bg-slate-900 text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-slate-800"
        >
          <Download size={14} />
          Reporte sin actualizar
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
            {/* Batch action bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 px-5 py-2.5 bg-secondary/10 border-b border-secondary/20">
                <span className="text-xs font-bold text-secondary">{selectedIds.size} seleccionada(s)</span>
                <button
                  onClick={() => batchAction('en_revision')}
                  disabled={batchLoading}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-all"
                >
                  <Clock size={13} /> Marcar en revisión
                </button>
                <button
                  onClick={() => batchAction('aprobada')}
                  disabled={batchLoading}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
                >
                  <CheckCircle size={13} /> Aprobar seleccionadas
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="ml-auto text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancelar
                </button>
              </div>
            )}
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={sortedRows.length > 0 && selectedIds.size === sortedRows.length}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-800 select-none"
                    onClick={() => toggleSort('beneficiario')}
                  >
                    <span className="inline-flex items-center gap-1">Beneficiario <SortIcon field="beneficiario" /></span>
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-800 select-none"
                    onClick={() => toggleSort('periodo')}
                  >
                    <span className="inline-flex items-center gap-1">Periodo <SortIcon field="periodo" /></span>
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Semestre</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Promedio</th>
                  <th
                    className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-800 select-none"
                    onClick={() => toggleSort('estado')}
                  >
                    <span className="inline-flex items-center gap-1">Estado <SortIcon field="estado" /></span>
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-800 select-none"
                    onClick={() => toggleSort('created_at')}
                  >
                    <span className="inline-flex items-center gap-1">Enviada <SortIcon field="created_at" /></span>
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Visto</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Revisada</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map((item) => {
                  const b = beneficiariosMap[item.beneficiario_id];
                  const v = item.ventana_id ? ventanasMap[item.ventana_id] : null;
                  const ventanaEstado = getVentanaEstado(v);
                  const isViewed = viewedIds.has(item.id);
                  const isSelected = selectedIds.has(item.id);
                  // Urgency: en_revision sin revisar por más de 3 días
                  const daysSince = item.created_at
                    ? (Date.now() - new Date(item.created_at).getTime()) / 86_400_000
                    : 0;
                  const isUrgent = item.estado === 'en_revision' && !item.revisado_at && daysSince > 3;
                  const isOverdue = item.estado === 'en_revision' && !item.revisado_at && daysSince > 7;
                  const rowClass = isOverdue
                    ? 'bg-red-50 hover:bg-red-100 border-l-4 border-red-400'
                    : isUrgent
                    ? 'bg-amber-50 hover:bg-amber-100 border-l-4 border-amber-400'
                    : isSelected
                    ? 'bg-blue-50'
                    : 'hover:bg-slate-50';
                  return (
                    <tr
                      key={item.id}
                      className={`cursor-pointer transition-colors ${rowClass}`}
                      onClick={() => openRow(item)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCheckbox(item.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-800 truncate max-w-[200px]">{b?.nombre_completo || '—'}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[200px]">{b?.n_documento || '—'}</p>
                      </td>
                      <td className="px-5 py-3">
                        <div className="max-w-[220px]">
                          <p className="text-slate-700 truncate">{v?.nombre || <span className="text-slate-400">Sin periodo</span>}</p>
                          <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${ventanaEstado.className}`}>
                            {ventanaEstado.label}
                          </span>
                        </div>
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
                        {isOverdue && <p className="text-[10px] text-red-600 font-bold mt-0.5">+7 días sin revisar</p>}
                        {isUrgent && !isOverdue && <p className="text-[10px] text-amber-600 font-bold mt-0.5">+3 días sin revisar</p>}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(item.created_at)}</td>
                      <td className="px-4 py-3 text-center">
                        {isViewed ? (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 ring-1 ring-green-200">
                            ✓ Visto
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.revisado_at ? (
                          <CheckCircle size={16} className="text-emerald-500 mx-auto" />
                        ) : (
                          <Clock size={16} className="text-amber-400 mx-auto" />
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            title="Aprobar directamente"
                            onClick={(e) => quickAction(item, 'aprobada', e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                          >
                            <CheckCircle size={15} />
                          </button>
                          <button
                            title="Rechazar directamente"
                            onClick={(e) => quickAction(item, 'rechazada', e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                          >
                            <XCircle size={15} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openRow(item); }}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            <Eye size={14} />
                            Ver
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400 flex items-center justify-between">
              <span>{sortedRows.length} de {rows.length} actualizaciones</span>
              <span className="hidden sm:flex items-center gap-1 text-slate-300">
                <span className="w-3 h-0.5 bg-amber-400 inline-block rounded" /> &gt;3 días sin revisar
                <span className="w-3 h-0.5 bg-red-400 inline-block rounded ml-2" /> &gt;7 días
              </span>
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
          convocatoriasMap={convocatoriasMap}
          onClose={() => setSelectedRow(null)}
          onSaved={handleSaved}
        />
      )}

      {showReporteModal && (
        <ReporteSinActualizarModal
          ventanas={ventanas}
          onClose={() => setShowReporteModal(false)}
        />
      )}
    </div>
  );
};

export default AdminActualizaciones;
