import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle, CircleDollarSign, FileText, Loader2, Mail, MapPin, Phone, Ticket } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateTime, formatMoney } from '../lib/formatters';
import BitacoraTimeline from './BitacoraTimeline';

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
  const [activeTab, setActiveTab] = useState('perfil');
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
          <section className="border border-slate-200 rounded-2xl p-4">
            <p className="text-sm text-slate-500">Información de onboarding no disponible en esta vista. Accede a la ficha 360 completa para más detalles.</p>
          </section>
        )}

        {activeTab === 'expediente' && (
          <section className="border border-slate-200 rounded-2xl p-4">
            <p className="text-sm text-slate-500">Expediente no disponible en esta vista. Accede a la ficha 360 completa para más detalles.</p>
          </section>
        )}
      </div>
    </div>
  );
}

const InfoCard = ({ label, value }) => (
  <div className="border border-slate-100 rounded-lg px-3 py-2 bg-slate-50">
    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</p>
    <p className="text-sm text-slate-700 mt-1">{value}</p>
  </div>
);
