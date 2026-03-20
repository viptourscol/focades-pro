import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BookOpen, ClipboardList, ExternalLink, FileClock, LogIn, Megaphone, UserCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showErrorAlert } from '../lib/alerts';
import { consumePortalAuthErrorMessage, resolvePortalAccess } from '../lib/portalAuth';

const FEATURES = [
  {
    icon: UserCircle2,
    title: 'Consultar tu estado',
    desc: 'Verifica el estado actual de tu beneficio y tus datos registrados en el programa.',
  },
  {
    icon: ClipboardList,
    title: 'Actualización semestral',
    desc: 'Envía tus documentos e información personal cada semestre de forma segura y en línea.',
  },
  {
    icon: FileClock,
    title: 'Historial de envíos',
    desc: 'Consulta el historial de cada actualización semestral y su estado de revisión.',
  },
  {
    icon: BookOpen,
    title: 'Noticias del programa',
    desc: 'Mantente informado sobre novedades, convocatorias y comunicados de FOCADES.',
  },
];

const BeneficiarioLogin = () => {
  const [loginLoading, setLoginLoading] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [hasPortalAccess, setHasPortalAccess] = useState(false);
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const loginSectionRef = useRef(null);

  // Verificar sesión activa y cargar noticias en paralelo
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const currentUrl = new URL(window.location.href);
      const authCode = String(currentUrl.searchParams.get('code') || '').trim();
      const authError = String(currentUrl.searchParams.get('error_description') || currentUrl.searchParams.get('error') || '').trim();

      if (authError) {
        window.history.replaceState({}, document.title, '/beneficiario/login');
        await showErrorAlert({
          title: 'No se pudo completar el acceso',
          text: authError,
        });
      }

      if (authCode) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);
        window.history.replaceState({}, document.title, '/beneficiario/login');

        if (exchangeError) {
          if (!mounted) return;
          await showErrorAlert({
            title: 'No se pudo completar el inicio de sesión',
            text: exchangeError.message || 'Ocurrió un error al procesar el acceso con Google.',
          });
          setCheckingAccess(false);
          return;
        }
      }

      const authMessage = consumePortalAuthErrorMessage();
      if (authMessage) {
        await showErrorAlert({ title: 'Acceso no autorizado', text: authMessage });
      }

      const nowIso = new Date().toISOString();

      const [access, { data: newsData }] = await Promise.all([
        resolvePortalAccess({ attemptClaim: true }),
        supabase
          .from('portal_noticias')
          .select('id,title,summary,content,image_url,button_label,button_url,publish_at')
          .eq('is_active', true)
          .lte('publish_at', nowIso)
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('publish_at', { ascending: false })
          .limit(6),
      ]);

      if (!mounted) return;
      setHasPortalAccess(access.ok);
      setCheckingAccess(false);
      setNews(Array.isArray(newsData) ? newsData : []);
      setNewsLoading(false);
    };

    init();

    return () => { mounted = false; };
  }, []);

  const handleGoogleLogin = async () => {
    setLoginLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/beneficiario/login` },
    });
    if (error) {
      await showErrorAlert({
        title: 'No se pudo iniciar sesión',
        text: error.message || 'Ocurrió un error al autenticar con Google.',
      });
      setLoginLoading(false);
    }
  };

  const scrollToLogin = () => {
    loginSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (checkingAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center admin-shell">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-secondary rounded-full animate-spin" />
      </div>
    );
  }

  if (hasPortalAccess) {
    return <Navigate to="/beneficiario" replace />;
  }

  return (
    <div className="min-h-screen admin-shell flex flex-col">

      <header className="bg-[var(--gov-ink)] text-white px-4 md:px-10 h-16 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[linear-gradient(135deg,#f1c57f,#bb7d26)] text-[#10233f] font-black flex items-center justify-center text-sm">F</div>
          <div className="leading-tight hidden sm:block">
            <p className="font-black text-sm">FOCADES</p>
            <p className="text-[11px] text-slate-300 uppercase tracking-[0.16em]">Portal de Beneficiarios</p>
          </div>
        </div>
        <button
          type="button"
          onClick={scrollToLogin}
          className="inline-flex items-center gap-2 bg-[var(--gov-accent)] text-white text-sm font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
        >
          <LogIn size={15} />
          Iniciar sesión
        </button>
      </header>

      <section className="bg-[var(--gov-ink)] text-white px-4 md:px-10 py-14 md:py-20 animate-fade-in admin-grid">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-10">
          <div className="flex-1 text-center md:text-left animate-slide-up">
            <span className="inline-block bg-[var(--gov-accent-soft)] text-[#f3d4a9] text-xs font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-[0.16em]">
              Bienvenido
            </span>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight">
              Portal de Beneficiarios<br />
              <span className="text-[#f1c57f]">FOCADES</span>
            </h1>
            <p className="mt-4 text-slate-300 text-sm leading-relaxed max-w-md mx-auto md:mx-0">
              Tu plataforma integral para el seguimiento y gestión de tu beneficio educativo. Consulta tu estado, actualiza tus datos semestrales y mantente informado.
            </p>
            <button
              type="button"
              onClick={scrollToLogin}
              className="mt-7 inline-flex items-center gap-2 bg-[var(--gov-accent)] text-white font-bold px-6 py-3 rounded-xl hover:opacity-90 transition-all duration-300"
            >
              <LogIn size={16} />
              Consulta tu estado aquí
            </button>
          </div>
          <div className="shrink-0 w-48 h-48 md:w-64 md:h-64 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center animate-scale-up">
            <div className="text-7xl md:text-8xl font-black text-[#f1c57f]/70 select-none">F</div>
          </div>
        </div>
      </section>

      <section className="px-4 md:px-10 py-12 bg-white/85 border-b border-[var(--gov-line)] animate-fade-in" style={{ animationDelay: '100ms' }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-[var(--gov-ink)] text-center mb-8">¿Qué puedes hacer en la plataforma?</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc }, idx) => (
              <div key={title} className="ui-card-plain space-y-2 animate-slide-up hover:shadow-md transition-all duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                <div className="w-10 h-10 rounded-xl bg-[var(--gov-accent-soft)] text-[var(--gov-ink)] flex items-center justify-center">
                  <Icon size={20} />
                </div>
                <h3 className="font-bold text-[var(--gov-ink)] text-sm">{title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 md:px-10 py-12 flex-1 animate-fade-in" style={{ animationDelay: '150ms' }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-[var(--gov-ink)] mb-6">Novedades del programa</h2>

          {newsLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((n) => (
                <div key={n} className="ui-card-plain h-48 animate-pulse" />
              ))}
            </div>
          ) : news.length === 0 ? (
            <div className="ui-empty animate-fade-in">
              No hay publicaciones activas en este momento.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {news.map((item, idx) => (
                <article key={item.id} className="ui-card-plain overflow-hidden flex flex-col animate-slide-up hover:shadow-lg transition-all duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.title || 'Noticia'}
                      className="w-full h-40 object-cover hover:brightness-90 transition-all duration-300"
                    />
                  )}
                  <div className="p-4 space-y-2 flex-1 flex flex-col">
                    <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[var(--gov-info)] transition-colors duration-200">
                      <Megaphone size={12} className="group-hover:scale-125 transition-transform" /> Programa FOCADES
                    </p>
                    <h3 className="font-bold text-[var(--gov-ink)] text-sm leading-tight">{item.title || 'Sin título'}</h3>
                    <p className="text-xs text-slate-600 line-clamp-4 flex-1">
                      {item.summary || item.content || 'Sin descripción.'}
                    </p>
                    {item.button_url && (
                      <a
                        href={item.button_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--gov-info)] mt-1 hover:translate-x-1 transition-all duration-200"
                      >
                        {item.button_label || 'Ver más'} <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section
        ref={loginSectionRef}
        className="px-4 md:px-10 py-12 bg-white/85 border-t border-[var(--gov-line)] animate-fade-in"
        style={{ animationDelay: '200ms' }}
      >
        <div className="max-w-md mx-auto admin-panel rounded-3xl overflow-hidden animate-modal-enter">
          <div className="bg-[var(--gov-ink)] text-white px-6 py-5 admin-grid">
            <h2 className="text-2xl font-bold">Iniciar sesión</h2>
            <p className="text-sm text-slate-300 mt-1">
              Accede con la cuenta de Google registrada en el programa.
            </p>
          </div>
          <div className="px-6 py-6 space-y-4">
            <p className="text-xs text-slate-500 leading-relaxed">
              Solo cuentas autorizadas por el equipo FOCADES tienen acceso al portal. Si no puedes ingresar, comunícate con el administrador del programa.
            </p>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loginLoading}
              className="w-full ui-btn-primary disabled:opacity-50"
            >
              <LogIn size={18} />
              {loginLoading ? 'Redirigiendo...' : 'Continuar con Google'}
            </button>
          </div>
        </div>
      </section>

      <footer className="bg-[var(--gov-ink)] text-white text-center text-xs px-4 py-5 tracking-[0.08em] uppercase">
        © 2026 Alcaldía de Montelíbano – Secretaría de Educación. Todos los derechos reservados.
      </footer>

    </div>
  );
};

export default BeneficiarioLogin;
