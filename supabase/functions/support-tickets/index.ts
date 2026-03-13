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

const findInscripcionByRadicado = async (admin: any, radicado: string) => {
  const query = sanitizeText(radicado, 50);
  if (!query) return null;

  const byRadicado = await admin
    .from('inscripciones')
    .select('*')
    .eq('radicado', query)
    .maybeSingle();

  if (byRadicado.data) return byRadicado.data;

  const byNumeroRadicado = await admin
    .from('inscripciones')
    .select('*')
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

const verifyTurnstile = async (token: string, remoteIp: string) => {
  const secret = Deno.env.get('SUPPORT_TURNSTILE_SECRET_KEY') || '';
  if (!secret) {
    return { ok: true, skipped: true };
  }

  if (!token) {
    return { ok: false, reason: 'Debes completar la validación CAPTCHA para enviar el ticket.' };
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret,
      response: token,
      remoteip: remoteIp || '',
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.success !== true) {
    return {
      ok: false,
      reason: 'No se pudo validar CAPTCHA. Recarga la página e inténtalo nuevamente.',
    };
  }

  return { ok: true, skipped: false };
};

const maybeSendTicketCreatedEmail = async ({
  email,
  nombre,
  radicado,
  ticketCodigo,
}: {
  email: string;
  nombre: string;
  radicado: string;
  ticketCodigo: string;
}) => {
  const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';
  const from = Deno.env.get('SUPPORT_EMAIL_FROM') || Deno.env.get('DOCS_EMAIL_FROM') || '';

  if (!resendApiKey || !from || !isValidEmail(email)) {
    return { sent: false, reason: 'Configuración de correo no disponible para tickets.' };
  }

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
      <h2 style="color:#0D2C54;">Hemos recibido tu ticket de ayuda</h2>
      <p>Hola <strong>${sanitizeText(nombre || 'Aspirante', 120)}</strong>,</p>
      <p>Tu solicitud de soporte fue registrada correctamente.</p>
      <p><strong>Radicado:</strong> ${sanitizeText(radicado, 50)}<br/>
      <strong>Ticket:</strong> ${sanitizeText(ticketCodigo, 30)}</p>
      <p>Podrás consultar el estado y respuesta de este ticket desde el botón <strong>Ayuda</strong> en el portal, ingresando tu radicado y correo.</p>
      <p>Atentamente,<br/><strong>Equipo FOCADES</strong></p>
    </div>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `Ticket de ayuda recibido - ${ticketCodigo}`,
      html,
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      sent: false,
      reason: json?.message || json?.error || response.statusText || 'No se pudo enviar correo de acuse.',
    };
  }

  return { sent: true, providerId: json?.id || '' };
};

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
    const action = sanitizeText(body?.action, 20).toLowerCase();

    if (!action) {
      throw new HttpError('Acción inválida para soporte.', 400);
    }

    const rawRadicado = sanitizeText(body?.radicado, 50);
    const rawEmail = sanitizeText(body?.email_contacto, 150).toLowerCase();

    if (action === 'create') {
      const nombreContacto = sanitizeText(body?.nombre_contacto, 150);
      const asunto = sanitizeText(body?.asunto, 180);
      const mensaje = sanitizeText(body?.mensaje, 2500);
      const captchaToken = sanitizeText(body?.captcha_token, 4000);
      const remoteIp =
        sanitizeText(req.headers.get('x-forwarded-for') || '', 120).split(',')[0]?.trim() || '';

      if (!rawRadicado) {
        throw new HttpError('Debes ingresar tu número de radicado.', 400);
      }

      if (!isValidEmail(rawEmail)) {
        throw new HttpError('Debes ingresar un correo de contacto válido.', 400);
      }

      if (!asunto) {
        throw new HttpError('Debes indicar el asunto de tu solicitud.', 400);
      }

      if (mensaje.length < 20) {
        throw new HttpError('Describe tu solicitud con mayor detalle (mínimo 20 caracteres).', 400);
      }

      const captchaResult = await verifyTurnstile(captchaToken, remoteIp);
      if (!captchaResult.ok) {
        throw new HttpError(captchaResult.reason || 'Validación CAPTCHA fallida.', 400);
      }

      const inscripcion = await findInscripcionByRadicado(admin, rawRadicado);
      if (!inscripcion?.id) {
        throw new HttpError(
          'No encontramos una inscripción con ese radicado. Verifica el número e inténtalo nuevamente.',
          404
        );
      }

      const { data: recentTickets, error: recentError } = await admin
        .from('soporte_tickets')
        .select('id,created_at')
        .eq('radicado', inscripcion.radicado || rawRadicado)
        .eq('email_contacto', rawEmail)
        .gte('created_at', new Date(Date.now() - 120000).toISOString())
        .limit(2);

      if (!recentError && (recentTickets || []).length >= 2) {
        throw new HttpError(
          'Ya registraste solicitudes hace pocos segundos. Espera un momento antes de enviar otro ticket.',
          429
        );
      }

      let createdTicket = null;
      for (let attempts = 0; attempts < 6; attempts += 1) {
        const ticketCodigo = buildTicketCode();
        const insert = await admin
          .from('soporte_tickets')
          .insert({
            ticket_codigo: ticketCodigo,
            inscripcion_id: inscripcion.id,
            radicado: inscripcion.radicado || rawRadicado,
            email_contacto: rawEmail,
            nombre_contacto: nombreContacto || inscripcion.nombre_completo || '',
            asunto,
            mensaje_aspirante: mensaje,
            estado: 'recibido',
            prioridad: 'media',
          })
          .select('*')
          .single();

        if (!insert.error && insert.data) {
          createdTicket = insert.data;
          break;
        }

        if (insert.error && insert.error.code !== '23505') {
          throw new HttpError(insert.error.message || 'No se pudo registrar el ticket.', 400);
        }
      }

      if (!createdTicket) {
        throw new HttpError('No se pudo generar el número de ticket. Inténtalo de nuevo.', 500);
      }

      const mailResult = await maybeSendTicketCreatedEmail({
        email: rawEmail,
        nombre: createdTicket.nombre_contacto || nombreContacto || inscripcion.nombre_completo || 'Aspirante',
        radicado: createdTicket.radicado,
        ticketCodigo: createdTicket.ticket_codigo,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          ticket: {
            id: createdTicket.id,
            ticket_codigo: createdTicket.ticket_codigo,
            radicado: createdTicket.radicado,
            estado: createdTicket.estado,
            asunto: createdTicket.asunto,
            mensaje_aspirante: createdTicket.mensaje_aspirante,
            respuesta_admin: createdTicket.respuesta_admin,
            created_at: createdTicket.created_at,
            respondido_at: createdTicket.respondido_at,
            created_at_label: formatDateTime(createdTicket.created_at),
            respondido_at_label: formatDateTime(createdTicket.respondido_at),
          },
          message:
            'Tu ticket fue recibido correctamente. Te responderemos en el menor tiempo posible y podrás revisar la respuesta desde este mismo chat ingresando tu radicado.',
          email: mailResult,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    if (action === 'list') {
      if (!rawRadicado) {
        throw new HttpError('Debes ingresar el radicado para consultar tickets.', 400);
      }

      if (!isValidEmail(rawEmail)) {
        throw new HttpError('Debes ingresar el mismo correo registrado en tu ticket.', 400);
      }

      const inscripcion = await findInscripcionByRadicado(admin, rawRadicado);
      if (!inscripcion?.id) {
        throw new HttpError('No encontramos una inscripción con ese radicado.', 404);
      }

      const { data: tickets, error: ticketsError } = await admin
        .from('soporte_tickets')
        .select('id,ticket_codigo,radicado,estado,asunto,mensaje_aspirante,respuesta_admin,created_at,respondido_at')
        .eq('radicado', inscripcion.radicado || rawRadicado)
        .eq('email_contacto', rawEmail)
        .order('created_at', { ascending: false })
        .limit(25);

      if (ticketsError) {
        throw new HttpError(ticketsError.message || 'No se pudieron consultar los tickets.', 400);
      }

      const normalized = (tickets || []).map((ticket: any) => ({
        ...ticket,
        created_at_label: formatDateTime(ticket.created_at),
        respondido_at_label: formatDateTime(ticket.respondido_at),
      }));

      return new Response(
        JSON.stringify({ ok: true, tickets: normalized }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    throw new HttpError('Acción no soportada para soporte.', 400);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 400;

    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
      }
    );
  }
});
