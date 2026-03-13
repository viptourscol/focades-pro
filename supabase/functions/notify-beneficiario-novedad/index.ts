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

const sanitize = (value: unknown, max = 500) => String(value || '').trim().slice(0, max);

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const statusClass = (estado: string) => {
  const clean = String(estado || '').toLowerCase().replace(/\s+/g, '');
  if (clean.includes('aprob')) return 'status-Resuelto';
  if (clean.includes('rechaz')) return 'status-ConObservaciones';
  return 'status-Asignado';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      throw new HttpError('Método no permitido.', 405);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'FOCADES <notificaciones@focades.gov.co>';

    if (!supabaseUrl || !serviceRoleKey) {
      throw new HttpError('Configuración incompleta de Supabase.', 500);
    }

    if (!resendApiKey) {
      throw new HttpError('RESEND_API_KEY no está configurada.', 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get('authorization') ?? '';
    const callerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!callerToken) throw new HttpError('Se requiere autenticación.', 401);

    const {
      data: { user: callerUser },
      error: callerError,
    } = await adminClient.auth.getUser(callerToken);

    if (callerError || !callerUser?.id) {
      throw new HttpError('No autenticado.', 401);
    }

    const { data: adminRow } = await adminClient
      .from('portal_admin_users')
      .select('user_id')
      .eq('user_id', callerUser.id)
      .maybeSingle();

    if (!adminRow?.user_id) {
      throw new HttpError('Solo administradores pueden enviar notificaciones.', 403);
    }

    const body = await req.json().catch(() => ({}));

    const email = sanitize(body?.email, 150).toLowerCase();
    const nombreEstudiante = sanitize(body?.nombre_estudiante, 120) || 'Estudiante';
    const numeroPeticion = sanitize(body?.numero_peticion, 80) || 'No disponible';
    const estado = sanitize(body?.estado, 80) || 'En revisión';
    const nota = sanitize(body?.nota, 2000);
    const portalUrl = sanitize(body?.portal_url, 500) || 'https://app.focades.info/beneficiario/login';

    if (!email || !isValidEmail(email)) {
      throw new HttpError('Correo inválido para notificación.', 400);
    }

    const badgeClass = statusClass(estado);
    const year = new Date().getFullYear();

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background-color: #f4f7f9; padding: 20px; }
    .container {
      max-width: 600px; margin: 0 auto; padding: 30px; background-color: #ffffff;
      border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .header { text-align: center; border-bottom: 1px solid #dee2e6; padding-bottom: 20px; margin-bottom: 20px; }
    .logo { width: 170px; }
    h2 { color: #0D2C54; }
    .status-badge {
        display: inline-block; padding: 5px 12px; border-radius: 15px;
        font-weight: bold; color: white;
    }
    .status-Resuelto { background-color: #198754; }
    .status-ConObservaciones { background-color: #dc3545; }
    .status-Asignado { background-color: #0d6efd; }
    .note {
        background-color: #fff3cd; border-left: 4px solid #ffc107;
        padding: 15px; margin-top: 20px; font-size: 0.95rem;
    }
    .button-container { text-align: center; margin-top: 30px; }
    .button {
      background-color: #F9A03F; color: #FFFFFF; text-decoration: none;
      padding: 12px 25px; border-radius: 8px; font-weight: bold;
      display: inline-block;
    }
    .footer { margin-top: 30px; font-size: 0.8rem; color: #6c757d; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
        <img class="logo" src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logo-focades-alcadia.png" alt="Logo FOCADES">
        <h2>Notificación de Actualización de Beneficiario</h2>
    </div>

    <p>Hola <strong>${nombreEstudiante}</strong>,</p>
    <p>Te informamos que ha habido una actualización en tu proceso con número de referencia:</p>
    <h3 style="text-align: center; color: #1A5A96;">${numeroPeticion}</h3>

    <p>El nuevo estado de tu actualización es:</p>
    <div style="text-align: center;">
        <span class="status-badge ${badgeClass}">${estado}</span>
    </div>

    ${nota ? `
      <div class="note">
          <strong>Nota del revisor:</strong>
          <p style="margin-top: 5px; margin-bottom: 0;">${nota}</p>
      </div>
    ` : ''}

    <p style="margin-top: 20px;">
      Te recomendamos revisar los detalles completos de tu estado de actualización en la plataforma FOCADES.
    </p>

    <div class="button-container">
      <a href="${portalUrl}" target="_blank" class="button">Revisar mi estado</a>
    </div>

    <p class="footer">
      Este es un mensaje automático. Por favor, no respondas a este correo.<br>
      © ${year} Alcaldía de Montelíbano - Secretaría de Educación
    </p>
  </div>
</body>
</html>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: `FOCADES | Novedad en tu actualización (${estado})`,
        html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => 'No detail');
      throw new HttpError(`Proveedor de correo respondió con error: ${detail}`, 502);
    }

    const result = await response.json().catch(() => ({}));

    return new Response(JSON.stringify({ ok: true, id: result?.id || null }), {
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (err) {
    const status = err instanceof Error && 'status' in err ? (err as HttpError).status : 500;
    const message = err instanceof Error ? err.message : 'Error interno.';
    return new Response(JSON.stringify({ ok: false, message }), {
      status,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});
