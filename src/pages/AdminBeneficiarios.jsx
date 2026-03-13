import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Search, UserCircle2, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

const STATE_OPTIONS = ['all', 'activo', 'suspendido', 'retirado', 'condonado', 'egresado'];

const statusClassName = (status) => {
  if (status === 'activo') return 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200';
  if (status === 'suspendido') return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200';
  if (status === 'retirado') return 'bg-red-100 text-red-700 ring-1 ring-red-200';
  if (status === 'condonado') return 'bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200';
  if (status === 'egresado') return 'bg-blue-100 text-blue-700 ring-1 ring-blue-200';
  return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
};

const AdminBeneficiarios = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stateFilter, setStateFilter] = useState('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('portal_beneficiarios')
        .select('id,nombre_completo,email,n_documento,estado_beneficiario,semestre_actual,auth_user_id,updated_at,created_at')
        .order('updated_at', { ascending: false })
        .limit(300);
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

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return rows.filter((item) => {
      const matchesState = stateFilter === 'all' || item.estado_beneficiario === stateFilter;
      if (!matchesState) return false;
      if (!query) return true;
      return [item.nombre_completo, item.email, item.n_documento]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(query));
    });
  }, [rows, searchTerm, stateFilter]);

  const metrics = useMemo(() => {
    return rows.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.estado_beneficiario === 'activo') acc.activos += 1;
        if (item.auth_user_id) acc.vinculados += 1;
        if (item.estado_beneficiario === 'suspendido') acc.suspendidos += 1;
        return acc;
      },
      { total: 0, activos: 0, vinculados: 0, suspendidos: 0 }
    );
  }, [rows]);

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-2xl font-black text-slate-800">Beneficiarios</h2>
        <p className="text-sm text-slate-500 mt-1">
          Consulta la base activa del portal y entra a la ficha 360 para revisar perfil, actualizaciones, documentos, tickets y pagos.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard title="Total" value={metrics.total} icon={<Users size={18} className="text-blue-600" />} tone="bg-blue-50" />
        <MetricCard title="Activos" value={metrics.activos} icon={<UserCircle2 size={18} className="text-emerald-600" />} tone="bg-emerald-50" />
        <MetricCard title="Vinculados" value={metrics.vinculados} icon={<CreditCard size={18} className="text-cyan-600" />} tone="bg-cyan-50" />
        <MetricCard title="Suspendidos" value={metrics.suspendidos} icon={<Users size={18} className="text-amber-600" />} tone="bg-amber-50" />
      </div>

      <section className="bg-white rounded-3xl border border-slate-200 p-4 md:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por nombre, correo o documento"
              className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm"
            />
          </div>
          <select
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
          >
            {STATE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'Todos los estados' : option}
              </option>
            ))}
          </select>
          <button type="button" onClick={loadData} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold">
            Recargar
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[860px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Beneficiario</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Documento</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Estado</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Semestre</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Vinculación</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Última actualización</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-4 py-20 text-center text-slate-400 italic">Cargando beneficiarios...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-20 text-center text-slate-400 italic">No hay beneficiarios para este filtro.</td>
                </tr>
              ) : (
                filteredRows.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
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
                    <td className="px-4 py-4 text-sm text-slate-600">{item.semestre_actual || 'No definido'}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">{item.auth_user_id ? 'Activa' : 'Pendiente'}</td>
                    <td className="px-4 py-4 text-sm text-slate-500">{item.updated_at ? new Date(item.updated_at).toLocaleString('es-CO') : 'No disponible'}</td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        to={`/admin/beneficiarios/${item.id}`}
                        className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-secondary text-white text-sm font-bold"
                      >
                        Abrir ficha 360
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

const MetricCard = ({ title, value, icon, tone }) => (
  <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tone}`}>{icon}</div>
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</p>
      <p className="text-2xl font-black text-slate-800">{value}</p>
    </div>
  </div>
);

export default AdminBeneficiarios;
