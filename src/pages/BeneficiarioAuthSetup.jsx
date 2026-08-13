import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { showErrorAlert, showSuccessAlert } from '../lib/alerts';
import { ChevronRight, Lock, FileText, Mail, AlertCircle, CheckCircle2, User, BookOpen, DollarSign } from 'lucide-react';

const BeneficiarioAuthSetup = () => {
  const [step, setStep] = useState(1); // 1-3: Auth, 4-6: Perfil
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    // Auth (pasos 1-3)
    document: '',
    email: '',
    password: '',
    passwordConfirm: '',
    setupToken: '',
    // Perfil (pasos 4-6)
    genero: '',
    telefono: '',
    nombre_colegio: '',
    nombre_universidad: '',
    programa_academico: '',
    tipo_educacion: 'PROFESIONAL',
    modalidad_beca: '',
    año_convocatoria: new Date().getFullYear(),
    nombre_banco: '',
    numero_cuenta: '',
    tipo_cuenta_bancaria: 'AHORROS',
  });
  const [beneficiarioInfo, setBeneficiarioInfo] = useState(null);
  const [beneficiarioId, setBeneficiarioId] = useState(null);
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [redirectToDashboard, setRedirectToDashboard] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    // Verificar si viene de un link de setup
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setFormData(prev => ({ ...prev, setupToken: token }));
      setStep(3);
    }
  }, []);

  // Validar perfil (pasos 4-6)
  const validatePerfil = (stepNum) => {
    const newErrors = {};

    if (stepNum === 4) {
      if (!formData.genero) newErrors.genero = 'Campo requerido';
      if (!formData.telefono) newErrors.telefono = 'Campo requerido';
      if (formData.telefono && !/^\d{10}$/.test(formData.telefono.replace(/\D/g, ''))) {
        newErrors.telefono = 'Teléfono inválido (10 dígitos)';
      }
    }

    if (stepNum === 5) {
      if (!formData.nombre_universidad) newErrors.nombre_universidad = 'Campo requerido';
      if (!formData.programa_academico) newErrors.programa_academico = 'Campo requerido';
    }

    if (stepNum === 6) {
      if (!formData.nombre_banco) newErrors.nombre_banco = 'Campo requerido';
      if (!formData.numero_cuenta) newErrors.numero_cuenta = 'Campo requerido';
      if (formData.numero_cuenta && !/^\d+$/.test(formData.numero_cuenta.replace(/\s/g, ''))) {
        newErrors.numero_cuenta = 'Solo se permiten números';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Paso 1: Validar documento y obtener info
  const handleStep1 = async (e) => {
    e.preventDefault();
    if (!formData.document || !formData.email) {
      await showErrorAlert({
        title: 'Campos requeridos',
        text: 'Ingresa tu número de documento y correo electrónico.',
      });
      return;
    }

    setLoading(true);
    try {
      // Obtener ID del beneficiario
      const { data: benef, error: benefError } = await supabase
        .from('portal_beneficiarios')
        .select('id')
        .eq('n_documento', formData.document)
        .single();

      if (benefError || !benef) {
        await showErrorAlert({
          title: 'Documento no encontrado',
          text: 'El número de documento no está registrado en nuestro sistema.',
        });
        return;
      }

      setBeneficiarioId(benef.id);

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

    if (formData.password.length < 8) {
      await showErrorAlert({
        title: 'Contraseña débil',
        text: 'La contraseña debe tener al menos 8 caracteres.',
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

      // Pre-llenar datos del perfil que ya existen
      if (beneficiarioInfo) {
        setFormData(prev => ({
          ...prev,
          nombre_colegio: beneficiarioInfo.nombre_colegio || '',
          nombre_universidad: beneficiarioInfo.nombre_universidad || '',
          programa_academico: beneficiarioInfo.programa_academico || '',
          modalidad_beca: beneficiarioInfo.modalidad_beca || '',
          año_convocatoria: beneficiarioInfo.año_convocatoria || new Date().getFullYear(),
        }));
      }

      setSetupCompleted(true);
      setStep(4); // Ir a paso de perfil personal
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

  // Paso 4: Datos Personales
  const handleStep4 = (e) => {
    e.preventDefault();
    if (!validatePerfil(4)) {
      return;
    }
    setStep(5);
  };

  // Paso 5: Datos Académicos
  const handleStep5 = (e) => {
    e.preventDefault();
    if (!validatePerfil(5)) {
      return;
    }
    setStep(6);
  };

  // Paso 6: Datos Bancarios (FINAL - GUARDAR TODO)
  const handleStep6 = async (e) => {
    e.preventDefault();
    if (!validatePerfil(6)) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('portal_beneficiarios')
        .update({
          genero: formData.genero,
          telefono: formData.telefono,
          nombre_colegio: formData.nombre_colegio,
          nombre_universidad: formData.nombre_universidad,
          programa_academico: formData.programa_academico,
          tipo_educacion: formData.tipo_educacion,
          modalidad_beca: formData.modalidad_beca,
          año_convocatoria: formData.año_convocatoria,
          nombre_banco: formData.nombre_banco,
          numero_cuenta: formData.numero_cuenta,
          tipo_cuenta_bancaria: formData.tipo_cuenta_bancaria,
          perfil_completado_en: new Date().toISOString(),
        })
        .eq('id', beneficiarioId);

      if (error) throw error;

      await showSuccessAlert({
        title: '¡Bienvenido a FOCADES!',
        text: 'Tu perfil está completo. Ahora puedes acceder al portal.',
      });

      setRedirectToDashboard(true);
    } catch (error) {
      console.error('Save profile error:', error);
      await showErrorAlert({
        title: 'Error',
        text: error.message || 'No se pudo guardar tu perfil.',
      });
    } finally {
      setLoading(false);
    }
  };

  if (redirectToDashboard) {
    return <Navigate to="/beneficiario" replace />;
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
        <h1 className="text-primary font-bold text-lg">Portal de Beneficiarios - Configuración</h1>
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
              <h2 className="text-2xl font-bold text-white">Completa tu registro</h2>
              <p className="text-sm text-slate-200 mt-2">
                {step === 1 && 'Paso 1: Verifica tu documento'}
                {step === 2 && 'Paso 2: Revisa tu correo'}
                {step === 3 && 'Paso 3: Establece tu contraseña'}
                {step === 4 && 'Paso 4: Datos personales'}
                {step === 5 && 'Paso 5: Información académica'}
                {step === 6 && 'Paso 6: Datos bancarios'}
              </p>
            </div>

            {/* Barra de progreso */}
            <div className="px-6 pt-6 pb-4">
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5, 6].map(s => (
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

            {/* Body */}
            <div className="px-6 py-6 space-y-4">
              {/* Step 1: Documento */}
              {step === 1 && (
                <form onSubmit={handleStep1} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      <FileText size={16} className="inline mr-2" />
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
                    {loading ? 'Verificando...' : 'Continuar'}
                    <ChevronRight size={18} />
                  </button>
                </form>
              )}

              {/* Step 2: Verificación */}
              {step === 2 && (
                <div className="space-y-4 text-center">
                  <div className="flex justify-center">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(34,197,94,0.1)' }}
                    >
                      <Mail size={32} style={{ color: '#22C55E' }} />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-primary">Revisa tu correo</h3>
                    <p className="text-sm text-slate-600 mt-2">
                      Enviamos un link de verificación a:
                      <br />
                      <strong>{formData.email}</strong>
                    </p>
                  </div>

                  <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="px-2 bg-white text-sm text-slate-500">o</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      <Lock size={16} className="inline mr-2" />
                      Si tienes el código, ingrésalo aquí
                    </label>
                    <input
                      type="text"
                      placeholder="Código de verificación"
                      value={formData.setupToken}
                      onChange={e => setFormData({ ...formData, setupToken: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm transition-all"
                    style={{ background: '#1A5A96', color: 'white' }}
                  >
                    Verificar
                    <ChevronRight size={18} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-full px-4 py-2 text-sm font-semibold text-secondary hover:text-primary transition-colors"
                  >
                    Volver atrás
                  </button>
                </div>
              )}

              {/* Step 3: Contraseña */}
              {step === 3 && (
                <form onSubmit={handleStep3} className="space-y-4">
                  {setupCompleted ? (
                    <div className="text-center space-y-4 py-4">
                      <div className="flex justify-center">
                        <div
                          className="w-16 h-16 rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(34,197,94,0.1)' }}
                        >
                          <CheckCircle2 size={32} style={{ color: '#22C55E' }} />
                        </div>
                      </div>
                      <h3 className="text-lg font-bold text-primary">¡Configuración completa!</h3>
                      <p className="text-sm text-slate-600">Ya puedes iniciar sesión con tu documento y contraseña.</p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-primary mb-2">
                          <Lock size={16} className="inline mr-2" />
                          Contraseña
                        </label>
                        <input
                          type="password"
                          placeholder="Mínimo 8 caracteres"
                          value={formData.password}
                          onChange={e => setFormData({ ...formData, password: e.target.value })}
                          className="w-full px-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
                          disabled={loading}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-primary mb-2">
                          <Lock size={16} className="inline mr-2" />
                          Confirmar contraseña
                        </label>
                        <input
                          type="password"
                          placeholder="Repite tu contraseña"
                          value={formData.passwordConfirm}
                          onChange={e => setFormData({ ...formData, passwordConfirm: e.target.value })}
                          className="w-full px-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
                          disabled={loading}
                        />
                      </div>

                      <div
                        className="rounded-xl px-4 py-3 text-xs leading-relaxed flex items-start gap-2"
                        style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)', color: '#166534' }}
                      >
                        <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                        Usa una contraseña fuerte: mayúsculas, minúsculas, números y símbolos.
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm disabled:opacity-50 transition-all"
                        style={{ background: '#1A5A96', color: 'white' }}
                      >
                        {loading ? 'Guardando...' : 'Siguiente'}
                        <ChevronRight size={18} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        className="w-full px-4 py-2 text-sm font-semibold text-secondary hover:text-primary transition-colors"
                      >
                        Volver atrás
                      </button>
                    </>
                  )}
                </form>
              )}

              {/* Step 4: Datos Personales */}
              {step === 4 && (
                <form onSubmit={handleStep4} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      <User size={16} className="inline mr-2" />
                      Género <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.genero}
                      onChange={e => setFormData({ ...formData, genero: e.target.value })}
                      className={`w-full px-4 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-secondary ${
                        errors.genero ? 'border-red-500' : 'border-border'
                      }`}
                    >
                      <option value="">Selecciona...</option>
                      <option value="MASCULINO">Masculino</option>
                      <option value="FEMENINO">Femenino</option>
                      <option value="OTRO">Otro</option>
                    </select>
                    {errors.genero && <p className="text-xs text-red-500 mt-1">{errors.genero}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      <Mail size={16} className="inline mr-2" />
                      Teléfono <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="3001234567"
                      value={formData.telefono}
                      onChange={e => setFormData({ ...formData, telefono: e.target.value.replace(/\D/g, '') })}
                      className={`w-full px-4 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-secondary ${
                        errors.telefono ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {errors.telefono && <p className="text-xs text-red-500 mt-1">{errors.telefono}</p>}
                    <p className="text-xs text-slate-500 mt-1">10 dígitos sin símbolos</p>
                  </div>

                  <div
                    className="rounded-xl px-4 py-3 text-xs leading-relaxed flex items-start gap-2"
                    style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)', color: '#1e40af' }}
                  >
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    Datos necesarios para contactarte si es importante
                  </div>

                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm disabled:opacity-50 transition-all"
                    style={{ background: '#1A5A96', color: 'white' }}
                  >
                    Siguiente
                    <ChevronRight size={18} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="w-full px-4 py-2 text-sm font-semibold text-secondary hover:text-primary transition-colors"
                  >
                    Volver atrás
                  </button>
                </form>
              )}

              {/* Step 5: Datos Académicos */}
              {step === 5 && (
                <form onSubmit={handleStep5} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      <BookOpen size={16} className="inline mr-2" />
                      Colegio/Instituto
                    </label>
                    <input
                      type="text"
                      placeholder="Nombre de tu institución anterior"
                      value={formData.nombre_colegio}
                      onChange={e => setFormData({ ...formData, nombre_colegio: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      <BookOpen size={16} className="inline mr-2" />
                      Universidad <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Universidad de Antioquia"
                      value={formData.nombre_universidad}
                      onChange={e => setFormData({ ...formData, nombre_universidad: e.target.value })}
                      className={`w-full px-4 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-secondary ${
                        errors.nombre_universidad ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {errors.nombre_universidad && <p className="text-xs text-red-500 mt-1">{errors.nombre_universidad}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      <BookOpen size={16} className="inline mr-2" />
                      Programa Académico <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Ingeniería de Sistemas"
                      value={formData.programa_academico}
                      onChange={e => setFormData({ ...formData, programa_academico: e.target.value })}
                      className={`w-full px-4 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-secondary ${
                        errors.programa_academico ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {errors.programa_academico && <p className="text-xs text-red-500 mt-1">{errors.programa_academico}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      <BookOpen size={16} className="inline mr-2" />
                      Tipo de Educación
                    </label>
                    <select
                      value={formData.tipo_educacion}
                      onChange={e => setFormData({ ...formData, tipo_educacion: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
                    >
                      <option value="PROFESIONAL">Profesional</option>
                      <option value="TECNOLOGICO">Tecnológico</option>
                      <option value="TECNICO">Técnico</option>
                    </select>
                  </div>

                  <div
                    className="rounded-xl px-4 py-3 text-xs leading-relaxed flex items-start gap-2"
                    style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)', color: '#1e40af' }}
                  >
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    Información académica para validar tu beca
                  </div>

                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm disabled:opacity-50 transition-all"
                    style={{ background: '#1A5A96', color: 'white' }}
                  >
                    Siguiente
                    <ChevronRight size={18} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="w-full px-4 py-2 text-sm font-semibold text-secondary hover:text-primary transition-colors"
                  >
                    Volver atrás
                  </button>
                </form>
              )}

              {/* Step 6: Datos Bancarios (FINAL) */}
              {step === 6 && (
                <form onSubmit={handleStep6} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      <DollarSign size={16} className="inline mr-2" />
                      Banco <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.nombre_banco}
                      onChange={e => setFormData({ ...formData, nombre_banco: e.target.value })}
                      className={`w-full px-4 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-secondary ${
                        errors.nombre_banco ? 'border-red-500' : 'border-border'
                      }`}
                    >
                      <option value="">Selecciona tu banco...</option>
                      <option value="BANCOLOMBIA">Bancolombia</option>
                      <option value="BANCO BOGOTA">Banco de Bogotá</option>
                      <option value="DAVIVIENDA">Davivienda</option>
                      <option value="BANCO OCCIDENTE">Banco de Occidente</option>
                      <option value="BANCARISARALDA">Bancarisaralda</option>
                      <option value="BANCO CAJA SOCIAL">Banco Caja Social</option>
                      <option value="BANCAFAMILIA">Bancafamilia</option>
                      <option value="BANCO PATRIMONIAL">Banco Patrimonial</option>
                      <option value="BANCO PICHINCHA">Banco Pichincha</option>
                      <option value="CITIBANK">Citibank</option>
                      <option value="OTROS">Otros</option>
                    </select>
                    {errors.nombre_banco && <p className="text-xs text-red-500 mt-1">{errors.nombre_banco}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      <DollarSign size={16} className="inline mr-2" />
                      Tipo de Cuenta
                    </label>
                    <select
                      value={formData.tipo_cuenta_bancaria}
                      onChange={e => setFormData({ ...formData, tipo_cuenta_bancaria: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary"
                    >
                      <option value="AHORROS">Ahorros</option>
                      <option value="CORRIENTE">Corriente</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      <DollarSign size={16} className="inline mr-2" />
                      Número de Cuenta <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="12345678901234567890"
                      value={formData.numero_cuenta}
                      onChange={e => setFormData({ ...formData, numero_cuenta: e.target.value.replace(/\D/g, '') })}
                      className={`w-full px-4 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-secondary ${
                        errors.numero_cuenta ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {errors.numero_cuenta && <p className="text-xs text-red-500 mt-1">{errors.numero_cuenta}</p>}
                    <p className="text-xs text-slate-500 mt-1">Solo números, sin espacios</p>
                  </div>

                  <div
                    className="rounded-xl px-4 py-3 text-xs leading-relaxed flex items-start gap-2"
                    style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#7c2d12' }}
                  >
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <div>
                      <strong>⚠️ Datos confidenciales</strong><br />
                      Tus datos bancarios están protegidos y se usan solo para pagos de beca
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm disabled:opacity-50 transition-all"
                    style={{ background: '#22C55E', color: 'white' }}
                  >
                    {loading ? 'Finalizando...' : '✓ Completar Registro'}
                    <CheckCircle2 size={18} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep(5)}
                    className="w-full px-4 py-2 text-sm font-semibold text-secondary hover:text-primary transition-colors"
                  >
                    Volver atrás
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Footer info */}
          <p className="text-center text-xs text-slate-500 mt-6">
            ¿Ya tienes acceso?{' '}
            <a href="/beneficiario/login" className="font-semibold text-secondary hover:text-primary transition-colors">
              Inicia sesión aquí
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default BeneficiarioAuthSetup;
