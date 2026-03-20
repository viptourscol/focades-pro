import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import BeneficiarioNotificacionesPanel from '../components/BeneficiarioNotificacionesPanel';

const BeneficiarioNotificaciones = () => {
  const navigate = useNavigate();

  const handleNotificationOpen = () => {
    navigate('/beneficiario#centro-notificaciones');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <section className="bg-white border border-border rounded-3xl p-5 md:p-6 animate-slide-up">
        <div className="flex items-center gap-2">
          <Bell size={20} className="text-secondary" />
          <h2 className="text-xl font-extrabold text-primary">Notificaciones</h2>
        </div>
        <p className="text-sm text-slate-600 mt-2">
          Vista rápida de notificaciones. Al seleccionar una, te llevamos al Inicio para revisar el centro de notificaciones completo.
        </p>
      </section>

      <BeneficiarioNotificacionesPanel
        limit={20}
        showTitle={false}
        compact={true}
        showViewAllLink={false}
        onNotificationOpen={handleNotificationOpen}
      />
    </div>
  );
};

export default BeneficiarioNotificaciones;
