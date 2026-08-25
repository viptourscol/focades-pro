import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ExternalLink, Megaphone, X, AlertCircle, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showInfoAlert } from '../lib/alerts';
import BeneficiarioNotificacionesPanel from '../components/BeneficiarioNotificacionesPanel';

const NewsModal = ({ item, onClose }) => {
  if (!item) return null;

  return (
    <div
      className="ui-modal-backdrop animate-fade-in"
      onClick={onClose}
    >
      <div
        className="ui-modal-surface max-h-[90vh] flex flex-col animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {item.image_url && (
          <img src={item.image_url} alt={item.title || 'Noticia'} className="w-full h-52 object-cover shrink-0" />
        )}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 shrink-0">
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-secondary">
              <Megaphone size={13} /> Programa FOCADES
            </p>
            <h2 className="text-2xl font-bold text-[var(--gov-ink)] mt-0.5 leading-tight">{item.title || 'Sin título'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-9 h-9 rounded-xl border border-[var(--gov-line)] bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors duration-200"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4 flex-1 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
          {item.content || item.summary || 'Sin contenido.'}
        </div>
        {(item.button_url || item.publish_at) && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-4 shrink-0">
            {item.publish_at && (
              <p className="text-xs text-slate-400">
                {new Date(item.publish_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
            {item.button_url && (
              <a
                href={item.button_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-bold text-secondary hover:underline ml-auto transition-colors duration-200 hover:text-accent"
              >
                {item.button_label || 'Ver más'} <ExternalLink size={14} />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const BeneficiarioHome = () => {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState([]);
  const [selectedNews, setSelectedNews] = useState(null);
  const [perfilIncompleto, setPerfilIncompleto] = useState(false);
  const [estadoBeneficiario, setEstadoBeneficiario] = useState(null);
  const [razonSuspension, setRazonSuspension] = useState(null);

  useEffect(() => {
    if (location.hash !== '#centro-notificaciones') return;
    const timer = window.setTimeout(() => {
      document.getElementById('centro-notificaciones')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [location.hash]);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      const nowIso = new Date().toISOString();

      // Verificar si el perfil del beneficiario está incompleto desde la base de datos
      try {
        const sessionStr = localStorage.getItem('focades:beneficiario-session');
        if (sessionStr) {
          const session = JSON.parse(sessionStr);
          const beneficiarioId = session.profile?.id;
          
          if (beneficiarioId) {
            // Consultar estado real desde la base de datos
            const { data: beneficiario, error: profileError } = await supabase
              .from('portal_beneficiarios')
              .select('id, onboarding_completado, estado_beneficiario, razon_suspension')
              .eq('id', beneficiarioId)
              .maybeSingle();

            if (!profileError && beneficiario) {
              // Actualizar localStorage con el estado real
              session.profile.onboarding_completado = beneficiario.onboarding_completado;
              session.profile.estado_beneficiario = beneficiario.estado_beneficiario;
              session.timestamp = new Date().toISOString();
              localStorage.setItem('focades:beneficiario-session', JSON.stringify(session));
              
              // Guardar estado para mostrar banners
              setEstadoBeneficiario(beneficiario.estado_beneficiario);
              setRazonSuspension(beneficiario.razon_suspension);
              
              // Mostrar banner si el onboarding no está completado
              if (!beneficiario.onboarding_completado) {
                setPerfilIncompleto(true);
              }
            }
          }
        }
      } catch (error) {
        // Error verificando perfil
      }

      
      const [{ data: newsData }, { data: modalData }] = await Promise.all([
        supabase
          .from('portal_noticias')
          .select('*')
          .eq('is_active', true)
          .lte('publish_at', nowIso)
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('publish_at', { ascending: false })
          .limit(20),
        supabase
          .from('portal_modal_anuncios')
          .select('*')
          .eq('is_active', true)
          .lte('visible_desde', nowIso)
          .or(`visible_hasta.is.null,visible_hasta.gte.${nowIso}`)
          .order('priority', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!mounted) return;

      setNews(Array.isArray(newsData) ? newsData : []);
      setLoading(false);

      const modalDismissKey = `portal:modal:${modalData?.id || ''}:dismissed`;
      if (modalData?.id && !sessionStorage.getItem(modalDismissKey)) {
        await showInfoAlert({
          title: modalData.title || 'Información importante',
          text: modalData.content || '',
        });
        sessionStorage.setItem(modalDismissKey, '1');
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="ui-page">
      <NewsModal item={selectedNews} onClose={() => setSelectedNews(null)} />

      <section className="ui-card animate-slide-up">
        <h2 className="ui-title text-[clamp(1.4rem,2.4vw,2rem)]">Inicio</h2>
        <p className="ui-subtitle mt-1">Noticias y avisos relevantes del programa.</p>
      </section>

      {/* Banner de estado suspendido */}
      {estadoBeneficiario === 'suspendido' && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-4 mb-6 rounded-r-xl shadow-sm animate-slide-up">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-rose-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-rose-800">
                Tu estado es SUSPENDIDO
              </h3>
              <p className="text-sm text-rose-700 mt-1">
                Actualmente <strong>no puedes enviar actualizaciones semestrales ni recibir nuevos pagos</strong>.
              </p>
              {razonSuspension && (
                <div className="mt-2 p-3 rounded-lg bg-white border border-rose-200">
                  <p className="text-xs font-semibold text-rose-800 mb-1">Motivo de suspensión:</p>
                  <p className="text-sm text-rose-900">{razonSuspension}</p>
                </div>
              )}
              <p className="text-sm text-rose-700 mt-2">
                Si tienes dudas sobre tu situación, por favor contacta a administración a través del sistema de tickets de soporte.
              </p>
              <a
                href="/beneficiario/tickets"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-sm font-semibold transition-all duration-200 hover:shadow-md"
              >
                Contactar soporte
                <ChevronRight size={16} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Banner de perfil incompleto */}
      {perfilIncompleto && !estadoBeneficiario && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-r-xl shadow-sm animate-slide-up">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-yellow-800">
                Tu perfil está incompleto
              </h3>
              <p className="text-sm text-yellow-700 mt-1">
                Para acceder a todas las funcionalidades del portal, necesitas completar tu información personal y subir los documentos requeridos.
              </p>
              <a
                href="/beneficiario/completar-onboarding"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded-lg text-sm font-semibold transition-all duration-200 hover:shadow-md"
              >
                Completar mi perfil ahora
                <ChevronRight size={16} />
              </a>
            </div>
          </div>
        </div>
      )}

  <section id="centro-notificaciones" className="scroll-mt-24">
  {/* Panel de Notificaciones */}
  <BeneficiarioNotificacionesPanel limit={3} showTitle={true} />
  </section>

      {loading ? (
        <div className="ui-empty animate-pulse">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce-subtle"></div>
            <span>Cargando contenido...</span>
            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce-subtle" style={{ animationDelay: '0.1s' }}></div>
          </div>
        </div>
      ) : news.length === 0 ? (
        <div className="ui-empty animate-fade-in">No hay publicaciones activas.</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {news.map((item, idx) => (
            <article
              key={item.id}
              className="ui-card-plain overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group animate-slide-up"
              style={{ animationDelay: `${idx * 50}ms` }}
              onClick={() => setSelectedNews(item)}
            >
              {item.image_url && (
                <img src={item.image_url} alt={item.title || 'Noticia'} className="w-full h-40 object-cover group-hover:brightness-95 transition-all duration-300" />
              )}
              <div className="p-4 space-y-2">
                <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-secondary group-hover:text-accent transition-colors duration-200">
                  <Megaphone size={13} className="group-hover:scale-110 transition-transform duration-200" /> Programa FOCADES
                </p>
                <h3 className="font-bold text-primary leading-tight group-hover:text-secondary transition-colors duration-200">{item.title || 'Sin título'}</h3>
                <p className="text-sm text-slate-600 line-clamp-3">{item.summary || item.content || 'Sin descripción.'}</p>
                <p className="text-xs text-[var(--gov-info)] font-semibold mt-1 group-hover:translate-x-1 transition-transform duration-200">Leer más →</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default BeneficiarioHome;
