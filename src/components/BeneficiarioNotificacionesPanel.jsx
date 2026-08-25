import { useEffect, useState } from 'react';
import { Bell, CheckCircle, AlertCircle, Clock, DollarSign, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';

const READ_RETENTION_DAYS = 2;

const NOTIFICATION_ICONS = {
  actualización_confirmada: <FileText size={16} className="text-blue-600" />,
  actualización_rechazada: <AlertCircle size={16} className="text-red-600" />,
  actualización_aprobada: <CheckCircle size={16} className="text-green-600" />,
  ventana_habilitada: <CheckCircle size={16} className="text-emerald-600" />,
  ventana_cerrada: <Clock size={16} className="text-amber-600" />,
  documentos_incompletos: <AlertCircle size={16} className="text-amber-600" />,
  plazo_próximo: <Clock size={16} className="text-amber-600" />,
  elegibilidad_confirmada: <DollarSign size={16} className="text-emerald-600" />,
  pago_efectuado: <DollarSign size={16} className="text-emerald-600" />,
  anuncio_general: <Bell size={16} className="text-slate-600" />,
};

const NOTIFICATION_COLORS = {
  actualización_confirmada: 'border-blue-200 bg-blue-50',
  actualización_rechazada: 'border-red-200 bg-red-50',
  actualización_aprobada: 'border-emerald-200 bg-emerald-50',
  ventana_habilitada: 'border-emerald-200 bg-emerald-50',
  ventana_cerrada: 'border-amber-200 bg-amber-50',
  documentos_incompletos: 'border-amber-200 bg-amber-50',
  plazo_próximo: 'border-amber-200 bg-amber-50',
  elegibilidad_confirmada: 'border-emerald-200 bg-emerald-50',
  pago_efectuado: 'border-emerald-200 bg-emerald-50',
  anuncio_general: 'border-slate-200 bg-slate-50',
};

const NOTIFICATION_TITLES = {
  actualización_confirmada: '✓ Actualización  Confirmada',
  actualización_rechazada: '⚠ Actualización Rechazada',
  actualización_aprobada: '✓ Actualización Aprobada',
  ventana_habilitada: '✓ Ventana Habilitada',
  ventana_cerrada: '⏰ Ventana Cerrada',
  documentos_incompletos: '⚠ Documentos Incompletos',
  plazo_próximo: '⏰ Plazo Próximo',
  elegibilidad_confirmada: '✓ Elegibilidad Confirmada',
  pago_efectuado: '✓ Pago Efectuado',
  anuncio_general: '📢 Anuncio',
};

const BeneficiarioNotificacionesPanel = ({
  limit = 5,
  showTitle = true,
  compact = false,
  showViewAllLink = true,
  onNotificationOpen = null,
}) => {
  const [loading, setLoading] = useState(true);
  const [notificaciones, setNotificaciones] = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);

  const isReadExpired = (notif) => {
    if (!notif?.leida || !notif?.created_at) return false;
    const createdAt = new Date(notif.created_at);
    if (Number.isNaN(createdAt.getTime())) return false;
    const ageMs = Date.now() - createdAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays > READ_RETENTION_DAYS;
  };

  const emitUnreadCount = (count) => {
    window.dispatchEvent(
      new CustomEvent('benef-notif-updated', {
        detail: { unreadCount: Number(count || 0) },
      })
    );
  };

  useEffect(() => {
    let mounted = true;

    const loadNotificaciones = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) {
          if (mounted) setLoading(false);
          return;
        }

        // Obtener beneficiario ID
        const { data: profileData } = await supabase
          .from('portal_beneficiarios')
          .select('id')
          .eq('auth_user_id', userId)
          .maybeSingle();

        if (!profileData?.id) {
          if (mounted) setLoading(false);
          return;
        }

        // Cargar solo no leídas para que desaparezcan del panel al marcarlas.
        const { data: notifData } = await supabase
          .from('portal_notificaciones_beneficiarios')
          .select('*')
          .eq('beneficiario_id', profileData.id)
          .eq('leida', false)
          .order('created_at', { ascending: false })
          .limit(Math.max(limit * 6, 50));

        const { count: unreadCount } = await supabase
          .from('portal_notificaciones_beneficiarios')
          .select('id', { count: 'exact', head: true })
          .eq('beneficiario_id', profileData.id)
          .eq('leida', false);

        if (!mounted) return;

        const rawArray = Array.isArray(notifData) ? notifData : [];
        const visibleArray = rawArray.filter((item) => !isReadExpired(item)).slice(0, limit);
        const nextUnread = Number(unreadCount || 0);

        setNotificaciones(visibleArray);
        setNoLeidas(nextUnread);
        emitUnreadCount(nextUnread);
      } catch (error) {if (mounted) setNotificaciones([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadNotificaciones();
    return () => {
      mounted = false;
    };
  }, [limit]);

  const marcarComoLeida = async (notificacionId) => {
    try {
      const { error } = await supabase
        .from('portal_notificaciones_beneficiarios')
        .update({ leida: true })
        .eq('id', notificacionId);

      if (error) {
        throw new Error(error.message || 'No se pudo marcar como leída.');
      }

      // Actualizar local: se elimina de la lista visible al marcar leída.
      setNotificaciones((prev) => prev.filter((n) => n.id !== notificacionId));
      const nextUnread = Math.max(0, noLeidas - 1);
      setNoLeidas(nextUnread);
      emitUnreadCount(nextUnread);
    } catch (error) {}
  };

  const handleNotificationClick = async (notif) => {
    if (!notif?.id) return;
    if (!notif.leida) {
      await marcarComoLeida(notif.id);
    }
    if (typeof onNotificationOpen === 'function') {
      onNotificationOpen(notif);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CO', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="bg-white border border-border rounded-2xl p-6 animate-pulse">
        <div className="h-6 bg-slate-200 rounded mb-4 w-48"></div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-slate-100 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showTitle && (
        <section className="bg-white border border-border rounded-2xl p-5 md:p-6">
          <div className="flex items-center gap-2">
            <Bell size={20} className="text-secondary" />
            <h2 className="text-lg font-extrabold text-primary">Notificaciones</h2>
            {noLeidas > 0 && (
              <span className="ml-auto px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 ring-1 ring-red-200">
                {noLeidas} {noLeidas === 1 ? 'nueva' : 'nuevas'}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 mt-2">Historial de notificaciones sobre tus actualizaciones y pagos.</p>
          {!compact && (
            <p className="text-[11px] text-slate-500 mt-1">
              Al marcar como leída, la notificación se oculta del panel y se elimina automáticamente después de {READ_RETENTION_DAYS} días.
            </p>
          )}
        </section>
      )}

      {notificaciones.length === 0 ? (
        <div className="bg-white border border-border rounded-2xl p-8 text-center text-slate-500 animate-fade-in">
          <Bell size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm">
            {loading ? 'Cargando notificaciones…' : 'No hay notificaciones por el momento.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notificaciones.map((notif) => (
            <div
              key={notif.id}
              className={`border rounded-2xl ${compact ? 'p-3' : 'p-4'} cursor-pointer transition-all duration-200 animate-slide-up hover:shadow-md ${
                NOTIFICATION_COLORS[notif.tipo] || 'border-slate-200 bg-slate-50'
              } ${notif.leida ? 'opacity-75' : 'ring-1 ring-amber-200'}`}
              onClick={() => handleNotificationClick(notif)}
            >
              <div className="flex gap-3">
                <div className="shrink-0 pt-0.5">
                  {NOTIFICATION_ICONS[notif.tipo] || <Bell size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className={`font-semibold ${compact ? 'text-xs' : 'text-sm'} text-slate-800`}>
                      {NOTIFICATION_TITLES[notif.tipo] || notif.titulo}
                    </h3>
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(notif.created_at)}
                    </span>
                  </div>
                  
                  <p className={`${compact ? 'text-xs' : 'text-sm'} text-slate-700 mt-1 line-clamp-2`}>
                    {notif.descripcion || notif.titulo}
                  </p>

                  {/* Mostrar contexto específico según tipo */}
                  {!compact && notif.contexto?.documentos_faltantes && notif.contexto.documentos_faltantes.length > 0 && (
                    <div className="mt-2 text-xs text-slate-600">
                      <span className="font-semibold">Documentos faltantes:</span>{' '}
                      {notif.contexto.documentos_faltantes.join(', ')}
                    </div>
                  )}

                  {!compact && notif.contexto?.monto_elegible && (
                    <div className="mt-2 text-xs font-semibold text-emerald-700">
                      💰 Monto elegible: ${new Intl.NumberFormat('es-CO').format(notif.contexto.monto_elegible)}
                    </div>
                  )}

                  {!compact && !notif.leida && (
                    <p className="text-xs text-amber-600 mt-2 font-semibold">
                      Haz clic para marcar como leída
                    </p>
                  )}
                  {compact && (
                    <p className="text-[11px] text-secondary mt-2 font-semibold">
                      Toca para abrir en Inicio
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showViewAllLink && notificaciones.length > 0 && notificaciones.length >= limit && (
        <div className="text-center">
          <a
            href="/beneficiario/notificaciones"
            className="text-sm font-semibold text-secondary hover:text-secondary/80 transition-colors"
          >
            Ver todas las notificaciones →
          </a>
        </div>
      )}
    </div>
  );
};

export default BeneficiarioNotificacionesPanel;
