import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle, CircleDollarSign, FileText, Loader2, Mail, MapPin, Phone, Ticket, X } from 'lucide-react';
import { supabase, getSafeSession } from '../lib/supabase';
import { formatDateTime, formatMoney } from '../lib/formatters';
import { showConfirmAlert, showErrorAlert, showSuccessAlert } from '../lib/alerts';
import BitacoraTimeline from './BitacoraTimeline';
import DocViewerModal from './DocViewerModal';

const DETAIL_TABS = ['perfil', 'onboarding', 'actualizaciones', 'expediente', 'pagos', 'tickets', 'bitacora'];

const estadoClassName = (status) => {
  if (status === 'activo' || status === 'aprobada' || status === 'efectuado') return 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200';
  if (status === 'suspendido' || status === 'pendiente' || status === 'en_revision' || status === 'programado') return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200';
  if (status === 'retirado' || status === 'rechazada' || status === 'anulado') return 'bg-red-100 text-red-700 ring-1 ring-red-200';
  if (status === 'condonado' || status === 'egresado') return 'bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200';
  return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
};

const SummaryCard = ({ title, value, icon, tone }) => (
  <div className="border border-slate-200 rounded-xl px-3 py-3 flex items-center gap-2 text-sm">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tone}`}>{icon}</div>
    <div>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{title}</p>
      <p className="font-bold text-slate-800">{value}</p>
    </div>
  </div>
);

/**
 * BeneficiarioFicha360Modal
 * Componente modal que muestra la ficha 360 de un beneficiario
 * Extraído de AdminBeneficiarioDetalle para usar en modales/drawers
 * 
 * Props:
 * - beneficiarioId: string - ID del beneficiario
 * - onClose: function - Callback al cerrar
 */
export default function BeneficiarioFicha360Modal({ beneficiarioId }) {
  const [loading, setLoading] = useState(true);
  const [beneficiario, setBeneficiario] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [payments, setPayments] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [bitacoraRows, setBitacoraRows] = useState([]);
  const [expedienteDocs, setExpedienteDocs] = useState([]);
  const [expedienteData, setExpedienteData] = useState(null);
  const [historicoDocs, setHistoricoDocs] = useState([]);
  const [onboardingDocs, setOnboardingDocs] = useState([]);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [activeTab, setActiveTab] = useState('perfil');
  const [onboardingSubTab, setOnboardingSubTab] = useState('personal');
  const [documentActionModal, setDocumentActionModal] = useState({
    isOpen: false,
    action: null, // 'replace' | 'delete'
    documento: null,
    motivo: '',
    nuevoArchivo: null,
    loading: false,
    document_type: 'historico', // 'inscripcion' | 'historico'
  });
  const [loadedTabs, setLoadedTabs] = useState({
    perfil: false,
    onboarding: false,
    actualizaciones: false,
    expediente: false,
    pagos: false,
    tickets: false,
    bitacora: false,
  });
  const [loadingByTab, setLoadingByTab] = useState({
    perfil: false,
    onboarding: false,
    actualizaciones: false,
    expediente: false,
    pagos: false,
    tickets: false,
    bitacora: false,
  });

  const setTabLoading = (tab, value) => {
    setLoadingByTab((prev) => ({ ...prev, [tab]: value }));
  };

  const markTabLoaded = (tab) => {
    setLoadedTabs((prev) => ({ ...prev, [tab]: true }));
  };

  // Cargar datos del perfil
  const loadProfileData = async () => {
    setTabLoading('perfil', true);
    try {
      const { data: profile } = await supabase
        .from('portal_beneficiarios')
        .select('*')
        .eq('id', beneficiarioId)
        .maybeSingle();

      setBeneficiario(profile || null);
      markTabLoaded('perfil');
    } catch (error) {
      console.error('Error cargando perfil:', error);
      setBeneficiario(null);
    } finally {
      setTabLoading('perfil', false);
    }
  };

  // Cargar actualizaciones
  const loadActualizaciones = async () => {
    if (loadedTabs.actualizaciones) return;
    setTabLoading('actualizaciones', true);
    try {
      const { data } = await supabase
        .from('portal_actualizaciones')
        .select('*')
        .eq('beneficiario_id', beneficiarioId)
        .order('created_at', { ascending: false });

      setUpdates(data || []);
      markTabLoaded('actualizaciones');
    } catch (error) {
      console.error('Error cargando actualizaciones:', error);
      setUpdates([]);
    } finally {
      setTabLoading('actualizaciones', false);
    }
  };

  // Cargar pagos
  const loadPagos = async () => {
    if (loadedTabs.pagos) return;
    setTabLoading('pagos', true);
    try {
      const { data } = await supabase
        .from('portal_beneficiario_pagos')
        .select('*')
        .eq('beneficiario_id', beneficiarioId)
        .order('created_at', { ascending: false });

      setPayments(data || []);
      markTabLoaded('pagos');
    } catch (error) {
      console.error('Error cargando pagos:', error);
      setPayments([]);
    } finally {
      setTabLoading('pagos', false);
    }
  };

  // Cargar tickets
  const loadTickets = async () => {
    if (loadedTabs.tickets) return;
    setTabLoading('tickets', true);
    try {
      const { data } = await supabase
        .from('portal_tickets')
        .select('*')
        .eq('beneficiario_id', beneficiarioId)
        .order('created_at', { ascending: false });

      setTickets(data || []);
      markTabLoaded('tickets');
    } catch (error) {
      console.error('Error cargando tickets:', error);
      setTickets([]);
    } finally {
      setTabLoading('tickets', false);
    }
  };

  // Cargar bitácora
  const loadBitacora = async () => {
    if (loadedTabs.bitacora) return;
    setTabLoading('bitacora', true);
    try {
      const { data } = await supabase
        .from('portal_bitacora')
        .select('*')
        .eq('beneficiario_id', beneficiarioId)
        .order('created_at', { ascending: false });

      setBitacoraRows(data || []);
      markTabLoaded('bitacora');
    } catch (error) {
      console.error('Error cargando bitácora:', error);
      setBitacoraRows([]);
    } finally {
      setTabLoading('bitacora', false);
    }
  };

  // Cargar documentos de onboarding
  const loadOnboardingData = async (profileOverride = null) => {
    if (loadedTabs.onboarding) return;
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
      markTabLoaded('onboarding');
    } catch (error) {
      console.error('Error cargando documentos de onboarding:', error);
      setOnboardingDocs([]);
    } finally {
      setTabLoading('onboarding', false);
    }
  };

  // Funciones para manejo de acciones de documentos
  const openDocumentActionModal = (action, documento, documentType = 'historico') => {
    setDocumentActionModal({
      isOpen: true,
      action,
      documento,
      motivo: '',
      nuevoArchivo: null,
      loading: false,
      document_type: documentType,
    });
  };

  const closeDocumentActionModal = () => {
    setDocumentActionModal({
      isOpen: false,
      action: null,
      documento: null,
      motivo: '',
      nuevoArchivo: null,
      loading: false,
      document_type: 'historico',
    });
  };

  const handleDocumentFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setDocumentActionModal((prev) => ({ ...prev, nuevoArchivo: file }));
    }
  };

  const executeDocumentAction = async () => {
    const { action, documento, motivo, nuevoArchivo } = documentActionModal;

    if (!documento || !motivo.trim()) {
      await showErrorAlert({ title: 'Datos incompletos', text: 'Debes registrar el motivo de la acción.' });
      return;
    }

    if (action === 'replace' && !nuevoArchivo) {
      await showErrorAlert({ title: 'Archivo requerido', text: 'Debes seleccionar un nuevo archivo para reemplazar.' });
      return;
    }

    setDocumentActionModal((prev) => ({ ...prev, loading: true }));

    try {
      const { session } = await getSafeSession();
      const adminId = session?.user?.id || null;

      if (!adminId) {
        throw new Error('No se pudo identificar la sesión de admin');
      }

      if (action === 'replace' && nuevoArchivo) {
        const base64String = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(nuevoArchivo);
          reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
        });

        const { data: result, error: invokeError } = await supabase.functions.invoke('admin-document-action', {
          body: {
            method: 'replace-document',
            beneficiario_id: beneficiario.id,
            documento_id: documento.id,
            tipo_documento: documento.tipo_documento,
            motivo: String(motivo).trim(),
            nuevo_archivo_base64: base64String,
            nuevo_archivo_nombre: nuevoArchivo.name,
            admin_id: adminId,
            document_type: documentActionModal.document_type,
          },
        });

        if (invokeError) {
          console.error('Invoke error details:', invokeError);
          let errorMessage = invokeError.message || 'Error al procesar el reemplazo';
          if (invokeError.context) {
            try {
              const errorData = await invokeError.context.json?.();
              errorMessage = errorData?.error || errorData?.message || errorMessage;
            } catch (e) {}
          }
          throw new Error(errorMessage);
        }

        if (!result?.ok) {
          throw new Error(result?.error || 'No se pudo reemplazar el documento');
        }

        closeDocumentActionModal();
        await showSuccessAlert({ title: 'Documento reemplazado', text: `${documento.nombre_original || documento.tipo_documento} fue reemplazado correctamente.` });
      } else if (action === 'delete') {
        const confirmed = await showConfirmAlert({
          title: '¿Eliminar documento?',
          text: `Se eliminará ${documento.nombre_original || documento.tipo_documento}. Esta acción se registrará en la bitácora.`,
          confirmButtonText: 'Eliminar',
          cancelButtonText: 'Cancelar',
          zIndex: 99999,
        });

        if (!confirmed) {
          setDocumentActionModal((prev) => ({ ...prev, loading: false }));
          return;
        }

        const { data: result, error: invokeError } = await supabase.functions.invoke('admin-document-action', {
          body: {
            method: 'delete-document',
            beneficiario_id: beneficiario.id,
            documento_id: documento.id,
            tipo_documento: documento.tipo_documento,
            motivo: String(motivo).trim(),
            admin_id: adminId,
            document_type: documentActionModal.document_type,
          },
        });

        if (invokeError) {
          console.error('Invoke error details:', invokeError);
          let errorMessage = invokeError.message || 'Error al procesar la eliminación';
          if (invokeError.context) {
            try {
              const errorData = await invokeError.context.json?.();
              errorMessage = errorData?.error || errorData?.message || errorMessage;
            } catch (e) {}
          }
          throw new Error(errorMessage);
        }

        if (!result?.ok) {
          console.error('Result error:', result?.error);
          throw new Error(result?.error || 'No se pudo eliminar el documento');
        }

        closeDocumentActionModal();
        await showSuccessAlert({ title: 'Documento eliminado', text: `${documento.nombre_original || documento.tipo_documento} fue eliminado correctamente.` });
      }

      // Recargar documentos
      if (loadedTabs.onboarding) {
        await loadOnboardingData(beneficiario);
      }
    } catch (error) {
      console.error('❌ Error en executeDocumentAction:', error);
      let errorMessage = error.message || 'Ocurrió un error inesperado.';
      if (errorMessage.includes('Documento no encontrado')) {
        setLoadedTabs((prev) => ({ ...prev, onboarding: false }));
        await loadOnboardingData(beneficiario);
      }
      await showErrorAlert({ title: 'Error', text: errorMessage });
    } finally {
      setDocumentActionModal((prev) => ({ ...prev, loading: false }));
    }
  };

  // Cargar expediente y documentos
  const loadExpedienteData = async (profileOverride = null) => {
    if (loadedTabs.expediente) return;
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
        }
      }

      if (!inscripcionPk) {
        setExpedienteData(null);
        setExpedienteDocs([]);
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
    } catch (error) {
      console.error('Error cargando expediente:', error);
      setExpedienteData(null);
      setExpedienteDocs([]);
      setHistoricoDocs([]);
    } finally {
      setTabLoading('expediente', false);
    }
  };

  // Cargar perfil al montar
  useEffect(() => {
    loadProfileData();
    setLoading(false);
  }, [beneficiarioId]);

  // Cargar tab cuando cambia
  useEffect(() => {
    if (activeTab === 'actualizaciones') loadActualizaciones();
    if (activeTab === 'pagos') loadPagos();
    if (activeTab === 'tickets') loadTickets();
    if (activeTab === 'bitacora') loadBitacora();
    if (activeTab === 'onboarding') loadOnboardingData();
    if (activeTab === 'expediente') loadExpedienteData();
  }, [activeTab]);

  if (loading || !beneficiario) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-slate-400" />
      </div>
    );
  }

  const totalPagado = payments
    .filter((p) => p.estado === 'efectuado')
    .reduce((sum, p) => sum + (Number(p.monto) || 0), 0);

  return (
    <div className="space-y-4">
      {/* Header del beneficiario */}
      <section className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-800">{beneficiario.nombre_completo || 'Sin nombre'}</h2>
            <div className="flex flex-wrap gap-2 text-xs text-slate-500 mt-2">
              <span className="inline-flex items-center gap-1"><Mail size={13} /> {beneficiario.email || 'Sin correo'}</span>
              <span className="inline-flex items-center gap-1"><Phone size={13} /> {beneficiario.telefono || 'Sin teléfono'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-widest ${estadoClassName(beneficiario.estado_beneficiario)}`}>
              {beneficiario.estado_beneficiario || 'sin estado'}
            </span>
            <span className="text-xs text-slate-500">Semestre: {beneficiario.semestre_actual || '—'}</span>
          </div>
        </div>
      </section>

      {/* Resumen Cards */}
      <div className="grid grid-cols-2 gap-2">
        <SummaryCard
          title="Actualizaciones"
          value={loadedTabs.actualizaciones ? updates.length : '...'}
          icon={<FileText size={14} className="text-blue-600" />}
          tone="bg-blue-50"
        />
        <SummaryCard
          title="Pagos"
          value={loadedTabs.pagos ? payments.length : '...'}
          icon={<CircleDollarSign size={14} className="text-emerald-600" />}
          tone="bg-emerald-50"
        />
        <SummaryCard
          title="Tickets"
          value={loadedTabs.tickets ? tickets.length : '...'}
          icon={<Ticket size={14} className="text-amber-600" />}
          tone="bg-amber-50"
        />
        <SummaryCard
          title="Total pagado"
          value={loadedTabs.pagos ? formatMoney(totalPagado) : '...'}
          icon={<CheckCircle size={14} className="text-cyan-600" />}
          tone="bg-cyan-50"
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
              activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {tab}
            {loadingByTab[tab] ? ' ...' : ''}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-4">
        {activeTab === 'perfil' && (
          <section className="border border-slate-200 rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-slate-800">Perfil operativo</h3>
            <div className="grid gap-3">
              <InfoCard label="Correo" value={beneficiario.email || '—'} />
              <InfoCard label="Teléfono" value={beneficiario.telefono || '—'} />
              <InfoCard label="Dirección" value={beneficiario.direccion || '—'} />
              <InfoCard label="Semestre actual" value={beneficiario.semestre_actual || '—'} />
            </div>
            <p className="text-xs text-slate-500 pt-2 border-t">Actualizado: {formatDateTime(beneficiario.updated_at)}</p>
          </section>
        )}

        {activeTab === 'actualizaciones' && (
          <section className="border border-slate-200 rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-slate-800">Actualizaciones ({updates.length})</h3>
            {updates.length === 0 ? (
              <p className="text-sm text-slate-500">No hay actualizaciones registradas.</p>
            ) : (
              <div className="space-y-2">
                {updates.map((update) => (
                  <div key={update.id} className="border border-slate-100 rounded-lg p-3 bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{update.estado || 'sin estado'}</span>
                      <span className="text-xs text-slate-500">{formatDateTime(update.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'pagos' && (
          <section className="border border-slate-200 rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-slate-800">Pagos ({payments.length})</h3>
            {payments.length === 0 ? (
              <p className="text-sm text-slate-500">No hay pagos registrados.</p>
            ) : (
              <div className="space-y-2">
                {payments.map((payment) => (
                  <div key={payment.id} className="border border-slate-100 rounded-lg p-3 bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold">{payment.concepto || 'Sin concepto'}</p>
                        <p className="text-xs text-slate-500">{payment.periodo || '—'}</p>
                      </div>
                      <span className="text-xs font-bold text-emerald-700">{formatMoney(payment.monto)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'tickets' && (
          <section className="border border-slate-200 rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-slate-800">Tickets ({tickets.length})</h3>
            {tickets.length === 0 ? (
              <p className="text-sm text-slate-500">No hay tickets registrados.</p>
            ) : (
              <div className="space-y-2">
                {tickets.map((ticket) => (
                  <div key={ticket.id} className="border border-slate-100 rounded-lg p-3 bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{ticket.asunto || 'Sin asunto'}</span>
                      <span className="text-xs text-slate-500">{formatDateTime(ticket.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'bitacora' && (
          <section className="border border-slate-200 rounded-2xl p-4">
            <h3 className="font-bold text-slate-800 mb-3">Bitácora</h3>
            <BitacoraTimeline rows={bitacoraRows} loading={loadingByTab.bitacora} formatDateTime={formatDateTime} />
          </section>
        )}

        {activeTab === 'onboarding' && (
          <section className="border border-slate-200 rounded-2xl p-4 space-y-4">
            <div className="border-b border-slate-200 pb-2 mb-3">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'personal', label: 'Personal' },
                  { id: 'socioeconomico', label: 'Socio-económico' },
                  { id: 'familiar', label: 'Familiar' },
                  { id: 'secundaria', label: 'Secundaria' },
                  { id: 'academico', label: 'Académico' },
                  { id: 'bancario', label: 'Bancario' },
                  { id: 'documentos', label: 'Documentos' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setOnboardingSubTab(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      onboardingSubTab === tab.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Personal */}
            {onboardingSubTab === 'personal' && (
              <div className="grid gap-2">
                <OnboardingField label="Nombre completo" value={beneficiario?.nombre_completo} />
                <OnboardingField label="Tipo documento" value={beneficiario?.tipo_documento} />
                <OnboardingField label="Número documento" value={beneficiario?.n_documento} />
                <OnboardingField label="Género" value={beneficiario?.genero} />
                <OnboardingField label="Fecha nacimiento" value={beneficiario?.fecha_nacimiento} />
                <OnboardingField label="País nacimiento" value={beneficiario?.pais_nacimiento} />
                <OnboardingField label="Departamento nacimiento" value={beneficiario?.dpto_nacimiento} />
                <OnboardingField label="Municipio nacimiento" value={beneficiario?.municipio_nacimiento} />
                <OnboardingField label="Email" value={beneficiario?.email} />
                <OnboardingField label="Teléfono" value={beneficiario?.telefono} />
              </div>
            )}

            {/* Socio-económico */}
            {onboardingSubTab === 'socioeconomico' && (
              <div className="grid gap-2">
                <OnboardingField label="Zona residencia" value={beneficiario?.zona_residencia} />
                <OnboardingField label="Dirección residencia" value={beneficiario?.direccion_residencia} />
                <OnboardingField label="Barrio/Corregimiento" value={beneficiario?.barrio_corregimiento} />
                <OnboardingField label="Departamento residencia" value={beneficiario?.dpto_residencia} />
                <OnboardingField label="Municipio residencia" value={beneficiario?.municipio_residencia} />
                <OnboardingField label="Grupo SISBEN" value={beneficiario?.sisben_grupo} />
                <OnboardingField label="Recibe subsidio" value={beneficiario?.recibe_subsidio} />
                <OnboardingField label="Cuál subsidio" value={beneficiario?.cual_subsidio} />
                <OnboardingField label="Enfoque diferencial" value={beneficiario?.enfoque_diferencial} />
                <OnboardingField label="Labora actualmente" value={beneficiario?.labora_actualmente} />
              </div>
            )}

            {/* Familiar */}
            {onboardingSubTab === 'familiar' && (
              <div className="grid gap-2">
                <div className="border-b pb-2 mb-2">
                  <p className="text-xs font-bold text-slate-700 mb-2">Datos del Padre</p>
                  <OnboardingField label="Nombre padre" value={beneficiario?.nombre_padre} />
                  <OnboardingField label="Documento padre" value={beneficiario?.documento_padre} />
                  <OnboardingField label="Ocupación padre" value={beneficiario?.ocupacion_padre} />
                  <OnboardingField label="Ingresos padre" value={beneficiario?.ingresos_padre} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700 mb-2">Datos de la Madre</p>
                  <OnboardingField label="Nombre madre" value={beneficiario?.nombre_madre} />
                  <OnboardingField label="Documento madre" value={beneficiario?.documento_madre} />
                  <OnboardingField label="Ocupación madre" value={beneficiario?.ocupacion_madre} />
                  <OnboardingField label="Ingresos madre" value={beneficiario?.ingresos_madre} />
                </div>
              </div>
            )}

            {/* Secundaria */}
            {onboardingSubTab === 'secundaria' && (
              <div className="grid gap-2">
                <OnboardingField label="Título obtenido" value={beneficiario?.titulo_obtenido} />
                <OnboardingField label="Año graduación" value={beneficiario?.ano_graduacion} />
                <OnboardingField label="Establecimiento educativo" value={beneficiario?.establecimiento_educativo} />
                <OnboardingField label="Puntaje ICFES" value={beneficiario?.puntaje_icfes} />
              </div>
            )}

            {/* Académico */}
            {onboardingSubTab === 'academico' && (
              <div className="grid gap-2">
                <OnboardingField label="Programa académico" value={beneficiario?.programa_academico} />
                <OnboardingField label="Universidad" value={beneficiario?.nombre_universidad} />
                <OnboardingField label="Institución superior" value={beneficiario?.institucion_superior} />
                <OnboardingField label="Departamento institución" value={beneficiario?.dpto_institucion} />
                <OnboardingField label="Municipio institución" value={beneficiario?.municipio_institucion} />
                <OnboardingField label="Ciudad institución" value={beneficiario?.ciudad_institucion} />
                <OnboardingField label="Tipo educación" value={beneficiario?.tipo_educacion} />
                <OnboardingField label="Modalidad" value={beneficiario?.modalidad} />
                <OnboardingField label="Semestre ingreso" value={beneficiario?.semestre_ingreso} />
                <OnboardingField label="Semestre actual" value={beneficiario?.semestre_actual} />
                <OnboardingField label="Promedio anterior" value={beneficiario?.promedio_anterior} />
              </div>
            )}

            {/* Bancario */}
            {onboardingSubTab === 'bancario' && (
              <div className="grid gap-2">
                <OnboardingField label="Nombre banco" value={beneficiario?.nombre_banco} />
                <OnboardingField label="Tipo cuenta bancaria" value={beneficiario?.tipo_cuenta_bancaria} />
                <OnboardingField label="Número cuenta" value={beneficiario?.numero_cuenta} />
              </div>
            )}

            {/* Documentos */}
            {onboardingSubTab === 'documentos' && (
              <div className="space-y-3">
                {onboardingDocs.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText size={40} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-500">Sin documentos de onboarding registrados</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-600">Total de documentos: <span className="text-secondary">{onboardingDocs.length}</span></p>
                    <div className="space-y-2">
                      {onboardingDocs.map((doc) => (
                        <div key={doc.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-2 border-slate-200 rounded-2xl px-4 py-3 hover:border-blue-300 hover:bg-blue-50/30 transition-all">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText size={20} className="text-slate-700 flex-shrink-0" />
                              <p className="font-bold text-slate-900 text-base truncate">
                                {doc.titulo || doc.nombre_original || doc.tipo_documento || 'Documento sin nombre'}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              {doc.tipo_documento && (
                                <span className="bg-slate-700 text-white px-2.5 py-1 rounded-lg font-bold">
                                  {doc.tipo_documento.toUpperCase()}
                                </span>
                              )}
                              <span className="text-slate-600 font-medium">
                                {formatDateTime(doc.created_at)}
                              </span>
                            </div>
                          </div>
                          {doc.storage_path && (
                            <div className="flex gap-2 flex-shrink-0">
                              <button 
                                type="button" 
                                onClick={() => setViewingDoc(doc)}
                                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-secondary hover:bg-slate-50"
                              >
                                Ver
                              </button>
                              <button
                                type="button"
                                onClick={() => openDocumentActionModal('replace', doc, 'historico')}
                                className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-sm font-bold text-blue-600 hover:bg-blue-100"
                              >
                                Reemplazar
                              </button>
                              <button
                                type="button"
                                onClick={() => openDocumentActionModal('delete', doc, 'historico')}
                                className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-sm font-bold text-red-600 hover:bg-red-100"
                              >
                                Eliminar
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === 'expediente' && (
          <section className="border border-slate-200 rounded-2xl p-4 space-y-4">
            <h3 className="font-bold text-slate-800">Expediente de admisión</h3>
            {loadingByTab.expediente && <p className="text-sm text-slate-500">Cargando expediente...</p>}
            {!loadingByTab.expediente && !beneficiario.inscripcion_pk && (
              <p className="text-sm text-slate-500">Este beneficiario no tiene inscripción vinculada en el nuevo esquema.</p>
            )}
            {!loadingByTab.expediente && beneficiario.inscripcion_pk && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
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
                      <div key={doc.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border border-slate-200 rounded-xl px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{doc.nombre_original || doc.tipo_documento}</p>
                          <p className="text-xs text-slate-500 mt-1">{doc.tipo_documento} · {formatDateTime(doc.uploaded_at)}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button type="button" onClick={() => setViewingDoc(doc)} className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-secondary hover:bg-slate-50 whitespace-nowrap">
                            Ver
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {!loadingByTab.expediente && historicoDocs.length > 0 && (
              <div className="border-t border-slate-200 pt-4 space-y-2">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Expediente histórico</p>
                <p className="text-sm text-slate-600 mb-3">Documentos migrados del sistema anterior como respaldo histórico.</p>
                <div className="space-y-2">
                  {historicoDocs.map((doc) => (
                    <div key={doc.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border border-slate-200 rounded-xl px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{doc.nombre_original || 'Documento'}</p>
                        <p className="text-xs text-slate-500 mt-1">{formatDateTime(doc.created_at)}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button type="button" onClick={() => setViewingDoc(doc)} className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-secondary hover:bg-slate-50 whitespace-nowrap">
                          Ver
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Modal de visualización de documentos */}
      {viewingDoc && (
        <DocViewerModal 
          doc={viewingDoc} 
          onClose={() => setViewingDoc(null)}
        />
      )}

      {/* Modal de acción de documentos (Reemplazar/Eliminar) */}
      {documentActionModal.isOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full mx-4 shadow-2xl animate-scale-up">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-800">
                {documentActionModal.action === 'replace' ? 'Reemplazar documento' : 'Eliminar documento'}
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                {documentActionModal.documento?.nombre_original || documentActionModal.documento?.tipo_documento}
              </p>
            </div>

            <div className="space-y-4 mb-6">
              {/* Campo de motivo */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Motivo de la acción *</label>
                <textarea
                  value={documentActionModal.motivo}
                  onChange={(e) => setDocumentActionModal((prev) => ({ ...prev, motivo: e.target.value }))}
                  placeholder="Describe por qué reemplazas o eliminas este documento"
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-secondary/25 focus:border-secondary"
                />
              </div>

              {/* Campo de archivo (solo para reemplazar) */}
              {documentActionModal.action === 'replace' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Nuevo archivo PDF *</label>
                  <div className={`border-2 rounded-xl px-4 py-4 text-center cursor-pointer transition ${
                    documentActionModal.nuevoArchivo 
                      ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100' 
                      : 'border-red-300 bg-red-50 hover:bg-red-100'
                  }`}>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleDocumentFileChange}
                      className="hidden"
                      id="doc-action-file"
                    />
                    <label htmlFor="doc-action-file" className="cursor-pointer">
                      {documentActionModal.nuevoArchivo ? (
                        <div className="text-sm">
                          <p className="font-semibold text-emerald-800">✓ Archivo seleccionado</p>
                          <p className="text-xs text-emerald-700 mt-1">{documentActionModal.nuevoArchivo.name}</p>
                        </div>
                      ) : (
                        <div className="text-sm text-red-700">
                          <p className="font-semibold">Selecciona un archivo PDF</p>
                          <p className="text-xs mt-1">o arrastra aquí</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Botones */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeDocumentActionModal}
                disabled={documentActionModal.loading}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeDocumentAction}
                disabled={
                  documentActionModal.loading ||
                  !documentActionModal.motivo.trim() ||
                  (documentActionModal.action === 'replace' && !documentActionModal.nuevoArchivo)
                }
                className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-white transition disabled:opacity-50 flex items-center justify-center gap-2 ${
                  documentActionModal.action === 'delete'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {documentActionModal.loading && <Loader2 size={18} className="animate-spin" />}
                {documentActionModal.action === 'replace' ? 'Reemplazar' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const InfoCard = ({ label, value }) => (
  <div className="border border-slate-100 rounded-lg px-3 py-2 bg-slate-50">
    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</p>
    <p className="text-sm text-slate-700 mt-1">{value}</p>
  </div>
);

const OnboardingField = ({ label, value }) => (
  <div className="border-b border-slate-100 pb-2 last:border-0">
    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</p>
    <p className="text-sm text-slate-700 mt-0.5">{value || '—'}</p>
  </div>
);
