import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { showErrorAlert, showSuccessAlert } from '../lib/alerts';
import { Lock, LogIn, AlertCircle, Mail, Eye, EyeOff } from 'lucide-react';

export const BeneficiarioLoginForm = ({ onSuccess, isLoading, setIsLoading }) => {
  const [formData, setFormData] = useState({
    document: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

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
      const needsOnboarding = result.data.needs_onboarding;
      const redirectTo = result.data.redirect_to;
      
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
        // Error guardando sesión
      }

      // Si necesita completar onboarding, redirigir a la página de continuación
      if (needsOnboarding && redirectTo) {
        window.location.href = redirectTo;
        return;
      }

      // Llamar onSuccess para redirigir al dashboard normal
      if (onSuccess) onSuccess();
    } catch (error) {await showErrorAlert({
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

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resetEmail)) {
      await showErrorAlert({
        title: 'Correo inválido',
        text: 'Por favor ingresa un correo electrónico válido.',
      });
      return;
    }

    setResetLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-password-beneficiario', {
        body: {
          method: 'request-reset',
          email: resetEmail,
        },
      });

      if (error || !data?.ok) {
        await showErrorAlert({
          title: 'Error',
          text: data?.error || 'No se pudo procesar tu solicitud. Intenta de nuevo.',
        });
        return;
      }

      // Cerrar modal y mostrar mensaje de éxito
      setShowPasswordReset(false);
      setResetEmail('');
      
      await showSuccessAlert({
        title: 'Correo enviado',
        text: data.message || 'Si el correo está registrado, recibirás un link de recuperación en tu bandeja de entrada.',
      });
    } catch (error) {
      await showErrorAlert({
        title: 'Error',
        text: error.message || 'No se pudo procesar tu solicitud.',
      });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Solo Login con Documento */}
      <div className="border-b pb-3" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
        <h3 className="text-lg font-semibold text-white">Iniciar sesión</h3>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.65)' }}>Ingresa con tu documento y contraseña</p>
      </div>

      {/* Document Login Form */}
      <form onSubmit={handleDocumentLogin} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-white mb-2">
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
            <label className="block text-sm font-semibold text-white">
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
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Tu contraseña"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-2 pr-10 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              disabled={isLoading}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
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

        <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.60)' }}>
          ¿No tienes cuenta?{' '}
          <a href="/beneficiario/auth-setup" className="font-semibold hover:opacity-80 transition-opacity" style={{ color: '#F9A03F' }}>
            Configura tu acceso
          </a>
        </p>
      </form>

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
            <h3 className="text-xl font-bold text-slate-800">Recuperar contraseña</h3>

            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-2">
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
