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
      }

      const authMessage = consumePortalAuthErrorMessage();
      if (authMessage) {
        await showErrorAlert({
          title: 'Acceso no autorizado',
          text: authMessage,
        });
      }

      const access = await resolvePortalAccess({ attemptClaim: false });
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
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-secondary rounded-full animate-spin" />
      </div>
    );
  }

  if (hasAdminAccess) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <section className="px-6 py-5 bg-primary text-white">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-200">
            <ShieldCheck size={14} /> Acceso Administrativo
          </p>
          <h1 className="text-2xl font-black mt-1">Panel Admin FOCADES</h1>
          <p className="text-sm text-slate-300 mt-2">
            Solo correos autorizados como administradores pueden ingresar.
          </p>
        </section>

        <section className="p-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs px-3 py-2 mb-5 inline-flex items-start gap-2">
            <Lock size={14} className="shrink-0 mt-0.5" />
            Verificamos tu cuenta contra la lista interna de administradores.
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-accent text-white py-3 rounded-xl font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
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
