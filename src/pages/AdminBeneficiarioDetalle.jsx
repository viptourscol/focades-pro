import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CircleDollarSign, Edit2, FileText, LoaderCircle, Mail, MapPin, Phone, Save, ShieldAlert, Ticket } from 'lucide-react';
import { showConfirmAlert, showErrorAlert, showSuccessAlert } from '../lib/alerts';
import { invokeAdminTickets } from '../lib/adminTickets';
import { getSafeSession, supabase } from '../lib/supabase';
import DocViewerModal from '../components/DocViewerModal';

const PAYMENT_RIGHTS_RPC_SESSION_KEY = 'focades-payment-rights-rpc-unavailable';
const ADMIN_PAYMENT_RIGHTS_RPC = 'admin_beneficiario_payment_rights';

const isRpcMarkedUnavailable = (rpcName) => {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.sessionStorage.getItem(PAYMENT_RIGHTS_RPC_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return Boolean(parsed?.[rpcName]);
  } catch {
    return false;
  }
};

const markRpcUnavailable = (rpcName) => {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(PAYMENT_RIGHTS_RPC_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[rpcName] = true;
    window.sessionStorage.setItem(PAYMENT_RIGHTS_RPC_SESSION_KEY, JSON.stringify(parsed));
  } catch {
    // noop
  }
};

const BENEFICIARIO_STATES = ['activo', 'suspendido', 'retirado', 'condonado', 'egresado'];
const UPDATE_STATUS_OPTIONS = ['en_revision', 'aprobada', 'rechazada'];
const PAYMENT_STATUS_OPTIONS = ['programado', 'pendiente', 'efectuado', 'anulado'];
const DETAIL_TABS = ['perfil', 'onboarding', 'actualizaciones', 'expediente', 'pagos', 'tickets', 'bitacora'];

const formatDateTime = (value) => {
  if (!value) return 'No disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No disponible';
  return date.toLocaleString('es-CO');
};

const formatDate = (value) => {
  if (!value) return 'No disponible';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'No disponible';
  return date.toLocaleDateString('es-CO');
};

const formatMoney = (value) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value || 0));

const estadoClassName = (status) => {
  if (status === 'activo' || status === 'aprobada' || status === 'efectuado') return 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200';
  if (status === 'suspendido' || status === 'pendiente' || status === 'en_revision' || status === 'programado') return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200';
  if (status === 'retirado' || status === 'rechazada' || status === 'anulado') return 'bg-red-100 text-red-700 ring-1 ring-red-200';
  if (status === 'condonado' || status === 'egresado') return 'bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200';
  return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
};

const emptyPaymentDraft = {
  concepto: '',
  periodo: '',
  referencia: '',
  monto: '',
  fecha_programada: '',
  fecha_efectiva: '',
  estado: 'programado',
  observacion: '',
};

const normalizeBeneficiarioLevel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('tecnol')) return 'tecnologo';
  if (normalized.includes('tecnic')) return 'tecnico';
  if (normalized.includes('universi') || normalized.includes('pregrado') || normalized.includes('profesional')) return 'profesional';
  return null;
};

const paymentCapForLevel = (value) => {
  const normalized = normalizeBeneficiarioLevel(value);
  if (normalized === 'tecnico') return 4;
  if (normalized === 'tecnologo') return 6;
  if (normalized === 'profesional') return 10;
  return null;
};

const toIntegerOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
};

const buildLocalPaymentRights = ({ profile, paymentRows = [], enrollmentData = null }) => {
  const nivelFormacion =
    profile?.nivel_formacion ||
    enrollmentData?.datos_formulario?.nivel_formacion ||
    null;
  const modalidad =
    profile?.modalidad ||
    enrollmentData?.datos_formulario?.modalidad ||
    enrollmentData?.datos_formulario?.modalidad_aspira ||
    null;
  const semestreIngreso =
    toIntegerOrNull(profile?.semestre_ingreso) ||
    toIntegerOrNull(enrollmentData?.datos_formulario?.semestre_ingreso) ||
    null;
  const topePagos = paymentCapForLevel(nivelFormacion);
  const derechoInicial = topePagos && semestreIngreso ? Math.max(0, topePagos - (semestreIngreso - 1)) : 0;
  const pagosEfectuados = paymentRows.filter((item) => item.estado === 'efectuado').length;
  const pagosRestantes = Math.max(0, derechoInicial - pagosEfectuados);
  const esActivo = profile?.estado_beneficiario === 'activo';

  let motivoBloqueo = null;
  let esElegible = false;

  if (!nivelFormacion) {
    motivoBloqueo = 'Falta nivel de formacion para calcular derechos de pago.';
  } else if (!semestreIngreso) {
    motivoBloqueo = 'Falta semestre de ingreso para calcular derechos de pago.';
  } else if (!esActivo) {
    motivoBloqueo = 'El beneficiario no esta en estado activo.';
  } else if (pagosRestantes <= 0) {
    motivoBloqueo = 'El beneficiario ya agoto sus cupos de pago.';
  } else {
    esElegible = true;
  }

  return {
    beneficiarioId: profile?.id || null,
    nivelFormacion,
    nivelNormalizado: normalizeBeneficiarioLevel(nivelFormacion),
    modalidad,
    semestreIngreso,
    semestreReferencia: semestreIngreso,
    topePagos,
    derechoInicial,
    ajustesNetos: 0,
    derechoTotal: derechoInicial,
    pagosEfectuados,
    pagosRestantes,
    estadoBeneficiario: profile?.estado_beneficiario || null,
    esElegible,
    motivoBloqueo,
    source: 'local-fallback',
  };
};

