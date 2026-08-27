import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, CreditCard, RefreshCcw, Search, Trash2, Undo2, UserCircle2, Users, Key, CheckSquare, ClipboardCheck, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showConfirmAlert, showErrorAlert, showSuccessAlert, showWarningAlert } from '../lib/alerts';

const STATE_OPTIONS = ['all', 'activo', 'suspendido', 'retirado', 'condonado', 'egresado'];
const DELETED_FILTER_OPTIONS = ['active', 'deleted', 'all'];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const ALL_OPTION = 'all';

const statusClassName = (status) => {
  if (status === 'activo') return 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200';
  if (status === 'suspendido') return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200';
  if (status === 'retirado') return 'bg-red-100 text-red-700 ring-1 ring-red-200';
  if (status === 'condonado') return 'bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200';
  if (status === 'egresado') return 'bg-blue-100 text-blue-700 ring-1 ring-blue-200';
  return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
};

const formatDateTime = (value) => {
  if (!value) return 'No disponible';
  return new Date(value).toLocaleString('es-CO');
};

const normalizeConvocatoria = (value) => {
  const text = String(value || '').trim();
  return text || 'Sin convocatoria';
};

const normalizeModalidad = (value) => {
  const text = String(value || '').trim();
  return text || 'Sin modalidad';
};

