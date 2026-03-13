import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const BeneficiarioResumen = () => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) {
        if (mounted) setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('portal_beneficiarios')
        .select('*')
        .eq('auth_user_id', userId)
        .maybeSingle();

      if (!mounted) return;
      setProfile(data || null);
      setLoading(false);
    };

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <div className="bg-white border border-border rounded-2xl p-8 text-center text-slate-500">Cargando resumen...</div>;
  }

  if (!profile) {
    return (
      <div className="bg-white border border-border rounded-2xl p-8">
        <h2 className="text-xl font-extrabold text-primary">Mi Resumen</h2>
        <p className="text-sm text-slate-600 mt-3">
          Tu cuenta aún no está vinculada como beneficiario activo. Comunícate con el equipo administrador para habilitar el acceso.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-border rounded-2xl p-6">
        <h2 className="text-xl font-extrabold text-primary">Mi Resumen</h2>
        <p className="text-sm text-slate-600 mt-1">Estado general del proceso como beneficiario.</p>

        <div className="mt-5 grid md:grid-cols-2 gap-4 text-sm">
          <SummaryItem label="Nombre" value={profile.nombre_completo} />
          <SummaryItem label="Correo" value={profile.email} />
          <SummaryItem label="Teléfono" value={profile.telefono} />
          <SummaryItem label="Dirección" value={profile.direccion} />
          <SummaryItem label="Semestre actual" value={String(profile.semestre_actual || '')} />
          <SummaryItem label="Estado" value={profile.estado_beneficiario} />
          <SummaryItem label="Radicado" value={profile.radicado_inscripcion} />
          <SummaryItem label="Última actualización" value={profile.updated_at ? new Date(profile.updated_at).toLocaleString('es-CO') : ''} />
        </div>
      </div>
    </div>
  );
};

const SummaryItem = ({ label, value }) => (
  <div className="rounded-xl border border-border p-3 bg-slate-50">
    <p className="text-[11px] uppercase tracking-wide font-bold text-slate-500">{label}</p>
    <p className="font-semibold text-primary mt-1">{value || 'No disponible'}</p>
  </div>
);

export default BeneficiarioResumen;
