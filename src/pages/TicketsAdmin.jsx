import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, MessageSquare, Send } from 'lucide-react';
import { invokeAdminTickets } from '../lib/adminTickets';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'recibido', label: 'Nuevos' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'respondido', label: 'Respondidos' },
  { value: 'cerrado', label: 'Cerrados' },
];

const STATUS_LABELS = {
  recibido: 'Recibido',
  en_revision: 'En revisión',
  respondido: 'Respondido',
  cerrado: 'Cerrado',
};

const PRIORITY_LABELS = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
};

const statusBadgeClass = (status) => {
  if (status === 'recibido') return 'bg-blue-100 text-blue-700 ring-1 ring-blue-200';
  if (status === 'en_revision') return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200';
  if (status === 'respondido') return 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200';
  if (status === 'cerrado') return 'bg-slate-200 text-slate-700 ring-1 ring-slate-300';
  return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
};

const TicketsAdmin = () => {
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    recibido: 0,
    en_revision: 0,
    respondido: 0,
    cerrado: 0,
    activos: 0,
    resueltos: 0,
    pendientes: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [statusDraft, setStatusDraft] = useState('en_revision');
  const [priorityDraft, setPriorityDraft] = useState('media');
  const [replyDraft, setReplyDraft] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [tickets, selectedTicketId]
  );

  const loadTickets = async () => {
    setLoading(true);
    setError('');

    const result = await invokeAdminTickets({
      action: 'list',
      estado: activeFilter,
      query: searchTerm,
      limit: 120,
    });

    if (!result.ok) {
      setError(result.error || 'No se pudieron cargar tickets.');
      setTickets([]);
      setStats((prev) => ({ ...prev, total: 0 }));
      setLoading(false);
      return;
    }

    const rows = Array.isArray(result.data?.tickets) ? result.data.tickets : [];
    setTickets(rows);

    const statsResult = await invokeAdminTickets({ action: 'stats' });
    if (statsResult.ok && statsResult.data?.stats) {
      setStats(statsResult.data.stats);
    } else if (result.data?.stats) {
      setStats((prev) => ({ ...prev, ...result.data.stats }));
    }

    if (rows.length > 0 && !rows.some((ticket) => ticket.id === selectedTicketId)) {
      const next = rows[0];
      setSelectedTicketId(next.id);
      setStatusDraft(next.estado || 'en_revision');
      setPriorityDraft(next.prioridad || 'media');
      setReplyDraft(next.respuesta_admin || '');
    }

    if (rows.length === 0) {
      setSelectedTicketId('');
      setReplyDraft('');
    }

    setLoading(false);
  };

  useEffect(() => {
    loadTickets();
  }, [activeFilter]);

  const handleSearch = async () => {
    await loadTickets();
  };

  const handleSelectTicket = (ticket) => {
    setSelectedTicketId(ticket.id);
    setStatusDraft(ticket.estado || 'en_revision');
    setPriorityDraft(ticket.prioridad || 'media');
    setReplyDraft(ticket.respuesta_admin || '');
    setMessage('');
    setError('');
  };

  const handleSaveTicket = async () => {
    if (!selectedTicketId) return;

    setSaving(true);
    setMessage('');
    setError('');

    const result = await invokeAdminTickets({
      action: 'update',
      ticket_id: selectedTicketId,
      estado: statusDraft,
      prioridad: priorityDraft,
      respuesta_admin: replyDraft,
    });

    if (!result.ok) {
      setError(result.error || 'No se pudo actualizar el ticket.');
      setSaving(false);
      return;
    }

    setTickets((prev) =>
      prev.map((ticket) => (ticket.id === selectedTicketId ? { ...ticket, ...result.data.ticket } : ticket))
    );
    setMessage('Ticket actualizado correctamente.');
    setSaving(false);
    await loadTickets();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <section className="ui-card p-6 md:p-7">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--gov-accent)]">Soporte institucional</p>
            <h1 className="mt-1 text-2xl md:text-3xl font-black text-[var(--gov-ink)] tracking-tight">Gestión de Tickets</h1>
            <p className="mt-1 text-sm text-slate-600">Consolida solicitudes de beneficiarios y administra respuestas desde un solo panel.</p>
          </div>
          <button
            type="button"
            onClick={loadTickets}
            className="ui-btn-secondary inline-flex items-center gap-2"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refrescar
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard title="Activos" value={stats.activos} tone="text-amber-700 bg-amber-50" />
        <MetricCard title="Nuevos" value={stats.recibido} tone="text-blue-700 bg-blue-50" />
        <MetricCard title="En revisión" value={stats.en_revision} tone="text-orange-700 bg-orange-50" />
        <MetricCard title="Resueltos" value={stats.resueltos} tone="text-green-700 bg-green-50" />
      </div>

      <div className="ui-card p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setActiveFilter(option.value)}
              className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                activeFilter === option.value
                  ? 'bg-secondary text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por ticket, radicado, correo o asunto"
                className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              className="px-3 py-2 rounded-xl bg-primary text-white text-sm font-bold"
            >
              Buscar
            </button>
            <button
              type="button"
              onClick={loadTickets}
              className="p-2 rounded-xl text-secondary hover:bg-blue-50"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 text-xs font-black uppercase tracking-widest text-slate-500">
              Tickets
            </div>
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
              {loading ? (
                <p className="p-6 text-sm text-slate-500 italic">Cargando tickets...</p>
              ) : tickets.length === 0 ? (
                <p className="p-6 text-sm text-slate-500 italic">No hay tickets para este filtro.</p>
              ) : (
                tickets.map((ticket) => (
                  <button
                    type="button"
                    key={ticket.id}
                    onClick={() => handleSelectTicket(ticket)}
                    className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${
                      selectedTicketId === ticket.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-primary text-sm">{ticket.ticket_codigo}</p>
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${statusBadgeClass(ticket.estado)}`}>
                        {STATUS_LABELS[ticket.estado] || ticket.estado}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Radicado: {ticket.radicado}</p>
                    <p className="text-sm text-slate-700 mt-1 truncate">{ticket.asunto}</p>
                    <p className="text-[11px] text-slate-500 mt-2">{ticket.created_at_label || ticket.created_at}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4 md:p-5 space-y-4 bg-white">
            {!selectedTicket ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                Selecciona un ticket para gestionarlo.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-lg font-black text-slate-800">{selectedTicket.ticket_codigo}</p>
                    <p className="text-xs text-slate-500">{selectedTicket.created_at_label || selectedTicket.created_at}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${statusBadgeClass(selectedTicket.estado)}`}>
                    {STATUS_LABELS[selectedTicket.estado] || selectedTicket.estado}
                  </span>
                </div>

                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  <InfoLine label="Radicado" value={selectedTicket.radicado} />
                  <InfoLine label="Prioridad" value={PRIORITY_LABELS[selectedTicket.prioridad] || selectedTicket.prioridad} />
                  <InfoLine label="Contacto" value={selectedTicket.nombre_contacto || 'No disponible'} />
                  <InfoLine label="Correo" value={selectedTicket.email_contacto || 'No disponible'} />
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Asunto</p>
                  <p className="text-sm text-slate-700">{selectedTicket.asunto}</p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Mensaje del aspirante</p>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                    {selectedTicket.mensaje_aspirante}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Estado</label>
                    <select
                      value={statusDraft}
                      onChange={(event) => setStatusDraft(event.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                    >
                      <option value="recibido">Recibido</option>
                      <option value="en_revision">En revisión</option>
                      <option value="respondido">Respondido</option>
                      <option value="cerrado">Cerrado</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Prioridad</label>
                    <select
                      value={priorityDraft}
                      onChange={(event) => setPriorityDraft(event.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                    >
                      <option value="baja">Baja</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Respuesta del administrador</label>
                  <textarea
                    rows={5}
                    value={replyDraft}
                    onChange={(event) => setReplyDraft(event.target.value)}
                    placeholder="Escribe una respuesta para el aspirante..."
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveTicket}
                    disabled={saving}
                    className="ui-btn-primary inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <Send size={15} />
                    {saving ? 'Guardando...' : 'Guardar gestión'}
                  </button>
                  {message && <p className="text-xs text-green-600 font-semibold">{message}</p>}
                  {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ title, value, tone }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</p>
    <div className={`mt-2 inline-flex items-center px-3 py-1 rounded-xl text-2xl font-black ${tone}`}>{value || 0}</div>
  </div>
);

const InfoLine = ({ label, value }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
    <p className="text-sm text-slate-700 mt-1 break-all">{value || 'No disponible'}</p>
  </div>
);

export default TicketsAdmin;