const AdminBeneficiarios = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [deletedFilter, setDeletedFilter] = useState('active');
  const [convocatoriaFilter, setConvocatoriaFilter] = useState(ALL_OPTION);
  const [modalidadFilter, setModalidadFilter] = useState(ALL_OPTION);
  const [onboardingFilter, setOnboardingFilter] = useState('all');
  const [contrasenaFilter, setContrasenaFilter] = useState('all');
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('portal_beneficiarios')
        .select(`
          id, nombre_completo, email, n_documento, tipo_documento, telefono, direccion, genero,
          fecha_nacimiento, pais_nacimiento, dpto_nacimiento, municipio_nacimiento,
          dpto_residencia, municipio_residencia, direccion_residencia, barrio_corregimiento, zona_residencia,
          sisben_grupo, recibe_subsidio, cual_subsidio, enfoque_diferencial, labora_actualmente,
          nombre_padre, documento_padre, ocupacion_padre, ingresos_padre,
          nombre_madre, documento_madre, ocupacion_madre, ingresos_madre,
          titulo_obtenido, ano_graduacion, establecimiento_educativo, puntaje_icfes,
          estado_beneficiario, semestre_actual, semestre_ingreso, auth_user_id, 
          programa_academico, nombre_universidad, institucion_superior, nombre_colegio, tipo_educacion, 
          nivel_formacion, modalidad_beca, modalidad, año_convocatoria,
          ciudad_institucion, dpto_institucion, municipio_institucion, promedio_anterior,
          nombre_banco, numero_cuenta, tipo_cuenta_bancaria,
          updated_at, created_at, deleted_at, deletion_reason, 
          convocatoria_nombre, origen_registro, onboarding_completado, inscripcion_id,
          acepta_terminos_at, acepta_datos_at,
          portal_auth_credentials (
            setup_completed_at
          )
        `)
        .order('updated_at', { ascending: false });
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const convocatoriaOptions = useMemo(() => {
    const set = new Set(rows.map((item) => normalizeConvocatoria(item.convocatoria_nombre)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [rows]);

  const modalidadOptions = useMemo(() => {
    const set = new Set(rows.map((item) => normalizeModalidad(item.modalidad_beca)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return rows.filter((item) => {
      const matchesState = stateFilter === 'all' || item.estado_beneficiario === stateFilter;
      if (!matchesState) return false;

      if (deletedFilter === 'active' && item.deleted_at) return false;
      if (deletedFilter === 'deleted' && !item.deleted_at) return false;

      const convocatoriaLabel = normalizeConvocatoria(item.convocatoria_nombre);
      if (convocatoriaFilter !== ALL_OPTION && convocatoriaLabel !== convocatoriaFilter) return false;

      const modalidadLabel = normalizeModalidad(item.modalidad_beca);
      if (modalidadFilter !== ALL_OPTION && modalidadLabel !== modalidadFilter) return false;

      // Filtro de onboarding
      if (onboardingFilter === 'completado' && !item.onboarding_completado) return false;
      if (onboardingFilter === 'pendiente' && item.onboarding_completado) return false;

      // Filtro de contraseña
      const tieneContrasena = item.portal_auth_credentials?.setup_completed_at != null;
      if (contrasenaFilter === 'si' && !tieneContrasena) return false;
      if (contrasenaFilter === 'no' && tieneContrasena) return false;

      if (!query) return true;
      return [item.nombre_completo, item.email, item.n_documento]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(query));
    });
  }, [rows, searchTerm, stateFilter, deletedFilter, convocatoriaFilter, modalidadFilter, onboardingFilter, contrasenaFilter]);

  const totalFiltered = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, stateFilter, deletedFilter, convocatoriaFilter, modalidadFilter, onboardingFilter, contrasenaFilter, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const firstItemIndex = totalFiltered === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItemIndex = Math.min(currentPage * pageSize, totalFiltered);
  const pageButtons = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 3) return [1, 2, 3, 4, totalPages];
    if (currentPage >= totalPages - 2) return [1, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, currentPage - 1, currentPage, currentPage + 1, totalPages];
  }, [currentPage, totalPages]);

  const metrics = useMemo(() => {
    return rows.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.estado_beneficiario === 'activo') acc.activos += 1;
        if (item.auth_user_id) acc.vinculados += 1;
        if (item.estado_beneficiario === 'suspendido') acc.suspendidos += 1;
        if (item.deleted_at) acc.eliminados += 1;
        
        // Nuevas métricas
        const tieneContrasena = item.portal_auth_credentials?.setup_completed_at != null;
        if (tieneContrasena) acc.conContrasena += 1;
        if (item.onboarding_completado) acc.onboardingCompletado += 1;
        
        // Conteo de elegibles (activos + suspendidos)
        const esElegible = item.estado_beneficiario === 'activo' || item.estado_beneficiario === 'suspendido';
        if (esElegible) {
          acc.totalElegibles += 1;
          if (tieneContrasena && item.onboarding_completado) {
            acc.elegiblesCompletados += 1;
          }
        }
        
        // Activos completados
        if (item.estado_beneficiario === 'activo' && tieneContrasena && item.onboarding_completado) {
          acc.activosCompletados += 1;
        }
        
        return acc;
      },
      {
        total: 0,
        activos: 0,
        vinculados: 0,
        suspendidos: 0,
        eliminados: 0,
        conContrasena: 0,
        onboardingCompletado: 0,
        activosCompletados: 0,
        totalElegibles: 0,
        elegiblesCompletados: 0,
      }
    );
  }, [rows]);

  const handleSoftDelete = async (item) => {
    const firstConfirm = await showConfirmAlert({
      title: 'Eliminar beneficiario',
      text: 'Se marcará como eliminado (soft delete) y se conservará todo el historial para auditoría.',
      confirmButtonText: 'Continuar',
    });
    if (!firstConfirm) return;

    const confirmWord = window.prompt('Escribe ELIMINAR para confirmar esta acción:');
    if (confirmWord !== 'ELIMINAR') {
      await showWarningAlert({
        title: 'Confirmación inválida',
        text: 'La eliminación fue cancelada porque no escribiste ELIMINAR.',
      });
      return;
    }

    const reason = window.prompt('Motivo de eliminación (obligatorio):', 'Retiro administrativo') || '';
    if (!String(reason).trim()) {
      await showWarningAlert({ title: 'Motivo requerido', text: 'Debes indicar el motivo de la eliminación.' });
      return;
    }

    const note = window.prompt('Nota adicional (opcional):', '') || '';

    setActionLoadingId(item.id);
    try {
      const { data, error } = await supabase.rpc('soft_delete_beneficiario', {
        p_beneficiario_id: item.id,
        p_reason: String(reason).trim(),
        p_note: String(note).trim() || null,
        p_confirm: 'ELIMINAR',
      });

      if (error || !data?.ok) {
        throw new Error(error?.message || data?.message || 'No se pudo eliminar el beneficiario.');
      }

      await showSuccessAlert({
        title: 'Beneficiario eliminado',
        text: `Se conservó el historial. Actualizaciones relacionadas: ${data.related_updates || 0}.`,
      });
      await loadData();
    } catch (err) {
      await showErrorAlert({
        title: 'No se pudo eliminar',
        text: err.message || 'Ocurrió un error al eliminar el beneficiario.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRestore = async (item) => {
    const confirmed = await showConfirmAlert({
      title: 'Restaurar beneficiario',
      text: 'El beneficiario volverá al listado activo.',
      confirmButtonText: 'Restaurar',
    });
    if (!confirmed) return;

    setActionLoadingId(item.id);
    try {
      const { data, error } = await supabase.rpc('restore_beneficiario', {
        p_beneficiario_id: item.id,
        p_note: 'Restauración administrativa',
      });

      if (error || !data?.ok) {
        throw new Error(error?.message || data?.message || 'No se pudo restaurar el beneficiario.');
      }

      await showSuccessAlert({ title: 'Beneficiario restaurado', text: 'Se reactivó el registro correctamente.' });
      await loadData();
    } catch (err) {
      await showErrorAlert({ title: 'No se pudo restaurar', text: err.message || 'Ocurrió un error.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const metricCards = [
    { title: 'Total', value: metrics.total, icon: <Users size={18} className="text-blue-600" />, tone: 'bg-blue-50' },
    { title: 'Activos', value: metrics.activos, icon: <UserCircle2 size={18} className="text-emerald-600" />, tone: 'bg-emerald-50' },
    { title: 'Vinculados', value: metrics.vinculados, icon: <CreditCard size={18} className="text-cyan-600" />, tone: 'bg-cyan-50' },
    { title: 'Suspendidos', value: metrics.suspendidos, icon: <Users size={18} className="text-amber-600" />, tone: 'bg-amber-50' },
    { title: 'Eliminados', value: metrics.eliminados, icon: <Trash2 size={18} className="text-rose-600" />, tone: 'bg-rose-50' },
    { title: 'Con Contraseña', value: metrics.conContrasena, icon: <Key size={18} className="text-purple-600" />, tone: 'bg-purple-50' },
    { title: 'Onboarding Completo', value: metrics.onboardingCompletado, icon: <ClipboardCheck size={18} className="text-teal-600" />, tone: 'bg-teal-50' },
  ];

  return (
    <div className="ui-page">
      <section className="admin-panel admin-grid rounded-[34px] p-6 animate-slide-up">
        <h2 className="ui-title text-[clamp(1.7rem,3vw,2.8rem)]">Beneficiarios</h2>
        <p className="ui-subtitle mt-1">
          Consulta la base activa del portal y entra a la ficha 360 para revisar perfil, actualizaciones, documentos, tickets y pagos.
        </p>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-3">
        {metricCards.map((metric, index) => (
          <MetricCard
            key={metric.title}
            title={metric.title}
            value={metric.value}
            icon={metric.icon}
            tone={metric.tone}
            delay={index * 60}
          />
        ))}
      </div>

      {/* Barras de Progreso */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-slide-up" style={{ animationDelay: '120ms', animationFillMode: 'both' }}>
        {/* Progreso de Beneficiarios Activos */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-5 shadow-sm border border-emerald-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-white rounded-xl shadow-sm">
              <TrendingUp size={20} className="text-emerald-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-800">Proceso Completo - Activos</h3>
              <p className="text-xs text-slate-600 mt-0.5">Contraseña establecida + Onboarding completado</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700">
                {metrics.activosCompletados} de {metrics.activos}
              </span>
              <span className="text-2xl font-black text-emerald-700">
                {metrics.activos > 0 ? Math.round((metrics.activosCompletados / metrics.activos) * 100) : 0}%
              </span>
            </div>
            <div className="w-full bg-white/70 rounded-full h-3 overflow-hidden shadow-inner">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full transition-all duration-500 rounded-full"
                style={{ width: `${metrics.activos > 0 ? (metrics.activosCompletados / metrics.activos) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Progreso de Beneficiarios Elegibles (Activos + Suspendidos) */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 shadow-sm border border-blue-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-white rounded-xl shadow-sm">
              <CheckSquare size={20} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-800">Proceso Completo - Elegibles</h3>
              <p className="text-xs text-slate-600 mt-0.5">Activos + Suspendidos con proceso completado</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700">
                {metrics.elegiblesCompletados} de {metrics.totalElegibles}
              </span>
              <span className="text-2xl font-black text-blue-700">
                {metrics.totalElegibles > 0 ? Math.round((metrics.elegiblesCompletados / metrics.totalElegibles) * 100) : 0}%
              </span>
            </div>
            <div className="w-full bg-white/70 rounded-full h-3 overflow-hidden shadow-inner">
              <div
                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-500 rounded-full"
                style={{ width: `${metrics.totalElegibles > 0 ? (metrics.elegiblesCompletados / metrics.totalElegibles) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <section className="admin-panel rounded-[30px] p-4 md:p-6 space-y-4 animate-slide-up" style={{ animationDelay: '80ms', animationFillMode: 'both' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-3 xl:col-span-4 2xl:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por nombre, correo o documento"
              className="w-full border border-[var(--gov-line)] rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none"
            />
          </div>
          <select
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value)}
            className="border border-[var(--gov-line)] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
          >
            {STATE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'Todos los estados' : option}
              </option>
            ))}
          </select>

          <select
            value={convocatoriaFilter}
            onChange={(event) => setConvocatoriaFilter(event.target.value)}
            className="border border-[var(--gov-line)] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
          >
            <option value={ALL_OPTION}>Todas las convocatorias</option>
            {convocatoriaOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={modalidadFilter}
            onChange={(event) => setModalidadFilter(event.target.value)}
            className="border border-[var(--gov-line)] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
          >
            <option value={ALL_OPTION}>Todas las modalidades</option>
            {modalidadOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={deletedFilter}
            onChange={(event) => setDeletedFilter(event.target.value)}
            className="border border-[var(--gov-line)] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
          >
            {DELETED_FILTER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 'active' ? 'Solo activos' : option === 'deleted' ? 'Solo eliminados' : 'Activos + eliminados'}
              </option>
            ))}
          </select>

          <select
            value={onboardingFilter}
            onChange={(event) => setOnboardingFilter(event.target.value)}
            className="border border-[var(--gov-line)] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
          >
            <option value="all">Onboarding: Todos</option>
            <option value="completado">✓ Completado</option>
            <option value="pendiente">⏳ Pendiente</option>
          </select>

          <select
            value={contrasenaFilter}
            onChange={(event) => setContrasenaFilter(event.target.value)}
            className="border border-[var(--gov-line)] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
          >
            <option value="all">Contraseña: Todos</option>
            <option value="si">🔑 Establecida</option>
            <option value="no">❌ Sin establecer</option>
          </select>

          <button
            type="button"
            onClick={loadData}
            className="ui-btn-primary"
          >
            <RefreshCcw size={14} /> Recargar
          </button>
        </div>

        {/* Vista móvil */}
        <div className="space-y-3 lg:hidden">
          {loading ? (
            <div className="ui-empty italic">Cargando beneficiarios...</div>
          ) : filteredRows.length === 0 ? (
            <div className="ui-empty italic">No hay beneficiarios para este filtro.</div>
          ) : (
            paginatedRows.map((item, index) => (
              <article
                key={item.id}
                className="ui-card-plain animate-slide-up"
                style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{item.nombre_completo || 'Sin nombre'}</p>
                    <p className="text-xs text-slate-500 mt-1 truncate">{item.email || 'Sin correo'}</p>
                    {item.modalidad_beca && (
                      <span className="inline-block mt-2 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200">
                        {normalizeModalidad(item.modalidad_beca)}
                      </span>
                    )}
                  </div>
                  <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${statusClassName(item.estado_beneficiario)}`}>
                    {item.estado_beneficiario || 'sin estado'}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                    <p className="text-slate-400 uppercase tracking-wide">Documento</p>
                    <p className="font-semibold text-slate-700 mt-0.5">{item.n_documento || 'Sin documento'}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                    <p className="text-slate-400 uppercase tracking-wide">Semestre</p>
                    <p className="font-semibold text-slate-700 mt-0.5">{item.semestre_actual || 'No definido'}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                    <p className="text-slate-400 uppercase tracking-wide">Vinculación</p>
                    <p className="font-semibold text-slate-700 mt-0.5">{item.auth_user_id ? 'Activa' : 'Pendiente'}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                    <p className="text-slate-400 uppercase tracking-wide">Actualización</p>
                    <p className="font-semibold text-slate-700 mt-0.5">{formatDateTime(item.updated_at)}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    to={`/admin/beneficiarios/${item.id}`}
                    title="Ver ficha 360 completa"
                    className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-secondary text-white text-xs font-semibold transition-all duration-150 hover:bg-secondary/90 active:scale-95"
                  >
                    <Eye size={14} />
                  </Link>

                  {item.deleted_at ? (
                    <button
                      type="button"
                      onClick={() => handleRestore(item)}
                      disabled={actionLoadingId === item.id}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 text-xs font-bold hover:bg-emerald-50 transition-colors disabled:opacity-50"
                    >
                      <Undo2 size={14} /> Restaurar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSoftDelete(item)}
                      disabled={actionLoadingId === item.id}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-50 transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={14} /> Eliminar
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        {/* Vista escritorio */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[980px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Beneficiario</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Documento</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Estado</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Modalidad</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Semestre</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Vinculación</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Última actualización</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Registro</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-4 py-20 text-center text-slate-400 italic">Cargando beneficiarios...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-20 text-center text-slate-400 italic">No hay beneficiarios para este filtro.</td>
                </tr>
              ) : (
                paginatedRows.map((item, index) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors animate-slide-up" style={{ animationDelay: `${index * 20}ms`, animationFillMode: 'both' }}>
                    <td className="px-4 py-4 align-top">
                      <p className="font-bold text-slate-800">{item.nombre_completo || 'Sin nombre'}</p>
                      <p className="text-xs text-slate-500 mt-1">{item.email || 'Sin correo'}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">{item.n_documento || 'Sin documento'}</td>
                    <td className="px-4 py-4">
                      <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${statusClassName(item.estado_beneficiario)}`}>
                        {item.estado_beneficiario || 'sin estado'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">{normalizeModalidad(item.modalidad_beca)}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">{item.semestre_actual || 'No definido'}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">{item.auth_user_id ? 'Activa' : 'Pendiente'}</td>
                    <td className="px-4 py-4 text-sm text-slate-500">{formatDateTime(item.updated_at)}</td>
                    <td className="px-4 py-4 text-xs text-slate-500">
                      {item.deleted_at ? (
                        <>
                          <p className="font-bold text-rose-600">Eliminado</p>
                          <p>{formatDateTime(item.deleted_at)}</p>
                        </>
                      ) : (
                        'Activo'
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/admin/beneficiarios/${item.id}`}
                          title="Ver ficha 360 completa"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary text-white text-xs font-semibold transition-all duration-150 hover:bg-secondary/90 active:scale-95"
                        >
                          <Eye size={14} />
                        </Link>

                        {item.deleted_at ? (
                          <button
                            type="button"
                            onClick={() => handleRestore(item)}
                            disabled={actionLoadingId === item.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 text-xs font-bold hover:bg-emerald-50 transition-colors disabled:opacity-50"
                          >
                            <Undo2 size={14} /> Restaurar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSoftDelete(item)}
                            disabled={actionLoadingId === item.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-50 transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={14} /> Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filteredRows.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-sm text-slate-500">
                Mostrando <span className="font-bold text-slate-700">{firstItemIndex}</span> - <span className="font-bold text-slate-700">{lastItemIndex}</span> de{' '}
                <span className="font-bold text-slate-700">{totalFiltered}</span> registros
              </p>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="border border-[var(--gov-line)] rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} por página
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-[var(--gov-line)] text-xs font-bold text-slate-600 hover:bg-white disabled:opacity-50"
              >
                Anterior
              </button>
              {pageButtons.map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`h-8 min-w-8 px-2 rounded-lg text-xs font-bold transition-colors ${
                    page === currentPage ? 'bg-[var(--gov-ink)] text-white' : 'border border-[var(--gov-line)] text-slate-600 hover:bg-white'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-[var(--gov-line)] text-xs font-bold text-slate-600 hover:bg-white disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

const MetricCard = ({ title, value, icon, tone, delay = 0 }) => (
  <div
    className={`${tone} rounded-2xl p-4 flex items-center gap-3 shadow-sm animate-slide-up`}
    style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
  >
    <div className="p-2 bg-white rounded-xl shadow-sm shrink-0">{icon}</div>
    <div>
      <p className="text-xs text-slate-500">{title}</p>
      <p className="text-2xl font-black text-slate-800">{value}</p>
    </div>
  </div>
);

export default AdminBeneficiarios;
