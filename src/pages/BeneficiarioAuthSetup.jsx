import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { showErrorAlert, showSuccessAlert } from '../lib/alerts';
import { ChevronRight, Lock, Mail, AlertCircle, CheckCircle2, Eye, EyeOff, Check, X, LogIn, Home } from 'lucide-react';

const BeneficiarioAuthSetup = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // Solo 3 pasos: verificar documento, ver token, establecer contraseña
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    document: '',
    email: '',
    password: '',
    passwordConfirm: '',
    setupToken: '',
  });
  const [beneficiarioInfo, setBeneficiarioInfo] = useState(null);
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  // Validadores de contraseña
  const passwordValidations = {
    minLength: formData.password.length >= 8,
    hasUpperCase: /[A-Z]/.test(formData.password),
    hasLowerCase: /[a-z]/.test(formData.password),
    hasNumber: /[0-9]/.test(formData.password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password),
    passwordsMatch: formData.password && formData.password === formData.passwordConfirm,
  };

  useEffect(() => {
    // Verificar si viene de un link de setup con token
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setFormData(prev => ({ ...prev, setupToken: token }));
      setStep(3);
    }
  }, []);

  // Paso 1: Iniciar verificación con documento y email
  const handleStep1 = async (e) => {
    e.preventDefault();
    if (!formData.document || !formData.email) {
      await showErrorAlert({
        title: 'Campos requeridos',
        text: 'Ingresa tu documento y correo electrónico.',
      });
      return;
    }

    setLoading(true);
    try {
      // Verificar que el documento existe
      const { data: benef, error: benefError } = await supabase
        .from('portal_beneficiarios')
        .select('id, nombres, apellidos, numero_documento')
        .eq('numero_documento', formData.document)
        .single();

      if (benefError || !benef) {
        await showErrorAlert({
          title: 'Documento no encontrado',
          text: 'El número de documento no está registrado en nuestro sistema.',
        });
        return;
      }

      const result = await supabase.functions.invoke('auth-credentials', {
        body: {
          method: 'setup-init',
          document_number: formData.document,
          email: formData.email,
        },
      });

      if (!result.data?.ok) {
        await showErrorAlert({
          title: 'Error',
          text: result.data?.error || 'No se pudo iniciar el setup.',
        });
        return;
      }

      // Guardar info del beneficiario y token
      setBeneficiarioInfo(result.data.beneficiario);
      setFormData(prev => ({ ...prev, setupToken: result.data.setup_token }));
      setStep(2);

      await showSuccessAlert({
        title: '¡Verificación enviada!',
        text: `Se envió un link de verificación a ${formData.email}`,
      });
    } catch (error) {
      console.error('Setup error:', error);
      await showErrorAlert({
        title: 'Error',
        text: error.message || 'No se pudo procesar tu solicitud.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Paso 3: Establecer contraseña
  const handleStep3 = async (e) => {
    e.preventDefault();
    if (!formData.password || !formData.passwordConfirm) {
      await showErrorAlert({
        title: 'Contraseña requerida',
        text: 'Ingresa y confirma tu contraseña.',
      });
      return;
    }

    if (formData.password !== formData.passwordConfirm) {
      await showErrorAlert({
        title: 'Contraseñas no coinciden',
        text: 'Las contraseñas deben ser iguales.',
      });
      return;
    }

    // Validar todos los requisitos de seguridad
    if (!passwordValidations.minLength) {
      await showErrorAlert({
        title: 'Contraseña muy corta',
        text: 'La contraseña debe tener al menos 8 caracteres.',
      });
      return;
    }

    if (!passwordValidations.hasUpperCase || !passwordValidations.hasLowerCase) {
      await showErrorAlert({
        title: 'Contraseña débil',
        text: 'La contraseña debe contener mayúsculas y minúsculas.',
      });
      return;
    }

    if (!passwordValidations.hasNumber) {
      await showErrorAlert({
        title: 'Contraseña débil',
        text: 'La contraseña debe contener al menos un número.',
      });
      return;
    }

    if (!passwordValidations.hasSpecial) {
      await showErrorAlert({
        title: 'Contraseña débil',
        text: 'La contraseña debe contener al menos un carácter especial (!@#$%).',
      });
      return;
    }

    setLoading(true);
    try {
      const result = await supabase.functions.invoke('auth-credentials', {
        body: {
          method: 'setup-complete',
          setup_token: formData.setupToken,
          password: formData.password,
          password_confirm: formData.passwordConfirm,
        },
      });

      if (!result.data?.ok) {
        await showErrorAlert({
          title: 'Error',
          text: result.data?.error || 'No se pudo establecer la contraseña.',
        });
        return;
      }

      setSetupCompleted(true);
      
      await showSuccessAlert({
        title: '¡Contraseña creada exitosamente!',
        text: 'Ahora debes iniciar sesión con tu documento y contraseña para completar tu perfil.',
        icon: 'success',
      });
      
    } catch (error) {
      console.error('Setup complete error:', error);
      await showErrorAlert({
        title: 'Error',
        text: error.message || 'No se pudo completar el setup.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F7FA' }}>
      {/* Header */}
      <header className="h-[72px] bg-white border-b border-border px-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logofocades-solo.png"
            alt="FOCADES"
            className="h-10"
          />
          <h1 className="text-primary font-bold text-lg">Portal de Beneficiarios - Configuración</h1>
        </div>
        <a
          href="/"
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-primary transition-colors"
        >
          <Home size={18} />
          Volver al inicio
        </a>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Tarjeta principal */}
          <div
            className="rounded-3xl shadow-xl overflow-hidden"
            style={{ border: '1px solid rgba(26,90,150,0.1)' }}
          >
            {/* Header */}
            <div
              className="px-6 py-8"
              style={{ background: 'linear-gradient(135deg, #0D2C54 0%, #081e3a 100%)' }}
            >
              <div
                className="w-12 h-12 rounded-2xl font-black flex items-center justify-center text-lg mb-4"
                style={{ background: '#F9A03F', color: '#0D2C54' }}
              >
                F
              </div>
              <h2 className="text-2xl font-bold text-white">
                {setupCompleted ? '¡Registro completado!' : 'Completa tu registro'}
              </h2>
              <p className="text-sm text-slate-200 mt-2">
                {setupCompleted && 'Ahora puedes iniciar sesión'}
                {!setupCompleted && step === 1 && 'Paso 1: Verifica tu documento'}
                {!setupCompleted && step === 2 && 'Paso 2: Revisa tu correo'}
                {!setupCompleted && step === 3 && 'Paso 3: Establece tu contraseña'}
              </p>
            </div>

            {/* Barra de progreso (solo si no está completado) */}
            {!setupCompleted && (
              <div className="px-6 pt-6 pb-4">
                <div className="flex gap-2">
                  {[1, 2, 3].map(s => (
                    <div
                      key={s}
                      className="flex-1 h-2 rounded-full transition-all"
                      style={{
                        background: s <= step ? '#1A5A96' : '#E2E8F0',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Body */}
            <div className="px-6 py-6 space-y-4">
              {/* Mensaje final: Ir a login */}
              {setupCompleted && (
                <div className="space-y-4">
                  <div
                    className="rounded-xl px-4 py-3 text-sm leading-relaxed flex items-start gap-3"
                    style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)', color: '#166534' }}
                  >
                    <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold mb-1">Tu contraseña ha sido creada exitosamente.</p>
                      <p className="text-xs">
                        Para completar tu perfil y subir documentos, debes iniciar sesión con tu documento y la contraseña que acabas de crear.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate('/beneficiario/login')}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm transition-all"
                    style={{ background: '#1A5A96', color: 'white' }}
                  >
                    <LogIn size={18} />
                    Ir a iniciar sesión
                  </button>

                  <p className="text-center text-xs text-slate-500">
                    Una vez autenticado, podrás completar tu información y subir los documentos requeridos.
                  </p>
                </div>
              )}

              {/* Step 1: Documento */}
              {!setupCompleted && step === 1 && (
                <form onSubmit={handleStep1} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      <Lock size={16} className="inline mr-2" />
                      Número de documento
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: 1023456789"
                      value={formData.document}
                      onChange={e => setFormData({ ...formData, document: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      <Mail size={16} className="inline mr-2" />
                      Correo electrónico
                    </label>
                    <input
                      type="email"
                      placeholder="tu@correo.com"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
                      disabled={loading}
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Usaremos este correo para enviar el link de verificación
                    </p>
                  </div>

                  <div
                    className="rounded-xl px-4 py-3 text-xs leading-relaxed flex items-start gap-2"
                    style={{ background: 'rgba(249,160,63,0.10)', border: '1px solid rgba(249,160,63,0.25)', color: '#7C5D1A' }}
                  >
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    Asegúrate de ingresar el correo electrónico correcto. Es necesario para verificar tu identidad.
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm disabled:opacity-50 transition-all"
                    style={{ background: '#1A5A96', color: 'white' }}
                  >
                    {loading ? 'Enviando...' : 'Enviar verificación'}
                    {!loading && <ChevronRight size={18} />}
                  </button>
                </form>
              )}

              {/* Step 2: Revisar correo */}
              {!setupCompleted && step === 2 && (
                <div className="space-y-4">
                  <div
                    className="rounded-xl px-4 py-3 text-sm leading-relaxed flex items-start gap-2"
                    style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)', color: '#1e40af' }}
                  >
                    <Mail size={16} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Verifica tu correo electrónico</p>
                      <p className="text-xs mt-1">
                        Enviamos un link de verificación a <strong>{formData.email}</strong>. Haz clic en el enlace para continuar.
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 text-center">
                    Si no ves el correo, revisa tu carpeta de spam. El enlace es válido por 24 horas.
                  </p>

                  <button
                    onClick={() => setStep(3)}
                    className="w-full px-4 py-2 text-sm font-semibold text-secondary hover:text-primary transition-colors"
                  >
                    Ya tengo el link, continuar
                  </button>

                  <button
                    onClick={() => setStep(1)}
                    className="w-full px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Volver atrás
                  </button>
                </div>
              )}

              {/* Step 3: Contraseña */}
              {!setupCompleted && step === 3 && (
                <form onSubmit={handleStep3} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      <Lock size={16} className="inline mr-2" />
                      Nueva contraseña
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-4 py-2 pr-10 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      Confirmar contraseña
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswordConfirm ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={formData.passwordConfirm}
                        onChange={e => setFormData({ ...formData, passwordConfirm: e.target.value })}
                        className="w-full px-4 py-2 pr-10 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPasswordConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Validaciones en tiempo real */}
                  <div className="space-y-2 bg-slate-50 p-3 rounded-xl">
                    <p className="text-xs font-semibold text-slate-600 mb-2">La contraseña debe tener:</p>
                    <ValidationItem isValid={passwordValidations.minLength} text="Al menos 8 caracteres" />
                    <ValidationItem isValid={passwordValidations.hasUpperCase} text="Una letra mayúscula (A-Z)" />
                    <ValidationItem isValid={passwordValidations.hasLowerCase} text="Una letra minúscula (a-z)" />
                    <ValidationItem isValid={passwordValidations.hasNumber} text="Un número (0-9)" />
                    <ValidationItem isValid={passwordValidations.hasSpecial} text="Un carácter especial (!@#$%)" />
                    <ValidationItem isValid={passwordValidations.passwordsMatch} text="Las contraseñas coinciden" />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !Object.values(passwordValidations).every(v => v === true)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm disabled:opacity-50 transition-all"
                    style={{ background: '#1A5A96', color: 'white' }}
                  >
                    {loading ? 'Guardando...' : 'Establecer contraseña'}
                    {!loading && <ChevronRight size={18} />}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Footer info */}
          {!setupCompleted && (
            <p className="text-center text-xs text-slate-500 mt-6">
              ¿Ya tienes acceso?{' '}
              <a href="/beneficiario/login" className="font-semibold text-secondary hover:text-primary transition-colors">
                Inicia sesión aquí
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// Componente auxiliar para mostrar validaciones de contraseña
const ValidationItem = ({ isValid, text }) => (
  <div className={`flex items-center gap-2 text-xs ${isValid ? 'text-green-700' : 'text-slate-500'}`}>
    {isValid ? (
      <Check size={14} className="shrink-0" />
    ) : (
      <X size={14} className="shrink-0" />
    )}
    <span>{text}</span>
  </div>
);

export default BeneficiarioAuthSetup;
