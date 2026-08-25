import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy, Plus, RefreshCw, MessageSquareText, Send, X, ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ChatBubble from '../components/ChatBubble';
import ChatInput from '../components/ChatInput';
import TicketListItem from '../components/TicketListItem';

const BeneficiarioTickets = () => {
  const navigate = useNavigate();
  const chatEndRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [mensajes, setMensajes] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ asunto: '', mensaje: '' });
  const [profileInfo, setProfileInfo] = useState({ email: '', radicado: '', nombre_completo: '' });
  const [authExpired, setAuthExpired] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) || null,
    [tickets, selectedId]
  );

  const selectedMensajes = useMemo(
    () => mensajes.filter((msg) => msg.ticket_id === selectedId),
    [mensajes, selectedId]
  );

  // Obtener beneficiario_id (reutilizable)
  const getBeneficiarioId = async () => {
    try {
      const sessionStr = localStorage.getItem('focades:beneficiario-session');
      if (sessionStr) {
        const documentSession = JSON.parse(sessionStr);
        const sessionTime = new Date(documentSession.timestamp).getTime();
        const maxAge = 24 * 60 * 60 * 1000;
        
        if (Date.now() - sessionTime <= maxAge) {
          return documentSession.beneficiario_id;
        }
      }
    } catch (error) {}

    // Fallback a Supabase Auth
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (userId) {
      const { data: profile } = await supabase
        .from('portal_beneficiarios')
        .select('id')
        .eq('auth_user_id', userId)
        .maybeSingle();
      
      return profile?.id;
    }

    return null;
  };

  const loadTickets = async ({ keepSelection = true } = {}) => {
    setLoading(true);
    setError('');
    setAuthExpired(false);

    const beneficiarioId = await getBeneficiarioId();

    if (!beneficiarioId) {
      setAuthExpired(true);
      setError('Tu sesión expiró. Inicia sesión de nuevo para continuar.');
      setLoading(false);
      return;
    }const { data: result, error: invokeError } = await supabase.functions.invoke('get-beneficiario-tickets', {
      body: { beneficiario_id: beneficiarioId },
    });

    if (invokeError || !result?.ok) {setError(result?.error || invokeError?.message || 'No se pudieron cargar tus tickets.');
      setTickets([]);
      setMensajes([]);
      setSelectedId('');
      setLoading(false);
      return;
    }const rows = Array.isArray(result.tickets) ? result.tickets : [];
    const msgs = Array.isArray(result.mensajes) ? result.mensajes : [];
    const profile = result.profile || {};

    setTickets(rows);
    setMensajes(msgs);
    setProfileInfo({
      email: String(profile.email || ''),
      radicado: String(profile.radicado || ''),
      nombre_completo: String(profile.nombre_completo || ''),
    });

    if (rows.length === 0) {
      setSelectedId('');
    } else if (!keepSelection || !rows.some((item) => item.id === selectedId)) {
      setSelectedId(rows[0].id);
    }

    setLoading(false);
  };

  // Polling cada 30s
  useEffect(() => {
    loadTickets({ keepSelection: false });
    const interval = setInterval(() => {
      loadTickets({ keepSelection: true });
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Scroll automático al final del chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedMensajes]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const asunto = String(form.asunto || '').trim();
    const mensaje = String(form.mensaje || '').trim();

    if (!asunto) {
      setError('Debes indicar el asunto del ticket.');
      return;
    }

    if (mensaje.length < 20) {
      setError('Describe tu solicitud con mayor detalle (mínimo 20 caracteres).');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    const beneficiarioId = await getBeneficiarioId();

    if (!beneficiarioId) {
      setAuthExpired(true);
      setError('Tu sesión expiró. Inicia sesión de nuevo para continuar.');
      setSubmitting(false);
      return;
    }const { data: result, error: invokeError } = await supabase.functions.invoke('crear-ticket-beneficiario', {
      body: {
        beneficiario_id: beneficiarioId,
        asunto,
        mensaje,
      },
    });

    if (invokeError || !result?.ok) {setError(result?.error || invokeError?.message || 'No se pudo crear el ticket.');
      setSubmitting(false);
      return;
    }const createdTicket = result.ticket || null;
    setSuccess(result.message || 'Tu ticket fue creado correctamente.');
    setForm({ asunto: '', mensaje: '' });
    setShowForm(false);
    await loadTickets({ keepSelection: false });
    if (createdTicket?.id) {
      setSelectedId(createdTicket.id);
      setShowMobileChat(true);
    }
    setSubmitting(false);
  };

  const handleSendMessage = async (mensaje) => {
    if (!selectedTicket) return;

    setSendingMessage(true);
    setError('');

    const beneficiarioId = await getBeneficiarioId();

    if (!beneficiarioId) {
      setAuthExpired(true);
      setError('Tu sesión expiró. Inicia sesión de nuevo para continuar.');
      setSendingMessage(false);
      return;
    }const { data: result, error: invokeError } = await supabase.functions.invoke('enviar-mensaje-ticket', {
      body: {
        beneficiario_id: beneficiarioId,
        ticket_id: selectedId,
        mensaje,
      },
    });

    if (invokeError || !result?.ok) {setError(result?.error || invokeError?.message || 'No se pudo enviar el mensaje.');
      setSendingMessage(false);
      return;
    }// Agregar mensaje temporalmente al estado (optimistic update)
    if (result.mensaje) {
      setMensajes((prev) => [...prev, result.mensaje]);
    }

    // Recargar tickets para obtener estado actualizado
    await loadTickets({ keepSelection: true });
    setSendingMessage(false);
  };

  const handleSelectTicket = (ticketId) => {
    setSelectedId(ticketId);
    setShowMobileChat(true);
  };

  const handleBackToList = () => {
    setShowMobileChat(false);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-blue-50 to-slate-50 p-5 md:p-6">
        <div className="absolute -top-16 -right-10 h-40 w-40 rounded-full bg-blue-100/60 blur-2xl" />
        <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-amber-100/40 blur-2xl" />

        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-extrabold text-primary flex items-center gap-2">
              <LifeBuoy size={24} /> Centro de Soporte
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Crea tickets y conversa con el equipo administrativo en tiempo real.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600">
              <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">Correo: {profileInfo.email || 'No disponible'}</span>
              <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">Radicado: {profileInfo.radicado || 'No disponible'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadTickets({ keepSelection: true })}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 transition-colors"
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm((prev) => !prev);
                setError('');
                setSuccess('');
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-secondary transition-colors"
            >
              {showForm ? <X size={16} /> : <Plus size={16} />}
              {showForm ? 'Cerrar' : 'Nuevo ticket'}
            </button>
          </div>
        </div>
      </section>

      {/* Formulario nuevo ticket */}
      {showForm && (
        <section className="bg-white border border-border rounded-2xl p-4 md:p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-700 mb-3">
            <MessageSquareText size={16} className="text-secondary" />
            <p className="text-sm font-black uppercase tracking-widest">Crear nuevo ticket</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Asunto</label>
              <input
                type="text"
                name="asunto"
                value={form.asunto}
                onChange={handleInputChange}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Ej: Duda sobre estado de actualización"
                maxLength={180}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Mensaje inicial</label>
              <textarea
                name="mensaje"
                value={form.mensaje}
                onChange={handleInputChange}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm min-h-[130px] focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Describe tu solicitud con el mayor detalle posible..."
                maxLength={2500}
              />
              <p className="text-[11px] text-slate-500 mt-1">{String(form.mensaje || '').length} / 2500</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-bold hover:bg-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Send size={15} /> {submitting ? 'Enviando...' : 'Crear ticket'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Alertas */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <p>{error}</p>
          {authExpired && (
            <button
              type="button"
              onClick={() => navigate('/beneficiario/login', { replace: true })}
              className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700"
            >
              Ir a iniciar sesión
            </button>
          )}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {/* Layout principal de chat */}
      <section className="grid lg:grid-cols-[380px_1fr] gap-4 h-[600px]">
        {/* Lista de tickets (oculta en mobile si hay ticket seleccionado) */}
        <div className={`bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col ${
          showMobileChat ? 'hidden lg:flex' : 'flex'
        }`}>
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Mis tickets</p>
            <span className="text-xs font-semibold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full">{tickets.length}</span>
          </div>

          {loading ? (
            <div className="p-5 text-sm text-slate-500">Cargando tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="p-5 text-center text-sm text-slate-500">
              <p>Aún no has creado tickets.</p>
              <p className="mt-2 text-xs">Haz clic en "Nuevo ticket" para empezar.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {tickets.map((ticket) => (
                <TicketListItem
                  key={ticket.id}
                  ticket={ticket}
                  selected={selectedId === ticket.id}
                  onClick={() => handleSelectTicket(ticket.id)}
                  unreadCount={0}
                />
              ))}
            </div>
          )}
        </div>

        {/* Área de chat (oculta en mobile si no hay ticket seleccionado) */}
        <div className={`bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col ${
          !showMobileChat ? 'hidden lg:flex' : 'flex'
        }`}>
          {!selectedTicket ? (
            <div className="h-full flex items-center justify-center text-center p-8">
              <div>
                <MessageSquareText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-400 text-sm">Selecciona un ticket para ver la conversación</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header del chat */}
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-3 flex-shrink-0">
                <button
                  onClick={handleBackToList}
                  className="lg:hidden p-1 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <ChevronLeft size={20} className="text-slate-600" />
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm text-slate-800 truncate">{selectedTicket.asunto}</h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedTicket.ticket_codigo}</p>
                </div>
                {selectedTicket.cerrado_at && (
                  <span className="px-2.5 py-1 text-xs font-bold bg-gray-100 text-gray-600 rounded-lg flex-shrink-0">
                    Cerrado
                  </span>
                )}
              </div>

              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto px-4 py-4 bg-slate-50">
                {selectedMensajes.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                    Aún no hay mensajes en este ticket
                  </div>
                ) : (
                  <div className="space-y-1">
                    {selectedMensajes.map((msg) => (
                      <ChatBubble
                        key={msg.id}
                        autorTipo={msg.autor_tipo}
                        mensaje={msg.mensaje}
                        timestamp={msg.created_at}
                        nombreAdmin={msg.autor_tipo === 'admin' ? 'Soporte FOCADES' : null}
                      />
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>

              {/* Input de mensaje */}
              <div className="px-4 py-3 border-t border-slate-200 bg-white flex-shrink-0">
                <ChatInput
                  onSend={handleSendMessage}
                  disabled={!!selectedTicket.cerrado_at}
                  loading={sendingMessage}
                  placeholder={selectedTicket.cerrado_at ? 'Este ticket fue cerrado' : 'Escribe tu mensaje...'}
                />
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default BeneficiarioTickets;
