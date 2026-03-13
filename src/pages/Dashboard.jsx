import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, UserCheck, UserX, Clock, BarChart3, PieChart } from 'lucide-react';
import { invokeAdminTickets } from '../lib/adminTickets';

const Dashboard = () => {
  const [stats, setStats] = useState({
    total: 0,
    admitidos: 0,
    rechazados: 0,
    revision: 0,
  });
  const [ticketStats, setTicketStats] = useState({
    activos: 0,
    resueltos: 0,
    en_revision: 0,
    recibido: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    const { data, error } = await supabase.from('inscripciones').select('estado');

    if (!error && data) {
      const counts = data.reduce((acc, curr) => {
        acc.total++;
        if (curr.estado === 'Admitido') acc.admitidos++;
        else if (curr.estado === 'No admitido') acc.rechazados++;
        else if (curr.estado === 'En revisión') acc.revision++;
        return acc;
      }, { total: 0, admitidos: 0, rechazados: 0, revision: 0 });
      
      setStats(counts);
    }

    const ticketResult = await invokeAdminTickets({ action: 'stats' });
    if (ticketResult.ok) {
      setTicketStats({
        activos: Number(ticketResult.data?.stats?.activos || 0),
        resueltos: Number(ticketResult.data?.stats?.resueltos || 0),
        en_revision: Number(ticketResult.data?.stats?.en_revision || 0),
        recibido: Number(ticketResult.data?.stats?.recibido || 0),
      });
    }

    setLoading(false);
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* TARJETAS PRINCIPALES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Inscritos" 
          value={stats.total} 
          icon={<Users className="text-blue-600" />} 
          color="bg-blue-50" 
          loading={loading}
        />
        <StatCard 
          title="Admitidos" 
          value={stats.admitidos} 
          icon={<UserCheck className="text-green-600" />} 
          color="bg-green-50" 
          loading={loading}
        />
        <StatCard 
          title="En Revisión" 
          value={stats.revision} 
          icon={<Clock className="text-orange-600" />} 
          color="bg-orange-50" 
          loading={loading}
        />
        <StatCard 
          title="No Admitidos" 
          value={stats.rechazados} 
          icon={<UserX className="text-red-600" />} 
          color="bg-red-50" 
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Tickets Activos" 
          value={ticketStats.activos} 
          icon={<Clock className="text-amber-600" />} 
          color="bg-amber-50" 
          loading={loading}
        />
        <StatCard 
          title="Tickets Resueltos" 
          value={ticketStats.resueltos} 
          icon={<UserCheck className="text-green-600" />} 
          color="bg-green-50" 
          loading={loading}
        />
        <StatCard 
          title="Tickets en Proceso" 
          value={ticketStats.en_revision} 
          icon={<BarChart3 className="text-orange-600" />} 
          color="bg-orange-50" 
          loading={loading}
        />
        <StatCard 
          title="Tickets Nuevos" 
          value={ticketStats.recibido} 
          icon={<Users className="text-blue-600" />} 
          color="bg-blue-50" 
          loading={loading}
        />
      </div>

      {/* SECCIÓN DE ANÁLISIS VISUAL (Placeholder para gráficas futuras) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="text-slate-400" size={20} />
            <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Distribución por Modalidad</h3>
          </div>
          <div className="h-64 flex items-center justify-center border-2 border-dashed border-slate-100 rounded-3xl text-slate-400 text-sm italic">
            Pronto: Gráfico de Barras (Sueños vs Mérito)
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <PieChart className="text-slate-400" size={20} />
            <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Estado de Convocatoria</h3>
          </div>
          <div className="h-64 flex items-center justify-center border-2 border-dashed border-slate-100 rounded-3xl text-slate-400 text-sm italic">
            Pronto: Gráfico de Torta (Cumplimiento de Metas)
          </div>
        </div>
      </div>
    </div>
  );
};

function StatCard({ title, value, icon, color, loading }) {
  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5 hover:shadow-md transition-shadow">
      <div className={`w-14 h-14 ${color} rounded-2xl flex items-center justify-center`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
        <h4 className="text-2xl font-black text-slate-800">
          {loading ? "..." : value}
        </h4>
      </div>
    </div>
  );
}

export default Dashboard;