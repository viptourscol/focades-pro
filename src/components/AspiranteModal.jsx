import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSafeSession, supabase } from '../lib/supabase';
import { 
  X, Copy, Cpu, User, Home, 
  GraduationCap, FileText, CheckCircle, 
  Briefcase, ShieldAlert, Heart, Eye
} from 'lucide-react';

const DOCUMENT_LABELS = {
  documento_identidad: 'Documento de identidad',
  acta_grado: 'Acta de grado',
  diploma: 'Diploma',
  pruebas_saber: 'Pruebas Saber',
  cert_matricula: 'Certificado de matrícula',
  cert_notas: 'Certificado de notas',
  ficha_sisben: 'Ficha Sisbén',
  cert_enfoque: 'Certificado enfoque diferencial',
  certificado_bancario: 'Certificado bancario',
  firma_digital: 'Firma digital',
};

const getDocumentLabel = (key) => DOCUMENT_LABELS[key] || key || 'Documento';

const toObjectSafe = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const buildAttachedDocuments = (aspirante, historialDocs = []) => {
  const soportes = toObjectSafe(aspirante?.soportes);
  const datosFormulario = toObjectSafe(aspirante?.datos_formulario);
  const formSoportes = toObjectSafe(datosFormulario?.soportes);
  const directDocColumns = [
    'documento_identidad',
    'acta_grado',
    'diploma',
    'pruebas_saber',
    'cert_matricula',
    'cert_notas',
    'ficha_sisben',
    'cert_enfoque',
    'certificado_bancario',
    'firma_url',
  ];

  const entries = [
    ...Object.entries(soportes),
    ...Object.entries(formSoportes),
    ...directDocColumns.map((key) => [key === 'firma_url' ? 'firma_digital' : key, aspirante?.[key]]),
    ...(Array.isArray(historialDocs)
      ? historialDocs.map((item) => [
          item?.tipo_documento || 'documento',
          item?.storage_path,
        ])
      : []),
    ['firma_digital', aspirante?.firma_url],
    ['certificado_bancario', aspirante?.certificado_bancario],
  ];

  const dedup = new Map();
  entries.forEach(([key, rawPath]) => {
    const path = String(rawPath || '').trim();
    if (!path) return;
    if (dedup.has(path)) return;
    dedup.set(path, {
      key,
      label: getDocumentLabel(key),
      path,
    });
  });

  return Array.from(dedup.values()).sort((a, b) => a.label.localeCompare(b.label, 'es-CO'));
};

const looksLikePdf = (value) => /\.pdf(\?|$)/i.test(String(value || ''));

const looksLikeImage = (value) => /\.(png|jpg|jpeg|webp)(\?|$)/i.test(String(value || ''));

const pickAspiranteValue = (aspirante, persona, key) => {
  const datosFormulario = toObjectSafe(aspirante?.datos_formulario);

  const personaValue = persona?.[key];
  if (personaValue !== undefined && personaValue !== null && String(personaValue).trim() !== '') {
    return personaValue;
  }

  const aspiranteValue = aspirante?.[key];
  if (aspiranteValue !== undefined && aspiranteValue !== null && String(aspiranteValue).trim() !== '') {
    return aspiranteValue;
  }

  const formValue = datosFormulario?.[key];
  if (formValue !== undefined && formValue !== null && String(formValue).trim() !== '') {
    return formValue;
  }

  return '';
};

const getBankCertificatePathFromAspirante = (aspirante) => {
  const direct = String(aspirante?.certificado_bancario || '').trim();
  const soportes =
    aspirante?.soportes && typeof aspirante.soportes === 'object'
      ? String(aspirante.soportes.certificado_bancario || '').trim()
      : '';
  const formSoportes =
    aspirante?.datos_formulario?.soportes && typeof aspirante.datos_formulario.soportes === 'object'
      ? String(aspirante.datos_formulario.soportes.certificado_bancario || '').trim()
      : '';

  return direct || soportes || formSoportes || '';
};

