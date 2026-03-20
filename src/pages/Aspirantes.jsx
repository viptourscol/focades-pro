import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  Clipboard, Eye, CheckCircle, XCircle, 
  Search, RefreshCw, Filter, Users, UserCircle2, CreditCard, Trash2 
} from 'lucide-react';
import AspiranteModal from '../components/AspiranteModal';
import { showErrorAlert, showSuccessAlert } from '../lib/alerts';

const getEtapaLabel = (value) => {
  const etapa = String(value || '').trim().toLowerCase();
  if (etapa === 'legalizacion') return 'Legalización';
  if (etapa === 'admitido') return 'Admitido';
  return 'Aspirante';
};

const hasBankCertificateEvidence = (record) => {
  if (!record || typeof record !== 'object') return false;

  const direct = String(record.certificado_bancario || '').trim();
  const soportes =
    record.soportes && typeof record.soportes === 'object' ? String(record.soportes.certificado_bancario || '').trim() : '';
  const formSoportes =
    record.datos_formulario?.soportes && typeof record.datos_formulario.soportes === 'object'
      ? String(record.datos_formulario.soportes.certificado_bancario || '').trim()
      : '';

  return Boolean(direct || soportes || formSoportes);
};

const getWorkflowMeta = (record) => {
  const etapa = String(record?.etapa || '').trim().toLowerCase();
  const certRequired = record?.cert_bancario_requerido === true;
  const hasCert = hasBankCertificateEvidence(record);

  if (hasCert && (etapa !== 'legalizacion' || !certRequired)) {
    return {
      label: 'Legalización completada',
      tone: 'bg-green-100 text-green-700 ring-1 ring-green-200',
      stageLabel: getEtapaLabel(etapa),
    };
  }

  if (etapa === 'legalizacion' && certRequired && hasCert) {
    return {
      label: 'Legalización en revisión',
      tone: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
      stageLabel: getEtapaLabel(etapa),
    };
  }

  if (etapa === 'legalizacion' && certRequired && !hasCert) {
    return {
      label: 'Pendiente certificado',
      tone: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
      stageLabel: getEtapaLabel(etapa),
    };
  }

  if (etapa === 'aspirante' && record?.permite_reemplazo_soportes) {
    return {
      label: 'Reemplazo habilitado',
      tone: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
      stageLabel: getEtapaLabel(etapa),
    };
  }

  return {
    label: 'Sin acción pendiente',
    tone: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    stageLabel: getEtapaLabel(etapa),
  };
};

const STATE_OPTIONS = ['all', 'aspirante', 'admitido', 'legalizacion'];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const ALL_OPTION = 'all';