const AdminBeneficiarioDetalle = () => {
  const { beneficiarioId } = useParams();
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingReviewId, setSavingReviewId] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [beneficiario, setBeneficiario] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [documentsByUpdate, setDocumentsByUpdate] = useState({});
  const [stateHistory, setStateHistory] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paymentRights, setPaymentRights] = useState(null);
  const [paymentRightsNotice, setPaymentRightsNotice] = useState('');
  const [tickets, setTickets] = useState([]);
  const [bitacoraRows, setBitacoraRows] = useState([]);
  const [onboardingDocs, setOnboardingDocs] = useState([]);
  const [profileForm, setProfileForm] = useState({ email: '', telefono: '', direccion: '', semestre_actual: '' });
  const [statusDraft, setStatusDraft] = useState('activo');
  const [statusReason, setStatusReason] = useState('');
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [paymentDraft, setPaymentDraft] = useState(emptyPaymentDraft);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [activeTab, setActiveTab] = useState('perfil');
  const [onboardingSubTab, setOnboardingSubTab] = useState('personal');
  const [isEditingOnboarding, setIsEditingOnboarding] = useState(false);
  const [onboardingForm, setOnboardingForm] = useState({});
  const [hasOnboardingChanges, setHasOnboardingChanges] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState({ perfil: false, onboarding: false, actualizaciones: false, expediente: false, pagos: false, tickets: false, bitacora: false });
  const [loadingByTab, setLoadingByTab] = useState({ perfil: false, onboarding: false, actualizaciones: false, expediente: false, pagos: false, tickets: false, bitacora: false });
  const [expedienteDocs, setExpedienteDocs] = useState([]);
  const [expedienteData, setExpedienteData] = useState(null);
  const [historicoDocs, setHistoricoDocs] = useState([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');

  const setTabLoading = (tab, value) => {
    setLoadingByTab((prev) => ({ ...prev, [tab]: value }));
  };

  const markTabLoaded = (tab) => {
    setLoadedTabs((prev) => ({ ...prev, [tab]: true }));
  };

  const loadProfileData = async () => {
    setLoading(true);
    setTabLoading('perfil', true);
    try {
      const [{ data: profile }, { data: historyData }] = await Promise.all([
        supabase.from('portal_beneficiarios').select('*').eq('id', beneficiarioId).maybeSingle(),
        supabase.from('portal_beneficiario_estado_historial').select('*').eq('beneficiario_id', beneficiarioId).order('created_at', { ascending: false }),
      ]);

      setBeneficiario(profile || null);
      setProfileForm({
        email: profile?.email || '',
        telefono: profile?.telefono || '',
        direccion: profile?.direccion || '',
        semestre_actual: String(profile?.semestre_actual || ''),
      });
      setStatusDraft(profile?.estado_beneficiario || 'activo');
      setStateHistory(Array.isArray(historyData) ? historyData : []);
      markTabLoaded('perfil');
      return profile || null;
    } catch {
      setBeneficiario(null);
      setStateHistory([]);
      return null;
    } finally {
      setTabLoading('perfil', false);
      setLoading(false);
    }
  };

  const loadUpdatesData = async () => {
    setTabLoading('actualizaciones', true);
    try {
      const { data: updatesData } = await supabase
        .from('portal_actualizaciones')
        .select('*')
        .eq('beneficiario_id', beneficiarioId)
        .order('created_at', { ascending: false });

      const updatesList = Array.isArray(updatesData) ? updatesData : [];
      setUpdates(updatesList);

      const reviewInitial = {};
      updatesList.forEach((item) => {
        reviewInitial[item.id] = {
          estado: item.estado || 'en_revision',
          observacion_admin: item.observacion_admin || '',
        };
      });
      setReviewDrafts(reviewInitial);

      const updateIds = updatesList.map((item) => item.id);
      if (updateIds.length > 0) {
        const { data: docsData } = await supabase
          .from('portal_actualizacion_documentos')
          .select('*')
          .in('actualizacion_id', updateIds)
          .order('created_at', { ascending: false });

        const nextDocs = {};
        (docsData || []).forEach((doc) => {
          if (!nextDocs[doc.actualizacion_id]) nextDocs[doc.actualizacion_id] = [];
          nextDocs[doc.actualizacion_id].push(doc);
        });
        setDocumentsByUpdate(nextDocs);
      } else {
        setDocumentsByUpdate({});
      }

      markTabLoaded('actualizaciones');
    } finally {
      setTabLoading('actualizaciones', false);
    }
  };

  const loadPagosData = async () => {
    setTabLoading('pagos', true);
    try {
      const { data } = await supabase
        .from('portal_beneficiario_pagos')
        .select('*')
        .eq('beneficiario_id', beneficiarioId)
        .order('created_at', { ascending: false });
      const paymentRows = Array.isArray(data) ? data : [];
      setPayments(paymentRows);
      await loadPaymentRights(beneficiarioId, beneficiario, paymentRows);
      markTabLoaded('pagos');
    } finally {
      setTabLoading('pagos', false);
    }
  };

  const loadPaymentRights = async (targetBeneficiarioId = beneficiarioId, profileOverride = null, paymentRowsOverride = null) => {
    try {
      if (isRpcMarkedUnavailable(ADMIN_PAYMENT_RIGHTS_RPC)) {
        throw new Error('__PAYMENT_RIGHTS_RPC_UNAVAILABLE__');
      }

      const { data, error } = await supabase.rpc('admin_beneficiario_payment_rights', {
        p_beneficiario_id: Number(targetBeneficiarioId),
      });

      if (error) throw error;
      setPaymentRights(data || null);
      setPaymentRightsNotice('');
    } catch (error) {
      const profile = profileOverride || beneficiario;
      let enrollmentData = null;

      if (profile?.inscripcion_pk || profile?.inscripcion_id) {
        const { data: inscripcionData } = await supabase
          .from('inscripciones')
          .select('id,datos_formulario')
          .eq('id', profile.inscripcion_pk || profile.inscripcion_id)
          .maybeSingle();
        enrollmentData = inscripcionData || null;
      }

      const fallback = buildLocalPaymentRights({
        profile,
        paymentRows: Array.isArray(paymentRowsOverride) ? paymentRowsOverride : payments,
        enrollmentData,
      });

      setPaymentRights(fallback);
      if (String(error?.message || '').includes('404') || String(error?.message || '').includes('not found')) {
        markRpcUnavailable(ADMIN_PAYMENT_RIGHTS_RPC);
      }

      if (String(error?.message || '') === '__PAYMENT_RIGHTS_RPC_UNAVAILABLE__' || String(error?.message || '').includes('404') || String(error?.message || '').includes('not found')) {
        setPaymentRightsNotice('La funcion de backend para derechos de pago aun no esta desplegada en Supabase. Se muestra un calculo local estimado.');
      } else {
        setPaymentRightsNotice('No fue posible consultar el calculo centralizado. Se muestra un calculo local estimado.');
      }
    }
  };

  const loadTicketsData = async (profileOverride = null) => {
    setTabLoading('tickets', true);
    try {
      const profile = profileOverride || beneficiario;
      if (!(profile?.email || profile?.radicado_inscripcion)) {
        setTickets([]);
        markTabLoaded('tickets');
        return;
      }

      const result = await invokeAdminTickets({
        action: 'list',
        query: profile?.email || profile?.radicado_inscripcion,
        limit: 120,
      });

      if (result.ok) {
        const relatedTickets = (result.data?.tickets || []).filter((ticket) => {
          const sameEmail = profile?.email && String(ticket.email_contacto || '').toLowerCase() === String(profile.email || '').toLowerCase();
          const sameRadicado = profile?.radicado_inscripcion && String(ticket.radicado || '') === String(profile.radicado_inscripcion || '');
          return sameEmail || sameRadicado;
        });
        setTickets(relatedTickets);
      } else {
        setTickets([]);
      }
      markTabLoaded('tickets');
    } finally {
      setTabLoading('tickets', false);
    }
  };

  const loadExpedienteData = async (profileOverride = null) => {
    setTabLoading('expediente', true);
    try {
      const profile = profileOverride || beneficiario;
      let inscripcionPk = profile?.inscripcion_pk;

      if (!inscripcionPk) {
        const normalizedRadicado = String(profile?.radicado_inscripcion || '').trim();
        const normalizedDocumento = String(profile?.n_documento || '').trim();

        let linkedInscripcion = null;

        if (normalizedRadicado) {
          const byRadicado = await supabase
            .from('inscripciones')
            .select('id,radicado,updated_at')
            .eq('radicado', normalizedRadicado)
            .order('updated_at', { ascending: false })
            .limit(1);

          const radicadoRows = Array.isArray(byRadicado.data) ? byRadicado.data : [];
          linkedInscripcion = radicadoRows[0] || null;

          if (!linkedInscripcion) {
            const byNumeroRadicado = await supabase
              .from('inscripciones')
              .select('id,numero_radicado,updated_at')
              .eq('numero_radicado', normalizedRadicado)
              .order('updated_at', { ascending: false })
              .limit(1);

            const missingNumeroRadicadoColumn =
              byNumeroRadicado.error &&
              /column\s+inscripciones\.numero_radicado does not exist|Could not find the 'numero_radicado' column/i.test(
                byNumeroRadicado.error.message || ''
              );

            if (!missingNumeroRadicadoColumn) {
              const numeroRows = Array.isArray(byNumeroRadicado.data) ? byNumeroRadicado.data : [];
              linkedInscripcion = numeroRows[0] || null;
            }
          }
        }

        if (!linkedInscripcion && normalizedDocumento) {
          const byDocumento = await supabase
            .from('inscripciones')
            .select('id,n_documento,updated_at')
            .eq('n_documento', normalizedDocumento)
            .order('updated_at', { ascending: false })
            .limit(1);

          const documentoRows = Array.isArray(byDocumento.data) ? byDocumento.data : [];
          linkedInscripcion = documentoRows[0] || null;
        }

        if (linkedInscripcion?.id) {
          inscripcionPk = linkedInscripcion.id;

          // Persistir vínculo para que futuras cargas usen llave directa.
          if (profile?.id) {
            await supabase
              .from('portal_beneficiarios')
              .update({ inscripcion_pk: linkedInscripcion.id, updated_at: new Date().toISOString() })
              .eq('id', profile.id);
          }
        }
      }

      if (!inscripcionPk) {
        setExpedienteData(null);
        setExpedienteDocs([]);
        // Cargar documentos históricos incluso sin inscripción
        if (profile?.id) {
          const { data: historicoData } = await supabase
            .from('portal_beneficiario_documentos_historicos')
            .select('*')
            .eq('beneficiario_id', profile.id)
            .order('created_at', { ascending: false });
          setHistoricoDocs(Array.isArray(historicoData) ? historicoData : []);
        } else {
          setHistoricoDocs([]);
        }
        markTabLoaded('expediente');
        return;
      }

      const [{ data: inscripcion }, { data: docs }, { data: historicoData }] = await Promise.all([
        supabase
          .from('inscripciones')
          .select('id,radicado,estado,etapa,observacion_publica,convocatoria_id,puntaje_total,datos_formulario,created_at,updated_at')
          .eq('id', inscripcionPk)
          .maybeSingle(),
        supabase
          .from('inscripciones_documentos')
          .select('*')
          .eq('inscripcion_id', inscripcionPk)
          .order('uploaded_at', { ascending: false }),
        supabase
          .from('portal_beneficiario_documentos_historicos')
          .select('*')
          .eq('beneficiario_id', profile.id)
          .order('created_at', { ascending: false }),
      ]);

      setExpedienteData(inscripcion || null);
      setExpedienteDocs(Array.isArray(docs) ? docs : []);
      setHistoricoDocs(Array.isArray(historicoData) ? historicoData : []);
      markTabLoaded('expediente');
    } finally {
      setTabLoading('expediente', false);
    }
  };

  const loadBitacoraData = async (profileOverride = null) => {
    setTabLoading('bitacora', true);
    try {
      const profile = profileOverride || beneficiario;
      if (!profile?.id) {
        setBitacoraRows([]);
        markTabLoaded('bitacora');
        return;
      }

      const { data } = await supabase
        .from('portal_beneficiario_bitacora')
        .select('*')
        .eq('beneficiario_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(300);

      setBitacoraRows(Array.isArray(data) ? data : []);
      markTabLoaded('bitacora');
    } finally {
      setTabLoading('bitacora', false);
    }
  };

  const loadOnboardingData = async (profileOverride = null) => {
    setTabLoading('onboarding', true);
    try {
      const profile = profileOverride || beneficiario;
      if (!profile?.id) {
        setOnboardingDocs([]);
        markTabLoaded('onboarding');
        return;
      }

      const { data } = await supabase
        .from('portal_beneficiario_documentos_historicos')
        .select('*')
        .eq('beneficiario_id', profile.id)
        .order('created_at', { ascending: false });

      setOnboardingDocs(Array.isArray(data) ? data : []);
      
      // Inicializar formulario de onboarding
      setOnboardingForm({
        nombre_completo: profile.nombre_completo || '',
        n_documento: profile.n_documento || '',
        tipo_documento: profile.tipo_documento || 'CC',
        email: profile.email || '',
        telefono: profile.telefono || '',
        genero: profile.genero || '',
        fecha_nacimiento: profile.fecha_nacimiento || '',
        pais_nacimiento: profile.pais_nacimiento || 'COLOMBIA',
        dpto_nacimiento: profile.dpto_nacimiento || '',
        municipio_nacimiento: profile.municipio_nacimiento || '',
        dpto_residencia: profile.dpto_residencia || '',
        municipio_residencia: profile.municipio_residencia || '',
        direccion_residencia: profile.direccion_residencia || '',
        barrio_corregimiento: profile.barrio_corregimiento || '',
        zona_residencia: profile.zona_residencia || '',
        direccion: profile.direccion || '',
        sisben_grupo: profile.sisben_grupo || '',
        recibe_subsidio: profile.recibe_subsidio || '',
        cual_subsidio: profile.cual_subsidio || '',
        enfoque_diferencial: profile.enfoque_diferencial || 'NINGUNO',
        labora_actualmente: profile.labora_actualmente || '',
        nombre_padre: profile.nombre_padre || '',
        documento_padre: profile.documento_padre || '',
        ocupacion_padre: profile.ocupacion_padre || '',
        ingresos_padre: profile.ingresos_padre || '',
        nombre_madre: profile.nombre_madre || '',
        documento_madre: profile.documento_madre || '',
        ocupacion_madre: profile.ocupacion_madre || '',
        ingresos_madre: profile.ingresos_madre || '',
        titulo_obtenido: profile.titulo_obtenido || '',
        ano_graduacion: profile.ano_graduacion || '',
        establecimiento_educativo: profile.establecimiento_educativo || '',
        puntaje_icfes: profile.puntaje_icfes || '',
        programa_academico: profile.programa_academico || '',
        nombre_universidad: profile.nombre_universidad || '',
        institucion_superior: profile.institucion_superior || '',
        dpto_institucion: profile.dpto_institucion || '',
        municipio_institucion: profile.municipio_institucion || '',
        ciudad_institucion: profile.ciudad_institucion || '',
        tipo_educacion: profile.tipo_educacion || '',
        modalidad_beca: profile.modalidad_beca || '',
        semestre_actual: profile.semestre_actual || '',
        semestre_ingreso: profile.semestre_ingreso || '',
        modalidad: profile.modalidad || '',
        promedio_anterior: profile.promedio_anterior || '',
        año_convocatoria: profile.año_convocatoria || '',
        nombre_banco: profile.nombre_banco || '',
        tipo_cuenta_bancaria: profile.tipo_cuenta_bancaria || '',
        numero_cuenta: profile.numero_cuenta || '',
      });
      setHasOnboardingChanges(false);
      setIsEditingOnboarding(false);
      markTabLoaded('onboarding');
    } finally {
      setTabLoading('onboarding', false);
    }
  };

  const handleOnboardingChange = (field, value) => {
    setOnboardingForm(prev => ({ ...prev, [field]: value }));
    setHasOnboardingChanges(true);
  };

  const handleCancelOnboardingEdit = () => {
    // Restaurar valores originales
    if (beneficiario) {
      setOnboardingForm({
        nombre_completo: beneficiario.nombre_completo || '',
        n_documento: beneficiario.n_documento || '',
        tipo_documento: beneficiario.tipo_documento || 'CC',
        email: beneficiario.email || '',
        telefono: beneficiario.telefono || '',
        genero: beneficiario.genero || '',
        fecha_nacimiento: beneficiario.fecha_nacimiento || '',
        pais_nacimiento: beneficiario.pais_nacimiento || 'COLOMBIA',
        dpto_nacimiento: beneficiario.dpto_nacimiento || '',
        municipio_nacimiento: beneficiario.municipio_nacimiento || '',
        dpto_residencia: beneficiario.dpto_residencia || '',
        municipio_residencia: beneficiario.municipio_residencia || '',
        direccion_residencia: beneficiario.direccion_residencia || '',
        barrio_corregimiento: beneficiario.barrio_corregimiento || '',
        zona_residencia: beneficiario.zona_residencia || '',
        direccion: beneficiario.direccion || '',
        sisben_grupo: beneficiario.sisben_grupo || '',
        recibe_subsidio: beneficiario.recibe_subsidio || '',
        cual_subsidio: beneficiario.cual_subsidio || '',
        enfoque_diferencial: beneficiario.enfoque_diferencial || 'NINGUNO',
        labora_actualmente: beneficiario.labora_actualmente || '',
        nombre_padre: beneficiario.nombre_padre || '',
        documento_padre: beneficiario.documento_padre || '',
        ocupacion_padre: beneficiario.ocupacion_padre || '',
        ingresos_padre: beneficiario.ingresos_padre || '',
        nombre_madre: beneficiario.nombre_madre || '',
        documento_madre: beneficiario.documento_madre || '',
        ocupacion_madre: beneficiario.ocupacion_madre || '',
        ingresos_madre: beneficiario.ingresos_madre || '',
        titulo_obtenido: beneficiario.titulo_obtenido || '',
        ano_graduacion: beneficiario.ano_graduacion || '',
        establecimiento_educativo: beneficiario.establecimiento_educativo || '',
        puntaje_icfes: beneficiario.puntaje_icfes || '',
        programa_academico: beneficiario.programa_academico || '',
        nombre_universidad: beneficiario.nombre_universidad || '',
        institucion_superior: beneficiario.institucion_superior || '',
        dpto_institucion: beneficiario.dpto_institucion || '',
        municipio_institucion: beneficiario.municipio_institucion || '',
        ciudad_institucion: beneficiario.ciudad_institucion || '',
        tipo_educacion: beneficiario.tipo_educacion || '',
        modalidad_beca: beneficiario.modalidad_beca || '',
        semestre_actual: beneficiario.semestre_actual || '',
        semestre_ingreso: beneficiario.semestre_ingreso || '',
        modalidad: beneficiario.modalidad || '',
        promedio_anterior: beneficiario.promedio_anterior || '',
        año_convocatoria: beneficiario.año_convocatoria || '',
        nombre_banco: beneficiario.nombre_banco || '',
        tipo_cuenta_bancaria: beneficiario.tipo_cuenta_bancaria || '',
        numero_cuenta: beneficiario.numero_cuenta || '',
      });
    }
    setHasOnboardingChanges(false);
    setIsEditingOnboarding(false);
  };

  const handleSaveOnboarding = async () => {
    if (!hasOnboardingChanges) {
      await showErrorAlert({ title: 'Sin cambios', text: 'No hay cambios para guardar' });
      return;
    }

    setLoading(true);
    try {
      // Calcular cambios
      const changes = {};
      Object.keys(onboardingForm).forEach(key => {
        if (onboardingForm[key] !== (beneficiario[key] || '')) {
          changes[key] = onboardingForm[key];
        }
      });

      if (Object.keys(changes).length === 0) {
        await showErrorAlert({ title: 'Sin cambios', text: 'No hay cambios para guardar' });
        return;
      }

      // Actualizar beneficiario
      const { error: updateError } = await supabase
        .from('portal_beneficiarios')
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq('id', beneficiarioId);

      if (updateError) throw updateError;

      // Registrar en bitácora
      const session = await getSafeSession();
      const actorUserId = session?.user?.id || null;
      const actorEmail = session?.user?.email || 'Sistema';

      await supabase.from('portal_beneficiario_bitacora').insert({
        beneficiario_id: beneficiarioId,
        categoria: 'datos_personales',
        tipo_evento: 'actualizacion_admin',
        accion: 'update',
        nota: `Actualización de datos de onboarding por ${actorEmail}. Campos: ${Object.keys(changes).join(', ')}`,
        actor_user_id: actorUserId,
      });

      await showSuccessAlert({ title: 'Guardado exitoso', text: 'Los datos del onboarding se actualizaron correctamente' });
      
      // Recargar datos
      const profile = await loadProfileData();
      if (profile) {
        await loadOnboardingData(profile);
      }
      
      setIsEditingOnboarding(false);
      setHasOnboardingChanges(false);
    } catch (error) {
      await showErrorAlert({ title: 'Error al guardar', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleViewDocument = async (doc) => {
    if (!doc?.storage_path) return;
    
    try {
      // Limpiar path
      let cleanPath = doc.storage_path;
      const bucketPrefix = 'soportes/';
      if (cleanPath.startsWith(bucketPrefix)) {
        cleanPath = cleanPath.substring(bucketPrefix.length);
      }

      // Obtener URL firmada
      const { data: signedData, error: signedError } = await supabase.storage
        .from('soportes')
        .createSignedUrl(cleanPath, 60 * 30);

      if (signedError || !signedData?.signedUrl) {
        throw new Error(signedError?.message || 'No se pudo obtener una URL para visualizar el documento.');
      }

      // Abrir en nueva ventana
      window.open(signedData.signedUrl, '_blank');
    } catch (error) {
      await showErrorAlert({ title: 'Error', text: error.message || 'No se pudo abrir el documento.' });
    }
  };

  const loadTabData = async (tab, profileOverride = null) => {
    if (tab === 'actualizaciones') await loadUpdatesData();
    if (tab === 'expediente') await loadExpedienteData(profileOverride);
    if (tab === 'pagos') await loadPagosData();
    if (tab === 'tickets') await loadTicketsData(profileOverride);
    if (tab === 'bitacora') await loadBitacoraData(profileOverride);
    if (tab === 'onboarding') await loadOnboardingData(profileOverride);
  };

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setLoadedTabs({ perfil: false, onboarding: false, actualizaciones: false, expediente: false, pagos: false, tickets: false, bitacora: false });
      setUpdates([]);
      setDocumentsByUpdate({});
      setPayments([]);
      setPaymentRights(null);
      setTickets([]);
      setBitacoraRows([]);
      setOnboardingDocs([]);
      setExpedienteDocs([]);
      setExpedienteData(null);
      setActiveTab('perfil');

      const profile = await loadProfileData();
      if (!mounted) return;
      if (profile?.id) {
        await loadPaymentRights(profile.id, profile, []);
      }
      await loadTabData('actualizaciones', profile);
    };

    bootstrap();
    return () => {
      mounted = false;
    };
  }, [beneficiarioId]);

  useEffect(() => {
    if (activeTab === 'perfil') return;
    if (loadedTabs[activeTab]) return;
    loadTabData(activeTab);
  }, [activeTab, loadedTabs]);

  const totalPagado = useMemo(() => {
    return payments
      .filter((item) => item.estado === 'efectuado')
      .reduce((acc, item) => acc + Number(item.monto || 0), 0);
  }, [payments]);

  const latestUpdate = updates[0] || null;

  const saveProfile = async () => {
    if (!beneficiario?.id) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('portal_beneficiarios')
        .update({
          email: String(profileForm.email || '').trim().toLowerCase(),
          telefono: String(profileForm.telefono || '').trim() || null,
          direccion: String(profileForm.direccion || '').trim() || null,
          semestre_actual: Number(profileForm.semestre_actual || 0) || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', beneficiario.id);

      if (error) throw error;
      await showSuccessAlert({ title: 'Perfil actualizado', text: 'Los datos base del beneficiario fueron actualizados.' });
      const profile = await loadProfileData();
      if (loadedTabs.tickets) {
        await loadTicketsData(profile);
      }
      if (loadedTabs.expediente) {
        await loadExpedienteData(profile);
      }
      await loadPaymentRights(beneficiario.id);
    } catch (error) {
      await showErrorAlert({ title: 'No se pudo guardar el perfil', text: error.message || 'Ocurrió un error.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const changeBeneficiarioState = async () => {
    if (!beneficiario?.id) return;
    if (!statusDraft || statusDraft === beneficiario.estado_beneficiario) {
      await showErrorAlert({ title: 'Sin cambios', text: 'Selecciona un estado diferente para registrar el cambio.' });
      return;
    }
    if (!String(statusReason || '').trim()) {
      await showErrorAlert({ title: 'Motivo requerido', text: 'Debes registrar el motivo del cambio de estado.' });
      return;
    }

    setSavingStatus(true);
    try {
      const { session } = await getSafeSession();
      const actor = session?.user || null;

      const { error: updateError } = await supabase
        .from('portal_beneficiarios')
        .update({ estado_beneficiario: statusDraft, updated_at: new Date().toISOString() })
        .eq('id', beneficiario.id);
      if (updateError) throw updateError;

      const { error: historyError } = await supabase.from('portal_beneficiario_estado_historial').insert({
        beneficiario_id: beneficiario.id,
        estado_anterior: beneficiario.estado_beneficiario || null,
        estado_nuevo: statusDraft,
        motivo: String(statusReason || '').trim(),
        actor_user_id: actor?.id || null,
        actor_email: actor?.email || null,
      });
      if (historyError) throw historyError;

      setStatusReason('');
      await showSuccessAlert({ title: 'Estado actualizado', text: 'El cambio quedó registrado en el historial.' });
      await loadProfileData();
      await loadPaymentRights(beneficiario.id);
    } catch (error) {
      await showErrorAlert({ title: 'No se pudo cambiar el estado', text: error.message || 'Ocurrió un error.' });
    } finally {
      setSavingStatus(false);
    }
  };

  const saveReview = async (updateId) => {
    const draft = reviewDrafts[updateId];
    if (!draft) return;
    if (draft.estado === 'rechazada' && !String(draft.observacion_admin || '').trim()) {
      await showErrorAlert({ title: 'Observación requerida', text: 'Debes registrar una observación al rechazar una actualización.' });
      return;
    }

    setSavingReviewId(String(updateId));
    try {
      const { session } = await getSafeSession();
      const { error } = await supabase
        .from('portal_actualizaciones')
        .update({
          estado: draft.estado,
          observacion_admin: String(draft.observacion_admin || '').trim() || null,
          revisado_por_user_id: session?.user?.id || null,
          revisado_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', updateId);

      if (error) throw error;
      await showSuccessAlert({ title: 'Actualización revisada', text: 'La revisión administrativa fue guardada.' });
      await loadUpdatesData();
    } catch (error) {
      await showErrorAlert({ title: 'No se pudo guardar la revisión', text: error.message || 'Ocurrió un error.' });
    } finally {
      setSavingReviewId('');
    }
  };

  const editPayment = (payment) => {
    setEditingPaymentId(payment.id);
    setPaymentDraft({
      concepto: payment.concepto || '',
      periodo: payment.periodo || '',
      referencia: payment.referencia || '',
      monto: String(payment.monto || ''),
      fecha_programada: payment.fecha_programada || '',
      fecha_efectiva: payment.fecha_efectiva || '',
      estado: payment.estado || 'programado',
      observacion: payment.observacion || '',
    });
  };

  const resetPaymentForm = () => {
    setEditingPaymentId(null);
    setPaymentDraft(emptyPaymentDraft);
  };

  const savePayment = async () => {
    if (!beneficiario?.id) return;
    if (!String(paymentDraft.concepto || '').trim() || !String(paymentDraft.monto || '').trim()) {
      await showErrorAlert({ title: 'Datos incompletos', text: 'Debes registrar al menos concepto y monto.' });
      return;
    }

    setSavingPayment(true);
    try {
      const { session } = await getSafeSession();
      const payload = {
        beneficiario_id: beneficiario.id,
        concepto: String(paymentDraft.concepto || '').trim(),
        periodo: String(paymentDraft.periodo || '').trim() || null,
        referencia: String(paymentDraft.referencia || '').trim() || null,
        monto: Number(String(paymentDraft.monto || '').replace(',', '.')) || 0,
        fecha_programada: paymentDraft.fecha_programada || null,
        fecha_efectiva: paymentDraft.fecha_efectiva || null,
        estado: paymentDraft.estado || 'programado',
        observacion: String(paymentDraft.observacion || '').trim() || null,
        updated_by_user_id: session?.user?.id || null,
      };

      if (editingPaymentId) {
        const { error } = await supabase
          .from('portal_beneficiario_pagos')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingPaymentId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('portal_beneficiario_pagos').insert({
          ...payload,
          created_by_user_id: session?.user?.id || null,
        });
        if (error) throw error;
      }

      resetPaymentForm();
      await showSuccessAlert({ title: 'Pago guardado', text: 'El registro financiero fue actualizado.' });
      await loadPagosData();
      await loadPaymentRights(beneficiario.id);
    } catch (error) {
      await showErrorAlert({ title: 'No se pudo guardar el pago', text: error.message || 'Ocurrió un error.' });
    } finally {
      setSavingPayment(false);
    }
  };

  const sendInvite = async () => {
    if (!beneficiario?.email || inviteLoading) return;
    setInviteLoading(true);
    setInviteMessage('');
    try {
      const { session } = await getSafeSession();
      const accessToken = String(session?.access_token || '').trim();
      if (!accessToken) {
        throw new Error('Tu sesión expiró. Inicia sesión nuevamente para enviar invitaciones.');
      }

      const { data, error } = await supabase.functions.invoke('invite-beneficiario', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { email: beneficiario.email, nombre: beneficiario.nombre_completo || '' },
      });
      if (error) {
        const functionMessage = error?.context ? await error.context.json().then((payload) => payload?.message).catch(() => '') : '';
        throw new Error(functionMessage || error.message || 'No se pudo enviar la invitación.');
      }
      setInviteMessage(data?.message || 'Operación completada.');
    } catch (err) {
      setInviteMessage(err?.message || 'No se pudo enviar la invitación.');
    } finally {
      setInviteLoading(false);
    }
  };

  const deletePayment = async (paymentId) => {
    const confirmed = await showConfirmAlert({
      title: '¿Eliminar pago?',
      text: 'Esta acción no se puede deshacer.',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!confirmed) return;

    try {
      const { error } = await supabase.from('portal_beneficiario_pagos').delete().eq('id', paymentId);
      if (error) throw error;
      await showSuccessAlert({ title: 'Pago eliminado', text: 'El registro fue eliminado correctamente.' });
      await loadPagosData();
      await loadPaymentRights(beneficiario.id);
    } catch (error) {
      await showErrorAlert({ title: 'No se pudo eliminar el pago', text: error.message || 'Ocurrió un error.' });
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-16 text-center text-slate-500">
        <LoaderCircle size={24} className="mx-auto mb-3 animate-spin" />
        Cargando ficha 360 del beneficiario...
      </div>
    );
  }

  if (!beneficiario) {
    return (
      <div className="space-y-4">
        <Link to="/admin/beneficiarios" className="inline-flex items-center gap-2 text-sm font-bold text-secondary">
          <ArrowLeft size={16} /> Volver a beneficiarios
        </Link>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          No se encontró el beneficiario solicitado.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/admin/beneficiarios" className="inline-flex items-center gap-2 text-sm font-bold text-secondary">
        <ArrowLeft size={16} /> Volver a beneficiarios
      </Link>

      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">Ficha 360</p>
              {beneficiario.modalidad_beca && (
                <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200">
                  {beneficiario.modalidad_beca}
                </span>
              )}
            </div>
            <h1 className="text-3xl font-black text-slate-800 mt-1">{beneficiario.nombre_completo || 'Sin nombre'}</h1>
            <div className="flex flex-wrap gap-3 text-sm text-slate-500 mt-3">
              <span className="inline-flex items-center gap-2"><Mail size={15} /> {beneficiario.email || 'Sin correo'}</span>
              <span className="inline-flex items-center gap-2"><Phone size={15} /> {beneficiario.telefono || 'Sin teléfono'}</span>
              <span className="inline-flex items-center gap-2"><MapPin size={15} /> {beneficiario.direccion || 'Sin dirección'}</span>
              <span className="inline-flex items-center gap-2"><CalendarClock size={15} /> Actualizado {formatDateTime(beneficiario.updated_at)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <span className={`inline-flex px-3 py-2 rounded-2xl text-xs font-black uppercase tracking-widest ${estadoClassName(beneficiario.estado_beneficiario)}`}>
              {beneficiario.estado_beneficiario || 'sin estado'}
            </span>
            <p className="text-xs text-slate-500">Semestre actual: {beneficiario.semestre_actual || 'No definido'}</p>
            {beneficiario.auth_user_id ? (
              <p className="text-xs text-slate-500">Vinculación auth: <span className="text-emerald-600 font-bold">Activa</span></p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-slate-500">Vinculación auth: <span className="text-amber-600 font-bold">Pendiente</span></p>
                <button
                  type="button"
                  onClick={sendInvite}
                  disabled={inviteLoading || !beneficiario.email}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary text-white text-xs font-bold disabled:opacity-50"
                >
                  <Mail size={13} /> {inviteLoading ? 'Enviando...' : 'Enviar invitación de acceso'}
                </button>
                {inviteMessage && <p className="text-xs text-slate-600">{inviteMessage}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SummaryCard title="Actualizaciones" value={loadedTabs.actualizaciones ? updates.length : '...'} icon={<FileText size={18} className="text-blue-600" />} tone="bg-blue-50" />
          <SummaryCard title="Pagos" value={loadedTabs.pagos ? payments.length : '...'} icon={<CircleDollarSign size={18} className="text-emerald-600" />} tone="bg-emerald-50" />
          <SummaryCard title="Tickets" value={loadedTabs.tickets ? tickets.length : '...'} icon={<Ticket size={18} className="text-amber-600" />} tone="bg-amber-50" />
          <SummaryCard title="Total pagado" value={loadedTabs.pagos ? formatMoney(totalPagado) : '...'} icon={<CircleDollarSign size={18} className="text-cyan-600" />} tone="bg-cyan-50" />
        </div>
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-3">
        <div className="flex flex-wrap gap-2">
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-sm font-bold capitalize transition-colors ${
                activeTab === tab
                  ? 'bg-secondary text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab}
              {loadingByTab[tab] ? ' ...' : ''}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'perfil' && (
      <div className="grid xl:grid-cols-[1.1fr,0.9fr] gap-6">
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <SectionTitle title="Perfil operativo" subtitle="Edita datos base del beneficiario sin afectar su historial." />
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Correo" value={profileForm.email} onChange={(value) => setProfileForm((prev) => ({ ...prev, email: value }))} />
            <Field label="Teléfono" value={profileForm.telefono} onChange={(value) => setProfileForm((prev) => ({ ...prev, telefono: value }))} />
            <Field label="Dirección" value={profileForm.direccion} onChange={(value) => setProfileForm((prev) => ({ ...prev, direccion: value }))} />
            <Field label="Semestre actual" value={profileForm.semestre_actual} onChange={(value) => setProfileForm((prev) => ({ ...prev, semestre_actual: value }))} type="number" />
          </div>
          <button type="button" onClick={saveProfile} disabled={savingProfile} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-bold disabled:opacity-50">
            <Save size={16} /> {savingProfile ? 'Guardando...' : 'Guardar perfil'}
          </button>
        </section>

        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <SectionTitle title="Estado del beneficiario" subtitle="Cambia el estado y registra el motivo en trazabilidad." />
          <div className="grid md:grid-cols-[1fr,2fr] gap-3">
            <SelectField label="Nuevo estado" value={statusDraft} onChange={setStatusDraft} options={BENEFICIARIO_STATES} />
            <TextAreaField label="Motivo del cambio" value={statusReason} onChange={setStatusReason} rows={3} />
          </div>
          <button type="button" onClick={changeBeneficiarioState} disabled={savingStatus} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50">
            <ShieldAlert size={16} /> {savingStatus ? 'Guardando...' : 'Registrar cambio de estado'}
          </button>

          <div className="space-y-2 pt-2">
            {stateHistory.length === 0 ? (
              <p className="text-sm text-slate-500">Aún no hay cambios de estado registrados.</p>
            ) : (
              stateHistory.slice(0, 6).map((item) => (
                <div key={item.id} className="border border-slate-200 rounded-2xl px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${estadoClassName(item.estado_nuevo)}`}>
                      {item.estado_nuevo}
                    </span>
                    <span className="text-slate-400">desde {item.estado_anterior || 'sin dato'}</span>
                  </div>
                  <p className="text-sm text-slate-700 mt-2">{item.motivo || 'Sin motivo registrado'}</p>
                  <p className="text-xs text-slate-500 mt-2">{item.actor_email || 'Sistema'} · {formatDateTime(item.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      )}

      {activeTab === 'bitacora' && (
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
        <SectionTitle title="Bitácora del beneficiario" subtitle="Registro cronológico de cambios, asignaciones y acciones durante todo su ciclo." />
        {loadingByTab.bitacora && <p className="text-sm text-slate-500">Cargando bitácora...</p>}
        {!loadingByTab.bitacora && bitacoraRows.length === 0 ? (
          <p className="text-sm text-slate-500">No hay eventos registrados todavía para este beneficiario.</p>
        ) : (
          <div className="space-y-2">
            {bitacoraRows.map((row) => (
              <div key={row.id} className="border border-slate-200 rounded-2xl px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-700">
                    {row.categoria || 'general'}
                  </span>
                  <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-blue-50 text-blue-700">
                    {row.tipo_evento || 'evento'}
                  </span>
                  <span className="text-xs text-slate-500">{formatDateTime(row.created_at)}</span>
                </div>
                <p className="text-sm text-slate-700 mt-2">
                  {row.nota || `Acción: ${row.accion || 'update'}${row.campo_cambio ? ` · Campo: ${row.campo_cambio}` : ''}`}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Actor: {row.actor_email || row.actor_user_id || 'Sistema'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {activeTab === 'onboarding' && (
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
        <SectionTitle title="Información de Onboarding" subtitle="Datos completos del proceso de registro inicial del beneficiario." />
        
        {/* Sub-pestañas de onboarding */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          {[
            { id: 'personal', label: 'Personal' },
            { id: 'socioeconomico', label: 'Socio-económico' },
            { id: 'familiar', label: 'Familiar' },
            { id: 'secundaria', label: 'Secundaria' },
            { id: 'academico', label: 'Académico' },
            { id: 'bancario', label: 'Bancario' },
            { id: 'estado', label: 'Estado' },
            { id: 'documentos', label: 'Documentos' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setOnboardingSubTab(tab.id)}
              className={`px-4 py-2 font-semibold rounded-lg text-sm transition-all ${
                onboardingSubTab === tab.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Botones de edición */}
        {!loadingByTab.onboarding && beneficiario && onboardingSubTab !== 'estado' && onboardingSubTab !== 'documentos' && (
          <div className="flex items-center justify-end gap-3 border-b border-slate-200 pb-4">
            {!isEditingOnboarding ? (
              <button
                onClick={() => setIsEditingOnboarding(true)}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Edit2 size={18} />
                Editar
              </button>
            ) : (
              <>
                <button
                  onClick={handleCancelOnboardingEdit}
                  disabled={loading}
                  className="px-6 py-2.5 border-2 border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveOnboarding}
                  disabled={loading || !hasOnboardingChanges}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <LoaderCircle size={18} className="animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      Guardar Cambios
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        )}

        {loadingByTab.onboarding && <p className="text-sm text-slate-500">Cargando información...</p>}
        
        {!loadingByTab.onboarding && beneficiario && (
          <div className="space-y-4">
            {/* Personal */}
            {onboardingSubTab === 'personal' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DataField 
                  label="Nombre Completo" 
                  value={isEditingOnboarding ? onboardingForm.nombre_completo : beneficiario.nombre_completo} 
                  field="nombre_completo"
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                />
                <DataField 
                  label="Tipo de Documento" 
                  value={isEditingOnboarding ? onboardingForm.tipo_documento : beneficiario.tipo_documento} 
                  field="tipo_documento"
                  type="select"
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                  options={[
                    { value: 'CC', label: 'Cédula de Ciudadanía' },
                    { value: 'TI', label: 'Tarjeta de Identidad' },
                    { value: 'CE', label: 'Cédula de Extranjería' },
                    { value: 'PA', label: 'Pasaporte' }
                  ]}
                />
                <DataField 
                  label="Número de Documento" 
                  value={isEditingOnboarding ? onboardingForm.n_documento : beneficiario.n_documento} 
                  field="n_documento"
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                />
                <DataField 
                  label="Género" 
                  value={isEditingOnboarding ? onboardingForm.genero : beneficiario.genero} 
                  field="genero"
                  type="select"
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                  options={[
                    { value: '', label: 'Seleccionar...' },
                    { value: 'MASCULINO', label: 'Masculino' },
                    { value: 'FEMENINO', label: 'Femenino' },
                    { value: 'OTRO', label: 'Otro' }
                  ]}
                />
                <DataField 
                  label="Email" 
                  value={isEditingOnboarding ? onboardingForm.email : beneficiario.email} 
                  field="email"
                  type="email"
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                />
                <DataField 
                  label="Teléfono" 
                  value={isEditingOnboarding ? onboardingForm.telefono : beneficiario.telefono} 
                  field="telefono"
                  type="tel"
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                />
                <DataField 
                  label="Fecha de Nacimiento" 
                  value={isEditingOnboarding ? onboardingForm.fecha_nacimiento : (beneficiario.fecha_nacimiento ? formatDate(beneficiario.fecha_nacimiento) : null)} 
                  field="fecha_nacimiento"
                  type={isEditingOnboarding ? "date" : "text"}
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                />
                <DataField 
                  label="País de Nacimiento" 
                  value={isEditingOnboarding ? onboardingForm.pais_nacimiento : beneficiario.pais_nacimiento} 
                  field="pais_nacimiento"
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                />
                <DataField 
                  label="Departamento de Nacimiento" 
                  value={isEditingOnboarding ? onboardingForm.dpto_nacimiento : beneficiario.dpto_nacimiento} 
                  field="dpto_nacimiento"
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                />
                <DataField 
                  label="Municipio de Nacimiento" 
                  value={isEditingOnboarding ? onboardingForm.municipio_nacimiento : beneficiario.municipio_nacimiento} 
                  field="municipio_nacimiento"
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                />
                <DataField 
                  label="Departamento de Residencia" 
                  value={isEditingOnboarding ? onboardingForm.dpto_residencia : beneficiario.dpto_residencia} 
                  field="dpto_residencia"
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                />
                <DataField 
                  label="Municipio de Residencia" 
                  value={isEditingOnboarding ? onboardingForm.municipio_residencia : beneficiario.municipio_residencia} 
                  field="municipio_residencia"
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                />
                <DataField 
                  label="Dirección de Residencia" 
                  value={isEditingOnboarding ? onboardingForm.direccion_residencia : beneficiario.direccion_residencia} 
                  field="direccion_residencia"
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                  className="md:col-span-2" 
                />
                <DataField 
                  label="Barrio/Corregimiento" 
                  value={isEditingOnboarding ? onboardingForm.barrio_corregimiento : beneficiario.barrio_corregimiento} 
                  field="barrio_corregimiento"
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                />
                <DataField 
                  label="Zona de Residencia" 
                  value={isEditingOnboarding ? onboardingForm.zona_residencia : beneficiario.zona_residencia} 
                  field="zona_residencia"
                  type="select"
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                  options={[
                    { value: '', label: 'Seleccionar...' },
                    { value: 'URBANA', label: 'Urbana' },
                    { value: 'RURAL', label: 'Rural' }
                  ]}
                />
                <DataField 
                  label="Dirección" 
                  value={isEditingOnboarding ? onboardingForm.direccion : beneficiario.direccion} 
                  field="direccion"
                  isEditing={isEditingOnboarding}
                  onChange={handleOnboardingChange}
                  className="md:col-span-2" 
                />
              </div>
            )}

            {/* Socio-económico */}
            {onboardingSubTab === 'socioeconomico' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DataField label="Grupo SISBEN" value={beneficiario.sisben_grupo} />
                <DataField label="¿Recibe Subsidio?" value={beneficiario.recibe_subsidio} />
                {beneficiario.recibe_subsidio === 'SI' && (
                  <DataField label="¿Cuál Subsidio?" value={beneficiario.cual_subsidio} className="md:col-span-2" />
                )}
                <DataField label="Enfoque Diferencial" value={beneficiario.enfoque_diferencial} />
                <DataField label="¿Labora Actualmente?" value={beneficiario.labora_actualmente} />
              </div>
            )}

            {/* Familiar */}
            {onboardingSubTab === 'familiar' && (
              <div className="space-y-6">
                <div className="border-b border-slate-200 pb-4">
                  <h3 className="text-lg font-bold text-slate-800 mb-4">Información del Padre</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <DataField label="Nombre Completo" value={beneficiario.nombre_padre} />
                    <DataField label="Documento" value={beneficiario.documento_padre} />
                    <DataField label="Ocupación" value={beneficiario.ocupacion_padre} />
                    <DataField label="Ingresos Mensuales" value={beneficiario.ingresos_padre ? formatMoney(beneficiario.ingresos_padre) : null} />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-4">Información de la Madre</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <DataField label="Nombre Completo" value={beneficiario.nombre_madre} />
                    <DataField label="Documento" value={beneficiario.documento_madre} />
                    <DataField label="Ocupación" value={beneficiario.ocupacion_madre} />
                    <DataField label="Ingresos Mensuales" value={beneficiario.ingresos_madre ? formatMoney(beneficiario.ingresos_madre) : null} />
                  </div>
                </div>
              </div>
            )}

            {/* Secundaria */}
            {onboardingSubTab === 'secundaria' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DataField label="Título Obtenido" value={beneficiario.titulo_obtenido} />
                <DataField label="Año de Graduación" value={beneficiario.ano_graduacion} />
                <DataField label="Establecimiento Educativo" value={beneficiario.establecimiento_educativo} />
                <DataField label="Puntaje ICFES" value={beneficiario.puntaje_icfes} />
              </div>
            )}

            {/* Académico */}
            {onboardingSubTab === 'academico' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DataField label="Programa Académico" value={beneficiario.programa_academico} />
                <DataField label="Universidad / Institución" value={beneficiario.nombre_universidad} />
                <DataField label="Institución Superior" value={beneficiario.institucion_superior} />
                <DataField label="Departamento de la Institución" value={beneficiario.dpto_institucion} />
                <DataField label="Municipio de la Institución" value={beneficiario.municipio_institucion} />
                <DataField label="Ciudad de la Institución" value={beneficiario.ciudad_institucion} />
                <DataField label="Tipo de Educación" value={beneficiario.tipo_educacion} />
                <DataField label="Modalidad de Beca" value={beneficiario.modalidad_beca} />
                <DataField label="Semestre Actual" value={beneficiario.semestre_actual} />
                <DataField label="Semestre de Ingreso" value={beneficiario.semestre_ingreso} />
                <DataField label="Modalidad de Estudio" value={beneficiario.modalidad} />
                <DataField label="Promedio Anterior" value={beneficiario.promedio_anterior} />
                <DataField label="Año de Convocatoria" value={beneficiario.año_convocatoria} />
              </div>
            )}

            {/* Bancario */}
            {onboardingSubTab === 'bancario' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DataField label="Banco" value={beneficiario.nombre_banco} />
                <DataField label="Tipo de Cuenta" value={beneficiario.tipo_cuenta_bancaria} />
                <DataField label="Número de Cuenta" value={beneficiario.numero_cuenta} className="md:col-span-2" />
              </div>
            )}

            {/* Estado */}
            {onboardingSubTab === 'estado' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <p className="text-xs font-bold text-slate-600 mb-1">ESTADO DEL BENEFICIARIO</p>
                    <p className={`text-sm font-semibold inline-block px-3 py-1 rounded-lg ${estadoClassName(beneficiario.estado_beneficiario)}`}>
                      {beneficiario.estado_beneficiario?.toUpperCase() || 'ACTIVO'}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <p className="text-xs font-bold text-slate-600 mb-1">ORIGEN DEL REGISTRO</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {beneficiario.origen_registro === 'historico' ? 'Beneficiario Histórico' : 'Nueva Inscripción'}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <p className="text-xs font-bold text-slate-600 mb-1">ONBOARDING</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {beneficiario.onboarding_completado ? '✓ Completado' : '⏳ Pendiente'}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <p className="text-xs font-bold text-slate-600 mb-1">AUTH USER ID</p>
                    <p className="text-sm font-mono text-slate-900 break-all">
                      {beneficiario.auth_user_id || 'No vinculado'}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <p className="text-xs font-bold text-slate-600 mb-1">INSCRIPCIÓN ID</p>
                    <p className="text-sm font-mono text-slate-900 break-all">
                      {beneficiario.inscripcion_id || 'N/A'}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <p className="text-xs font-bold text-slate-600 mb-1">ACEPTA TÉRMINOS</p>
                    <p className="text-sm text-slate-900">
                      {beneficiario.acepta_terminos_at ? formatDateTime(beneficiario.acepta_terminos_at) : 'No aceptado'}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <p className="text-xs font-bold text-slate-600 mb-1">ACEPTA POLÍTICA DE DATOS</p>
                    <p className="text-sm text-slate-900">
                      {beneficiario.acepta_datos_at ? formatDateTime(beneficiario.acepta_datos_at) : 'No aceptado'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Documentos */}
            {onboardingSubTab === 'documentos' && (
              <div className="space-y-4">
                {onboardingDocs.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText size={56} className="mx-auto text-slate-300 mb-4" />
                    <h4 className="text-lg font-bold text-slate-700 mb-2">Sin documentos</h4>
                    <p className="text-slate-500">El beneficiario aún no tiene documentos de onboarding registrados</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-bold text-slate-700">
                        Total de documentos: <span className="text-secondary">{onboardingDocs.length}</span>
                      </p>
                    </div>
                    <div className="space-y-2">
                      {onboardingDocs.map((doc) => (
                        <div key={doc.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-2 border-slate-200 rounded-2xl px-4 py-3 hover:border-blue-300 hover:bg-blue-50/30 transition-all">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText size={20} className="text-slate-700 flex-shrink-0" />
                              <p className="font-bold text-slate-900 text-base truncate">
                                {doc.titulo || doc.tipo_documento || 'Documento sin nombre'}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              {doc.tipo_documento && (
                                <span className="bg-slate-700 text-white px-2.5 py-1 rounded-lg font-bold">
                                  {doc.tipo_documento.toUpperCase()}
                                </span>
                              )}
                              {doc.descripcion && (
                                <span className="bg-slate-50 text-slate-600 px-2.5 py-1 rounded-lg text-xs border border-slate-200">
                                  {doc.descripcion}
                                </span>
                              )}
                              <span className="text-slate-600 font-medium">
                                {formatDateTime(doc.created_at)}
                              </span>
                              {doc.fecha_documento && (
                                <span className="text-slate-500">
                                  Fecha doc: {formatDate(doc.fecha_documento)}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {doc.storage_path && (
                            <button 
                              type="button" 
                              onClick={() => handleViewDocument(doc)}
                              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-700 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-md hover:shadow-lg flex-shrink-0"
                            >
                              <FileText size={18} />
                              Ver Documento
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </section>
      )}

      {activeTab === 'actualizaciones' && (
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
        <SectionTitle title="Actualizaciones y documentos" subtitle="Revisa cada envío semestral, apruébalo o recházalo y consulta sus soportes." />
        {loadingByTab.actualizaciones && <p className="text-sm text-slate-500">Cargando actualizaciones...</p>}
        {updates.length === 0 ? (
          <p className="text-sm text-slate-500">No hay actualizaciones registradas para este beneficiario.</p>
        ) : (
          <div className="space-y-4">
            {updates.map((item) => {
              const docs = documentsByUpdate[item.id] || [];
              const draft = reviewDrafts[item.id] || { estado: item.estado || 'en_revision', observacion_admin: item.observacion_admin || '' };
              return (
                <div key={item.id} className="border border-slate-200 rounded-3xl p-4 space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-800">Actualización #{item.id}</p>
                      <p className="text-xs text-slate-500 mt-1">Enviada {formatDateTime(item.created_at)} · Semestre {item.semestre_actual || 'N/D'} · Promedio {item.promedio_semestre_anterior || 'N/D'}</p>
                    </div>
                    <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${estadoClassName(item.estado)}`}>
                      {item.estado || 'sin estado'}
                    </span>
                  </div>

                  <div className="grid xl:grid-cols-[1fr,1fr] gap-4">
                    <div className="space-y-3">
                      <SelectField
                        label="Estado de revisión"
                        value={draft.estado}
                        onChange={(value) => setReviewDrafts((prev) => ({ ...prev, [item.id]: { ...prev[item.id], estado: value } }))}
                        options={UPDATE_STATUS_OPTIONS}
                      />
                      <TextAreaField
                        label="Observación admin"
                        value={draft.observacion_admin}
                        onChange={(value) => setReviewDrafts((prev) => ({ ...prev, [item.id]: { ...prev[item.id], observacion_admin: value } }))}
                        rows={4}
                      />
                      <button
                        type="button"
                        onClick={() => saveReview(item.id)}
                        disabled={savingReviewId === String(item.id)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-bold disabled:opacity-50"
                      >
                        <Save size={16} /> {savingReviewId === String(item.id) ? 'Guardando...' : 'Guardar revisión'}
                      </button>
                      <p className="text-xs text-slate-500">
                        Última revisión: {item.revisado_at ? `${formatDateTime(item.revisado_at)}${item.observacion_admin ? ' · con observación' : ''}` : 'Pendiente'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Documentos</p>
                      {docs.length === 0 ? (
                        <p className="text-sm text-slate-500">No hay documentos asociados a esta actualización.</p>
                      ) : (
                        docs.map((doc) => (
                          <div key={doc.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-slate-200 rounded-2xl px-4 py-3">
                            <div>
                              <p className="font-semibold text-slate-800">{doc.nombre_original || doc.tipo_documento}</p>
                              <p className="text-xs text-slate-500 mt-1">{doc.tipo_documento} · {formatDateTime(doc.created_at)}</p>
                            </div>
                            <button type="button" onClick={() => setViewingDoc(doc)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-secondary hover:bg-slate-50">
                              Ver documento
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {activeTab === 'expediente' && (
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
        <SectionTitle title="Expediente de admisión" subtitle="Documentos e información original de la etapa de aspiración." />
        {loadingByTab.expediente && <p className="text-sm text-slate-500">Cargando expediente...</p>}
        {!loadingByTab.expediente && !beneficiario.inscripcion_pk && (
          <p className="text-sm text-slate-500">Este beneficiario no tiene inscripción vinculada en el nuevo esquema.</p>
        )}
        {!loadingByTab.expediente && beneficiario.inscripcion_pk && (
          <>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
              <InfoCard label="Inscripción PK" value={beneficiario.inscripcion_pk} />
              <InfoCard label="Radicado" value={expedienteData?.radicado || beneficiario.radicado_inscripcion || 'No definido'} />
              <InfoCard label="Etapa" value={expedienteData?.etapa || 'No definida'} />
              <InfoCard label="Estado" value={expedienteData?.estado || 'No definido'} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">Documentos de admisión</p>
              {expedienteDocs.length === 0 ? (
                <p className="text-sm text-slate-500">No hay documentos guardados en el expediente de admisión.</p>
              ) : (
                expedienteDocs.map((doc) => (
                  <div key={doc.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-slate-200 rounded-2xl px-4 py-3">
                    <div>
                      <p className="font-semibold text-slate-800">{doc.nombre_original || doc.tipo_documento}</p>
                      <p className="text-xs text-slate-500 mt-1">{doc.tipo_documento} · {formatDateTime(doc.uploaded_at)}</p>
                    </div>
                    <button type="button" onClick={() => setViewingDoc(doc)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-secondary hover:bg-slate-50">
                      Ver documento
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {!loadingByTab.expediente && historicoDocs.length > 0 && (
          <div className="border-t border-slate-200 pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📁</span>
              <h3 className="text-lg font-bold text-slate-800">Expediente Histórico</h3>
            </div>
            <p className="text-sm text-slate-600">Documentos migrados del sistema anterior como respaldo histórico.</p>
            <div className="space-y-2">
              {historicoDocs.map((doc) => (
                <div key={doc.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-slate-200 rounded-2xl px-4 py-3 bg-slate-50 hover:bg-slate-100 transition">
                  <div>
                    <p className="font-semibold text-slate-800">{doc.titulo}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {doc.tipo_documento && <span>{doc.tipo_documento} · </span>}
                      {doc.fecha_documento && <span>Fecha: {formatDate(doc.fecha_documento)} · </span>}
                      Importado: {formatDateTime(doc.created_at)}
                    </p>
                    {doc.descripcion && <p className="text-sm text-slate-700 mt-2">{doc.descripcion}</p>}
                  </div>
                  {doc.storage_path && (
                    <button 
                      type="button" 
                      onClick={() => {
                        // Intenta descargar el documento del storage
                        const path = doc.storage_path.replace('soportes/', '')
                        window.open(`/storage/download?path=${encodeURIComponent(path)}`, '_blank')
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-secondary hover:bg-white"
                    >
                      Ver documento
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      )}

      {(activeTab === 'pagos' || activeTab === 'tickets') && (
      <div className="grid xl:grid-cols-[1fr,1fr] gap-6">
        {activeTab === 'pagos' && (
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <SectionTitle title="Pagos y desembolsos" subtitle="Registra pagos manuales y mantén trazabilidad financiera básica." />
          {loadingByTab.pagos && <p className="text-sm text-slate-500">Cargando pagos...</p>}

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Derechos de pago</p>
                <p className="text-sm text-slate-600 mt-1">
                  El tope por nivel es un máximo posible. El derecho real depende del semestre de ingreso, pagos efectuados y ajustes administrativos.
                </p>
              </div>
              <span className={`inline-flex px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest ${paymentRights?.esElegible ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'}`}>
                {paymentRights?.esElegible ? 'Elegible para pago' : 'Pago bloqueado'}
              </span>
            </div>

            {paymentRightsNotice ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                {paymentRightsNotice}
              </div>
            ) : null}

            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
              <SummaryCard title="Tope por nivel" value={paymentRights ? paymentRights.topePagos : '...'} icon={<ShieldAlert size={18} className="text-sky-600" />} tone="bg-sky-50" />
              <SummaryCard title="Derecho total" value={paymentRights ? paymentRights.derechoTotal : '...'} icon={<CircleDollarSign size={18} className="text-teal-700" />} tone="bg-teal-50" />
              <SummaryCard title="Pagos efectuados" value={paymentRights ? paymentRights.pagosEfectuados : '...'} icon={<CircleDollarSign size={18} className="text-emerald-600" />} tone="bg-emerald-50" />
              <SummaryCard title="Pagos restantes" value={paymentRights ? paymentRights.pagosRestantes : '...'} icon={<Ticket size={18} className="text-amber-600" />} tone="bg-amber-50" />
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
              <InfoCard label="Nivel formación" value={paymentRights?.nivelFormacion || beneficiario.nivel_formacion || 'No definido'} />
              <InfoCard label="Modalidad" value={paymentRights?.modalidad || beneficiario.modalidad || 'No definida'} />
              <InfoCard label="Semestre ingreso" value={paymentRights?.semestreIngreso || beneficiario.semestre_ingreso || 'No definido'} />
              <InfoCard label="Ajustes netos" value={paymentRights ? paymentRights.ajustesNetos : '...'} />
            </div>

            {!paymentRights?.esElegible && paymentRights?.motivoBloqueo ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {paymentRights.motivoBloqueo}
              </div>
            ) : null}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Concepto" value={paymentDraft.concepto} onChange={(value) => setPaymentDraft((prev) => ({ ...prev, concepto: value }))} />
            <Field label="Periodo" value={paymentDraft.periodo} onChange={(value) => setPaymentDraft((prev) => ({ ...prev, periodo: value }))} />
            <Field label="Referencia" value={paymentDraft.referencia} onChange={(value) => setPaymentDraft((prev) => ({ ...prev, referencia: value }))} />
            <Field label="Monto" value={paymentDraft.monto} onChange={(value) => setPaymentDraft((prev) => ({ ...prev, monto: value }))} type="number" />
            <Field label="Fecha programada" value={paymentDraft.fecha_programada} onChange={(value) => setPaymentDraft((prev) => ({ ...prev, fecha_programada: value }))} type="date" />
            <Field label="Fecha efectiva" value={paymentDraft.fecha_efectiva} onChange={(value) => setPaymentDraft((prev) => ({ ...prev, fecha_efectiva: value }))} type="date" />
            <SelectField label="Estado" value={paymentDraft.estado} onChange={(value) => setPaymentDraft((prev) => ({ ...prev, estado: value }))} options={PAYMENT_STATUS_OPTIONS} />
            <TextAreaField label="Observación" value={paymentDraft.observacion} onChange={(value) => setPaymentDraft((prev) => ({ ...prev, observacion: value }))} rows={3} />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={savePayment} disabled={savingPayment} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-bold disabled:opacity-50">
              <Save size={16} /> {savingPayment ? 'Guardando...' : editingPaymentId ? 'Guardar pago' : 'Registrar pago'}
            </button>
            {editingPaymentId && (
              <button type="button" onClick={resetPaymentForm} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">
                Cancelar edición
              </button>
            )}
          </div>

          <div className="space-y-2 pt-2">
            {payments.length === 0 ? (
              <p className="text-sm text-slate-500">Aún no hay pagos registrados.</p>
            ) : (
              payments.map((item) => (
                <div key={item.id} className="border border-slate-200 rounded-2xl px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-800">{item.concepto}</p>
                    <p className="text-sm text-slate-600 mt-1">{formatMoney(item.monto)} · {item.periodo || 'Sin periodo'} · Ref. {item.referencia || 'N/D'}</p>
                    <p className="text-xs text-slate-500 mt-1">Programado: {formatDate(item.fecha_programada)} · Efectivo: {formatDate(item.fecha_efectiva)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${estadoClassName(item.estado)}`}>
                      {item.estado}
                    </span>
                    <button type="button" onClick={() => editPayment(item)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-secondary hover:bg-slate-50">
                      Editar
                    </button>
                    <button type="button" onClick={() => deletePayment(item.id)} className="px-3 py-2 rounded-xl border border-red-200 text-sm font-bold text-red-600 hover:bg-red-50">
                      Eliminar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
        )}

        {activeTab === 'tickets' && (
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <SectionTitle title="Tickets relacionados" subtitle="Solicitudes de soporte asociadas al correo o radicado del beneficiario." />
          {loadingByTab.tickets && <p className="text-sm text-slate-500">Cargando tickets...</p>}
          {tickets.length === 0 ? (
            <p className="text-sm text-slate-500">No se encontraron tickets relacionados.</p>
          ) : (
            <div className="space-y-2">
              {tickets.map((item) => (
                <div key={item.id} className="border border-slate-200 rounded-2xl px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-slate-800">{item.ticket_codigo}</p>
                    <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${estadoClassName(item.estado)}`}>
                      {item.estado}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 mt-2">{item.asunto}</p>
                  <p className="text-xs text-slate-500 mt-2">Radicado: {item.radicado || 'N/D'} · {formatDateTime(item.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
        )}
      </div>
      )}

      {activeTab === 'perfil' && (
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
        <SectionTitle title="Datos de contexto" subtitle="Vínculos técnicos y trazabilidad del perfil actual." />
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
          <InfoCard label="ID beneficiario" value={beneficiario.id} />
          <InfoCard label="Persona ID" value={beneficiario.persona_id || 'No definido'} />
          <InfoCard label="Inscripción PK" value={beneficiario.inscripcion_pk || 'No definido'} />
          <InfoCard label="Radicado" value={beneficiario.radicado_inscripcion || 'No definido'} />
          <InfoCard label="Auth User ID" value={beneficiario.auth_user_id || 'Pendiente'} />
          <InfoCard label="Última actualización enviada" value={latestUpdate ? formatDateTime(latestUpdate.created_at) : 'Sin actualizaciones'} />
          <InfoCard label="Creado" value={formatDateTime(beneficiario.created_at)} />
          <InfoCard label="Último cambio perfil" value={formatDateTime(beneficiario.updated_at)} />
        </div>
      </section>
      )}

      {viewingDoc && (
        <DocViewerModal doc={viewingDoc} onClose={() => setViewingDoc(null)} />
      )}
    </div>
  );
};

const SectionTitle = ({ title, subtitle }) => (
  <div>
    <h2 className="text-lg font-black text-slate-800">{title}</h2>
    <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
  </div>
);

const DataField = ({ label, value, field, isEditing = false, type = 'text', options = null, onChange = null, disabled = false, placeholder = '', className = '' }) => {
  const displayValue = value || 'No especificado';
  
  if (!isEditing) {
    return (
      <div className={className}>
        <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
        <div className="px-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900">
          {displayValue}
        </div>
      </div>
    );
  }
  
  // Modo edición
  if (type === 'select' && options) {
    return (
      <div className={className}>
        <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange && onChange(field, e.target.value)}
          disabled={disabled}
          className="w-full px-4 py-2.5 border-2 border-blue-300 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:cursor-not-allowed bg-white"
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }
  
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange && onChange(field, e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 border-2 border-blue-300 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:cursor-not-allowed bg-white"
      />
    </div>
  );
};

const SummaryCard = ({ title, value, icon, tone }) => (
  <div className="border border-slate-200 rounded-2xl px-4 py-4 flex items-center gap-3">
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tone}`}>{icon}</div>
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</p>
      <p className="text-lg font-black text-slate-800">{value}</p>
    </div>
  </div>
);

const Field = ({ label, value, onChange, type = 'text' }) => (
  <label className="grid gap-1">
    <span className="text-xs uppercase font-bold text-slate-500">{label}</span>
    <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm" />
  </label>
);

const SelectField = ({ label, value, onChange, options = [] }) => (
  <label className="grid gap-1">
    <span className="text-xs uppercase font-bold text-slate-500">{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  </label>
);

const TextAreaField = ({ label, value, onChange, rows = 3 }) => (
  <label className="grid gap-1">
    <span className="text-xs uppercase font-bold text-slate-500">{label}</span>
    <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className="border border-slate-200 rounded-xl px-3 py-2 text-sm" />
  </label>
);

const InfoCard = ({ label, value }) => (
  <div className="border border-slate-200 rounded-2xl px-4 py-3">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    <p className="text-sm text-slate-700 mt-2 break-words">{value}</p>
  </div>
);

export default AdminBeneficiarioDetalle;