const getFlowHintMessage = ({ etapa, certRequired, hasCertUploaded, permiteReemplazo }) => {
  if (hasCertUploaded && (etapa !== 'legalizacion' || !certRequired)) {
    return 'Legalización completada. Puedes dejar estado como Admitido o actualizar observación pública final.';
  }

  if (etapa === 'legalizacion' && certRequired && hasCertUploaded) {
    return 'El certificado bancario ya fue cargado por el aspirante. Puedes revisar y marcar la legalización como completada.';
  }

  if (etapa === 'legalizacion' && certRequired && !hasCertUploaded) {
    return 'Falta carga de certificado bancario por parte del aspirante.';
  }

  if (etapa === 'aspirante' && permiteReemplazo) {
    return 'Se encuentra habilitado el reemplazo de soportes para el aspirante.';
  }

  return 'Sin alertas de flujo. Ajusta etapa y banderas según avance del proceso.';
};

const AspiranteModal = ({ aspirante, onClose, onUpdateStatus, onUpdateWorkflow, onPromote }) => {
  const [animate, setAnimate] = useState(false);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState('');
  const [workflowError, setWorkflowError] = useState('');
  const [etapa, setEtapa] = useState(String(aspirante.etapa || 'aspirante').toLowerCase());
  const [permiteReemplazo, setPermiteReemplazo] = useState(Boolean(aspirante.permite_reemplazo_soportes));
  const [certBancarioRequerido, setCertBancarioRequerido] = useState(Boolean(aspirante.cert_bancario_requerido));
  const [observacionPublica, setObservacionPublica] = useState(aspirante.observacion_publica || '');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedDocUrl, setSelectedDocUrl] = useState('');
  const [docPreviewLoading, setDocPreviewLoading] = useState(false);
  const [docPreviewError, setDocPreviewError] = useState('');
  const [historialDocs, setHistorialDocs] = useState([]);
  const [radicadoCopied, setRadicadoCopied] = useState(false);
  const [activePreset, setActivePreset] = useState('');
  const [workflowSavedPulse, setWorkflowSavedPulse] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState('');
  const [decisionPulse, setDecisionPulse] = useState('');
  const [promoteSemestre, setPromoteSemestre] = useState('1');
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [promoteMessage, setPromoteMessage] = useState('');
  const [promoteError, setPromoteError] = useState('');
  useEffect(() => { setAnimate(true); }, []);

  useEffect(() => {
    let mounted = true;

    const loadHistorialDocs = async () => {
      if (!aspirante?.id) {
        if (mounted) setHistorialDocs([]);
        return;
      }

      const { data, error } = await supabase
        .from('inscripciones_documentos')
        .select('tipo_documento,storage_path')
        .eq('inscripcion_id', aspirante.id)
        .not('storage_path', 'is', null)
        .limit(200);

      if (!mounted) return;
      if (error) {
        setHistorialDocs([]);
        return;
      }

      setHistorialDocs(Array.isArray(data) ? data : []);
    };

    loadHistorialDocs();

    return () => {
      mounted = false;
    };
  }, [aspirante?.id]);

  const p = aspirante.personas;
  const puntaje = aspirante.puntaje_total || 0;
  const hasBankCertificateUploaded = Boolean(getBankCertificatePathFromAspirante(aspirante));
  const legalizacionCompletada = hasBankCertificateUploaded && (etapa !== 'legalizacion' || !certBancarioRequerido);
  const legalizacionEnRevision = etapa === 'legalizacion' && certBancarioRequerido && hasBankCertificateUploaded;
  const legalizacionPendienteCarga = etapa === 'legalizacion' && certBancarioRequerido && !hasBankCertificateUploaded;
  const flowHint = getFlowHintMessage({
    etapa,
    certRequired: certBancarioRequerido,
    hasCertUploaded: hasBankCertificateUploaded,
    permiteReemplazo,
  });
  const attachedDocuments = buildAttachedDocuments(aspirante, historialDocs);
  const promoted = Boolean(aspirante?.promovido_a_beneficiario) && Boolean(aspirante?.beneficiario_portal_id);
  const canPromote = legalizacionCompletada && !promoted;
  const nombreCompleto = pickAspiranteValue(aspirante, p, 'nombre_completo') || 'Aspirante';
  const etapaLabel = String(etapa || 'aspirante').trim();
  const etapaTone =
    etapa === 'legalizacion'
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : etapa === 'admitido'
        ? 'bg-green-100 text-green-700 border-green-200'
        : 'bg-blue-100 text-blue-700 border-blue-200';

  const resolveDocumentUrl = async (path) => {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from('soportes')
      .createSignedUrl(path, 60 * 30);

    if (!signedError && signedData?.signedUrl) {
      return signedData.signedUrl;
    }

    const publicData = supabase.storage.from('soportes').getPublicUrl(path);
    const publicUrl = String(publicData?.data?.publicUrl || '').trim();
    if (publicUrl) return publicUrl;

    throw new Error(signedError?.message || 'No se pudo obtener una URL para visualizar el documento.');
  };

  const handleOpenDocument = async (doc) => {
    setSelectedDoc(doc);
    setSelectedDocUrl('');
    setDocPreviewError('');
    setDocPreviewLoading(true);

    try {
      const url = await resolveDocumentUrl(doc.path);
      setSelectedDocUrl(url);
    } catch (error) {
      setDocPreviewError(error?.message || 'No se pudo abrir el documento.');
    } finally {
      setDocPreviewLoading(false);
    }
  };

  const closePreviewModal = () => {
    setSelectedDoc(null);
    setSelectedDocUrl('');
    setDocPreviewError('');
    setDocPreviewLoading(false);
  };

  const handleCopyRadicado = async () => {
    const radicado = String(aspirante?.radicado || '').trim();
    if (!radicado) return;

    try {
      await navigator.clipboard.writeText(radicado);
      setRadicadoCopied(true);
      window.setTimeout(() => setRadicadoCopied(false), 1200);
    } catch {
      setRadicadoCopied(false);
    }
  };

  const applyFlowPreset = (preset) => {
    setWorkflowMessage('');
    setWorkflowError('');
    setActivePreset(preset);
    window.setTimeout(() => setActivePreset(''), 700);

    if (preset === 'aspirante') {
      setEtapa('aspirante');
      setPermiteReemplazo(true);
      setCertBancarioRequerido(false);
      return;
    }

    if (preset === 'legalizacion') {
      setEtapa('legalizacion');
      setPermiteReemplazo(false);
      setCertBancarioRequerido(true);
      return;
    }

    if (preset === 'completada') {
      setEtapa('admitido');
      setPermiteReemplazo(false);
      setCertBancarioRequerido(false);
    }
  };

  const handleSaveWorkflow = async () => {
    if (!onUpdateWorkflow) return;
    setWorkflowSaving(true);
    setWorkflowError('');
    setWorkflowMessage('');

    const response = await onUpdateWorkflow(aspirante.id, {
      etapa,
      permite_reemplazo_soportes: permiteReemplazo,
      cert_bancario_requerido: certBancarioRequerido,
      observacion_publica: observacionPublica,
    });

    if (response?.ok) {
      setWorkflowMessage('Flujo del aspirante actualizado correctamente.');
      setWorkflowSavedPulse(true);
      window.setTimeout(() => setWorkflowSavedPulse(false), 900);
    } else {
      setWorkflowError(response?.error || 'No se pudo actualizar el flujo del aspirante.');
    }

    setWorkflowSaving(false);
  };

  const handleDecisionAction = async (mode) => {
    if (!onUpdateStatus || decisionLoading) return;

    const status = mode === 'admit' ? 'Admitido' : 'No admitido';
    setDecisionLoading(mode);
    setDecisionPulse(mode);

    try {
      await Promise.resolve(onUpdateStatus(aspirante.id, status));
    } finally {
      window.setTimeout(() => setDecisionPulse(''), 700);
      setDecisionLoading('');
    }
  };

  const sendPortalInvite = async (email, nombre) => {
    if (!email) return { ok: false, message: 'Sin correo para enviar invitación.' };
    try {
      const { session } = await getSafeSession();
      const accessToken = String(session?.access_token || '').trim();
      if (!accessToken) {
        return { ok: false, message: 'Tu sesión expiró. Inicia sesión nuevamente para enviar invitaciones.' };
      }

      const { data, error } = await supabase.functions.invoke('invite-beneficiario', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { email, nombre },
      });
      if (error) {
        const functionMessage = error?.context ? await error.context.json().then((payload) => payload?.message).catch(() => '') : '';
        return { ok: false, message: functionMessage || error.message || 'No se pudo enviar la invitación.' };
      }
      return data || { ok: false, message: 'Respuesta inesperada del servidor.' };
    } catch (err) {
      return { ok: false, message: err?.message || 'Error al enviar invitación.' };
    }
  };

  const handlePromote = async () => {
    if (!onPromote || !canPromote || promoteLoading) return;
    setPromoteLoading(true);
    setPromoteMessage('');
    setPromoteError('');

    try {
      const response = await onPromote(aspirante.id, Number(promoteSemestre || 0) || null);
      if (!response?.ok) {
        setPromoteError(response?.error || 'No fue posible promover al aspirante.');
      } else {
        const email = String(
          aspirante?.email ||
          aspirante?.datos_formulario?.email ||
          aspirante?.personas?.email || ''
        ).trim().toLowerCase();
        setPromoteMessage(`Beneficiario #${response.beneficiarioId} creado. Enviando invitación de acceso...`);
        const inviteResult = await sendPortalInvite(email, nombreCompleto);
        if (inviteResult?.ok) {
          setPromoteMessage(`✓ Beneficiario #${response.beneficiarioId} creado. ${inviteResult?.message || 'Acceso habilitado para iniciar sesión con Google.'}`);
        } else {
          setPromoteMessage(`✓ Beneficiario #${response.beneficiarioId} creado. (Invitación: ${inviteResult?.message || 'no enviada'})`);
        }
      }
    } catch (error) {
      setPromoteError(error?.message || 'No fue posible promover al aspirante.');
    } finally {
      setPromoteLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
      <div className={`bg-slate-50 w-full max-w-6xl rounded-[2.5rem] shadow-2xl overflow-hidden transition-all duration-500 transform ${animate ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
        
        {/* HEADER */}
        <header className="bg-white px-10 py-8 border-b border-slate-100 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="bg-secondary/10 text-secondary text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-lg">Expediente Digital</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500 font-mono text-xs font-bold">RAD: {aspirante.radicado}</span>
              <button
                type="button"
                onClick={handleCopyRadicado}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all duration-200 ${
                  radicadoCopied
                    ? 'bg-green-100 text-green-700 border-green-200 scale-95'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 hover:scale-105'
                }`}
                title="Copiar radicado"
              >
                <Copy size={12} /> {radicadoCopied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tight">{nombreCompleto}</h2>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all"><X size={28}/></button>
        </header>

        {/* CONTENIDO BENTO GRID */}
        <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          
          <div className="grid grid-cols-12 gap-6">
            
            <div className="col-span-12 lg:col-span-8 bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border ${etapaTone}`}>
                  Etapa: {etapaLabel}
                </span>
                <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-700 border border-slate-200">
                  Estado: {aspirante.estado || 'Sin estado'}
                </span>
                {legalizacionCompletada && (
                  <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-green-100 text-green-700 border border-green-200">
                    Legalización completada
                  </span>
                )}
                {legalizacionEnRevision && (
                  <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 border border-amber-200">
                    Legalización en revisión
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Programa</p>
                  <p className="text-sm font-bold text-slate-700">{pickAspiranteValue(aspirante, p, 'programa_academico') || 'No reportado'}</p>
                  <p className="text-xs text-slate-500 mt-1">Institución: {pickAspiranteValue(aspirante, p, 'institucion_superior') || 'No reportado'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Modalidad y semestre</p>
                  <p className="text-sm font-bold text-slate-700">
                    {pickAspiranteValue(aspirante, p, 'modalidad') || 'No reportado'} / {pickAspiranteValue(aspirante, p, 'semestre_ingreso') || 'No reportado'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">ICFES: {pickAspiranteValue(aspirante, p, 'puntaje_icfes') || 'No reportado'}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-700 mb-1 flex items-center gap-2"><Cpu size={14} /> Análisis IA</p>
                <p className="text-sm text-blue-900 leading-relaxed">
                  {aspirante.perfil_ia || 'Sin análisis IA registrado para este aspirante.'}
                </p>
              </div>
            </div>

            {/* KPI SCORE */}
            <div className="col-span-12 lg:col-span-4 bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm flex flex-col items-center justify-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Puntaje Global</span>
                <div className="text-7xl font-black text-primary mb-6">{puntaje}</div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div className="h-full bg-accent transition-all duration-1000" style={{ width: `${puntaje}%` }}></div>
                </div>
            </div>

            {/* BLOQUES DE INFORMACIÓN */}
            <BentoSection title="Datos Personales" icon={<User size={18}/>} span="col-span-12 lg:col-span-6">
              <InfoRow label="Nombre completo" value={pickAspiranteValue(aspirante, p, 'nombre_completo')} />
              <InfoRow label="Tipo de documento" value={pickAspiranteValue(aspirante, p, 'tipo_documento')} />
              <InfoRow label="Número de documento" value={pickAspiranteValue(aspirante, p, 'n_documento')} />
              <InfoRow label="Género" value={pickAspiranteValue(aspirante, p, 'genero')} />
              <InfoRow label="Fecha de nacimiento" value={pickAspiranteValue(aspirante, p, 'fecha_nacimiento')} />
              <InfoRow label="País de nacimiento" value={pickAspiranteValue(aspirante, p, 'pais_nacimiento')} />
              <InfoRow label="Departamento nacimiento" value={pickAspiranteValue(aspirante, p, 'dpto_nacimiento')} />
              <InfoRow label="Municipio nacimiento" value={pickAspiranteValue(aspirante, p, 'municipio_nacimiento')} />
            </BentoSection>

            <BentoSection title="Contacto y Residencia" icon={<Home size={18}/>} span="col-span-12 lg:col-span-6">
              <InfoRow label="Email" value={pickAspiranteValue(aspirante, p, 'email')} />
              <InfoRow label="Celular" value={pickAspiranteValue(aspirante, p, 'n_celular')} />
              <InfoRow label="Departamento residencia" value={pickAspiranteValue(aspirante, p, 'dpto_residencia')} />
              <InfoRow label="Municipio residencia" value={pickAspiranteValue(aspirante, p, 'municipio_residencia')} />
              <InfoRow label="Dirección residencia" value={pickAspiranteValue(aspirante, p, 'direccion_residencia')} />
              <InfoRow label="Zona residencia" value={pickAspiranteValue(aspirante, p, 'zona_residencia')} />
              <InfoRow label="Barrio/Corregimiento" value={pickAspiranteValue(aspirante, p, 'barrio_corregimiento')} />
            </BentoSection>

            <BentoSection title="Entorno Socioeconómico" icon={<Briefcase size={18}/>} span="col-span-12 lg:col-span-6">
                <InfoRow label="Recibe subsidio" value={pickAspiranteValue(aspirante, p, 'recibe_subsidio')} />
                <InfoRow label="Cuál subsidio" value={pickAspiranteValue(aspirante, p, 'cual_subsidio')} />
                <InfoRow label="Grupo Sisbén" value={pickAspiranteValue(aspirante, p, 'sisben_grupo')} />
                <InfoRow label="Enfoque diferencial" value={pickAspiranteValue(aspirante, p, 'enfoque_diferencial')} />
                <InfoRow label="Labora actualmente" value={pickAspiranteValue(aspirante, p, 'labora_actualmente')} />
            </BentoSection>

            <BentoSection title="Información de Padres" icon={<ShieldAlert size={18}/>} span="col-span-12 lg:col-span-6">
                <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Datos del padre</p>
                  <InfoRow label="Nombre completo" value={pickAspiranteValue(aspirante, p, 'nombre_padre')} />
                  <InfoRow label="Documento" value={pickAspiranteValue(aspirante, p, 'documento_padre')} />
                  <InfoRow label="Ocupación" value={pickAspiranteValue(aspirante, p, 'ocupacion_padre')} />
                  <InfoRow label="Ingresos" value={pickAspiranteValue(aspirante, p, 'ingresos_padre')} />
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Datos de la madre</p>
                  <InfoRow label="Nombre completo" value={pickAspiranteValue(aspirante, p, 'nombre_madre')} />
                  <InfoRow label="Documento" value={pickAspiranteValue(aspirante, p, 'documento_madre')} />
                  <InfoRow label="Ocupación" value={pickAspiranteValue(aspirante, p, 'ocupacion_madre')} />
                  <InfoRow label="Ingresos" value={pickAspiranteValue(aspirante, p, 'ingresos_madre')} />
                </div>
            </BentoSection>

            <BentoSection title="Información Académica" icon={<GraduationCap size={18}/>} span="col-span-12">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <InfoRow label="Título obtenido" value={pickAspiranteValue(aspirante, p, 'titulo_obtenido')} />
                    <InfoRow label="Año de graduación" value={pickAspiranteValue(aspirante, p, 'ano_graduacion')} />
                    <InfoRow label="Establecimiento" value={pickAspiranteValue(aspirante, p, 'establecimiento_educativo')} />
                    <InfoRow label="Nivel de formación" value={pickAspiranteValue(aspirante, p, 'nivel_formacion')} />
                    <InfoRow label="Institución superior" value={pickAspiranteValue(aspirante, p, 'institucion_superior')} />
                    <InfoRow label="Programa" value={pickAspiranteValue(aspirante, p, 'programa_academico')} />
                    <InfoRow label="Ciudad institución" value={pickAspiranteValue(aspirante, p, 'ciudad_institucion')} />
                    <InfoRow label="Modalidad" value={pickAspiranteValue(aspirante, p, 'modalidad')} />
                    <InfoRow label="Semestre ingreso" value={pickAspiranteValue(aspirante, p, 'semestre_ingreso')} />
                    <InfoRow label="Promedio anterior" value={pickAspiranteValue(aspirante, p, 'promedio_anterior')} />
                    <InfoRow label="Puntaje ICFES" value={pickAspiranteValue(aspirante, p, 'puntaje_icfes')} />
                </div>
            </BentoSection>

            <BentoSection title="Documentos Adjuntos" icon={<FileText size={18}/>} span="col-span-12">
              {attachedDocuments.length === 0 ? (
                <p className="text-sm text-slate-500">Este aspirante no tiene documentos adjuntos visibles.</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">Total adjuntos detectados: <strong>{attachedDocuments.length}</strong></p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {attachedDocuments.map((doc) => (
                      <div key={`${doc.path}-${doc.key}`} className="border border-slate-200 rounded-2xl p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase tracking-wider text-slate-500">{doc.label}</p>
                          <p className="text-[11px] text-slate-600 truncate">{doc.path}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenDocument(doc)}
                          className="group shrink-0 relative overflow-hidden bg-slate-900 text-white text-xs font-bold px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/20 hover:bg-slate-800 active:translate-y-0 active:scale-95"
                        >
                          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
                          <Eye size={14} className="relative transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3" />
                          <span className="relative">Ver</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </BentoSection>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-4 bg-slate-900 rounded-3xl p-8 border border-slate-800">
              <h5 className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2">
                <FileText size={14}/> Observaciones Internas
              </h5>
              <p className="text-slate-300 text-sm font-medium leading-relaxed">
                {aspirante.observacion_interna || "Sin anotaciones de auditoría."}
              </p>
            </div>

            <div className="xl:col-span-8 bg-white rounded-3xl p-8 border border-slate-100 shadow-sm space-y-4">
            <h5 className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Control de Etapa y Legalización</h5>
            <div className="grid gap-3 md:grid-cols-3">
              <button
                type="button"
                onClick={() => applyFlowPreset('aspirante')}
                className={`text-left rounded-2xl border px-4 py-3 transition-all duration-200 hover:bg-blue-100 hover:-translate-y-0.5 active:scale-95 ${
                  activePreset === 'aspirante'
                    ? 'border-blue-400 bg-blue-100 ring-2 ring-blue-300 scale-[0.99]'
                    : 'border-blue-200 bg-blue-50'
                }`}
              >
                <p className="text-xs font-black uppercase tracking-wider text-blue-700">Fase aspirante</p>
                <p className="text-xs text-blue-700 mt-1">Habilita reemplazo y desactiva legalización.</p>
              </button>

              <button
                type="button"
                onClick={() => applyFlowPreset('legalizacion')}
                className={`text-left rounded-2xl border px-4 py-3 transition-all duration-200 hover:bg-amber-100 hover:-translate-y-0.5 active:scale-95 ${
                  activePreset === 'legalizacion'
                    ? 'border-amber-400 bg-amber-100 ring-2 ring-amber-300 scale-[0.99]'
                    : 'border-amber-200 bg-amber-50'
                }`}
              >
                <p className="text-xs font-black uppercase tracking-wider text-amber-700">Iniciar legalización</p>
                <p className="text-xs text-amber-700 mt-1">Activa requerimiento de certificado bancario.</p>
              </button>

              <button
                type="button"
                onClick={() => applyFlowPreset('completada')}
                className={`text-left rounded-2xl border px-4 py-3 transition-all duration-200 hover:bg-green-100 hover:-translate-y-0.5 active:scale-95 ${
                  activePreset === 'completada'
                    ? 'border-green-400 bg-green-100 ring-2 ring-green-300 scale-[0.99]'
                    : 'border-green-200 bg-green-50'
                }`}
              >
                <p className="text-xs font-black uppercase tracking-wider text-green-700">Marcar completada</p>
                <p className="text-xs text-green-700 mt-1">Cierra legalización y quita requerimientos.</p>
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Estado actual:</span>
                {legalizacionCompletada && (
                  <span className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-green-100 text-green-700 border border-green-200">
                    ✅ Legalización completada
                  </span>
                )}
                {legalizacionEnRevision && (
                  <span className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                    ⏳ En revisión
                  </span>
                )}
                {legalizacionPendienteCarga && (
                  <span className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200">
                    📄 Pendiente certificado
                  </span>
                )}
                {!legalizacionCompletada && !legalizacionEnRevision && !legalizacionPendienteCarga && (
                  <span className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-200 text-slate-700 border border-slate-300">
                    Flujo general
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600">{flowHint}</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Etapa</label>
                <select
                  value={etapa}
                  onChange={(event) => setEtapa(event.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="aspirante">Aspirante</option>
                  <option value="admitido">Admitido</option>
                  <option value="legalizacion">Legalización</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Observación pública</label>
                <input
                  value={observacionPublica}
                  onChange={(event) => setObservacionPublica(event.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  placeholder="Visible para consulta por radicado"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={permiteReemplazo}
                  onChange={(event) => setPermiteReemplazo(event.target.checked)}
                />
                Autorizar reemplazo de soportes (etapa aspirante)
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={certBancarioRequerido}
                  onChange={(event) => setCertBancarioRequerido(event.target.checked)}
                />
                Requerir certificado bancario (legalización)
              </label>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Promoción a beneficiario activo</p>

              {promoted ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 border border-emerald-200">
                    Ya promovido
                  </span>
                  <Link
                    to={`/admin/beneficiarios/${aspirante.beneficiario_portal_id}`}
                    onClick={onClose}
                    className="inline-flex items-center px-3 py-2 rounded-xl text-xs font-bold text-secondary border border-slate-200 hover:bg-white"
                  >
                    Abrir ficha 360
                  </Link>
                  <button
                    type="button"
                    onClick={async () => {
                      const email = String(aspirante?.email || aspirante?.datos_formulario?.email || aspirante?.personas?.email || '').trim().toLowerCase();
                      setPromoteMessage('Enviando invitación...');
                      const r = await sendPortalInvite(email, nombreCompleto);
                      setPromoteMessage(r?.message || (r?.ok ? 'Invitación enviada.' : 'No se pudo enviar.'));
                    }}
                    className="text-xs text-secondary underline hover:opacity-70"
                  >
                    Reenviar invitación de acceso
                  </button>
                  {promoteMessage ? <p className="text-xs text-emerald-700 font-semibold">{promoteMessage}</p> : null}
                </div>
              ) : canPromote ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">Cumple condición de legalización completa. Puedes promoverlo para habilitar su ciclo como beneficiario.</p>
                  <div className="grid md:grid-cols-[220px,1fr] gap-3 items-end">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Semestre inicial</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={promoteSemestre}
                        onChange={(event) => setPromoteSemestre(event.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handlePromote}
                      disabled={promoteLoading}
                      className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {promoteLoading ? 'Promoviendo...' : 'Promover a beneficiario'}
                    </button>
                  </div>
                  {promoteMessage ? <p className="text-xs text-emerald-700 font-semibold">{promoteMessage}</p> : null}
                  {promoteError ? <p className="text-xs text-red-600 font-semibold">{promoteError}</p> : null}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Solo habilitado cuando esté en legalización con certificado bancario cargado.</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveWorkflow}
                disabled={workflowSaving}
                className={`bg-secondary text-white px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 transition-all duration-200 hover:brightness-110 active:scale-95 ${
                  workflowSavedPulse ? 'ring-2 ring-green-300 bg-green-600' : ''
                }`}
              >
                {workflowSaving ? 'Guardando...' : workflowSavedPulse ? 'Guardado ✓' : 'Guardar flujo'}
              </button>
              {workflowMessage && <p className="text-xs text-green-600 font-semibold">{workflowMessage}</p>}
              {workflowError && <p className="text-xs text-red-600 font-semibold">{workflowError}</p>}
            </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <footer className="bg-white border-t border-slate-100 px-10 py-8 flex justify-between items-center">
            <div className="flex gap-4">
                <button
                  onClick={() => handleDecisionAction('admit')}
                  disabled={decisionLoading === 'admit' || decisionLoading === 'reject'}
                  className={`bg-green-500 hover:bg-green-600 text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-green-500/20 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-60 ${
                    decisionPulse === 'admit' ? 'ring-2 ring-green-300 scale-[0.98]' : ''
                  }`}
                >
                    <CheckCircle size={18}/> {decisionLoading === 'admit' ? 'Actualizando...' : 'Admitir Candidato'}
                </button>
                <button
                  onClick={() => handleDecisionAction('reject')}
                  disabled={decisionLoading === 'admit' || decisionLoading === 'reject'}
                  className={`bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 px-8 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95 disabled:opacity-60 ${
                    decisionPulse === 'reject' ? 'ring-2 ring-red-200 bg-red-50 text-red-500 scale-[0.98]' : ''
                  }`}
                >
                    {decisionLoading === 'reject' ? 'Actualizando...' : 'Rechazar'}
                </button>
            </div>
            <button onClick={onClose} className="text-slate-400 font-bold text-sm hover:text-slate-600 transition-colors uppercase tracking-widest">Cerrar</button>
        </footer>

        {selectedDoc && (
          <div
            className="fixed inset-0 z-[70] bg-slate-900/60 p-4 flex items-center justify-center"
            onClick={closePreviewModal}
          >
            <div
              className="w-full max-w-5xl max-h-[90vh] bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Visualización de documento</p>
                  <p className="text-sm font-bold text-slate-700">{selectedDoc.label}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closePreviewModal}
                    className="p-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100"
                    aria-label="Cerrar visualización"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-100 max-h-[80vh] overflow-auto">
                {docPreviewLoading && <p className="text-sm text-slate-500">Cargando vista del documento...</p>}
                {!docPreviewLoading && docPreviewError && <p className="text-sm text-red-600">{docPreviewError}</p>}

                {!docPreviewLoading && !docPreviewError && selectedDocUrl && (
                  <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
                    {looksLikeImage(selectedDoc.path) || looksLikeImage(selectedDocUrl) ? (
                      <img src={selectedDocUrl} alt={selectedDoc.label} className="w-full max-h-[74vh] object-contain bg-slate-50" />
                    ) : looksLikePdf(selectedDoc.path) || looksLikePdf(selectedDocUrl) ? (
                      <iframe title={selectedDoc.label} src={selectedDocUrl} className="w-full h-[74vh]" />
                    ) : (
                      <iframe title={selectedDoc.label} src={selectedDocUrl} className="w-full h-[74vh]" />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const BentoSection = ({ title, icon, children, span }) => (
    <div className={`${span} bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm hover:shadow-md transition-shadow`}>
        <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest mb-6">
            {icon} {title}
        </div>
        <div className="space-y-4">{children}</div>
    </div>
);

const InfoRow = ({ label, value }) => (
    <div>
        <div className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider">{label}</div>
        <div className="text-sm font-bold text-slate-700">{value || 'No reportado'}</div>
    </div>
);

export default AspiranteModal;