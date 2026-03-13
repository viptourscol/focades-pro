// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const sanitizeText = (value: unknown, maxLength = 3000) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);

const normalizeEstado = (value: unknown) => sanitizeText(value, 30).toLowerCase();

const ALLOWED_ESTADOS = new Set(['recibido', 'en_revision', 'respondido', 'cerrado']);
const ALLOWED_PRIORIDADES = new Set(['baja', 'media', 'alta']);

const formatDateTime = (value: string | null) => {
  if (!value) return 'No disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No disponible';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(date);
};

const buildStats = (rows: any[]) => {
  const stats = {
    total: 0,
    recibido: 0,
    en_revision: 0,
    respondido: 0,
    cerrado: 0,
    activos: 0,
    resueltos: 0,
    pendientes: 0,
  };

  for (const row of rows || []) {
    const estado = normalizeEstado(row?.estado);
    stats.total += 1;
    if (estado === 'recibido') stats.recibido += 1;
    if (estado === 'en_revision') stats.en_revision += 1;
    if (estado === 'respondido') stats.respondido += 1;
    if (estado === 'cerrado') stats.cerrado += 1;
  }

  stats.pendientes = stats.recibido + stats.en_revision;
  stats.activos = stats.pendientes;
  stats.resueltos = stats.respondido + stats.cerrado;

  return stats;
};

const mapTicket = (ticket: any) => ({
  ...ticket,
  created_at_label: formatDateTime(ticket?.created_at),
  updated_at_label: formatDateTime(ticket?.updated_at),
  respondido_at_label: formatDateTime(ticket?.respondido_at),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new HttpError('Variables de entorno de Supabase incompletas en la función.', 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const action = sanitizeText(body?.action, 30).toLowerCase();

    if (!action) {
      throw new HttpError('Acción inválida.', 400);
    }

    if (action === 'stats') {
      const { data, error } = await admin.from('soporte_tickets').select('estado');
      if (error) {
        throw new HttpError(error.message || 'No se pudieron cargar estadísticas.', 400);
      }

      return new Response(JSON.stringify({ ok: true, stats: buildStats(data || []) }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list') {
      const estado = normalizeEstado(body?.estado);
      const q = sanitizeText(body?.query, 180).toLowerCase();
      const limit = Math.min(Math.max(Number(body?.limit) || 50, 1), 200);

      let query = admin
        .from('soporte_tickets')
        .select(
          'id,ticket_codigo,radicado,email_contacto,nombre_contacto,asunto,mensaje_aspirante,estado,prioridad,respuesta_admin,created_at,updated_at,respondido_at',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .limit(limit);

      if (ALLOWED_ESTADOS.has(estado)) {
        query = query.eq('estado', estado);
      }

      if (q) {
        query = query.or(
          `ticket_codigo.ilike.%${q}%,radicado.ilike.%${q}%,email_contacto.ilike.%${q}%,nombre_contacto.ilike.%${q}%,asunto.ilike.%${q}%`
        );
      }

      const { data, error, count } = await query;
      if (error) {
        throw new HttpError(error.message || 'No se pudieron listar tickets.', 400);
      }

      return new Response(
        JSON.stringify({
          ok: true,
          tickets: (data || []).map(mapTicket),
          total: count || 0,
          stats: buildStats(data || []),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (action === 'update') {
      const ticketId = sanitizeText(body?.ticket_id, 80);
      const estado = normalizeEstado(body?.estado);
      const prioridad = sanitizeText(body?.prioridad, 20).toLowerCase();
      const respuestaAdmin = sanitizeText(body?.respuesta_admin, 5000);

      if (!ticketId) {
        throw new HttpError('Debes indicar el ticket a actualizar.', 400);
      }

      const payload: Record<string, unknown> = {};

      if (estado) {
        if (!ALLOWED_ESTADOS.has(estado)) {
          throw new HttpError('Estado de ticket inválido.', 400);
        }
        payload.estado = estado;
      }

      if (prioridad) {
        if (!ALLOWED_PRIORIDADES.has(prioridad)) {
          throw new HttpError('Prioridad inválida.', 400);
        }
        payload.prioridad = prioridad;
      }

      if (respuestaAdmin) {
        payload.respuesta_admin = respuestaAdmin;
      }

      if ((estado === 'respondido' || estado === 'cerrado') && !payload.respondido_at) {
        payload.respondido_at = new Date().toISOString();
      }

      if (Object.keys(payload).length === 0) {
        throw new HttpError('No hay cambios para guardar.', 400);
      }

      const { data, error } = await admin
        .from('soporte_tickets')
        .update(payload)
        .eq('id', ticketId)
        .select(
          'id,ticket_codigo,radicado,email_contacto,nombre_contacto,asunto,mensaje_aspirante,estado,prioridad,respuesta_admin,created_at,updated_at,respondido_at'
        )
        .single();

      if (error) {
        throw new HttpError(error.message || 'No se pudo actualizar el ticket.', 400);
      }

      return new Response(JSON.stringify({ ok: true, ticket: mapTicket(data) }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new HttpError('Acción no soportada.', 400);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message =
      error instanceof HttpError
        ? error.message
        : error?.message || 'Error interno administrando tickets.';

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