const Aspirantes = () => {
  const [aspirantes, setAspirantes] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [convocatoriasList, setConvocatoriasList] = useState([]);
  const [selectedConvocatoria, setSelectedConvocatoria] = useState(ALL_OPTION);
  const [modalidadFilter, setModalidadFilter] = useState(ALL_OPTION);
  const [stateFilter, setStateFilter] = useState(ALL_OPTION);
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedAspirante, setSelectedAspirante] = useState(null);
  const [assignmentDraft, setAssignmentDraft] = useState({});
  const [assigningId, setAssigningId] = useState('');
  const [reviewedAspirantes, setReviewedAspirantes] = useState(new Set());

  // Carga inicial
  useEffect(() => {
    fetchConvocatorias();
    fetchAdminUsers();
  }, []);

  // Recarga aspirantes cuando cambia el filtro de convocatoria
  useEffect(() => {
    fetchAspirantes();
  }, [selectedConvocatoria]);

  async function fetchConvocatorias() {
    try {
      const { data } = await supabase.from('convocatorias').select('id, nombre, anio');
      setConvocatoriasList(data || []);
    } catch {
      setConvocatoriasList([]);
    }
  }

  async function fetchAspirantes() {
    setLoading(true);
    try {
      let query = supabase.from('inscripciones').select(`*, personas (*)`);

      if (selectedConvocatoria !== 'all') {
        query = query.eq('convocatoria_id', selectedConvocatoria);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (!error) {
        const safeData = data || [];
        setAspirantes(safeData);
        setAssignmentDraft((prev) => {
          const next = { ...prev };
          safeData.forEach((item) => {
            if (!(item.id in next)) {
              next[item.id] = item.revisor_asignado_user_id || '';
            }
          });
          return next;
        });
      } else {
        setAspirantes([]);
      }
    } catch {
      setAspirantes([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAdminUsers() {
    try {
      const { data } = await supabase
        .from('portal_admin_users')
        .select('user_id, nombre_completo, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      setAdminUsers(Array.isArray(data) ? data : []);
    } catch {
      setAdminUsers([]);
    }
  }

  // Abre el modal y marca el aspirante como revisado
  const openAspiranteModal = (aspirante) => {
    setSelectedAspirante(aspirante);
    setReviewedAspirantes(prev => new Set([...prev, aspirante.id]));
  };

  const assignReviewer = async (inscripcionId) => {
    const reviewer = String(assignmentDraft[inscripcionId] || '').trim();
    if (!reviewer) {
      await showErrorAlert({ title: 'Revisor requerido', text: 'Debes seleccionar un administrador revisor.' });
      return;
    }

    setAssigningId(inscripcionId);
    try {
      const { data, error } = await supabase.rpc('asignar_revisor_aspirante', {
        p_inscripcion_id: inscripcionId,
        p_revisor_user_id: reviewer,
        p_note: 'Asignación desde panel de aspirantes',
      });

      if (error || !data?.ok) {
        throw new Error(error?.message || data?.message || 'No se pudo asignar el revisor.');
      }

      setAspirantes((prev) => prev.map((item) => (
        item.id === inscripcionId
          ? { ...item, revisor_asignado_user_id: reviewer, revisor_asignado_at: new Date().toISOString() }
          : item
      )));

      if (selectedAspirante?.id === inscripcionId) {
        setSelectedAspirante((prev) => (prev ? { ...prev, revisor_asignado_user_id: reviewer } : prev));
      }

      await showSuccessAlert({ title: 'Revisor asignado', text: 'La asignación quedó registrada con historial.' });
    } catch (err) {
      await showErrorAlert({ title: 'No se pudo asignar', text: err?.message || 'Ocurrió un error.' });
    } finally {
      setAssigningId('');
    }
  };

  const updateStatus = async (id, newStatus) => {
    const { error } = await supabase.from('inscripciones').update({ estado: newStatus }).eq('id', id);
    if (!error) {
      setAspirantes(aspirantes.map(a => a.id === id ? { ...a, estado: newStatus } : a));
      if (selectedAspirante?.id === id) setSelectedAspirante({ ...selectedAspirante, estado: newStatus });
    }
  };

  const updateWorkflow = async (id, workflowPayload) => {
    const normalizedPayload = {
      etapa: workflowPayload.etapa,
      permite_reemplazo_soportes: workflowPayload.permite_reemplazo_soportes,
      cert_bancario_requerido: workflowPayload.cert_bancario_requerido,
      observacion_publica: workflowPayload.observacion_publica,
    };

    const attemptUpdate = async (payload) =>
      supabase.from('inscripciones').update(payload).eq('id', id);

    let { error } = await attemptUpdate(normalizedPayload);

    if (error) {
      const fallbackPayload = { ...normalizedPayload };
      const missingColumnPattern = /column\s+"?([a-zA-Z0-9_]+)"?\s+of relation\s+"inscripciones" does not exist/i;
      const missingField = String(error.message || '').match(missingColumnPattern)?.[1];

      if (missingField && Object.prototype.hasOwnProperty.call(fallbackPayload, missingField)) {
        delete fallbackPayload[missingField];
        ({ error } = await attemptUpdate(fallbackPayload));
      }
    }

    if (!error) {
      setAspirantes((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                ...normalizedPayload,
              }
            : item
        )
      );
      if (selectedAspirante?.id === id) {
        setSelectedAspirante((prev) => (prev ? { ...prev, ...normalizedPayload } : prev));
      }
      return { ok: true };
    }

    return { ok: false, error: error.message || 'No se pudo actualizar el flujo del aspirante.' };
  };

  const promoteToBeneficiario = async (id, semestreActual) => {
    const { data, error } = await supabase.rpc('promover_inscripcion_a_beneficiario', {
      p_inscripcion_id: id,
      p_semestre_actual: Number(semestreActual || 0) || null,
      p_forzar: false,
    });

    const payload = Array.isArray(data) ? data[0] : null;

    if (error || !payload?.ok) {
      const message = error?.message || payload?.message || 'No se pudo promover el aspirante.';
      await showErrorAlert({ title: 'Promoción no completada', text: message });
      return { ok: false, error: message };
    }

    setAspirantes((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              promovido_a_beneficiario: true,
              beneficiario_portal_id: payload.beneficiario_id
            }
          : item
      )
    );

    setSelectedAspirante((prev) =>
      prev && prev.id === id
        ? {
            ...prev,
            promovido_a_beneficiario: true,
            beneficiario_portal_id: payload.beneficiario_id,
          }
        : prev
    );

    await showSuccessAlert({
      title: 'Aspirante promovido',
      text: `Se creó el beneficiario #${payload.beneficiario_id}.`,
    });

    return { ok: true, beneficiarioId: payload.beneficiario_id };
  };

  const copyToClipboard = (text) => { navigator.clipboard.writeText(text); };

  // Opciones de modalidad
  const modalidadOptions = useMemo(() => {
    const set = new Set(aspirantes.map((a) => String(a.modalidad || '').trim() || 'Sin modalidad'));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [aspirantes]);

  // Filtros avanzados
  const filteredData = useMemo(() => {
    return aspirantes.filter(asp => {
      const matchesSearch = asp.personas?.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase()) || asp.radicado?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesConv = selectedConvocatoria === ALL_OPTION || asp.convocatoria_id === selectedConvocatoria;
      const matchesMod = modalidadFilter === ALL_OPTION || (String(asp.modalidad || '').trim() === modalidadFilter);
      const matchesState = stateFilter === ALL_OPTION || (String(asp.etapa || '').toLowerCase() === stateFilter);
      return matchesSearch && matchesConv && matchesMod && matchesState;
    });
  }, [aspirantes, searchTerm, selectedConvocatoria, modalidadFilter, stateFilter]);

  // Paginación
  const totalFiltered = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);
  const firstItemIndex = (currentPage - 1) * pageSize + 1;
  const lastItemIndex = Math.min(currentPage * pageSize, totalFiltered);
  const pageButtons = Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, currentPage - 3), currentPage + 2);

  // Métricas
  const metrics = useMemo(() => {
    const total = aspirantes.length;
    const admitidos = aspirantes.filter(a => String(a.etapa).toLowerCase() === 'admitido').length;
    const legalizacion = aspirantes.filter(a => String(a.etapa).toLowerCase() === 'legalizacion').length;
    const aspirante = aspirantes.filter(a => String(a.etapa).toLowerCase() === 'aspirante').length;
    return {
      total,
      admitidos,
      legalizacion,
      aspirante,
    };
  }, [aspirantes]);

  const metricCards = [
    { title: 'Total', value: metrics.total, icon: <Users size={18} className="text-blue-600" />, tone: 'bg-blue-50' },
    { title: 'Aspirantes', value: metrics.aspirante, icon: <UserCircle2 size={18} className="text-emerald-600" />, tone: 'bg-emerald-50' },
    { title: 'Legalización', value: metrics.legalizacion, icon: <CreditCard size={18} className="text-cyan-600" />, tone: 'bg-cyan-50' },
    { title: 'Admitidos', value: metrics.admitidos, icon: <CheckCircle size={18} className="text-green-600" />, tone: 'bg-green-50' },
  ];

  return (
    <div className="space-y-6">
      {/* TARJETAS DE MÉTRICAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {metricCards.map((metric, idx) => (
          <div key={metric.title} className={`rounded-2xl p-5 flex items-center gap-4 shadow-sm border border-slate-200 ${metric.tone}`} style={{ animationDelay: `${idx * 60}ms` }}>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/60">{metric.icon}</div>
            <div>
              <div className="text-xs font-bold uppercase text-slate-500 tracking-widest">{metric.title}</div>
              <div className="text-2xl font-black text-slate-800">{metric.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* FILTROS AVANZADOS */}
      <div className="bg-white rounded-3xl border border-slate-200 p-4 md:p-6 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
          <div className="relative sm:col-span-2 xl:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre o radicado"
              className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {STATE_OPTIONS.map(option => (
              <option key={option} value={option}>{option === 'all' ? 'Todos los estados' : getEtapaLabel(option)}</option>
            ))}
          </select>
          <select
            value={selectedConvocatoria}
            onChange={e => setSelectedConvocatoria(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value={ALL_OPTION}>Todas las convocatorias</option>
            {convocatoriasList.map(c => (
              <option key={c.id} value={c.id}>{c.nombre || c.anio}</option>
            ))}
          </select>
          <select
            value={modalidadFilter}
            onChange={e => setModalidadFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value={ALL_OPTION}>Todas las modalidades</option>
            {modalidadOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={fetchAspirantes}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold transition-all duration-150 hover:bg-primary/90 active:scale-[0.98]"
          >
            <RefreshCw size={14} /> Recargar
          </button>
        </div>
      </div>

      {/* TABLA PROFESIONAL */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-200">
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] min-w-[90px]">Radicado</th>
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] min-w-[120px]">Aspirante</th>
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hidden md:table-cell">Puntaje</th>
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hidden md:table-cell">Vinculación</th>
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hidden sm:table-cell">Revisado</th>
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Estado</th>
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hidden sm:table-cell">Revisor</th>
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="9" className="text-center py-20 text-slate-400 font-medium italic">Sincronizando base de datos relacional...</td></tr>
            ) : paginatedRows.length === 0 ? (
              <tr><td colSpan="9" className="text-center py-20 text-slate-400 font-medium italic">No se encontraron registros en este filtro.</td></tr>
            ) : (
              paginatedRows.map(asp => (
                <tr
                  key={asp.id}
                  className="hover:bg-slate-50/80 transition-all cursor-pointer group text-xs md:text-sm"
                  onClick={() => openAspiranteModal(asp)}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span onClick={(e) => { e.stopPropagation(); copyToClipboard(asp.radicado); }} className="font-mono font-bold text-secondary text-xs md:text-sm bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors">
                      {asp.radicado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-700 truncate max-w-[120px] md:max-w-none">{asp.personas?.nombre_completo}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter hidden md:block">{asp.personas?.n_documento}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="font-black text-slate-700 text-lg">{asp.puntaje_total}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {asp.promovido_a_beneficiario && asp.beneficiario_portal_id ? (
                      <Link
                        to={`/admin/beneficiarios/${asp.beneficiario_portal_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-200"
                      >
                        Beneficiario
                      </Link>
                    ) : (
                      <span className="inline-flex px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                        Aspirante
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {reviewedAspirantes.has(asp.id) ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-green-100 text-green-700 ring-1 ring-green-200">
                        ✓ Revisado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={asp.estado} />
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {/* Mostrar nombre del revisor si existe, si no, guion */}
                    <span className="font-bold text-slate-600">
                      {(() => {
                        const admin = adminUsers.find(a => a.user_id === asp.revisor_asignado_user_id);
                        if (admin && admin.nombre_completo) return admin.nombre_completo;
                        if (asp.revisor_asignado_user_id) return asp.revisor_asignado_user_id.slice(0, 8) + '...' + asp.revisor_asignado_user_id.slice(-4);
                        return '—';
                      })()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setSelectedAspirante(asp)} className="p-2 text-slate-400 hover:text-secondary hover:bg-white rounded-xl shadow-sm transition-all"><Eye size={20}/></button>
                      <button onClick={() => updateStatus(asp.id, 'Admitido')} className="p-2 text-slate-400 hover:text-green-500 hover:bg-white rounded-xl shadow-sm transition-all"><CheckCircle size={20}/></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINACIÓN */}
      {!loading && paginatedRows.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-slate-500">
              Mostrando <span className="font-bold text-slate-700">{firstItemIndex}</span> - <span className="font-bold text-slate-700">{lastItemIndex}</span> de{' '}
              <span className="font-bold text-slate-700">{totalFiltered}</span> registros
            </p>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>{size} por página</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >Anterior</button>
            {pageButtons.map(page => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={`h-8 min-w-8 px-2 rounded-lg text-xs font-bold transition-colors ${page === currentPage ? 'bg-primary text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >{page}</button>
            ))}
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >Siguiente</button>
          </div>
        </div>
      )}

      {selectedAspirante && (
        <AspiranteModal
          aspirante={selectedAspirante}
          onClose={() => setSelectedAspirante(null)}
          onUpdateStatus={updateStatus}
          onUpdateWorkflow={updateWorkflow}
          onPromote={promoteToBeneficiario}
          adminUsers={adminUsers}
          assignReviewer={assignReviewer}
          assignmentDraft={assignmentDraft}
          setAssignmentDraft={setAssignmentDraft}
          assigningId={assigningId}
        />
      )}
    </div>
  );
};

// COMPONENTE PARA LOS ESTADOS CON COLORES
function StatusBadge({ status }) {
  const styles = {
    'Radicado': 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
    'En revisión': 'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
    'Admitido': 'bg-green-100 text-green-700 ring-1 ring-green-200',
    'No admitido': 'bg-red-100 text-red-700 ring-1 ring-red-200',
  };
  return (
    <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${styles[status] || 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'}`}>
      {status || 'Sin Estado'}
    </span>
  );
}

function WorkflowBadge({ record }) {
  const meta = getWorkflowMeta(record);

  return (
    <div className="space-y-1">
      <span className={`inline-flex px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${meta.tone}`}>
        {meta.label}
      </span>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Etapa: {meta.stageLabel}</p>
    </div>
  );
}

export default Aspirantes;