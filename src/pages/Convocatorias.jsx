import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, Plus, CheckCircle2, AlertCircle } from 'lucide-react';

const Convocatorias = () => {
  const [convocatorias, setConvocatorias] = useState([]);
  const [loading, setLoading] = useState(true);

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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Historial de Convocatorias</h2>
        <button className="bg-primary text-white px-6 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-800 transition-all">
          <Plus size={18}/> Nueva Convocatoria
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {convocatorias.map((conv) => (
          <div key={conv.id} className={`bg-white p-6 rounded-[2rem] border-2 transition-all ${conv.is_activa ? 'border-secondary shadow-lg' : 'border-slate-100'}`}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Periodo</span>
                <h3 className="text-2xl font-black text-slate-800">{conv.nombre || conv.anio}</h3>
              </div>
              {conv.is_activa ? 
                <span className="bg-green-100 text-green-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                  <CheckCircle2 size={12}/> Activa
                </span> : 
                <span className="bg-slate-100 text-slate-400 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Inactiva</span>
              }
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar size={16} className="text-slate-400"/>
                <span>{conv.fecha_inicio || 'Sin fecha'} - {conv.fecha_fin || 'Sin fecha'}</span>
              </div>
            </div>

            <button 
              onClick={() => toggleActiva(conv.id, conv.is_activa)}
              className={`w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all ${
                conv.is_activa 
                ? 'bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500' 
                : 'bg-secondary text-white hover:bg-blue-600 shadow-lg shadow-blue-200'
              }`}
            >
              {conv.is_activa ? "Finalizar / Archivar" : "Activar Convocatoria"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Convocatorias;