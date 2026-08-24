import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BookOpen, ClipboardList, ExternalLink, FileClock, Megaphone, UserCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showErrorAlert } from '../lib/alerts';
import { consumePortalAuthErrorMessage, resolvePortalAccess } from '../lib/portalAuth';
import BeneficiarioLoginForm from '../components/BeneficiarioLoginForm';

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

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const currentUrl = new URL(window.location.href);
      const authCode = String(currentUrl.searchParams.get('code') || '').trim();
      const authError = String(currentUrl.searchParams.get('error_description') || currentUrl.searchParams.get('error') || '').trim();
      const logoutReason = String(currentUrl.searchParams.get('reason') || '').trim();

      // Mostrar mensaje si la sesión expiró por inactividad
      if (logoutReason === 'session-expired') {
        window.history.replaceState({}, document.title, '/beneficiario/login');
        await showErrorAlert({
          title: 'Sesión expirada',
          text: 'Tu sesión ha expirado por inactividad. Por favor, inicia sesión nuevamente.',
        });
      }

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
      
      // Si no tiene acceso y acabamos de procesar un login con Google, mostrar error
      if (!access.ok && authCode && access.reason === 'NOT_LINKED') {
        const { data: { user } } = await supabase.auth.getUser();
        await showErrorAlert({
          title: 'Email no registrado',
          text: `Tu email (${user?.email || 'desconocido'}) no está registrado como beneficiario. Solo beneficiarios autorizados por FOCADES pueden acceder.`,
        });
      }
      
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F7FA' }}>
        <div className="w-10 h-10 border-4 border-slate-200 rounded-full animate-spin" style={{ borderTopColor: '#1A5A96' }} />
      </div>
    );
  }

  if (hasPortalAccess) {
    return <Navigate to="/beneficiario" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F7FA' }}>

      {/* ── HEADER ── igual que Registro */}
      <header className="h-[72px] bg-white border-b border-border px-8 flex items-center gap-4">
        <img src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logofocades-solo.png" alt="FOCADES" className="h-10" />
        <h1 className="text-primary font-bold text-lg">Portal de Beneficiarios</h1>
      </header>

      {/* ── HERO SPLIT: texto izq + login card der, todo above-the-fold ── */}
      <section
        className="relative isolate overflow-hidden flex-1 flex items-stretch"
        style={{ minHeight: 'calc(100vh - 56px)' }}
      >
        {/* Fondo primary azul oscuro */}
        <div
          className="absolute inset-0 -z-20"
          style={{
            background:
              'radial-gradient(900px 500px at 95% 5%, rgba(249,160,63,0.20), transparent 50%), radial-gradient(600px 400px at -5% 95%, rgba(26,90,150,0.35), transparent 55%), linear-gradient(160deg, #0D2C54 0%, #081e3a 100%)',
          }}
        />
        {/* Puntos decorativos */}
        <div
          className="absolute inset-0 -z-10 opacity-[0.12]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.7) 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative z-10 w-full max-w-6xl mx-auto px-4 md:px-10 py-10 md:py-16 grid md:grid-cols-2 gap-10 items-center">

          {/* Columna izquierda: info */}
          <div className="text-white">
            <span
              className="inline-flex items-center gap-2 text-[11px] font-bold px-3 py-1.5 rounded-full mb-6 uppercase tracking-[0.2em]"
              style={{ background: 'rgba(249,160,63,0.15)', color: '#F9A03F', border: '1px solid rgba(249,160,63,0.35)' }}
            >
              <UserCircle2 size={12} /> Portal exclusivo beneficiarios
            </span>

            <h1
              className="text-4xl md:text-6xl font-extrabold leading-[0.95] tracking-tight text-white"
              style={{ fontFamily: "'Familjen Grotesk', sans-serif" }}
            >
              Accede a tu
              <br />
              <span style={{ color: '#F9A03F' }}>portal FOCADES</span>
            </h1>

            <p className="mt-5 text-sm md:text-base leading-relaxed max-w-sm" style={{ color: 'rgba(255,255,255,0.68)' }}>
              Consulta el estado de tu beneficio, actualiza tu información semestral y mantente al día con las novedades del programa.
            </p>

            {/* Feature list compacta */}
            <ul className="mt-8 space-y-3">
              {FEATURES.map(({ icon: Icon, title }) => (
                <li key={title} className="flex items-center gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.78)' }}>
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(249,160,63,0.18)' }}
                  >
                    <Icon size={14} style={{ color: '#F9A03F' }} />
                  </span>
                  {title}
                </li>
              ))}
            </ul>
          </div>

          {/* Columna derecha: tarjeta de login */}
          <div
            ref={loginSectionRef}
            className="rounded-3xl overflow-hidden shadow-2xl"
            style={{ border: '1px solid rgba(255,255,255,0.10)' }}
          >
            {/* Card header */}
            <div
              className="px-6 py-6"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(16px)',
              }}
            >
              <div
                className="w-12 h-12 rounded-2xl font-black flex items-center justify-center text-lg mb-4"
                style={{ background: '#F9A03F', color: '#0D2C54' }}
              >
                F
              </div>
              <h2 className="text-2xl font-extrabold text-white" style={{ fontFamily: "'Familjen Grotesk', sans-serif" }}>
                Iniciar sesión
              </h2>
              <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.60)' }}>
                Elige tu método de autenticación
              </p>
            </div>

            {/* Card body */}
            <div
              className="px-6 py-6"
              style={{
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(16px)',
              }}
            >
              <div
                className="rounded-xl px-4 py-3 text-xs leading-relaxed flex items-start gap-2 mb-4"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.65)' }}
              >
                <ShieldCheck size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                Solo cuentas autorizadas por el equipo FOCADES tienen acceso.
              </div>

              <div className="text-white">
                <BeneficiarioLoginForm 
                  isLoading={loginLoading} 
                  setIsLoading={setLoginLoading}
                  onSuccess={() => {
                    // Recargar para verificar acceso nuevamente
                    window.location.reload();
                  }}
                />
              </div>

              <p className="text-center text-[11px] mt-4" style={{ color: 'rgba(255,255,255,0.35)' }}>
                ¿Eres aspirante?{' '}
                <a href="/registro" className="font-bold hover:text-white transition-colors" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Ir a inscripción →
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── NOTICIAS (sección secundaria, debajo del fold) ── */}
      {(news.length > 0 || newsLoading) && (
        <section className="px-4 md:px-10 py-12" style={{ background: '#F5F7FA', borderTop: '1px solid #dee2e6' }}>
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-3 mb-7">
              <Megaphone size={18} style={{ color: '#F9A03F' }} />
              <h2 className="text-xl font-bold" style={{ color: '#0D2C54', fontFamily: "'Familjen Grotesk', sans-serif" }}>
                Novedades del programa
              </h2>
            </div>

            {newsLoading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="animate-pulse h-44 rounded-2xl" style={{ background: '#e2e8f0' }} />
                ))}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {news.map((item) => (
                  <article
                    key={item.id}
                    className="overflow-hidden flex flex-col rounded-2xl border hover:-translate-y-1 transition-transform"
                    style={{ background: '#ffffff', borderColor: '#dee2e6', boxShadow: '0 2px 8px rgba(13,44,84,0.06)' }}
                  >
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.title || 'Noticia'} className="w-full h-36 object-cover" />
                    ) : (
                      <div
                        className="w-full h-36 flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg,#0D2C54,#1A5A96)' }}
                      >
                        <Megaphone size={32} style={{ color: 'rgba(255,255,255,0.20)' }} />
                      </div>
                    )}
                    <div className="p-4 flex-1 flex flex-col gap-1">
                      {item.publish_at && (
                        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#F9A03F' }}>
                          {new Date(item.publish_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                      )}
                      <h3 className="font-bold text-sm leading-tight" style={{ color: '#0D2C54' }}>
                        {item.title || 'Sin título'}
                      </h3>
                      <p className="text-xs text-slate-600 line-clamp-3 flex-1">
                        {item.summary || item.content || ''}
                      </p>
                      {item.button_url && (
                        <a
                          href={item.button_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold mt-1 hover:underline"
                          style={{ color: '#1A5A96' }}
                        >
                          {item.button_label || 'Ver más'} <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── FOOTER ── igual que Registro */}
      <footer className="bg-primary text-white px-8 py-6 text-center text-sm">
        <img src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logoalcaldiasecretariablanco.png" alt="Alcaldía" className="h-14 mx-auto mb-3" />
        <p>© {new Date().getFullYear()} Alcaldía de Montelíbano - Secretaría de Educación</p>
      </footer>

    </div>
  );
};

export default BeneficiarioLogin;
