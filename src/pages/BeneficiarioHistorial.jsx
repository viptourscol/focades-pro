import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const BeneficiarioHistorial = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let mounted = true;

    const loadRows = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) {
        if (mounted) setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('portal_beneficiarios')
        .select('id')
        .eq('auth_user_id', userId)
        .maybeSingle();

      if (!profile?.id) {
        if (mounted) setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('portal_actualizaciones')
        .select('id,estado,semestre_actual,promedio_semestre_anterior,created_at')
        .eq('beneficiario_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!mounted) return;
      setRows(Array.isArray(data) ? data : []);
      setLoading(false);
    };

    loadRows();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="bg-white border border-border rounded-2xl p-6">
      <h2 className="text-xl font-extrabold text-primary">Historial de Actualizaciones</h2>
      <p className="text-sm text-slate-600 mt-1">Control de envíos para auditoría y seguimiento.</p>

      {loading ? (
        <p className="mt-6 text-slate-500">Cargando historial...</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-slate-500">Aún no tienes actualizaciones registradas.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-border">
                <th className="py-2 pr-4">Fecha</th>
                <th className="py-2 pr-4">Estado</th>
                <th className="py-2 pr-4">Semestre</th>
                <th className="py-2 pr-4">Promedio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60">
                  <td className="py-2 pr-4">{row.created_at ? new Date(row.created_at).toLocaleString('es-CO') : 'No disponible'}</td>
                  <td className="py-2 pr-4">{row.estado || 'No disponible'}</td>
                  <td className="py-2 pr-4">{row.semestre_actual || 'No disponible'}</td>
                  <td className="py-2 pr-4">{row.promedio_semestre_anterior ?? 'No disponible'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default BeneficiarioHistorial;
