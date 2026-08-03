import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Lock, LogIn, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showErrorAlert } from '../lib/alerts';
import { consumePortalAuthErrorMessage, resolvePortalAccess } from '../lib/portalAuth';

const AdminLogin = () => {
  const [loading, setLoading] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      const currentUrl = new URL(window.location.href);
      const authCode = String(currentUrl.searchParams.get('code') || '').trim();
      const authError = String(currentUrl.searchParams.get('error_description') || currentUrl.searchParams.get('error') || '').trim();

      if (authError) {
        window.history.replaceState({}, document.title, '/admin/login');
        await showErrorAlert({
          title: 'No se pudo completar el acceso',
          text: authError,
        });
      }

      if (authCode) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);
        window.history.replaceState({}, document.title, '/admin/login');

        if (exchangeError) {
          if (!mounted) return;
          await showErrorAlert({
            title: 'No se pudo completar el inicio de sesión',
            text: exchangeError.message || 'Ocurrió un error al procesar el acceso con Google.',
          });
          setCheckingAccess(false);
          return;
        }

        // Espera a que Supabase actualice la sesión internamente
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const authMessage = consumePortalAuthErrorMessage();
      if (authMessage) {
        await showErrorAlert({
          title: 'Acceso no autorizado',
          text: authMessage,
        });
      }

      // Reintentos para obtener acceso (puede haber delay en Supabase)
      let access = await resolvePortalAccess({ attemptClaim: false });
      if (!access.isAdmin && authCode) {
        // Si acabamos de autenticarnos pero no hay admin access, reintentar después de esperar más
        await new Promise(resolve => setTimeout(resolve, 1000));
        access = await resolvePortalAccess({ attemptClaim: false });
      }
      if (!mounted) return;
      setHasAdminAccess(Boolean(access.isAdmin));
      setCheckingAccess(false);
    };

    loadSession();

    return () => {
      mounted = false;
    };
  }, []);

  const handleGoogleLogin = async () => {
    setLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/admin/login`,
      },
    });

    if (error) {
      await showErrorAlert({
        title: 'No se pudo iniciar sesión',
        text: error.message || 'Ocurrió un error al autenticar con Google.',
      });
      setLoading(false);
    }
  };

  if (checkingAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center admin-shell">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-secondary rounded-full animate-spin" />
      </div>
    );
  }

  if (hasAdminAccess) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="min-h-screen admin-shell flex items-center justify-center px-4">
      <div className="w-full max-w-md admin-panel rounded-3xl overflow-hidden">
        <section className="px-6 py-5 bg-[var(--gov-ink)] text-white admin-grid">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-200">
            <ShieldCheck size={14} /> Acceso Administrativo
          </p>
          <h1 className="text-3xl font-bold mt-2">Panel Admin FOCADES</h1>
          <p className="text-sm text-slate-300 mt-2 leading-6">
            Solo correos autorizados como administradores pueden ingresar.
          </p>
        </section>

        <section className="p-6">
          <div className="ui-alert-warn mb-5 inline-flex items-start gap-2">
            <Lock size={14} className="shrink-0 mt-0.5" />
            Verificamos tu cuenta contra la lista interna de administradores.
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full ui-btn-primary disabled:opacity-50"
          >
            <LogIn size={18} />
            {loading ? 'Redirigiendo...' : 'Continuar con Google'}
          </button>
        </section>
      </div>
    </div>
  );
};

export default AdminLogin;
