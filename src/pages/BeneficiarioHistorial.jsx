import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Mail,
  MapPin,
  Phone,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import DocViewerModal from '../components/DocViewerModal';

const formatDateTime = (value) => {
  if (!value) return 'No disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No disponible';
  return date.toLocaleString('es-CO');
};

const formatFileSize = (value) => {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Sin tamaño';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const estadoMeta = (estado) => {
  if (estado === 'aprobada') {
    return {
      label: 'Aprobada',
      badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      icon: <CheckCircle2 size={14} className="text-emerald-600" />,
    };
  }

  if (estado === 'rechazada') {
    return {
      label: 'Rechazada',
      badge: 'bg-red-100 text-red-700 border-red-200',
      icon: <XCircle size={14} className="text-red-600" />,
    };
  }

  if (estado === 'subsanacion') {
    return {
      label: 'Subsanación',
      badge: 'bg-blue-100 text-blue-700 border-blue-200',
      icon: <AlertTriangle size={14} className="text-blue-600" />,
    };
  }

  return {
    label: 'En revisión',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: <Clock3 size={14} className="text-amber-600" />,
  };
};

const DOCUMENT_LABELS = {
  certificado_bancario: 'Certificado bancario',
  certificado_notas: 'Certificado de notas',
  certificado_matricula: 'Certificado de matrícula',
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

const MetricCard = ({ title, value, subtitle, tone }) => (
  <div className={`rounded-2xl border p-3 md:p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${tone}`}>
    <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider">{title}</p>
    <p className="text-lg md:text-2xl font-black mt-1 leading-tight">{value}</p>
    {subtitle ? <p className="text-[10px] md:text-xs mt-1 opacity-80 leading-tight">{subtitle}</p> : null}
  </div>
);

const DataPill = ({ icon, label, value }) => {
  const safeValue = value || 'No disponible';
  const isLongText = String(safeValue).length > 34;

  return (
    <div className={`rounded-xl border border-slate-200 bg-white px-2.5 md:px-3 py-2 transition-all duration-300 hover:bg-slate-50 hover:border-slate-300 ${isLongText ? 'col-span-2 md:col-span-1' : ''}`}>
      <p className="text-[10px] md:text-[11px] text-slate-400 flex items-center gap-1.5">{icon} {label}</p>
      <p className="text-xs md:text-sm font-semibold text-slate-700 mt-0.5 leading-tight break-words">{safeValue}</p>
    </div>
  );
};

const BeneficiarioHistorial = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [docsByUpdate, setDocsByUpdate] = useState({});
  const [windowsMap, setWindowsMap] = useState({});
  const [viewingDoc, setViewingDoc] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadRows = async () => {// Obtener beneficiario_id desde localStorage
      let beneficiarioId = null;
      try {
        const sessionStr = localStorage.getItem('focades:beneficiario-session');
        if (sessionStr) {
          const documentSession = JSON.parse(sessionStr);
          const sessionTime = new Date(documentSession.timestamp).getTime();
          const maxAge = 24 * 60 * 60 * 1000;
          
          if (Date.now() - sessionTime <= maxAge) {
            beneficiarioId = documentSession.beneficiario_id;}
        }
      } catch (error) {}

      // Si no hay beneficiario_id, intentar con Supabase Auth
      if (!beneficiarioId) {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) {if (mounted) setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from('portal_beneficiarios')
          .select('id')
          .eq('auth_user_id', userId)
          .maybeSingle();
        
        beneficiarioId = profile?.id;
      }

      if (!beneficiarioId) {
        if (mounted) setLoading(false);
        return;
      }

      // Cargar historial usando Edge Function (bypasses RLS)
      const { data: result, error: invokeError } = await supabase.functions.invoke('get-beneficiario-historial', {
        body: { beneficiario_id: beneficiarioId },
      });

      if (invokeError) {
        if (mounted) setLoading(false);
        return;
      }

      if (!result?.ok) {
        if (mounted) setLoading(false);
        return;
      }// Agrupar documentos por actualización
      const groupedDocs = (result.documentos || []).reduce((acc, doc) => {
        const key = doc.actualizacion_id;
        if (!acc[key]) acc[key] = [];
        acc[key].push(doc);
        return acc;
      }, {});

      // Mapear ventanas por ID
      const map = (result.ventanas || []).reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {});

      if (!mounted) return;
      setRows(result.actualizaciones || []);
      setDocsByUpdate(groupedDocs);
      setWindowsMap(map);
      setLoading(false);
    };

    loadRows();

    return () => {
      mounted = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const total = rows.length;
    const aprobadas = rows.filter((item) => item.estado === 'aprobada').length;
    const pendientes = rows.filter((item) => item.estado === 'en_revision').length;
    const rechazadas = rows.filter((item) => item.estado === 'rechazada').length;
    const lastDate = rows[0]?.created_at ? formatDateTime(rows[0].created_at) : 'Sin envíos';

    return { total, aprobadas, pendientes, rechazadas, lastDate };
  }, [rows]);

  return (
    <div className="space-y-5 animate-fade-in">
      {viewingDoc && <DocViewerModal doc={viewingDoc} onClose={() => setViewingDoc(null)} />}

      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-5 md:p-6 animate-slide-up">
        <div className="absolute -top-16 -right-10 h-40 w-40 rounded-full bg-blue-100/50 blur-2xl" />
        <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-amber-100/40 blur-2xl" />

        <div className="relative">
          <h2 className="text-xl md:text-2xl font-extrabold text-primary">Historial de Actualizaciones</h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Trazabilidad completa de cada envío semestral, su estado de revisión, observaciones y soportes adjuntos.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 lg:grid-cols-5 gap-2.5 md:gap-3 relative">
          <MetricCard title="Total envíos" value={metrics.total} subtitle="Histórico completo" tone="bg-slate-50 text-slate-700 border-slate-200" />
          <MetricCard title="En revisión" value={metrics.pendientes} subtitle="Pendientes de respuesta" tone="bg-amber-50 text-amber-700 border-amber-200" />
          <MetricCard title="Aprobadas" value={metrics.aprobadas} subtitle="Cumplieron revisión" tone="bg-emerald-50 text-emerald-700 border-emerald-200" />
          <MetricCard title="Rechazadas" value={metrics.rechazadas} subtitle="Requieren ajuste" tone="bg-red-50 text-red-700 border-red-200" />
          <MetricCard title="Último envío" value={metrics.lastDate} subtitle="Fecha de registro" tone="bg-blue-50 text-blue-700 border-blue-200" />
        </div>
      </section>

      {loading ? (
        <div className="bg-white border border-border rounded-2xl p-8 text-center text-slate-500 animate-pulse">
          <div className="flex items-center justify-center gap-2">
            <span>Cargando historial...</span>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-border rounded-2xl p-8 text-center text-slate-500 animate-fade-in">Aún no tienes actualizaciones registradas.</div>
      ) : (
        <div className="space-y-4 animate-fade-in">
          {rows.map((row, idx) => {
            const meta = estadoMeta(row.estado);
            const docs = docsByUpdate[row.id] || [];
            const windowInfo = windowsMap[row.ventana_id] || null;

            return (
              <article key={row.id} className="bg-white border border-border rounded-3xl p-4 md:p-5 shadow-sm animate-slide-up hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Actualización #{String(row.id).slice(0, 8)}</p>
                    <h3 className="text-lg font-extrabold text-primary mt-0.5">Semestre {row.semestre_actual || 'No definido'}</h3>
                    <p className="text-xs text-slate-500 mt-1">Registrada: {formatDateTime(row.created_at)}</p>
                    <p className="text-xs text-slate-500">Última modificación: {formatDateTime(row.updated_at)}</p>
                  </div>

                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-black uppercase tracking-wide transition-all duration-300 ${meta.badge} hover:scale-105 ${row.estado === 'en_revision' ? 'animate-pulse-gentle' : ''}`}>
                    {meta.icon}
                    {meta.label}
                  </div>
                </div>

                {row.estado === 'subsanacion' && (
                  <div className="mt-4 p-4 rounded-xl border border-blue-300 bg-blue-50 text-blue-900 flex items-start gap-3">
                    <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-blue-600" />
                    <div className="flex-1">
                      <p className="font-semibold text-sm">Debes corregir tu actualización</p>
                      <p className="text-xs text-blue-800 mt-1">El equipo administrativo ha solicitado correcciones en tu actualización.</p>
                      {(Array.isArray(row.campos_a_corregir) && row.campos_a_corregir.length > 0 || Array.isArray(row.documentos_a_corregir) && row.documentos_a_corregir.length > 0) && (
                        <div className="text-xs text-blue-700 mt-2 space-y-1">
                          {Array.isArray(row.campos_a_corregir) && row.campos_a_corregir.length > 0 && (
                            <p><strong>Campos a corregir:</strong> {row.campos_a_corregir.map((c) => CAMPO_LABELS_SUBSANACION[c] || c).join(', ')}</p>
                          )}
                          {Array.isArray(row.documentos_a_corregir) && row.documentos_a_corregir.length > 0 && (
                            <p><strong>Documentos a reemplazar:</strong> {row.documentos_a_corregir.map((d) => DOCUMENTO_LABELS_SUBSANACION[d] || d).join(', ')}</p>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-blue-700 mt-2 opacity-75">Marcada para subsanación: {formatDateTime(row.marcado_subsanacion_at)}</p>
                      <button
                        type="button"
                        onClick={() => navigate('/beneficiario/actualizacion')}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 hover:scale-105 transition-all duration-200"
                      >
                        Corregir ahora
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 xl:grid-cols-4 gap-2">
                  <DataPill icon={<CalendarDays size={12} />} label="Ventana" value={windowInfo?.nombre || 'No definida'} />
                  <DataPill icon={<FileText size={12} />} label="Promedio reportado" value={row.promedio_semestre_anterior ?? 'No disponible'} />
                  <DataPill icon={<Mail size={12} />} label="Correo reportado" value={row.email || 'No disponible'} />
                  <DataPill icon={<Phone size={12} />} label="Teléfono reportado" value={row.telefono || 'No disponible'} />
                </div>

                <div className="mt-2.5">
                  <DataPill icon={<MapPin size={12} />} label="Dirección reportada" value={row.direccion || 'No disponible'} />
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100 transition-colors duration-300">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500">Respuesta administrativa</p>
                  <p className="text-sm text-slate-700 mt-1">{row.observacion_admin || 'Sin observaciones registradas hasta el momento.'}</p>
                  <p className="text-xs text-slate-500 mt-2">Fecha de revisión: {formatDateTime(row.revisado_at)}</p>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500">Documentos del envío</p>
                    <span className="text-xs font-semibold text-slate-500">{docs.length} archivo(s)</span>
                  </div>

                  {docs.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-slate-500">No hay documentos adjuntos para este registro.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {docs.map((doc) => (
                        <div key={doc.id} className="px-3 py-2.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 hover:bg-slate-50 transition-all duration-200">
                          <div>
                            <p className="text-sm font-semibold text-slate-700">{DOCUMENT_LABELS[doc.tipo_documento] || doc.tipo_documento || 'Documento'}</p>
                            <p className="text-xs text-slate-500">{doc.nombre_original || 'Sin nombre'} · {formatFileSize(doc.size_bytes)} · {formatDateTime(doc.created_at)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setViewingDoc(doc)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-secondary hover:bg-slate-50 hover:scale-105 transition-all duration-200"
                          >
                            <Eye size={13} /> Ver documento
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BeneficiarioHistorial;
