import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  Clipboard, Eye, CheckCircle, XCircle, 
  Search, RefreshCw, Filter 
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

const Aspirantes = () => {
  const [aspirantes, setAspirantes] = useState([]);
  const [convocatoriasList, setConvocatoriasList] = useState([]);
  const [selectedConvocatoria, setSelectedConvocatoria] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedAspirante, setSelectedAspirante] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Carga inicial
  useEffect(() => {
    fetchConvocatorias();
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
        setAspirantes(data || []);
      } else {
        setAspirantes([]);
      }
    } catch {
      setAspirantes([]);
    } finally {
      setLoading(false);
    }
  }

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
              beneficiario_portal_id: payload.beneficiario_id,
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

  const filteredData = aspirantes.filter(asp => 
    asp.personas?.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asp.radicado?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* BARRA DE FILTROS Y BÚSQUEDA */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nombre o radicado..." 
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-secondary/20"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-slate-500">
            <Filter size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">Convocatoria:</span>
          </div>
          <select 
            value={selectedConvocatoria}
            onChange={(e) => setSelectedConvocatoria(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-secondary/20"
          >
            <option value="all">Ver Todas</option>
            {convocatoriasList.map(c => (
              <option key={c.id} value={c.id}>{c.nombre || c.anio}</option>
            ))}
          </select>
          <button onClick={fetchAspirantes} className="p-2.5 text-secondary hover:bg-blue-50 rounded-xl transition-all">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* TABLA PROFESIONAL */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-200">
              <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Radicado</th>
              <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Aspirante</th>
              <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Flujo</th>
              <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Vinculación</th>
              <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Puntaje</th>
              <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Estado</th>
              <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="7" className="text-center py-20 text-slate-400 font-medium italic">Sincronizando base de datos relacional...</td></tr>
            ) : filteredData.length === 0 ? (
              <tr><td colSpan="7" className="text-center py-20 text-slate-400 font-medium italic">No se encontraron registros en esta convocatoria.</td></tr>
            ) : (
              filteredData.map(asp => (
                <tr 
                  key={asp.id} 
                  className="hover:bg-slate-50/80 transition-all cursor-pointer group"
                  onClick={() => setSelectedAspirante(asp)}
                >
                  <td className="px-6 py-4">
                    <span onClick={(e) => { e.stopPropagation(); copyToClipboard(asp.radicado); }} className="font-mono font-bold text-secondary text-sm bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors">
                      {asp.radicado}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-700">{asp.personas?.nombre_completo}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{asp.personas?.n_documento}</div>
                  </td>
                  <td className="px-6 py-4">
                    <WorkflowBadge record={asp} />
                  </td>
                  <td className="px-6 py-4">
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
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="font-black text-slate-700 text-lg">{asp.puntaje_total}</span>
                      <div className="w-16 bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-1000 ${
                            asp.puntaje_total >= 80 ? 'bg-green-500' : 
                            asp.puntaje_total >= 60 ? 'bg-orange-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${asp.puntaje_total}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={asp.estado} />
                  </td>
                  <td className="px-6 py-4">
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

      {selectedAspirante && (
        <AspiranteModal 
          aspirante={selectedAspirante} 
          onClose={() => setSelectedAspirante(null)} 
          onUpdateStatus={updateStatus}
          onUpdateWorkflow={updateWorkflow}
          onPromote={promoteToBeneficiario}
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