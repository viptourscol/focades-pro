import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { showErrorAlert, showSuccessAlert } from '../lib/alerts';
import { TERMS_AND_CONDITIONS_TEXT, DATA_POLICY_TEXT } from '../lib/legalTexts';
import SignatureCanvas from 'react-signature-canvas';
import { 
  ChevronRight, ChevronLeft, Lock, User, Home, BookOpen, 
  DollarSign, FileText, Check, X, Eye, EyeOff, AlertCircle,
  Users, GraduationCap, Briefcase, Upload, PenTool, Shield, CheckCircle, Trash2, Info
} from 'lucide-react';

// Componente auxiliar para validaciones de contraseña
const ValidationItem = ({ valid, text }) => (
  <div className="flex items-center gap-2">
    {valid ? (
      <Check size={16} className="text-green-600" />
    ) : (
      <X size={16} className="text-slate-400" />
    )}
    <span className={`text-sm ${valid ? 'text-green-600' : 'text-slate-600'}`}>
      {text}
    </span>
  </div>
);

const BeneficiarioOnboardingCompleto = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [beneficiarioId, setBeneficiarioId] = useState(null);
  const [redirectToDashboard, setRedirectToDashboard] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(false); // Track if user came from login
  
  // Estados para documentos y firma
  const [uploadedDocs, setUploadedDocs] = useState({});
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const signatureRef = useRef(null);
  
  // Estados para modales legales
  const [leidoTerminos, setLeidoTerminos] = useState(false);
  const [leidoDatos, setLeidoDatos] = useState(false);
  const [modalLegal, setModalLegal] = useState(null); // 'terminos' | 'datos' | null
  
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
    
    // Paso 7: Formación superior
    institucion_superior: '',
    programa_academico: '',
    tipo_educacion: 'PROFESIONAL',
    semestre_ingreso: '',
    semestre_actual: '',
    dpto_institucion: '',
    municipio_institucion: '',
    modalidad: '',
    
    // Datos de beca (pre-cargados por admin, no editables en este flujo)
    modalidad_beca: '',
    año_convocatoria: new Date().getFullYear(),

    // Paso 8: Información bancaria (antes era paso 9)
    nombre_banco: '',
    tipo_cuenta_bancaria: 'AHORROS',
    numero_cuenta: '',
    numero_cuenta_confirm: '',

    // Paso 9: Documentos (antes era paso 10)(archivos)
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
    
    // Paso 10: Términos y firma (antes era paso 11)
    acepta_terminos: false,
    acepta_datos: false,
    firma_digital: null,
  });

  const [errors, setErrors] = useState({});
  const [catalogos, setCatalogos] = useState({
    departamentos: [],
    municipios: [],
    municipiosFiltrados: [],
    municipiosInstitucionFiltrados: [],
    establecimientos: [],
    instituciones: [],
    bancos: [],
  });

  // Opciones para selects
  const OCUPACION_OPTIONS = [
    'Fallecido',
    'Hogar',
    'Empleado',
    'Independiente',
    'Pensionado',
    'Desempleado',
    'No sabe/No responde',
  ];

  const INGRESOS_OPTIONS = [
    'Sin ingresos',
    'Menos de 1 SMLV',
    'Entre 1 y 2 SMLV',
    'Entre 2 y 3 SMLV',
    'Más de 3 SMLV',
  ];

  // Validadores de contraseña
  const passwordValidations = {
    minLength: formData.password.length >= 8,
    hasUpperCase: /[A-Z]/.test(formData.password),
    hasLowerCase: /[a-z]/.test(formData.password),
    hasNumber: /[0-9]/.test(formData.password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password),
    passwordsMatch: formData.password && formData.password === formData.passwordConfirm,
  };

  const TOTAL_STEPS = 11; // Eliminamos paso 8 (info beca) ya que admin ya tiene esos datos

  useEffect(() => {
    const initComponent = async () => {
      // Cargar catálogos
      await loadCatalogos();
      
      // Verificar si viene desde login (sesión en localStorage)
      const sessionStr = localStorage.getItem('focades:beneficiario-session');
      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr);
          const profile = session.profile;
          
          // Si onboarding ya está completo, redirigir al dashboard
          if (profile && profile.onboarding_completado) {
            setRedirectToDashboard(true);
            return;
          }
          
          // Usuario ya estableció contraseña, continuar desde paso 4
          setBeneficiarioId(profile.id);
          setCurrentStep(4);
          setIsLoginMode(true); // Mark as login mode
          
          // Pre-cargar datos del perfil
          setFormData(prev => ({
            ...prev,
            email: profile.email || '',
            document: profile.n_documento || '',
            genero: profile.genero || '',
            telefono: profile.telefono || '',
            fecha_nacimiento: profile.fecha_nacimiento || '',
            direccion_residencia: profile.direccion_residencia || '',
            barrio_corregimiento: profile.barrio_corregimiento || '',
            dpto_residencia: profile.dpto_residencia || '',
            municipio_residencia: profile.municipio_residencia || '',
            zona_residencia: profile.zona_residencia || '',
            pais_nacimiento: profile.pais_nacimiento || 'COLOMBIA',
            dpto_nacimiento: profile.dpto_nacimiento || '',
            municipio_nacimiento: profile.municipio_nacimiento || '',
            sisben_grupo: profile.sisben_grupo || '',
            recibe_subsidio: profile.recibe_subsidio || '',
            cual_subsidio: profile.cual_subsidio || '',
            enfoque_diferencial: profile.enfoque_diferencial || 'NINGUNO',
            labora_actualmente: profile.labora_actualmente || '',
            titulo_obtenido: profile.titulo_obtenido || '',
            ano_graduacion: profile.ano_graduacion || '',
            establecimiento_educativo: profile.establecimiento_educativo || '',
            puntaje_icfes: profile.puntaje_icfes || '',
            institucion_superior: profile.institucion_superior || '',
            programa_academico: profile.programa_academico || '',
            tipo_educacion: profile.tipo_educacion || 'PROFESIONAL',
            semestre_ingreso: profile.semestre_ingreso || '',
            semestre_actual: profile.semestre_actual || '',
            dpto_institucion: profile.dpto_institucion || '',
            municipio_institucion: profile.municipio_institucion || '',
            modalidad: profile.modalidad || '',
            modalidad_beca: profile.modalidad_beca || '',
            año_convocatoria: profile.año_convocatoria || new Date().getFullYear(),
            nombre_banco: profile.nombre_banco || '',
            tipo_cuenta_bancaria: profile.tipo_cuenta_bancaria || 'AHORROS',
            numero_cuenta: profile.numero_cuenta || '',
          }));
          
          // Cargar progreso guardado si existe
          loadSavedProgress();
          return;
        } catch (error) {
          console.error('Error leyendo sesión:', error);
        }
      }
      
      // Si no hay sesión, verificar si hay token en URL (flujo normal desde email)
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      if (token) {
        setFormData(prev => ({ ...prev, setupToken: token }));
        setCurrentStep(3); // Ir directo a establecer contraseña
      }
      
      // Cargar progreso guardado
      loadSavedProgress();
    };
    
    initComponent();
  }, []);

  const loadCatalogos = async () => {
    try {
      const [{ data: bancos }, { data: establecimientos }, { data: departamentos }, { data: municipios }] = await Promise.all([
        supabase.from('catalog_bancos').select('nombre').order('nombre'),
        supabase.from('vw_catalog_establecimientos').select('nombre').order('nombre'),
        supabase.from('vw_catalog_departamentos_colombia').select('*').order('nombre'),
        supabase.from('vw_catalog_municipios_colombia').select('*').order('nombre'),
      ]);

      setCatalogos(prev => ({
        ...prev,
        bancos: bancos?.map(b => b.nombre) || [],
        establecimientos: establecimientos?.map(e => e.nombre) || [],
        departamentos: departamentos || [],
        municipios: municipios || [],
        municipiosFiltrados: [],
        municipiosInstitucionFiltrados: [],
      }));
    } catch (error) {
      console.error('Error cargando catálogos:', error);
    }
  };

  // Cargar catálogos al iniciar
  useEffect(() => {
    loadCatalogos();
  }, []);

  // Filtrar municipios de residencia cuando cambia el departamento
  useEffect(() => {
    if (formData.dpto_residencia && catalogos.municipios.length > 0) {
      const filtered = catalogos.municipios.filter(
        m => m.departamento === formData.dpto_residencia
      );
      setCatalogos(prev => ({ ...prev, municipiosFiltrados: filtered }));
    } else {
      setCatalogos(prev => ({ ...prev, municipiosFiltrados: [] }));
    }
  }, [formData.dpto_residencia, catalogos.municipios]);

  // Filtrar municipios de institución cuando cambia el departamento
  useEffect(() => {
    if (formData.dpto_institucion && catalogos.municipios.length > 0) {
      const filtered = catalogos.municipios.filter(
        m => m.departamento === formData.dpto_institucion
      );
      setCatalogos(prev => ({ ...prev, municipiosInstitucionFiltrados: filtered }));
    } else {
      setCatalogos(prev => ({ ...prev, municipiosInstitucionFiltrados: [] }));
    }
  }, [formData.dpto_institucion, catalogos.municipios]);

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

      case 8: // Información bancaria (antes era paso 9)
        if (!formData.nombre_banco) newErrors.nombre_banco = 'Campo requerido';
        if (!formData.numero_cuenta) newErrors.numero_cuenta = 'Campo requerido';
        if (!formData.numero_cuenta_confirm) newErrors.numero_cuenta_confirm = 'Campo requerido';
        if (formData.numero_cuenta !== formData.numero_cuenta_confirm) {
          newErrors.numero_cuenta_confirm = 'Los números de cuenta no coinciden';
        }
        break;

      case 9: // Documentos (antes era paso 10)
        const requiredDocs = ['documento_identidad', 'acta_grado', 'diploma', 
                              'pruebas_saber', 'cert_matricula', 'cert_notas', 
                              'certificado_bancario'];
        requiredDocs.forEach(doc => {
          if (!uploadedDocs[doc]) {
            newErrors[doc] = 'Documento requerido';
          }
        });
        
        // Documentos condicionales
        if (formData.sisben_grupo && formData.sisben_grupo !== 'NO_APLICA' && !uploadedDocs.ficha_sisben) {
          newErrors.ficha_sisben = 'Ficha SISBEN requerida';
        }
        if (formData.enfoque_diferencial && formData.enfoque_diferencial !== 'NINGUNO' && !uploadedDocs.cert_enfoque) {
          newErrors.cert_enfoque = 'Certificado de enfoque diferencial requerido';
        }
        break;

      case 10: // Términos y firma (antes era paso 11)
        if (!formData.acepta_terminos) newErrors.acepta_terminos = 'Debes aceptar los términos';
        if (!formData.acepta_datos) newErrors.acepta_datos = 'Debes aceptar el tratamiento de datos';
        if (!formData.firma_digital) newErrors.firma_digital = 'Debes firmar digitalmente';
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

    setLoading(true);
    try {
      // Paso 1: Verificar documento (setup-init)
      if (currentStep === 1) {
        const result = await supabase.functions.invoke('auth-credentials', {
          body: {
            method: 'setup-init',
            document_number: formData.document,
            email: formData.email,
          },
        });

        if (!result.data?.ok) {
          throw new Error(result.data?.error || 'Error al verificar documento');
        }

        // En producción el token se envía por email, aquí lo obtenemos directamente
        if (result.data.setup_token) {
          setFormData(prev => ({ ...prev, setupToken: result.data.setup_token }));
        }

        // Pre-cargar datos existentes del beneficiario
        if (result.data.beneficiario) {
          const benef = result.data.beneficiario;
          setFormData(prev => ({
            ...prev,
            // Datos ya cargados por el admin
            genero: benef.genero || '',
            telefono: benef.telefono || '',
            direccion_residencia: benef.direccion_residencia || '',
            fecha_nacimiento: benef.fecha_nacimiento || '',
            barrio_corregimiento: benef.barrio_corregimiento || '',
            dpto_residencia: benef.dpto_residencia || '',
            municipio_residencia: benef.municipio_residencia || '',
            zona_residencia: benef.zona_residencia || '',
            pais_nacimiento: benef.pais_nacimiento || 'COLOMBIA',
            dpto_nacimiento: benef.dpto_nacimiento || '',
            municipio_nacimiento: benef.municipio_nacimiento || '',
            sisben_grupo: benef.sisben_grupo || '',
            recibe_subsidio: benef.recibe_subsidio || '',
            cual_subsidio: benef.cual_subsidio || '',
            enfoque_diferencial: benef.enfoque_diferencial || 'NINGUNO',
            labora_actualmente: benef.labora_actualmente || '',
            titulo_obtenido: benef.titulo_obtenido || '',
            ano_graduacion: benef.ano_graduacion || '',
            establecimiento_educativo: benef.establecimiento_educativo || '',
            puntaje_icfes: benef.puntaje_icfes || '',
            institucion_superior: benef.institucion_superior || '',
            programa_academico: benef.programa_academico || '',
            tipo_educacion: benef.tipo_educacion || 'PROFESIONAL',
            semestre_ingreso: benef.semestre_ingreso || '',
            semestre_actual: benef.semestre_actual || '',
            dpto_institucion: benef.dpto_institucion || '',
            municipio_institucion: benef.municipio_institucion || '',
            modalidad: benef.modalidad || '',
            modalidad_beca: benef.modalidad_beca || '',
            año_convocatoria: benef.año_convocatoria || new Date().getFullYear(),
            nombre_banco: benef.nombre_banco || '',
            tipo_cuenta_bancaria: benef.tipo_cuenta_bancaria || 'AHORROS',
            numero_cuenta: benef.numero_cuenta || '',
          }));
        }

        await showSuccessAlert({
          title: '¡Documento verificado!',
          text: 'Hemos cargado tu información. Verifica y completa los datos faltantes.',
        });
      }

      // Paso 3: Establecer contraseña (setup-complete)
      if (currentStep === 3) {
        const result = await supabase.functions.invoke('auth-credentials', {
          body: {
            method: 'setup-complete',
            setup_token: formData.setupToken,
            password: formData.password,
            password_confirm: formData.passwordConfirm,
          },
        });

        if (!result.data?.ok) {
          throw new Error(result.data?.error || 'Error al establecer contraseña');
        }

        // Guardar ID del beneficiario
        if (result.data.beneficiario_id) {
          setBeneficiarioId(result.data.beneficiario_id);
        }

        await showSuccessAlert({
          title: '¡Contraseña creada!',
          text: 'Ahora completa tu perfil',
        });
      }

      // Pasos 4-8: Guardar progreso en el backend (antes era 4-9)
      if (beneficiarioId && currentStep >= 4 && currentStep <= 8) {
        await updateProfile();
      }

      // Avanzar al siguiente paso
      if (currentStep < TOTAL_STEPS) {
        setCurrentStep(currentStep + 1);
        saveProgress();
      }
    } catch (error) {
      console.error('Error en handleNext:', error);
      await showErrorAlert({
        title: 'Error',
        text: error.message || 'No se pudo continuar',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrevious = () => {
    const minStep = isLoginMode ? 4 : 1; // Can't go before step 4 if coming from login
    if (currentStep > minStep) {
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
            institucion_superior: formData.institucion_superior,
            programa_academico: formData.programa_academico,
            tipo_educacion: formData.tipo_educacion,
            semestre_ingreso: formData.semestre_ingreso,
            semestre_actual: formData.semestre_actual,
            dpto_institucion: formData.dpto_institucion,
            municipio_institucion: formData.municipio_institucion,
            modalidad: formData.modalidad,
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
    if (!validateStep(10)) { // Ahora es paso 10 (antes era 11)
      return;
    }

    // Validar y guardar firma antes de completar
    if (!handleSaveSignature()) {
      return;
    }

    setLoading(true);
    try {
      // 1. Subir firma digital a Storage
      if (formData.firma_digital) {
        const blob = await fetch(formData.firma_digital).then(res => res.blob());
        const timestamp = Date.now();
        const bucketPath = `beneficiarios_historicos/${beneficiarioId}/firma-digital-${timestamp}.png`;
        const dbPath = `soportes/${bucketPath}`;

        const { error: uploadError } = await supabase.storage
          .from('soportes')
          .upload(bucketPath, blob, {
            contentType: 'image/png',
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Error al subir firma: ${uploadError.message}`);
        }

        // 2. Registrar firma en tabla de documentos usando Edge Function (bypass RLS)
        const registerResult = await supabase.functions.invoke('auth-credentials', {
          body: {
            method: 'register-document',
            beneficiario_id: beneficiarioId,
            titulo: 'Firma digital del beneficiario',
            tipo_documento: 'firma_digital',
            storage_path: dbPath,
            archivo_size_bytes: blob.size,
          },
        });

        if (!registerResult.data?.ok) {
          throw new Error(registerResult.data?.error || 'Error al registrar firma');
        }
      }

      // 3. Actualizar perfil final
      await updateProfile();

      // 4. Marcar onboarding como completado
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

      // 5. Limpiar progreso guardado
      localStorage.removeItem('focades:onboarding-progress');

      // 6. Actualizar sesión en localStorage para que BeneficiarioHome detecte perfil completo
      try {
        const sessionStr = localStorage.getItem('focades:beneficiario-session');
        if (sessionStr) {
          const session = JSON.parse(sessionStr);
          if (session.profile) {
            session.profile.onboarding_completado = true;
            session.profile.perfil_completado_en = new Date().toISOString();
            session.profile.acepta_terminos_at = new Date().toISOString();
            session.profile.acepta_datos_at = new Date().toISOString();
            localStorage.setItem('focades:beneficiario-session', JSON.stringify(session));
          }
        }
      } catch (error) {
        console.error('Error actualizando sesión en localStorage:', error);
      }

      await showSuccessAlert({
        title: '¡Registro Completado!',
        text: 'Tu perfil ha sido creado exitosamente',
      });

      // Avanzar al paso final (resumen)
      setCurrentStep(11); // Ahora es paso 11 (antes era 12)
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

  // ========== FUNCIONES DE MANEJO DE DOCUMENTOS ==========
  const handleUploadDocument = async (tipoDoc, file) => {
    if (!file || !beneficiarioId) return;

    // Validar tipo de archivo
    if (file.type !== 'application/pdf') {
      await showErrorAlert({
        title: 'Formato inválido',
        text: 'Solo se permiten archivos PDF',
      });
      return;
    }

    // Validar tamaño (máximo 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      await showErrorAlert({
        title: 'Archivo muy grande',
        text: 'El archivo no debe superar los 10MB',
      });
      return;
    }

    setUploadingDoc(tipoDoc);
    try {
      // Subir a Storage
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const bucketPath = `beneficiarios_historicos/${beneficiarioId}/documentos/${tipoDoc}-${timestamp}.pdf`;
      const dbPath = `soportes/${bucketPath}`;

      const { error: uploadError } = await supabase.storage
        .from('soportes')
        .upload(bucketPath, file, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Error al subir archivo: ${uploadError.message}`);
      }

      // Registrar en tabla de documentos a través del Edge Function
      // Esto evita problemas de RLS con usuarios anónimos
      const registerResult = await supabase.functions.invoke('auth-credentials', {
        body: {
          method: 'register-document',
          beneficiario_id: beneficiarioId,
          titulo: getDocumentTitle(tipoDoc),
          tipo_documento: tipoDoc,
          storage_path: dbPath,
          archivo_size_bytes: file.size,
        },
      });

      if (!registerResult.data?.ok) {
        throw new Error(registerResult.data?.error || 'Error al registrar documento');
      }

      // Actualizar estado local
      setUploadedDocs(prev => ({
        ...prev,
        [tipoDoc]: {
          nombre: file.name,
          size: file.size,
          path: dbPath,
        },
      }));

      await showSuccessAlert({
        title: 'Documento subido',
        text: `${getDocumentTitle(tipoDoc)} cargado exitosamente`,
        timer: 1500,
      });
    } catch (error) {
      console.error('Error subiendo documento:', error);
      await showErrorAlert({
        title: 'Error',
        text: error.message || 'No se pudo subir el documento',
      });
    } finally {
      setUploadingDoc(null);
    }
  };

  const getDocumentTitle = (tipo) => {
    const titles = {
      documento_identidad: 'Documento de Identidad',
      acta_grado: 'Acta de Grado',
      diploma: 'Diploma de Bachiller',
      pruebas_saber: 'Resultados Pruebas Saber 11',
      cert_matricula: 'Certificado de Matrícula',
      cert_notas: 'Certificado de Notas',
      certificado_bancario: 'Certificado Bancario',
      ficha_sisben: 'Ficha SISBEN',
      cert_enfoque: 'Certificado de Enfoque Diferencial',
    };
    return titles[tipo] || tipo;
  };

  const handleRemoveDocument = (tipoDoc) => {
    setUploadedDocs(prev => {
      const updated = { ...prev };
      delete updated[tipoDoc];
      return updated;
    });
  };

  const handleSaveSignature = () => {
    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      showErrorAlert({
        title: 'Firma requerida',
        text: 'Por favor firma en el recuadro',
      });
      return false;
    }

    // Guardar firma como imagen base64
    const signatureData = signatureRef.current.toDataURL('image/png');
    setFormData(prev => ({ ...prev, firma_digital: signatureData }));
    return true;
  };
  
  // Auto-guardar firma cuando el usuario deja de dibujar
  const handleSignatureEnd = () => {
    if (signatureRef.current && !signatureRef.current.isEmpty()) {
      const signatureData = signatureRef.current.toDataURL('image/png');
      setFormData(prev => ({ ...prev, firma_digital: signatureData }));
    }
  };

  const handleClearSignature = () => {
    if (signatureRef.current) {
      signatureRef.current.clear();
    }
    setFormData(prev => ({ ...prev, firma_digital: null }));
  };

  if (redirectToDashboard) {
    return <Navigate to="/beneficiario" replace />;
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return renderStepVerificarDocumento();
      case 2:
        return renderStepRevisarEmail();
      case 3:
        return renderStepEstablecerPassword();
      case 4:
        return renderStepDatosPersonales();
      case 5:
        return renderStepInfoSocioeconomica();
      case 6:
        return renderStepFormacionSecundaria();
      case 7:
        return renderStepFormacionSuperior();
      case 8:
        return renderStepInfoBancaria();
      case 9:
        return renderStepDocumentos();
      case 10:
        return renderStepTerminosYFirma();
      case 11:
        return renderStepResumen();
      default:
        return null;
    }
  };

  // ========== PASO 1: Verificar Documento ==========
  const renderStepVerificarDocumento = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <User size={32} className="text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-primary">Verificar Identidad</h2>
        <p className="text-slate-600 mt-2">Ingresa tu documento para iniciar el proceso</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Número de Documento
          </label>
          <input
            type="text"
            value={formData.document}
            onChange={(e) => setFormData({ ...formData, document: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none transition-all"
            placeholder="Ej: 1234567890"
          />
          {errors.document && <p className="text-red-500 text-sm mt-1">{errors.document}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Correo Electrónico
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none transition-all"
            placeholder="tucorreo@ejemplo.com"
          />
          {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
        </div>
      </div>
    </div>
  );

  // ========== PASO 2: Revisar Email ==========
  const renderStepRevisarEmail = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={32} className="text-secondary" />
        </div>
        <h2 className="text-2xl font-bold text-primary">Revisa tu Correo</h2>
        <p className="text-slate-600 mt-2">
          Hemos enviado un enlace de activación a <strong>{formData.email}</strong>
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800">
          <strong>Nota:</strong> Si llegaste desde el enlace del correo, continúa al siguiente paso.
        </p>
      </div>
    </div>
  );

  // ========== PASO 3: Establecer Contraseña ==========
  const renderStepEstablecerPassword = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock size={32} className="text-secondary" />
        </div>
        <h2 className="text-2xl font-bold text-primary">Crear Contraseña</h2>
        <p className="text-slate-600 mt-2">Protege tu cuenta con una contraseña segura</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Nueva Contraseña
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none transition-all pr-12"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Confirmar Contraseña
          </label>
          <div className="relative">
            <input
              type={showPasswordConfirm ? 'text' : 'password'}
              value={formData.passwordConfirm}
              onChange={(e) => setFormData({ ...formData, passwordConfirm: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none transition-all pr-12"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPasswordConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {errors.passwordConfirm && <p className="text-red-500 text-sm mt-1">{errors.passwordConfirm}</p>}
        </div>

        {/* Validadores */}
        <div className="bg-slate-50 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-slate-700 mb-2">La contraseña debe contener:</p>
          <ValidationItem valid={passwordValidations.minLength} text="Mínimo 8 caracteres" />
          <ValidationItem valid={passwordValidations.hasUpperCase} text="Una letra mayúscula" />
          <ValidationItem valid={passwordValidations.hasLowerCase} text="Una letra minúscula" />
          <ValidationItem valid={passwordValidations.hasNumber} text="Un número" />
          <ValidationItem valid={passwordValidations.hasSpecial} text="Un carácter especial (!@#$%^&*)" />
          <ValidationItem valid={passwordValidations.passwordsMatch} text="Las contraseñas coinciden" />
        </div>
      </div>
    </div>
  );

  // ========== PASO 4: Datos Personales ==========
  const renderStepDatosPersonales = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <User size={32} className="text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-primary">Datos Personales</h2>
        <p className="text-slate-600 mt-2">Completa tu información básica</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Género *</label>
          <select
            value={formData.genero}
            onChange={(e) => setFormData({ ...formData, genero: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          >
            <option value="">Selecciona...</option>
            <option value="MASCULINO">Masculino</option>
            <option value="FEMENINO">Femenino</option>
            <option value="OTRO">Otro</option>
          </select>
          {errors.genero && <p className="text-red-500 text-sm mt-1">{errors.genero}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Fecha de Nacimiento *</label>
          <input
            type="date"
            value={formData.fecha_nacimiento}
            onChange={(e) => setFormData({ ...formData, fecha_nacimiento: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          />
          {errors.fecha_nacimiento && <p className="text-red-500 text-sm mt-1">{errors.fecha_nacimiento}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Teléfono *</label>
        <input
          type="tel"
          value={formData.telefono}
          onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          placeholder="3001234567"
        />
        {errors.telefono && <p className="text-red-500 text-sm mt-1">{errors.telefono}</p>}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Dirección de Residencia *</label>
        <input
          type="text"
          value={formData.direccion_residencia}
          onChange={(e) => setFormData({ ...formData, direccion_residencia: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          placeholder="Calle 123 #45-67"
        />
        {errors.direccion_residencia && <p className="text-red-500 text-sm mt-1">{errors.direccion_residencia}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Departamento *</label>
          <select
            value={formData.dpto_residencia}
            onChange={(e) => {
              setFormData({ ...formData, dpto_residencia: e.target.value, municipio_residencia: '' });
            }}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          >
            <option value="">Selecciona departamento...</option>
            {catalogos.departamentos.map((dept, idx) => (
              <option key={idx} value={dept.nombre}>{dept.nombre}</option>
            ))}
          </select>
          {errors.dpto_residencia && <p className="text-red-500 text-sm mt-1">{errors.dpto_residencia}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Municipio *</label>
          <select
            value={formData.municipio_residencia}
            onChange={(e) => setFormData({ ...formData, municipio_residencia: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
            disabled={!formData.dpto_residencia}
          >
            <option value="">Selecciona municipio...</option>
            {catalogos.municipiosFiltrados.map((mun, idx) => (
              <option key={idx} value={mun.nombre}>{mun.nombre}</option>
            ))}
          </select>
          {errors.municipio_residencia && <p className="text-red-500 text-sm mt-1">{errors.municipio_residencia}</p>}
          {!formData.dpto_residencia && (
            <p className="text-xs text-slate-500 mt-1">Primero selecciona un departamento</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Barrio/Corregimiento</label>
          <input
            type="text"
            value={formData.barrio_corregimiento}
            onChange={(e) => setFormData({ ...formData, barrio_corregimiento: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Zona</label>
          <select
            value={formData.zona_residencia}
            onChange={(e) => setFormData({ ...formData, zona_residencia: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          >
            <option value="">Selecciona...</option>
            <option value="URBANA">Urbana</option>
            <option value="RURAL">Rural</option>
          </select>
        </div>
      </div>

      <div className="border-t border-slate-200 pt-4 mt-4">
        <h3 className="text-lg font-semibold text-slate-700 mb-4">Lugar de Nacimiento</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">País</label>
            <input
              type="text"
              value={formData.pais_nacimiento}
              onChange={(e) => setFormData({ ...formData, pais_nacimiento: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
              placeholder="Colombia"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Departamento</label>
            <select
              value={formData.dpto_nacimiento}
              onChange={(e) => setFormData({ ...formData, dpto_nacimiento: e.target.value, municipio_nacimiento: '' })}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
            >
              <option value="">Selecciona...</option>
              {catalogos.departamentos.map((dept, idx) => (
                <option key={idx} value={dept.nombre}>{dept.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Municipio</label>
            <select
              value={formData.municipio_nacimiento}
              onChange={(e) => setFormData({ ...formData, municipio_nacimiento: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
              disabled={!formData.dpto_nacimiento}
            >
              <option value="">Selecciona...</option>
              {catalogos.municipios.filter(m => m.departamento === formData.dpto_nacimiento).map((mun, idx) => (
                <option key={idx} value={mun.nombre}>{mun.nombre}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );

  // ========== PASO 5: Información Socioeconómica ==========
  const renderStepInfoSocioeconomica = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Home size={32} className="text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-primary">Información Socioeconómica</h2>
        <p className="text-slate-600 mt-2">Ayúdanos a conocer tu contexto social</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Grupo SISBEN *</label>
          <select
            value={formData.sisben_grupo}
            onChange={(e) => setFormData({ ...formData, sisben_grupo: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          >
            <option value="">Selecciona...</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
            <option value="NO_APLICA">No Aplica</option>
          </select>
          {errors.sisben_grupo && <p className="text-red-500 text-sm mt-1">{errors.sisben_grupo}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">¿Recibes Subsidio? *</label>
          <select
            value={formData.recibe_subsidio}
            onChange={(e) => setFormData({ ...formData, recibe_subsidio: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          >
            <option value="">Selecciona...</option>
            <option value="SI">Sí</option>
            <option value="NO">No</option>
          </select>
          {errors.recibe_subsidio && <p className="text-red-500 text-sm mt-1">{errors.recibe_subsidio}</p>}
        </div>
      </div>

      {formData.recibe_subsidio === 'SI' && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">¿Cuál Subsidio? *</label>
          <input
            type="text"
            value={formData.cual_subsidio}
            onChange={(e) => setFormData({ ...formData, cual_subsidio: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
            placeholder="Ej: Familias en Acción"
          />
          {errors.cual_subsidio && <p className="text-red-500 text-sm mt-1">{errors.cual_subsidio}</p>}
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Enfoque Diferencial</label>
        <select
          value={formData.enfoque_diferencial}
          onChange={(e) => setFormData({ ...formData, enfoque_diferencial: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
        >
          <option value="NINGUNO">Ninguno</option>
          <option value="INDIGENA">Indígena</option>
          <option value="AFROCOLOMBIANO">Afrocolombiano</option>
          <option value="ROM">Rom (Gitano)</option>
          <option value="RAIZAL">Raizal</option>
          <option value="PALENQUERO">Palenquero</option>
          <option value="DISCAPACIDAD">Persona con Discapacidad</option>
          <option value="VICTIMA_CONFLICTO">Víctima del Conflicto</option>
          <option value="LGBTIQ">LGBTIQ+</option>
          <option value="OTRO">Otro</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">¿Laboras Actualmente?</label>
        <select
          value={formData.labora_actualmente}
          onChange={(e) => setFormData({ ...formData, labora_actualmente: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
        >
          <option value="">Selecciona...</option>
          <option value="SI">Sí</option>
          <option value="NO">No</option>
        </select>
      </div>

      <div className="border-t border-slate-200 pt-4 mt-6">
        <h3 className="text-lg font-semibold text-slate-700 mb-4">
          <Users className="inline-block mr-2" size={20} />
          Composición Familiar (Opcional)
        </h3>
        <p className="text-sm text-slate-600 mb-4">Si deseas, puedes proporcionar información sobre tus padres</p>

        <div className="space-y-6">
          {/* Información del Padre */}
          <div className="bg-slate-50 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Información del Padre</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Nombre Completo</label>
                <input
                  type="text"
                  value={formData.nombre_padre}
                  onChange={(e) => setFormData({ ...formData, nombre_padre: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
                  placeholder="Nombre del padre"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Documento</label>
                <input
                  type="text"
                  value={formData.documento_padre}
                  onChange={(e) => setFormData({ ...formData, documento_padre: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
                  placeholder="Número de documento"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Ocupación</label>
                <select
                  value={formData.ocupacion_padre}
                  onChange={(e) => setFormData({ ...formData, ocupacion_padre: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
                >
                  <option value="">Selecciona...</option>
                  {OCUPACION_OPTIONS.map((opc, idx) => (
                    <option key={idx} value={opc}>{opc}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Ingresos Mensuales</label>
                <select
                  value={formData.ingresos_padre}
                  onChange={(e) => setFormData({ ...formData, ingresos_padre: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
                >
                  <option value="">Selecciona...</option>
                  {INGRESOS_OPTIONS.map((opc, idx) => (
                    <option key={idx} value={opc}>{opc}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Información de la Madre */}
          <div className="bg-slate-50 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Información de la Madre</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Nombre Completo</label>
                <input
                  type="text"
                  value={formData.nombre_madre}
                  onChange={(e) => setFormData({ ...formData, nombre_madre: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
                  placeholder="Nombre de la madre"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Documento</label>
                <input
                  type="text"
                  value={formData.documento_madre}
                  onChange={(e) => setFormData({ ...formData, documento_madre: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
                  placeholder="Número de documento"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Ocupación</label>
                <select
                  value={formData.ocupacion_madre}
                  onChange={(e) => setFormData({ ...formData, ocupacion_madre: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
                >
                  <option value="">Selecciona...</option>
                  {OCUPACION_OPTIONS.map((opc, idx) => (
                    <option key={idx} value={opc}>{opc}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Ingresos Mensuales</label>
                <select
                  value={formData.ingresos_madre}
                  onChange={(e) => setFormData({ ...formData, ingresos_madre: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
                >
                  <option value="">Selecciona...</option>
                  {INGRESOS_OPTIONS.map((opc, idx) => (
                    <option key={idx} value={opc}>{opc}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ========== PASO 6: Formación Secundaria ==========
  const renderStepFormacionSecundaria = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <BookOpen size={32} className="text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-primary">Formación Secundaria</h2>
        <p className="text-slate-600 mt-2">Información sobre tu bachillerato</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Título Obtenido *</label>
          <select
            value={formData.titulo_obtenido}
            onChange={(e) => setFormData({ ...formData, titulo_obtenido: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          >
            <option value="">Selecciona...</option>
            <option value="BACHILLER_ACADEMICO">Bachiller Académico</option>
            <option value="BACHILLER_TECNICO">Bachiller Técnico</option>
            <option value="BACHILLER_COMERCIAL">Bachiller Comercial</option>
            <option value="BACHILLER_PEDAGOGICO">Bachiller Pedagógico</option>
            <option value="NORMALISTA">Normalista</option>
            <option value="OTRO">Otro</option>
          </select>
          {errors.titulo_obtenido && <p className="text-red-500 text-sm mt-1">{errors.titulo_obtenido}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Año de Graduación *</label>
          <input
            type="number"
            value={formData.ano_graduacion}
            onChange={(e) => setFormData({ ...formData, ano_graduacion: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
            min="1980"
            max="2050"
            placeholder="2020"
          />
          {errors.ano_graduacion && <p className="text-red-500 text-sm mt-1">{errors.ano_graduacion}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Establecimiento Educativo *</label>
        <input
          type="text"
          value={formData.establecimiento_educativo}
          onChange={(e) => setFormData({ ...formData, establecimiento_educativo: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          placeholder="Nombre del colegio"
          list="establecimientos-list"
        />
        <datalist id="establecimientos-list">
          {catalogos.establecimientos.map((est, idx) => (
            <option key={idx} value={est} />
          ))}
        </datalist>
        {errors.establecimiento_educativo && <p className="text-red-500 text-sm mt-1">{errors.establecimiento_educativo}</p>}
        <p className="text-xs text-slate-500 mt-1">Municipio: Montelíbano, Córdoba</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Puntaje ICFES *</label>
        <input
          type="number"
          value={formData.puntaje_icfes}
          onChange={(e) => setFormData({ ...formData, puntaje_icfes: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          min="0"
          max="500"
          placeholder="Ej: 350"
        />
        {errors.puntaje_icfes && <p className="text-red-500 text-sm mt-1">{errors.puntaje_icfes}</p>}
      </div>
    </div>
  );

  // ========== PASO 7: Formación Superior ==========
  const renderStepFormacionSuperior = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <GraduationCap size={32} className="text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-primary">Formación Superior</h2>
        <p className="text-slate-600 mt-2">Información sobre tu carrera universitaria</p>
      </div>

      {(formData.modalidad_beca || formData.año_convocatoria) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-800">
            <strong>Información de tu Crédito:</strong> {formData.modalidad_beca || 'Crédito'} - Convocatoria {formData.año_convocatoria || '2024'}
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Institución de Educación Superior *</label>
        <input
          type="text"
          value={formData.institucion_superior}
          onChange={(e) => setFormData({ ...formData, institucion_superior: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          placeholder="Nombre de la universidad"
        />
        {errors.institucion_superior && <p className="text-red-500 text-sm mt-1">{errors.institucion_superior}</p>}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Programa Académico *</label>
        <input
          type="text"
          value={formData.programa_academico}
          onChange={(e) => setFormData({ ...formData, programa_academico: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          placeholder="Ej: Ingeniería de Sistemas"
        />
        {errors.programa_academico && <p className="text-red-500 text-sm mt-1">{errors.programa_academico}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Nivel de Formación *</label>
          <select
            value={formData.tipo_educacion}
            onChange={(e) => setFormData({ ...formData, tipo_educacion: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          >
            <option value="PROFESIONAL">Profesional</option>
            <option value="TECNICO">Técnico</option>
            <option value="TECNOLOGO">Tecnólogo</option>
          </select>
          {errors.tipo_educacion && <p className="text-red-500 text-sm mt-1">{errors.tipo_educacion}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Modalidad *</label>
          <select
            value={formData.modalidad}
            onChange={(e) => setFormData({ ...formData, modalidad: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          >
            <option value="">Selecciona...</option>
            <option value="PRESENCIAL">Presencial</option>
            <option value="VIRTUAL">Virtual</option>
            <option value="DISTANCIA">A Distancia</option>
            <option value="SEMIPRESENCIAL">Semipresencial</option>
          </select>
          {errors.modalidad && <p className="text-red-500 text-sm mt-1">{errors.modalidad}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
            Semestre de Ingreso *
            <div className="group relative">
              <Info size={16} className="text-slate-400 cursor-help" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-lg z-10">
                Ingresa el periodo académico en que iniciaste tus estudios en la universidad (formato: año-semestre, ejemplo: 2020-1 o 2021-2)
                <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-slate-800"></div>
              </div>
            </div>
          </label>
          <input
            type="text"
            value={formData.semestre_ingreso}
            onChange={(e) => setFormData({ ...formData, semestre_ingreso: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
            placeholder="2020-1"
          />
          {errors.semestre_ingreso && <p className="text-red-500 text-sm mt-1">{errors.semestre_ingreso}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Semestre Actual *</label>
          <input
            type="number"
            value={formData.semestre_actual}
            onChange={(e) => setFormData({ ...formData, semestre_actual: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
            min="1"
            max="20"
            placeholder="5"
          />
          {errors.semestre_actual && <p className="text-red-500 text-sm mt-1">{errors.semestre_actual}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Departamento de la Institución *</label>
          <select
            value={formData.dpto_institucion}
            onChange={(e) => setFormData({ ...formData, dpto_institucion: e.target.value, municipio_institucion: '' })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          >
            <option value="">Selecciona departamento...</option>
            {catalogos.departamentos.map((dept, idx) => (
              <option key={idx} value={dept.nombre}>{dept.nombre}</option>
            ))}
          </select>
          {errors.dpto_institucion && <p className="text-red-500 text-sm mt-1">{errors.dpto_institucion}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Municipio de la Institución *</label>
          <select
            value={formData.municipio_institucion}
            onChange={(e) => setFormData({ ...formData, municipio_institucion: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
            disabled={!formData.dpto_institucion}
          >
            <option value="">Selecciona municipio...</option>
            {catalogos.municipiosInstitucionFiltrados.map((mun, idx) => (
              <option key={idx} value={mun.nombre}>{mun.nombre}</option>
            ))}
          </select>
          {errors.municipio_institucion && <p className="text-red-500 text-sm mt-1">{errors.municipio_institucion}</p>}
          {!formData.dpto_institucion && (
            <p className="text-xs text-slate-500 mt-1">Primero selecciona un departamento</p>
          )}
        </div>
      </div>
    </div>
  );

  // ========== PASO 8: Información Bancaria (antes era paso 9) ==========
  const renderStepInfoBancaria = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <DollarSign size={32} className="text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-primary">Información Bancaria</h2>
        <p className="text-slate-600 mt-2">Datos para desembolsos y pagos</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Banco *</label>
        <select
          value={formData.nombre_banco}
          onChange={(e) => setFormData({ ...formData, nombre_banco: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
        >
          <option value="">Selecciona un banco...</option>
          {catalogos.bancos.map((banco, idx) => (
            <option key={idx} value={banco}>{banco}</option>
          ))}
        </select>
        {errors.nombre_banco && <p className="text-red-500 text-sm mt-1">{errors.nombre_banco}</p>}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Tipo de Cuenta *</label>
        <select
          value={formData.tipo_cuenta_bancaria}
          onChange={(e) => setFormData({ ...formData, tipo_cuenta_bancaria: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
        >
          <option value="AHORROS">Ahorros</option>
          <option value="CORRIENTE">Corriente</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Número de Cuenta *</label>
        <input
          type="text"
          value={formData.numero_cuenta}
          onChange={(e) => setFormData({ ...formData, numero_cuenta: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          placeholder="1234567890"
        />
        {errors.numero_cuenta && <p className="text-red-500 text-sm mt-1">{errors.numero_cuenta}</p>}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Confirmar Número de Cuenta *</label>
        <input
          type="text"
          value={formData.numero_cuenta_confirm}
          onChange={(e) => setFormData({ ...formData, numero_cuenta_confirm: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none"
          placeholder="1234567890"
        />
        {errors.numero_cuenta_confirm && <p className="text-red-500 text-sm mt-1">{errors.numero_cuenta_confirm}</p>}
      </div>
    </div>
  );

  // ========== PASO 9: Documentos (simplificado por ahora, antes era paso 10) ==========
  const renderStepDocumentos = () => {
    const documentos = [
      { key: 'documento_identidad', label: 'Documento de Identidad', required: true },
      { key: 'acta_grado', label: 'Acta de Grado Bachillerato', required: true },
      { key: 'diploma', label: 'Diploma de Bachiller', required: true },
      { key: 'pruebas_saber', label: 'Resultados Pruebas Saber 11', required: true },
      { key: 'cert_matricula', label: 'Certificado de Matrícula', required: true },
      { key: 'cert_notas', label: 'Certificado de Notas Actual', required: true },
      { key: 'certificado_bancario', label: 'Certificado Bancario', required: true },
      { 
        key: 'ficha_sisben', 
        label: 'Ficha SISBEN', 
        required: formData.sisben_grupo && formData.sisben_grupo !== 'NO_APLICA' 
      },
      { 
        key: 'cert_enfoque', 
        label: 'Certificado Enfoque Diferencial', 
        required: formData.enfoque_diferencial && formData.enfoque_diferencial !== 'NINGUNO' 
      },
    ];

    return (
      <div className="space-y-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Upload size={32} className="text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-primary">Documentos de Soporte</h2>
          <p className="text-slate-600 mt-2">Sube los documentos requeridos en formato PDF</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-800">
            <strong>Importante:</strong> Solo se aceptan archivos PDF. Tamaño máximo por archivo: 10MB
          </p>
        </div>

        <div className="space-y-4">
          {documentos.filter(doc => doc.required !== false).map(doc => (
            <div key={doc.key} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    {doc.label} {doc.required && <span className="text-red-500">*</span>}
                  </label>
                  
                  {!uploadedDocs[doc.key] ? (
                    <div className="relative">
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadDocument(doc.key, file);
                        }}
                        disabled={uploadingDoc === doc.key}
                        className="block w-full text-sm text-slate-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-lg file:border-0
                          file:text-sm file:font-semibold
                          file:bg-primary/10 file:text-primary
                          hover:file:bg-primary/20
                          disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      {uploadingDoc === doc.key && (
                        <div className="absolute right-2 top-2">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-green-800 truncate">
                            {uploadedDocs[doc.key].nombre}
                          </p>
                          <p className="text-xs text-green-600">
                            {(uploadedDocs[doc.key].size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveDocument(doc.key)}
                        className="p-2 hover:bg-green-100 rounded-lg transition-colors"
                        title="Eliminar y subir otro"
                      >
                        <Trash2 size={18} className="text-green-700" />
                      </button>
                    </div>
                  )}
                  {errors[doc.key] && (
                    <p className="text-red-500 text-sm mt-1">{errors[doc.key]}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ========== PASO 10: Términos y Firma (antes era paso 11) ==========
  const renderStepTerminosYFirma = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield size={32} className="text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-primary">Términos y Condiciones</h2>
        <p className="text-slate-600 mt-2">Lee, acepta y firma digitalmente</p>
      </div>

      <div className="space-y-3">
        {/* Términos y Condiciones */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
          <label className="flex items-start gap-3 flex-1">
            <input
              type="checkbox"
              checked={formData.acepta_terminos}
              disabled={!leidoTerminos}
              readOnly
              className="mt-1 w-5 h-5 text-secondary border-slate-300 rounded focus:ring-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-sm text-slate-700">
              Acepto los <strong>términos y condiciones</strong> del programa FOCADES
            </span>
          </label>
          <button
            type="button"
            onClick={() => setModalLegal('terminos')}
            className="shrink-0 px-3 py-1.5 rounded-lg border border-secondary text-secondary font-semibold text-xs hover:bg-secondary hover:text-white transition-colors"
          >
            {leidoTerminos ? 'Ver términos' : 'Leer y aceptar'}
          </button>
        </div>
        {errors.acepta_terminos && <p className="text-red-500 text-sm ml-3">{errors.acepta_terminos}</p>}

        {/* Tratamiento de Datos */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
          <label className="flex items-start gap-3 flex-1">
            <input
              type="checkbox"
              checked={formData.acepta_datos}
              disabled={!leidoDatos}
              readOnly
              className="mt-1 w-5 h-5 text-secondary border-slate-300 rounded focus:ring-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-sm text-slate-700">
              Autorizo el <strong>tratamiento de mis datos personales</strong> según la Ley 1581 de 2012
            </span>
          </label>
          <button
            type="button"
            onClick={() => setModalLegal('datos')}
            className="shrink-0 px-3 py-1.5 rounded-lg border border-secondary text-secondary font-semibold text-xs hover:bg-secondary hover:text-white transition-colors"
          >
            {leidoDatos ? 'Ver política' : 'Leer y aceptar'}
          </button>
        </div>
        {errors.acepta_datos && <p className="text-red-500 text-sm ml-3">{errors.acepta_datos}</p>}
      </div>

      <div className="border-t border-slate-200 pt-6">
        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Firma Digital <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-slate-500 mb-3">
            Firma en el recuadro usando tu mouse, touchpad o pantalla táctil
          </p>
        </div>

        <div className="bg-slate-50 border-2 border-slate-300 rounded-xl overflow-hidden">
          <SignatureCanvas
            ref={signatureRef}
            canvasProps={{
              className: 'w-full h-48 bg-white cursor-crosshair',
            }}
            backgroundColor="white"
            penColor="rgb(0, 0, 0)"
            minWidth={0.5}
            maxWidth={2.5}
            onEnd={handleSignatureEnd}
          />
        </div>

        <div className="flex gap-3 mt-3">
          <button
            type="button"
            onClick={handleClearSignature}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-colors"
          >
            <Trash2 size={16} />
            Limpiar
          </button>
          
          {formData.firma_digital && (
            <div className="flex items-center gap-2 text-green-600 text-sm font-semibold">
              <CheckCircle size={18} />
              Firma guardada
            </div>
          )}
        </div>

        {errors.firma_digital && (
          <p className="text-red-500 text-sm mt-2">{errors.firma_digital}</p>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800">
          <strong>Importante:</strong> Tu firma digital será almacenada de forma segura y tendrá validez legal.
        </p>
      </div>
    </div>
  );

  // ========== PASO 11: Resumen (antes era paso 12) ==========
  const renderStepResumen = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check size={32} className="text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-primary">¡Registro Completado!</h2>
        <p className="text-slate-600 mt-2">Tu perfil ha sido creado exitosamente</p>
      </div>

      <div className="bg-slate-50 rounded-xl p-6 space-y-4">
        <div>
          <p className="text-sm text-slate-600">Correo Electrónico</p>
          <p className="font-semibold text-slate-900">{formData.email}</p>
        </div>
        <div>
          <p className="text-sm text-slate-600">Documento</p>
          <p className="font-semibold text-slate-900">{formData.document}</p>
        </div>
        <div>
          <p className="text-sm text-slate-600">Universidad</p>
          <p className="font-semibold text-slate-900">{formData.institucion_superior || 'No especificado'}</p>
        </div>
        <div>
          <p className="text-sm text-slate-600">Programa Académico</p>
          <p className="font-semibold text-slate-900">{formData.programa_academico || 'No especificado'}</p>
        </div>
        <div>
          <p className="text-sm text-slate-600">Banco</p>
          <p className="font-semibold text-slate-900">
            {formData.nombre_banco || 'No especificado'} - {formData.tipo_cuenta_bancaria}
          </p>
        </div>
        <div>
          <p className="text-sm text-slate-600">Documentos Subidos</p>
          <p className="font-semibold text-slate-900">{Object.keys(uploadedDocs).length} documentos</p>
        </div>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <p className="text-sm text-green-800 font-semibold mb-2">
          ✓ Perfil completado al 100%
        </p>
        <p className="text-sm text-green-700">
          Ya puedes acceder al portal de beneficiarios para gestionar tu beca, consultar pagos y actualizar tu información.
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F7FA' }}>
      {/* Header */}
      <header className="h-[72px] bg-white border-b border-border px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img
            src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logofocades-solo.png"
            alt="FOCADES"
            className="h-10"
          />
          <h1 className="text-primary font-bold text-lg">Configuración de Cuenta - Beneficiario</h1>
        </div>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-primary transition-colors"
        >
          <Home size={18} />
          Volver al inicio
        </a>
      </header>

      {/* Progress Bar */}
      <div className="bg-white border-b border-border px-8 py-4">
        <div className="max-w-4xl mx-auto">
          {currentStep >= 4 && !formData.setupToken && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>¡Bienvenido de nuevo!</strong> Ya estableciste tu contraseña. Completa tu perfil para acceder a todas las funcionalidades.
              </p>
            </div>
          )}
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
                disabled={(isLoginMode && currentStep === 4) || currentStep === 1}
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

              {currentStep < 10 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm disabled:opacity-50 transition-all text-white"
                  style={{ background: '#1A5A96' }}
                >
                  {loading ? 'Guardando...' : 'Siguiente'}
                  <ChevronRight size={18} />
                </button>
              ) : currentStep === 10 ? (
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm disabled:opacity-50 transition-all text-white"
                  style={{ background: '#22C55E' }}
                >
                  {loading ? 'Finalizando...' : 'Finalizar Registro'}
                  <Check size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setRedirectToDashboard(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all text-white"
                  style={{ background: '#1A5A96' }}
                >
                  Ir al Portal
                  <ChevronRight size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modales Legales */}
      {modalLegal === 'terminos' && (
        <LegalModal
          title="Términos y Condiciones FOCADES"
          paragraphs={TERMS_AND_CONDITIONS_TEXT}
          onClose={() => setModalLegal(null)}
          onAccept={() => {
            setLeidoTerminos(true);
            setFormData(prev => ({ ...prev, acepta_terminos: true }));
            setModalLegal(null);
          }}
          acceptLabel="He leído y acepto términos"
        />
      )}

      {modalLegal === 'datos' && (
        <LegalModal
          title="Política de Tratamiento de Datos Personales"
          paragraphs={DATA_POLICY_TEXT}
          onClose={() => setModalLegal(null)}
          onAccept={() => {
            setLeidoDatos(true);
            setFormData(prev => ({ ...prev, acepta_datos: true }));
            setModalLegal(null);
          }}
          acceptLabel="He leído y autorizo tratamiento"
        />
      )}
    </div>
  );
};

// Componente Modal Legal (reutilizable)
const LegalModal = ({ title, paragraphs, onClose, onAccept, acceptLabel }) => {
  const [canAccept, setCanAccept] = useState(false);

  useEffect(() => {
    setCanAccept(false);
  }, [title]);

  const handleScroll = (event) => {
    const target = event.currentTarget;
    const reachedBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 8;
    if (reachedBottom) {
      setCanAccept(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-primary">{title}</h3>
          <p className="text-xs text-slate-500 mt-1">Debes leer hasta el final para habilitar la aceptación.</p>
        </div>

        <div 
          onScroll={handleScroll} 
          className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-4 text-sm text-slate-700 leading-relaxed"
        >
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={!canAccept}
            className="px-4 py-2 rounded-lg bg-secondary text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 transition-all"
          >
            {canAccept ? acceptLabel : 'Desplázate al final para aceptar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BeneficiarioOnboardingCompleto;
