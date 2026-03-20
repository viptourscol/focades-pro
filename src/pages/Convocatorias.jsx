import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, Plus, CheckCircle2 } from 'lucide-react';

const Convocatorias = () => {
  const [convocatorias, setConvocatorias] = useState([]);
  const [loading, setLoading] = useState(true);

  const metrics = useMemo(() => {
    const total = convocatorias.length;
    const activas = convocatorias.filter((item) => item.is_activa).length;
    const inactivas = total - activas;
    return { total, activas, inactivas };
  }, [convocatorias]);

  useEffect(() => { fetchConvocatorias(); }, []);

  async function fetchConvocatorias() {
    const { data } = await supabase.from('convocatorias').select('*').order('anio', { ascending: false });
    setConvocatorias(data || []);
    setLoading(false);
  }

  const toggleActiva = async (id, currentStatus) => {
    const { error } = await supabase
      .from('convocatorias')
      .update({ is_activa: !currentStatus })
      .eq('id', id);

    if (!error) fetchConvocatorias(); // El trigger de SQL se encarga de apagar las demás
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <section className="ui-card p-6 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--gov-accent)]">Gestión institucional</p>
            <h2 className="mt-1 text-2xl md:text-3xl font-black text-[var(--gov-ink)] tracking-tight">Historial de Convocatorias</h2>
            <p className="mt-1 text-sm text-slate-600">Administra periodos de inscripción y controla qué convocatoria está vigente.</p>
          </div>
          <button className="ui-btn-primary inline-flex items-center gap-2">
            <Plus size={16} /> Nueva Convocatoria
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Metric title="Total" value={metrics.total} tone="bg-slate-100 text-slate-800" />
          <Metric title="Activas" value={metrics.activas} tone="bg-emerald-100 text-emerald-800" />
          <Metric title="Inactivas" value={metrics.inactivas} tone="bg-amber-100 text-amber-800" />
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading && (
          <div className="ui-card p-6 col-span-full text-sm text-slate-500">Cargando convocatorias...</div>
        )}
        {!loading && convocatorias.length === 0 && (
          <div className="ui-card p-6 col-span-full text-sm text-slate-500">No hay convocatorias registradas.</div>
        )}

        {!loading && convocatorias.map((conv) => (
          <div key={conv.id} className={`ui-card p-6 transition-all ${conv.is_activa ? 'ring-2 ring-emerald-200' : ''}`}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Periodo</span>
                <h3 className="text-2xl font-black text-slate-800">{conv.nombre || conv.anio}</h3>
              </div>
              {conv.is_activa ? (
                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                  <CheckCircle2 size={12} /> Activa
                </span>
              ) : (
                <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Inactiva</span>
              )}
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar size={16} className="text-slate-400" />
                <span>{conv.fecha_inicio || 'Sin fecha'} - {conv.fecha_fin || 'Sin fecha'}</span>
              </div>
            </div>

            <button
              onClick={() => toggleActiva(conv.id, conv.is_activa)}
              className={`w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all ${
                conv.is_activa
                  ? 'bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600'
                  : 'bg-[var(--gov-accent)] text-white hover:brightness-95 shadow-lg shadow-sky-200'
              }`}
            >
              {conv.is_activa ? 'Finalizar / Archivar' : 'Activar Convocatoria'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const Metric = ({ title, value, tone }) => (
  <div className={`rounded-2xl border border-slate-200 px-4 py-3 ${tone}`}>
    <p className="text-[10px] font-black uppercase tracking-[0.16em]">{title}</p>
    <p className="text-2xl font-black mt-1">{value}</p>
  </div>
);

export default Convocatorias;