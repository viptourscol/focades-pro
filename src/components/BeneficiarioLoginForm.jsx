import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { showErrorAlert } from '../lib/alerts';
import { Lock, LogIn, AlertCircle, Mail } from 'lucide-react';

export const BeneficiarioLoginForm = ({ onSuccess, isLoading, setIsLoading }) => {
  const [loginMethod, setLoginMethod] = useState('google'); // 'google' | 'document'
  const [formData, setFormData] = useState({
    document: '',
    password: '',
  });
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/beneficiario/login` },
    });
    if (error) {
      await showErrorAlert({
        title: 'No se pudo iniciar sesión',
        text: error.message || 'Ocurrió un error al autenticar con Google.',
      });
      setIsLoading(false);
    }
  };

  const handleDocumentLogin = async (e) => {
    e.preventDefault();
    if (!formData.document || !formData.password) {
      await showErrorAlert({
        title: 'Campos requeridos',
        text: 'Ingresa tu documento y contraseña.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await supabase.functions.invoke('auth-credentials', {
        body: {
          method: 'login',
          document_number: formData.document,
          password: formData.password,
        },
      });

      if (!result.data?.ok) {
        await showErrorAlert({
          title: 'Error de login',
          text: result.data?.error || 'Documento o contraseña incorrectos.',
        });
        return;
      }

      // Guardar sesión del beneficiario en localStorage
      const beneficiarioId = result.data.beneficiario_id;
      const profile = result.data.profile;
      
      const sessionData = {
        beneficiario_id: beneficiarioId,
        document_number: formData.document,
        login_method: 'document',
        timestamp: new Date().toISOString(),
        profile: profile, // Guardar perfil completo
      };
      
      try {
        localStorage.setItem('focades:beneficiario-session', JSON.stringify(sessionData));
      } catch (error) {
        console.error('Error guardando sesión:', error);
      }

      // Llamar onSuccess para redirigir
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Login error:', error);
      await showErrorAlert({
        title: 'Error',
        text: error.message || 'No se pudo procesar tu login.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    if (!resetEmail) {
      await showErrorAlert({
        title: 'Correo requerido',
        text: 'Ingresa tu correo electrónico.',
      });
      return;
    }

    setResetLoading(true);
    try {
      // TODO: Implementar endpoint de password reset
      await showErrorAlert({
        title: 'En desarrollo',
        text: 'La recuperación de contraseña está en desarrollo. Contacta al administrador.',
      });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tabs para cambiar método de login */}
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setLoginMethod('google')}
          className={`flex-1 pb-3 text-sm font-semibold transition-colors ${
            loginMethod === 'google'
              ? 'text-secondary border-b-2 border-secondary'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Google
        </button>
        <button
          type="button"
          onClick={() => setLoginMethod('document')}
          className={`flex-1 pb-3 text-sm font-semibold transition-colors ${
            loginMethod === 'document'
              ? 'text-secondary border-b-2 border-secondary'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Documento + Contraseña
        </button>
      </div>

      {/* Google Login */}
      {loginMethod === 'google' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl font-bold text-sm disabled:opacity-50 hover:brightness-110 transition-all"
            style={{ background: '#F9A03F', color: '#0D2C54' }}
          >
            <LogIn size={18} />
            {isLoading ? 'Redirigiendo...' : 'Continuar con Google'}
          </button>

          <div
            className="rounded-xl px-4 py-3 text-xs leading-relaxed flex items-start gap-2"
            style={{ background: 'rgba(26,90,150,0.08)', border: '1px solid rgba(26,90,150,0.15)', color: 'rgba(26,90,150,0.75)' }}
          >
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            Si es tu primer acceso, debes configurar tu contraseña primero.
            <a href="/beneficiario/auth-setup" className="font-semibold underline ml-auto whitespace-nowrap">
              Configurar aquí
            </a>
          </div>
        </div>
      )}

      {/* Document + Password Login */}
      {loginMethod === 'document' && (
        <form onSubmit={handleDocumentLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-primary mb-2">
              Número de documento
            </label>
            <input
              type="text"
              placeholder="Ej: 1023456789"
              value={formData.document}
              onChange={e => setFormData({ ...formData, document: e.target.value.toUpperCase() })}
              className="w-full px-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
              disabled={isLoading}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-primary">
                Contraseña
              </label>
              <button
                type="button"
                onClick={() => setShowPasswordReset(true)}
                className="text-xs font-semibold text-secondary hover:text-primary transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <input
              type="password"
              placeholder="Tu contraseña"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm disabled:opacity-50 transition-all"
            style={{ background: '#1A5A96', color: 'white' }}
          >
            <Lock size={18} />
            {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>

          <p className="text-center text-xs text-slate-500">
            ¿No tienes cuenta?{' '}
            <a href="/beneficiario/auth-setup" className="font-semibold text-secondary hover:text-primary transition-colors">
              Configura tu acceso
            </a>
          </p>
        </form>
      )}

      {/* Password Reset Modal */}
      {showPasswordReset && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-50"
          onClick={() => setShowPasswordReset(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-xl max-w-sm w-full p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-primary">Recuperar contraseña</h3>

            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-primary mb-2">
                  <Mail size={16} className="inline mr-2" />
                  Correo electrónico
                </label>
                <input
                  type="email"
                  placeholder="tu@correo.com"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
                  disabled={resetLoading}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Enviaremos un link de recuperación a este correo.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordReset(false)}
                  className="flex-1 px-4 py-2 rounded-xl border border-border text-primary font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="flex-1 px-4 py-2 rounded-xl text-white font-semibold disabled:opacity-50 transition-colors"
                  style={{ background: '#1A5A96' }}
                >
                  {resetLoading ? 'Enviando...' : 'Enviar link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BeneficiarioLoginForm;
