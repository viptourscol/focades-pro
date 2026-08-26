import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { showErrorAlert, showSuccessAlert } from '../lib/alerts';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const BeneficiarioResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, text: '', color: '' });

  // Verificar token al cargar
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setVerifying(false);
        setTokenValid(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('reset-password-beneficiario', {
          body: {
            method: 'verify-reset-token',
            token: token,
          },
        });

        if (error || !data?.ok) {
          setTokenValid(false);
          await showErrorAlert({
            title: 'Token inválido',
            text: data?.error || 'El link de recuperación no es válido o ha expirado.',
          });
        } else {
          setTokenValid(true);
        }
      } catch (error) {
        console.error('Error verificando token:', error);
        setTokenValid(false);
      } finally {
        setVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  // Calcular fortaleza de contraseña
  useEffect(() => {
    if (!newPassword) {
      setPasswordStrength({ score: 0, text: '', color: '' });
      return;
    }

    let score = 0;
    let text = '';
    let color = '';

    // Longitud
    if (newPassword.length >= 8) score++;
    if (newPassword.length >= 12) score++;

    // Complejidad
    if (/[a-z]/.test(newPassword)) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^a-zA-Z0-9]/.test(newPassword)) score++;

    // Evaluar
    if (score <= 2) {
      text = 'Débil';
      color = 'text-red-600';
    } else if (score <= 4) {
      text = 'Media';
      color = 'text-yellow-600';
    } else {
      text = 'Fuerte';
      color = 'text-green-600';
    }

    setPasswordStrength({ score, text, color });
  }, [newPassword]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 8) {
      await showErrorAlert({
        title: 'Contraseña muy corta',
        text: 'La contraseña debe tener al menos 8 caracteres.',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      await showErrorAlert({
        title: 'Las contraseñas no coinciden',
        text: 'Por favor verifica que ambas contraseñas sean iguales.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-password-beneficiario', {
        body: {
          method: 'reset-password',
          token: token,
          new_password: newPassword,
        },
      });

      if (error || !data?.ok) {
        await showErrorAlert({
          title: 'Error al cambiar contraseña',
          text: data?.error || 'No se pudo restablecer tu contraseña. Intenta de nuevo.',
        });
        return;
      }

      await showSuccessAlert({
        title: '¡Contraseña restablecida!',
        text: 'Tu contraseña ha sido actualizada exitosamente. Ahora puedes iniciar sesión con tu nueva contraseña.',
      });

      // Redirigir al login
      navigate('/beneficiario/login');
    } catch (error) {
      console.error('Error restableciendo contraseña:', error);
      await showErrorAlert({
        title: 'Error',
        text: error.message || 'Ocurrió un error al restablecer tu contraseña.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F7FA' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={40} className="animate-spin text-primary" />
          <p className="text-slate-600">Verificando link de recuperación...</p>
        </div>
      </div>
    );
  }

  if (!token || !tokenValid) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F7FA' }}>
        {/* Header */}
        <header className="h-[72px] bg-white border-b border-border px-8 flex items-center gap-4">
          <img
            src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logofocades-solo.png"
            alt="FOCADES"
            className="h-10"
          />
          <h1 className="text-primary font-bold text-lg">Portal de Beneficiarios</h1>
        </header>

        {/* Contenido */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-3">Link inválido o expirado</h2>
              <p className="text-slate-600 mb-6">
                El link de recuperación no es válido o ha expirado. Los links de recuperación son válidos por 1 hora.
              </p>
              <button
                onClick={() => navigate('/beneficiario/login')}
                className="w-full px-4 py-3 rounded-2xl font-bold text-sm transition-all"
                style={{ background: '#1A5A96', color: 'white' }}
              >
                Volver al inicio de sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F7FA' }}>
      {/* Header */}
      <header className="h-[72px] bg-white border-b border-border px-8 flex items-center gap-4">
        <img
          src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logofocades-solo.png"
          alt="FOCADES"
          className="h-10"
        />
        <h1 className="text-primary font-bold text-lg">Portal de Beneficiarios</h1>
      </header>

      {/* Contenido */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <Lock size={32} className="text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Restablecer contraseña</h2>
            <p className="text-slate-600 text-sm">
              Ingresa tu nueva contraseña. Debe tener al menos 8 caracteres.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nueva contraseña */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">Nueva contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Ingresa tu nueva contraseña"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 pr-10 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
                  disabled={submitting}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  disabled={submitting}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {newPassword && (
                <p className={`text-xs mt-1 font-semibold ${passwordStrength.color}`}>
                  Fortaleza: {passwordStrength.text}
                </p>
              )}
            </div>

            {/* Confirmar contraseña */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">Confirmar contraseña</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirma tu nueva contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 pr-10 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
                  disabled={submitting}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  disabled={submitting}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-600 mt-1 font-semibold">Las contraseñas no coinciden</p>
              )}
              {confirmPassword && newPassword === confirmPassword && (
                <p className="text-xs text-green-600 mt-1 font-semibold flex items-center gap-1">
                  <CheckCircle size={12} /> Las contraseñas coinciden
                </p>
              )}
            </div>

            {/* Requisitos */}
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-600 mb-2">Tu contraseña debe tener:</p>
              <ul className="text-xs text-slate-600 space-y-1">
                <li className="flex items-center gap-2">
                  {newPassword.length >= 8 ? (
                    <CheckCircle size={12} className="text-green-600" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border border-slate-300" />
                  )}
                  Al menos 8 caracteres
                </li>
                <li className="flex items-center gap-2">
                  {/[A-Z]/.test(newPassword) ? (
                    <CheckCircle size={12} className="text-green-600" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border border-slate-300" />
                  )}
                  Al menos una mayúscula (recomendado)
                </li>
                <li className="flex items-center gap-2">
                  {/[0-9]/.test(newPassword) ? (
                    <CheckCircle size={12} className="text-green-600" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border border-slate-300" />
                  )}
                  Al menos un número (recomendado)
                </li>
              </ul>
            </div>

            {/* Botones */}
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="submit"
                disabled={submitting || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                className="w-full px-4 py-3 rounded-2xl font-bold text-sm disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                style={{ background: '#1A5A96', color: 'white' }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Restableciendo...
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    Restablecer contraseña
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => navigate('/beneficiario/login')}
                className="w-full px-4 py-3 rounded-2xl font-semibold text-sm border border-border text-slate-600 hover:bg-slate-50 transition-all"
                disabled={submitting}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BeneficiarioResetPassword;
