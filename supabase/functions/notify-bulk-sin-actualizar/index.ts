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

const getBearerTokenFromRequest = (req: Request) => {
  const candidates = [
    req.headers.get('authorization'),
    req.headers.get('Authorization'),
    req.headers.get('x-authorization'),
    req.headers.get('X-Authorization'),
    req.headers.get('x-forwarded-authorization'),
    req.headers.get('X-Forwarded-Authorization'),
  ];

  for (const headerValue of candidates) {
    const token = String(headerValue || '').replace(/^Bearer\s+/i, '').trim();
    if (token) return token;
  }

  return '';
};

const TEMPLATE_LABELS: Record<string, string> = {
  ultimo_aviso: 'Último aviso',
  cierre_periodo_sin_pago: 'Cierre de periodo / sin pago',
};

const htmlEscape = (raw: string) =>
  String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const templateFor = (templateCode: string, data: Record<string, string>) => {
  const nombre = htmlEscape(data.nombre_estudiante || 'Estudiante');
  const periodo = htmlEscape(data.periodo || 'Periodo vigente');
  const portalUrl = htmlEscape(data.portal_url || 'https://app.focades.info/beneficiario/login');

  if (templateCode === 'cierre_periodo_sin_pago') {
    return {
      subject: `FOCADES | Cierre de periodo ${periodo}`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;background:#f4f6f8;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.08);">
        <tr><td style="padding:24px;background:#0d2c54;color:#ffffff;"><h2 style="margin:0;">FOCADES</h2></td></tr>
        <tr><td style="padding:28px;">
          <h3 style="margin-top:0;color:#0d2c54;">Cierre de periodo de actualización</h3>
          <p>Hola <strong>${nombre}</strong>,</p>
          <p>Te informamos que el periodo <strong>${periodo}</strong> cerró sin una actualización válida registrada en tu expediente.</p>
          <p>Mientras este estado persista, tu proceso puede quedar marcado como <strong>sin pago</strong> para el siguiente desembolso.</p>
          <p>Ingresa al portal para revisar tu estado y ponerte al día con tu gestión académica.</p>
          <p style="margin-top:24px;"><a href="${portalUrl}" style="display:inline-block;background:#f59e0b;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;">Ir al portal</a></p>
          <p style="font-size:12px;color:#6b7280;margin-top:24px;">Mensaje automático de FOCADES. No responder este correo.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    };
  }

  return {
    subject: `FOCADES | Último aviso de actualización (${periodo})`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;background:#f4f6f8;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.08);">
        <tr><td style="padding:24px;background:#0d2c54;color:#ffffff;"><h2 style="margin:0;">FOCADES</h2></td></tr>
        <tr><td style="padding:28px;">
          <h3 style="margin-top:0;color:#0d2c54;">Último aviso para actualizar tu información</h3>
          <p>Hola <strong>${nombre}</strong>,</p>
          <p>Este es un recordatorio final para el periodo <strong>${periodo}</strong>.</p>
          <p>Tu registro aparece como no actualizado o con actualización rechazada. Es necesario regularizar tu estado para evitar afectaciones en tus próximos pagos.</p>
          <p>Ingresa al portal y completa tu actualización lo antes posible.</p>
          <p style="margin-top:24px;"><a href="${portalUrl}" style="display:inline-block;background:#f59e0b;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;">Actualizar ahora</a></p>
          <p style="font-size:12px;color:#6b7280;margin-top:24px;">Mensaje automático de FOCADES. No responder este correo.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
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

    const body = await req.json().catch(() => ({}));
    const bodyToken = sanitize(body?.caller_token, 6000);
    const callerToken = getBearerTokenFromRequest(req) || bodyToken;
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

    const ventanaId = Number(body?.ventana_id || 0);
    const templateCode = sanitize(body?.template_code, 80);
    const recipientIds = Array.isArray(body?.recipient_ids)
      ? body.recipient_ids.map((v: unknown) => Number(v)).filter((v: number) => Number.isInteger(v) && v > 0)
      : [];
    const periodoNombre = sanitize(body?.periodo_nombre, 200) || 'Periodo vigente';
    const portalUrl = sanitize(body?.portal_url, 500) || 'https://app.focades.info/beneficiario/login';

    if (!Number.isInteger(ventanaId) || ventanaId <= 0) {
      throw new HttpError('ventana_id inválido.', 400);
    }

    if (!TEMPLATE_LABELS[templateCode]) {
      throw new HttpError('Plantilla no permitida.', 400);
    }

    if (recipientIds.length === 0) {
      throw new HttpError('Debes seleccionar al menos un destinatario.', 400);
    }

    if (recipientIds.length > 1000) {
      throw new HttpError('Máximo 1000 destinatarios por envío.', 400);
    }

    // Importante: este RPC usa auth.uid() para validar admin.
    // Debe ejecutarse con el JWT del usuario autenticado, no con service role.
    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_beneficiarios_sin_actualizar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${callerToken}`,
      },
      body: JSON.stringify({
        p_ventana_id: ventanaId,
        p_query: null,
        p_limit: 10000,
      }),
    });

    const rpcRaw = await rpcResponse.text().catch(() => '');
    let reportRows: any[] = [];
    if (!rpcResponse.ok) {
      let rpcMessage = 'No se pudo cargar el reporte.';
      try {
        const parsed = rpcRaw ? JSON.parse(rpcRaw) : null;
        rpcMessage = String(parsed?.message || parsed?.error || parsed?.hint || rpcMessage);
      } catch {
        if (rpcRaw) rpcMessage = rpcRaw;
      }
      throw new HttpError(rpcMessage, rpcResponse.status >= 400 && rpcResponse.status < 600 ? rpcResponse.status : 500);
    }

    try {
      reportRows = rpcRaw ? JSON.parse(rpcRaw) : [];
    } catch {
      reportRows = [];
    }

    const allowedRows = Array.isArray(reportRows) ? reportRows : [];
    const allowedMap = new Map<number, any>();
    allowedRows.forEach((row: any) => {
      const id = Number(row?.beneficiario_id || 0);
      if (id > 0) allowedMap.set(id, row);
    });

    const targets = recipientIds
      .map((id: number) => allowedMap.get(id))
      .filter(Boolean)
      .filter((row: any) => isValidEmail(String(row.email || '')));

    if (targets.length === 0) {
      throw new HttpError('No hay destinatarios válidos para enviar.', 400);
    }

    const campaignPayload = {
      ventana_id: ventanaId,
      plantilla_codigo: templateCode,
      plantilla_nombre: TEMPLATE_LABELS[templateCode],
      total_destinatarios: targets.length,
      created_by_user_id: callerUser.id,
      metadata: {
        periodo_nombre: periodoNombre,
        requested_recipient_ids: recipientIds,
      },
    };

    const { data: campaignRow, error: campaignError } = await adminClient
      .from('portal_notificacion_campanias')
      .insert(campaignPayload)
      .select('id')
      .single();

    if (campaignError || !campaignRow?.id) {
      throw new HttpError(campaignError?.message || 'No se pudo crear la campaña.', 500);
    }

    const campaniaId = Number(campaignRow.id);
    let sentCount = 0;
    let failedCount = 0;
    const details: Array<any> = [];

    for (const row of targets) {
      const email = sanitize(row.email, 150).toLowerCase();
      const nombreEstudiante = sanitize(row.nombre_completo, 120) || 'Estudiante';
      const beneficiarioId = Number(row.beneficiario_id || 0);

      let estadoEnvio = 'fallido';
      let proveedorId = null;
      let errorDetalle = null;
      let sentAt = null;

      try {
        const template = templateFor(templateCode, {
          nombre_estudiante: nombreEstudiante,
          periodo: periodoNombre,
          portal_url: portalUrl,
        });

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: template.subject,
            html: template.html,
          }),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => 'No detail');
          throw new Error(`Resend ${response.status}: ${detail}`);
        }

        const result = await response.json().catch(() => ({}));
        estadoEnvio = 'enviado';
        proveedorId = result?.id || null;
        sentAt = new Date().toISOString();
        sentCount += 1;
      } catch (err) {
        failedCount += 1;
        errorDetalle = String(err instanceof Error ? err.message : 'Error al enviar correo').slice(0, 1200);
      }

      details.push({
        campania_id: campaniaId,
        beneficiario_id: beneficiarioId || null,
        email,
        nombre_completo: nombreEstudiante,
        estado_envio: estadoEnvio,
        proveedor_id: proveedorId,
        error_detalle: errorDetalle,
        payload: {
          template_code: templateCode,
          periodo_nombre: periodoNombre,
          tipo_alerta: row.tipo_alerta,
        },
        sent_at: sentAt,
      });
    }

    if (details.length > 0) {
      const { error: detailsError } = await adminClient
        .from('portal_notificacion_campania_detalles')
        .insert(details);

      if (detailsError) {
        throw new HttpError(detailsError.message || 'No se pudo registrar detalle de la campaña.', 500);
      }
    }

    await adminClient
      .from('portal_notificacion_campanias')
      .update({ total_enviados: sentCount, total_fallidos: failedCount })
      .eq('id', campaniaId);

    return new Response(
      JSON.stringify({
        ok: true,
        campania_id: campaniaId,
        total: targets.length,
        enviados: sentCount,
        fallidos: failedCount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      }
    );
  } catch (err) {
    const status = err instanceof Error && 'status' in err ? (err as HttpError).status : 500;
    const message = err instanceof Error ? err.message : 'Error interno.';
    return new Response(JSON.stringify({ ok: false, message }), {
      status,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});
