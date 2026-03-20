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

const getBearerTokenFromRequest = (req: Request) => {
  const candidates = [
    req.headers.get('authorization'),
    req.headers.get('Authorization'),
    req.headers.get('x-authorization'),
    req.headers.get('X-Authorization'),
    req.headers.get('x-forwarded-authorization'),
    req.headers.get('X-Forwarded-Authorization'),
  ];

  for (const value of candidates) {
    const token = String(value || '').replace(/^Bearer\s+/i, '').trim();
    if (token) return token;
  }

  return '';
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

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

const buildTicketCode = () => {
  const year = new Date().getFullYear();
  const random = Math.floor(100000 + Math.random() * 900000);
  return `TKT-${year}-${random}`;
};

const mapTicket = (ticket: any) => ({
  ...ticket,
  created_at_label: formatDateTime(ticket?.created_at),
  updated_at_label: formatDateTime(ticket?.updated_at),
  respondido_at_label: formatDateTime(ticket?.respondido_at),
});

const findInscripcionByRadicado = async (admin: any, radicado: string) => {
  const query = sanitizeText(radicado, 50);
  if (!query) return null;

  const byRadicado = await admin
    .from('inscripciones')
    .select('id,radicado,numero_radicado')
    .eq('radicado', query)
    .maybeSingle();

  if (byRadicado.data) return byRadicado.data;

  const byNumeroRadicado = await admin
    .from('inscripciones')
    .select('id,radicado,numero_radicado')
    .eq('numero_radicado', query)
    .maybeSingle();

  const missingColumnError =
    byNumeroRadicado.error &&
    /column\s+inscripciones\.numero_radicado does not exist|Could not find the 'numero_radicado' column/i.test(
      String(byNumeroRadicado.error.message || '')
    );

  if (missingColumnError) {
    return null;
  }

  return byNumeroRadicado.data || null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new HttpError('Variables de entorno de Supabase incompletas en la función.', 500);
    }

    const body = await req.json().catch(() => ({}));
    const tokenFromBody = sanitizeText(body?.access_token, 8000);
    const authToken = getBearerTokenFromRequest(req) || tokenFromBody;

    if (!authToken) {
      throw new HttpError('Sesión inválida. Inicia sesión nuevamente para gestionar tickets.', 401);
    }

    const authClient = createClient(supabaseUrl, anonKey);

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(authToken);

    if (userError || !user?.id) {
      throw new HttpError('Sesión inválida. Inicia sesión nuevamente para gestionar tickets.', 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const action = sanitizeText(body?.action, 20).toLowerCase();

    if (!action) {
      throw new HttpError('Acción inválida para tickets de beneficiario.', 400);
    }

    const { data: profile, error: profileError } = await admin
      .from('portal_beneficiarios')
      .select('id,email,radicado_inscripcion,nombre_completo')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (profileError) {
      throw new HttpError(profileError.message || 'No se pudo validar tu perfil de beneficiario.', 400);
    }

    if (!profile?.id) {
      throw new HttpError('Tu cuenta no está vinculada a un beneficiario activo.', 403);
    }

    const contactEmail = sanitizeText(profile.email, 150).toLowerCase();
    const radicado = sanitizeText(profile.radicado_inscripcion, 50);

    if (!isValidEmail(contactEmail)) {
      throw new HttpError('Tu perfil no tiene un correo válido para registrar tickets.', 400);
    }

    if (!radicado) {
      throw new HttpError('Tu perfil no tiene radicado asociado. Solicita actualización al administrador.', 400);
    }

    if (action === 'list') {
      const { data, error } = await admin
        .from('soporte_tickets')
        .select(
          'id,ticket_codigo,radicado,email_contacto,nombre_contacto,asunto,mensaje_aspirante,estado,prioridad,respuesta_admin,created_at,updated_at,respondido_at'
        )
        .eq('email_contacto', contactEmail)
        .eq('radicado', radicado)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        throw new HttpError(error.message || 'No se pudieron consultar tus tickets.', 400);
      }

      return new Response(
        JSON.stringify({
          ok: true,
          tickets: (data || []).map(mapTicket),
          profile: {
            email: contactEmail,
            radicado,
            nombre_completo: profile.nombre_completo || '',
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (action === 'create') {
      const asunto = sanitizeText(body?.asunto, 180);
      const mensaje = sanitizeText(body?.mensaje, 2500);

      if (!asunto) {
        throw new HttpError('Debes indicar el asunto de tu solicitud.', 400);
      }

      if (mensaje.length < 20) {
        throw new HttpError('Describe tu solicitud con mayor detalle (mínimo 20 caracteres).', 400);
      }

      const { data: recentTickets, error: recentError } = await admin
        .from('soporte_tickets')
        .select('id,created_at')
        .eq('email_contacto', contactEmail)
        .eq('radicado', radicado)
        .gte('created_at', new Date(Date.now() - 120000).toISOString())
        .limit(2);

      if (!recentError && (recentTickets || []).length >= 2) {
        throw new HttpError(
          'Ya registraste solicitudes hace pocos segundos. Espera un momento antes de enviar otro ticket.',
          429
        );
      }

      const inscripcion = await findInscripcionByRadicado(admin, radicado);

      let createdTicket = null;
      for (let attempts = 0; attempts < 6; attempts += 1) {
        const ticketCodigo = buildTicketCode();
        const insert = await admin
          .from('soporte_tickets')
          .insert({
            ticket_codigo: ticketCodigo,
            inscripcion_id: inscripcion?.id || null,
            radicado: inscripcion?.radicado || radicado,
            email_contacto: contactEmail,
            nombre_contacto: sanitizeText(profile.nombre_completo, 150) || 'Beneficiario',
            asunto,
            mensaje_aspirante: mensaje,
            estado: 'recibido',
            prioridad: 'media',
          })
          .select(
            'id,ticket_codigo,radicado,email_contacto,nombre_contacto,asunto,mensaje_aspirante,estado,prioridad,respuesta_admin,created_at,updated_at,respondido_at'
          )
          .single();

        if (!insert.error && insert.data) {
          createdTicket = insert.data;
          break;
        }

        if (insert.error && insert.error.code !== '23505') {
          throw new HttpError(insert.error.message || 'No se pudo registrar tu ticket.', 400);
        }
      }

      if (!createdTicket) {
        throw new HttpError('No se pudo generar el número de ticket. Inténtalo nuevamente.', 500);
      }

      return new Response(
        JSON.stringify({
          ok: true,
          ticket: mapTicket(createdTicket),
          message: 'Tu ticket fue creado correctamente. El equipo revisará tu solicitud pronto.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    throw new HttpError('Acción no soportada para beneficiarios.', 400);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : error?.message || 'Error interno en tickets.';

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
