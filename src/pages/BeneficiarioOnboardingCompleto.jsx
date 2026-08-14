import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { showErrorAlert, showSuccessAlert } from '../lib/alerts';
import { 
  ChevronRight, ChevronLeft, Lock, User, Home, BookOpen, 
  DollarSign, FileText, Check, X, Eye, EyeOff, AlertCircle,
  Users, GraduationCap, Briefcase, Upload, PenTool, Shield
} from 'lucide-react';

const BeneficiarioOnboardingCompleto = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [beneficiarioId, setBeneficiarioId] = useState(null);
  const [redirectToDashboard, setRedirectToDashboard] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  
  const [formData, setFormData] = useState({
    // Paso 1-3: Autenticación (ya manejado en BeneficiarioAuthSetup)
    document: '',
    email: '',
    password: '',
    passwordConfirm: '',
    setupToken: '',
    
    // Paso 4: Datos personales básicos
    genero: '',
    fecha_nacimiento: '',
    telefono: '',
    direccion_residencia: '',
    barrio_corregimiento: '',
    dpto_residencia: '',
    municipio_residencia: '',
    zona_residencia: '',
    pais_nacimiento: 'COLOMBIA',
    dpto_nacimiento: '',
    municipio_nacimiento: '',
    
    // Paso 5: Información socioeconómica
    sisben_grupo: '',
    recibe_subsidio: '',
    cual_subsidio: '',
    enfoque_diferencial: 'NINGUNO',
    labora_actualmente: '',
    
    // Paso 5b: Composición familiar (opcional)
    nombre_padre: '',
    documento_padre: '',
    ocupacion_padre: '',
    ingresos_padre: '',
    nombre_madre: '',
    documento_madre: '',
    ocupacion_madre: '',
    ingresos_madre: '',
    
    // Paso 6: Formación secundaria
    titulo_obtenido: '',
    ano_graduacion: '',
    establecimiento_educativo: '',
    puntaje_icfes: '',
    municipio_establecimiento: '',
    
    // Paso 7: Formación superior
    institucion_superior: '',
    programa_academico: '',
    tipo_educacion: 'PROFESIONAL',
    semestre_ingreso: '',
    semestre_actual: '',
    ciudad_institucion: '',
    modalidad: '',
    promedio_anterior: '',
    
    // Paso 8: Información de beca
    modalidad_beca: '',
    año_convocatoria: new Date().getFullYear(),
    
    // Paso 9: Información bancaria
    nombre_banco: '',
    tipo_cuenta_bancaria: 'AHORROS',
    numero_cuenta: '',
    numero_cuenta_confirm: '',
    
    // Paso 10: Documentos (archivos)
    documentos: {
      documento_identidad: null,
      acta_grado: null,
      diploma: null,
      pruebas_saber: null,
      cert_matricula: null,
      cert_notas: null,
      ficha_sisben: null,
      cert_enfoque: null,
      certificado_bancario: null,
    },
    
    // Paso 11: Términos y firma
    acepta_terminos: false,
    acepta_datos: false,
    firma_digital: null,
  });

  const [errors, setErrors] = useState({});
  const [catalogos, setCatalogos] = useState({
    departamentos: [],
    municipios: [],
    establecimientos: [],
    instituciones: [],
    bancos: [],
  });

  // Validadores de contraseña
  const passwordValidations = {
    minLength: formData.password.length >= 8,
    hasUpperCase: /[A-Z]/.test(formData.password),
    hasLowerCase: /[a-z]/.test(formData.password),
    hasNumber: /[0-9]/.test(formData.password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password),
    passwordsMatch: formData.password && formData.password === formData.passwordConfirm,
  };

  const TOTAL_STEPS = 12;

  useEffect(() => {
    // Cargar catálogos
    loadCatalogos();
    
    // Verificar si hay token en URL
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setFormData(prev => ({ ...prev, setupToken: token }));
      setCurrentStep(3); // Ir directo a establecer contraseña
    }
    
    // Cargar progreso guardado
    loadSavedProgress();
  }, []);

  const loadCatalogos = async () => {
    try {
      const [{ data: bancos }, { data: establecimientos }] = await Promise.all([
        supabase.from('catalog_bancos').select('nombre').order('nombre'),
        supabase.from('vw_catalog_establecimientos').select('nombre').order('nombre'),
      ]);

      setCatalogos(prev => ({
        ...prev,
        bancos: bancos?.map(b => b.nombre) || [],
        establecimientos: establecimientos?.map(e => e.nombre) || [],
      }));
    } catch (error) {
      console.error('Error cargando catálogos:', error);
    }
  };

  const loadSavedProgress = () => {
    try {
      const saved = localStorage.getItem('focades:onboarding-progress');
      if (saved) {
        const data = JSON.parse(saved);
        setFormData(prev => ({ ...prev, ...data.formData }));
        setCurrentStep(data.currentStep || 1);
        setBeneficiarioId(data.beneficiarioId);
      }
    } catch (error) {
      console.error('Error cargando progreso:', error);
    }
  };

  const saveProgress = () => {
    try {
      localStorage.setItem('focades:onboarding-progress', JSON.stringify({
        formData,
        currentStep,
        beneficiarioId,
        timestamp: new Date().toISOString(),
      }));
    } catch (error) {
      console.error('Error guardando progreso:', error);
    }
  };

  // Guardar automáticamente cada 30 segundos
  useEffect(() => {
    const interval = setInterval(saveProgress, 30000);
    return () => clearInterval(interval);
  }, [formData, currentStep, beneficiarioId]);

  const validateStep = (step) => {
    const newErrors = {};

    switch (step) {
      case 1: // Verificar documento
        if (!formData.document) newErrors.document = 'Documento requerido';
        if (!formData.email) newErrors.email = 'Email requerido';
        break;

      case 3: // Establecer contraseña
        if (!formData.password) newErrors.password = 'Contraseña requerida';
        if (!formData.passwordConfirm) newErrors.passwordConfirm = 'Confirmación requerida';
        if (formData.password !== formData.passwordConfirm) {
          newErrors.passwordConfirm = 'Las contraseñas no coinciden';
        }
        if (!passwordValidations.minLength || !passwordValidations.hasUpperCase || 
            !passwordValidations.hasLowerCase || !passwordValidations.hasNumber || 
            !passwordValidations.hasSpecial) {
          newErrors.password = 'La contraseña no cumple los requisitos de seguridad';
        }
        break;

      case 4: // Datos personales
        if (!formData.genero) newErrors.genero = 'Campo requerido';
        if (!formData.fecha_nacimiento) newErrors.fecha_nacimiento = 'Campo requerido';
        if (!formData.telefono) newErrors.telefono = 'Campo requerido';
        if (!formData.direccion_residencia) newErrors.direccion_residencia = 'Campo requerido';
        break;

      case 5: // Información socioeconómica
        if (!formData.sisben_grupo) newErrors.sisben_grupo = 'Campo requerido';
        if (!formData.recibe_subsidio) newErrors.recibe_subsidio = 'Campo requerido';
        if (formData.recibe_subsidio === 'SI' && !formData.cual_subsidio) {
          newErrors.cual_subsidio = 'Especifica qué subsidio recibes';
        }
        break;

      case 6: // Formación secundaria
        if (!formData.titulo_obtenido) newErrors.titulo_obtenido = 'Campo requerido';
        if (!formData.ano_graduacion) newErrors.ano_graduacion = 'Campo requerido';
        if (!formData.establecimiento_educativo) newErrors.establecimiento_educativo = 'Campo requerido';
        if (!formData.puntaje_icfes) newErrors.puntaje_icfes = 'Campo requerido';
        break;

      case 7: // Formación superior
        if (!formData.institucion_superior) newErrors.institucion_superior = 'Campo requerido';
        if (!formData.programa_academico) newErrors.programa_academico = 'Campo requerido';
        if (!formData.tipo_educacion) newErrors.tipo_educacion = 'Campo requerido';
        if (!formData.semestre_ingreso) newErrors.semestre_ingreso = 'Campo requerido';
        if (!formData.semestre_actual) newErrors.semestre_actual = 'Campo requerido';
        if (!formData.modalidad) newErrors.modalidad = 'Campo requerido';
        break;

      case 8: // Información de beca
        if (!formData.modalidad_beca) newErrors.modalidad_beca = 'Campo requerido';
        if (!formData.año_convocatoria) newErrors.año_convocatoria = 'Campo requerido';
        break;

      case 9: // Información bancaria
        if (!formData.nombre_banco) newErrors.nombre_banco = 'Campo requerido';
        if (!formData.numero_cuenta) newErrors.numero_cuenta = 'Campo requerido';
        if (!formData.numero_cuenta_confirm) newErrors.numero_cuenta_confirm = 'Campo requerido';
        if (formData.numero_cuenta !== formData.numero_cuenta_confirm) {
          newErrors.numero_cuenta_confirm = 'Los números de cuenta no coinciden';
        }
        break;

      case 10: // Documentos
        const requiredDocs = ['documento_identidad', 'acta_grado', 'diploma', 
                              'pruebas_saber', 'cert_matricula', 'cert_notas', 
                              'certificado_bancario'];
        requiredDocs.forEach(doc => {
          if (!formData.documentos[doc]) {
            newErrors[doc] = 'Documento requerido';
          }
        });
        
        // Documentos condicionales
        if (formData.sisben_grupo && formData.sisben_grupo !== 'NO_APLICA' && !formData.documentos.ficha_sisben) {
          newErrors.ficha_sisben = 'Ficha SISBEN requerida';
        }
        if (formData.enfoque_diferencial && formData.enfoque_diferencial !== 'NINGUNO' && !formData.documentos.cert_enfoque) {
          newErrors.cert_enfoque = 'Certificado de enfoque diferencial requerido';
        }
        break;

      case 11: // Términos y firma
        if (!formData.acepta_terminos) newErrors.acepta_terminos = 'Debes aceptar los términos';
        if (!formData.acepta_datos) newErrors.acepta_datos = 'Debes aceptar el tratamiento de datos';
        if (!formData.firma_digital) newErrors.firma_digital = 'Firma requerida';
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = async () => {
    if (!validateStep(currentStep)) {
      await showErrorAlert({
        title: 'Campos incompletos',
        text: 'Por favor completa todos los campos obligatorios',
      });
      return;
    }

    // Guardar progreso en el backend
    if (beneficiarioId && currentStep >= 4) {
      await updateProfile();
    }

    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
      saveProgress();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const updateProfile = async () => {
    try {
      const result = await supabase.functions.invoke('auth-credentials', {
        body: {
          method: 'update-profile',
          beneficiario_id: beneficiarioId,
          profile_data: {
            genero: formData.genero,
            fecha_nacimiento: formData.fecha_nacimiento,
            telefono: formData.telefono,
            direccion_residencia: formData.direccion_residencia,
            barrio_corregimiento: formData.barrio_corregimiento,
            dpto_residencia: formData.dpto_residencia,
            municipio_residencia: formData.municipio_residencia,
            zona_residencia: formData.zona_residencia,
            pais_nacimiento: formData.pais_nacimiento,
            dpto_nacimiento: formData.dpto_nacimiento,
            municipio_nacimiento: formData.municipio_nacimiento,
            sisben_grupo: formData.sisben_grupo,
            recibe_subsidio: formData.recibe_subsidio,
            cual_subsidio: formData.cual_subsidio,
            enfoque_diferencial: formData.enfoque_diferencial,
            labora_actualmente: formData.labora_actualmente,
            nombre_padre: formData.nombre_padre,
            documento_padre: formData.documento_padre,
            ocupacion_padre: formData.ocupacion_padre,
            ingresos_padre: formData.ingresos_padre,
            nombre_madre: formData.nombre_madre,
            documento_madre: formData.documento_madre,
            ocupacion_madre: formData.ocupacion_madre,
            ingresos_madre: formData.ingresos_madre,
            titulo_obtenido: formData.titulo_obtenido,
            ano_graduacion: formData.ano_graduacion,
            establecimiento_educativo: formData.establecimiento_educativo,
            puntaje_icfes: formData.puntaje_icfes,
            municipio_establecimiento: formData.municipio_establecimiento,
            institucion_superior: formData.institucion_superior,
            programa_academico: formData.programa_academico,
            tipo_educacion: formData.tipo_educacion,
            semestre_ingreso: formData.semestre_ingreso,
            semestre_actual: formData.semestre_actual,
            ciudad_institucion: formData.ciudad_institucion,
            modalidad: formData.modalidad,
            promedio_anterior: formData.promedio_anterior,
            modalidad_beca: formData.modalidad_beca,
            año_convocatoria: formData.año_convocatoria,
            nombre_banco: formData.nombre_banco,
            numero_cuenta: formData.numero_cuenta,
            tipo_cuenta_bancaria: formData.tipo_cuenta_bancaria,
          },
        },
      });

      if (!result.data?.ok) {
        console.error('Error actualizando perfil:', result.data?.error);
      }
    } catch (error) {
      console.error('Error en updateProfile:', error);
    }
  };

  const handleComplete = async () => {
    if (!validateStep(11)) {
      return;
    }

    setLoading(true);
    try {
      // Actualizar perfil final
      await updateProfile();

      // Marcar onboarding como completado
      const result = await supabase.functions.invoke('auth-credentials', {
        body: {
          method: 'complete-onboarding',
          beneficiario_id: beneficiarioId,
          acepta_terminos: formData.acepta_terminos,
          acepta_datos: formData.acepta_datos,
        },
      });

      if (!result.data?.ok) {
        throw new Error(result.data?.error || 'Error completando onboarding');
      }

      // Limpiar progreso guardado
      localStorage.removeItem('focades:onboarding-progress');

      await showSuccessAlert({
        title: '¡Bienvenido a FOCADES!',
        text: 'Tu perfil está completo. Ahora puedes acceder al portal.',
      });

      setRedirectToDashboard(true);
    } catch (error) {
      console.error('Error completando onboarding:', error);
      await showErrorAlert({
        title: 'Error',
        text: error.message || 'No se pudo completar el onboarding',
      });
    } finally {
      setLoading(false);
    }
  };

  if (redirectToDashboard) {
    return <Navigate to="/beneficiario" replace />;
  }

  const renderStep = () => {
    // TODO: Implementar renderizado de cada paso
    return (
      <div className="text-center py-8">
        <p className="text-lg font-semibold text-primary">Paso {currentStep} de {TOTAL_STEPS}</p>
        <p className="text-sm text-slate-600 mt-2">Componente en desarrollo...</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F7FA' }}>
      {/* Header */}
      <header className="h-[72px] bg-white border-b border-border px-8 flex items-center gap-4">
        <img
          src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logofocades-solo.png"
          alt="FOCADES"
          className="h-10"
        />
        <h1 className="text-primary font-bold text-lg">Configuración de Cuenta - Beneficiario</h1>
      </header>

      {/* Progress Bar */}
      <div className="bg-white border-b border-border px-8 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-primary">
              Paso {currentStep} de {TOTAL_STEPS}
            </span>
            <span className="text-sm text-slate-600">
              {Math.round((currentStep / TOTAL_STEPS) * 100)}% completado
            </span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-secondary transition-all duration-300"
              style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="rounded-3xl shadow-xl overflow-hidden bg-white" style={{ border: '1px solid rgba(26,90,150,0.1)' }}>
            <div className="px-8 py-6">
              {renderStep()}
            </div>

            {/* Navigation Buttons */}
            <div className="px-8 py-6 bg-slate-50 border-t border-border flex justify-between">
              <button
                type="button"
                onClick={handlePrevious}
                disabled={currentStep === 1}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft size={18} />
                Anterior
              </button>

              <button
                type="button"
                onClick={() => {
                  saveProgress();
                  showSuccessAlert({
                    title: 'Progreso guardado',
                    text: 'Puedes continuar más tarde desde este punto',
                  });
                }}
                className="px-6 py-3 rounded-xl font-semibold text-sm border border-secondary text-secondary hover:bg-secondary/10 transition-colors"
              >
                Guardar y salir
              </button>

              {currentStep < TOTAL_STEPS ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm disabled:opacity-50 transition-all text-white"
                  style={{ background: '#1A5A96' }}
                >
                  Siguiente
                  <ChevronRight size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm disabled:opacity-50 transition-all text-white"
                  style={{ background: '#22C55E' }}
                >
                  {loading ? 'Finalizando...' : 'Finalizar'}
                  <Check size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BeneficiarioOnboardingCompleto;
