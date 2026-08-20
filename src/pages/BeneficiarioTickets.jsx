import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy, MessageSquareText, Plus, RefreshCw, Send, Ticket } from 'lucide-react';
import { supabase } from '../lib/supabase';

const STATUS_LABELS = {
  recibido: 'Recibido',
  en_revision: 'En revisión',
  respondido: 'Respondido',
  cerrado: 'Cerrado',
};

const statusBadgeClass = (status) => {
  if (status === 'respondido') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'en_revision') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (status === 'cerrado') return 'bg-slate-100 text-slate-700 border-slate-200';
  return 'bg-amber-100 text-amber-700 border-amber-200';
};

const BeneficiarioTickets = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ asunto: '', mensaje: '' });
  const [profileInfo, setProfileInfo] = useState({ email: '', radicado: '', nombre_completo: '' });
  const [authExpired, setAuthExpired] = useState(false);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) || null,
    [tickets, selectedId]
  );

  const loadTickets = async ({ keepSelection = true } = {}) => {
    setLoading(true);
    setError('');
    setAuthExpired(false);

    // Obtener beneficiario_id desde localStorage
    let beneficiarioId = null;
    try {
      const sessionStr = localStorage.getItem('focades:beneficiario-session');
      if (sessionStr) {
        const documentSession = JSON.parse(sessionStr);
        const sessionTime = new Date(documentSession.timestamp).getTime();
        const maxAge = 24 * 60 * 60 * 1000;
        
        if (Date.now() - sessionTime <= maxAge) {
          beneficiarioId = documentSession.beneficiario_id;
        }
      }
    } catch (error) {
      console.error('[BeneficiarioTickets] Error leyendo sesión:', error);
    }

    // Si no hay beneficiario_id, intentar con Supabase Auth
    if (!beneficiarioId) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (userId) {
        const { data: profile } = await supabase
          .from('portal_beneficiarios')
          .select('id')
          .eq('auth_user_id', userId)
          .maybeSingle();
        
        beneficiarioId = profile?.id;
      }
    }

    if (!beneficiarioId) {
      setAuthExpired(true);
      setError('Tu sesión expiró. Inicia sesión de nuevo para continuar.');
      setLoading(false);
      return;
    }

    console.log('[BeneficiarioTickets] Cargando tickets...');

    // Cargar tickets usando Edge Function (bypasses RLS)
    const { data: result, error: invokeError } = await supabase.functions.invoke('get-beneficiario-tickets', {
      body: { beneficiario_id: beneficiarioId },
    });

    if (invokeError) {
      console.error('[BeneficiarioTickets] Error invocando Edge Function:', invokeError);
      setError(invokeError.message || 'No se pudieron cargar tus tickets.');
      setTickets([]);
      setSelectedId('');
      setLoading(false);
      return;
    }

    if (!result?.ok) {
      console.error('[BeneficiarioTickets] Error en respuesta:', result);
      setError(result?.error || 'No se pudieron cargar tus tickets.');
      setTickets([]);
      setSelectedId('');
      setLoading(false);
      return;
    }

    console.log('[BeneficiarioTickets] Tickets cargados:', result.tickets?.length || 0);

    const rows = Array.isArray(result.tickets) ? result.tickets : [];
    const profile = result.profile || {};

    setTickets(rows);
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

  useEffect(() => {
    loadTickets({ keepSelection: false });
  }, []);

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

    // Obtener beneficiario_id desde localStorage
    let beneficiarioId = null;
    try {
      const sessionStr = localStorage.getItem('focades:beneficiario-session');
      if (sessionStr) {
        const documentSession = JSON.parse(sessionStr);
        const sessionTime = new Date(documentSession.timestamp).getTime();
        const maxAge = 24 * 60 * 60 * 1000;
        
        if (Date.now() - sessionTime <= maxAge) {
          beneficiarioId = documentSession.beneficiario_id;
        }
      }
    } catch (error) {
      console.error('[BeneficiarioTickets] Error leyendo sesión:', error);
    }

    // Si no hay beneficiario_id, intentar con Supabase Auth
    if (!beneficiarioId) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (userId) {
        const { data: profile } = await supabase
          .from('portal_beneficiarios')
          .select('id')
          .eq('auth_user_id', userId)
          .maybeSingle();
        
        beneficiarioId = profile?.id;
      }
    }

    if (!beneficiarioId) {
      setAuthExpired(true);
      setError('Tu sesión expiró. Inicia sesión de nuevo para continuar.');
      setSubmitting(false);
      return;
    }

    console.log('[BeneficiarioTickets] Creando ticket...');

    // Crear ticket usando Edge Function (bypasses RLS)
    const { data: result, error: invokeError } = await supabase.functions.invoke('crear-ticket-beneficiario', {
      body: {
        beneficiario_id: beneficiarioId,
        asunto,
        mensaje,
      },
    });

    if (invokeError) {
      console.error('[BeneficiarioTickets] Error invocando Edge Function:', invokeError);
      setError(invokeError.message || 'No se pudo crear el ticket.');
      setSubmitting(false);
      return;
    }

    if (!result?.ok) {
      console.error('[BeneficiarioTickets] Error en respuesta:', result);
      setError(result?.error || 'No se pudo crear el ticket.');
      setSubmitting(false);
      return;
    }

    console.log('[BeneficiarioTickets] Ticket creado:', result.ticket?.ticket_codigo);

    const createdTicket = result.ticket || null;
    setSuccess(result.message || 'Tu ticket fue creado correctamente.');
    setForm({ asunto: '', mensaje: '' });
    setShowForm(false);
    await loadTickets({ keepSelection: false });
    if (createdTicket?.id) {
      setSelectedId(createdTicket.id);
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-blue-50 to-slate-50 p-5 md:p-6">
        <div className="absolute -top-16 -right-10 h-40 w-40 rounded-full bg-blue-100/60 blur-2xl" />
        <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-amber-100/40 blur-2xl" />

        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-extrabold text-primary flex items-center gap-2">
              <LifeBuoy size={24} /> Centro de Soporte
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Crea tickets y consulta respuestas del equipo administrativo para tu caso.
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
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50"
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
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-secondary"
            >
              <Plus size={16} /> {showForm ? 'Cerrar formulario' : 'Nuevo ticket'}
            </button>
          </div>
        </div>
      </section>

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
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                placeholder="Ej: Duda sobre estado de actualización"
                maxLength={180}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Mensaje</label>
              <textarea
                name="mensaje"
                value={form.mensaje}
                onChange={handleInputChange}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm min-h-[130px]"
                placeholder="Describe tu solicitud con el mayor detalle posible..."
                maxLength={2500}
              />
              <p className="text-[11px] text-slate-500 mt-1">{String(form.mensaje || '').length} / 2500</p>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-bold hover:bg-primary disabled:opacity-60"
              >
                <Send size={15} /> {submitting ? 'Enviando...' : 'Enviar ticket'}
              </button>
            </div>
          </form>
        </section>
      )}

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
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Mis tickets</p>
            <span className="text-xs font-semibold text-slate-500">{tickets.length}</span>
          </div>

          {loading ? (
            <div className="p-5 text-sm text-slate-500">Cargando tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="p-5 text-sm text-slate-500">Aún no has creado tickets de soporte.</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
              {tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    selectedId === ticket.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-sm text-slate-800 truncate">{ticket.ticket_codigo}</p>
                    <span className={`text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border ${statusBadgeClass(ticket.estado)}`}>
                      {STATUS_LABELS[ticket.estado] || ticket.estado || 'Sin estado'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 truncate mt-1">{ticket.asunto || 'Sin asunto'}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{ticket.created_at_label || ticket.created_at || 'Sin fecha'}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-border rounded-2xl p-4 md:p-5">
          {!selectedTicket ? (
            <div className="h-full min-h-[220px] flex items-center justify-center text-sm text-slate-400 italic">
              Selecciona un ticket para ver su detalle.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <Ticket size={18} className="text-secondary" /> {selectedTicket.ticket_codigo}
                  </p>
                  <p className="text-sm text-slate-600 mt-1">{selectedTicket.asunto}</p>
                </div>
                <span className={`text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border ${statusBadgeClass(selectedTicket.estado)}`}>
                  {STATUS_LABELS[selectedTicket.estado] || selectedTicket.estado || 'Sin estado'}
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Mensaje enviado</p>
                <p className="text-sm text-slate-700 mt-1 whitespace-pre-line">
                  {selectedTicket.mensaje_aspirante || 'Sin mensaje.'}
                </p>
                <p className="text-xs text-slate-500 mt-2">Creado: {selectedTicket.created_at_label || selectedTicket.created_at}</p>
              </div>

              <div className={`rounded-xl border p-3 ${selectedTicket.respuesta_admin ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Respuesta administrativa</p>
                <p className="text-sm text-slate-700 mt-1 whitespace-pre-line">
                  {selectedTicket.respuesta_admin || 'Aún no hay respuesta por parte del equipo.'}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Respondido: {selectedTicket.respondido_at_label || selectedTicket.respondido_at || 'Pendiente'}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default BeneficiarioTickets;
