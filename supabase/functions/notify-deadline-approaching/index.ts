// @ts-nocheck
// Edge Function: notify-deadline-approaching
// Envía recordatorios a beneficiarios cuando falta 1 semana para el cierre de ventana de actualización
// Esta función puede ejecutarse vía cron job para envío automático

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
      throw new HttpError('Configuración incompleta de Supabase o Resend.', 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const ventanaId = body?.ventana_id ? Number(body.ventana_id) : null;
    const daysThreshold = body?.days_threshold || 7; // Recordar 7 días antes por defecto

    // Obtener ventana activa si no se especifica
    let ventana = null;
    if (ventanaId) {
      const { data } = await adminClient
        .from('portal_ventanas_actualizacion')
        .select('id,nombre,fecha_fin,is_active')
        .eq('id', ventanaId)
        .maybeSingle();
      ventana = data;
    } else {
      const { data } = await adminClient
        .from('portal_ventanas_actualizacion')
        .select('id,nombre,fecha_fin,is_active')
        .eq('is_active', true)
        .maybeSingle();
      ventana = data;
    }

    if (!ventana) {
      return new Response(
        JSON.stringify({ ok: false, message: 'No hay ventana activa.', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // Calcular si está en rango de dias_threshold
    const now = new Date();
    const fechaFin = new Date(ventana.fecha_fin);
    const diferenciaDias = Math.ceil((fechaFin.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diferenciaDias > daysThreshold || diferenciaDias <= 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          message: `No enviar recordatorio. Faltan ${diferenciaDias} días (threshold: ${daysThreshold}).`,
          sent: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // Buscar beneficiarios ACTIVOS que NO tienen actualización en esta ventana
    const { data: withoutUpdates, error: queryError } = await adminClient.rpc(
      'get_beneficiarios_sin_actualizar',
      { p_ventana_id: ventana.id }
    );

    if (queryError) {
      console.error('RPC error:', queryError);
      // Fallback: query manual
      const { data: beneficiarios } = await adminClient
        .from('portal_beneficiarios')
        .select('id,nombre_completo,email,estado_beneficiario')
        .eq('estado_beneficiario', 'activo');

      const { data: updates } = await adminClient
        .from('portal_actualizaciones')
        .select('beneficiario_id')
        .eq('ventana_id', ventana.id);

      const updatesBenID = new Set((updates || []).map(u => u.beneficiario_id));
      const sinActualizar = (beneficiarios || []).filter(b => !updatesBenID.has(b.id));

      return await sendDeadlineNotifications(
        sinActualizar,
        ventana,
        diferenciaDias,
        adminClient,
        resendApiKey,
        fromEmail,
        corsHeaders
      );
    }

    return await sendDeadlineNotifications(
      withoutUpdates || [],
      ventana,
      diferenciaDias,
      adminClient,
      resendApiKey,
      fromEmail,
      corsHeaders
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

async function sendDeadlineNotifications(
  beneficiarios: any[],
  ventana: any,
  diasRestantes: number,
  adminClient: any,
  resendApiKey: string,
  fromEmail: string,
  corsHeaders: Record<string, string>
) {
  let sentCount = 0;
  const errors: string[] = [];
  const year = new Date().getFullYear();

  for (const beneficiario of beneficiarios) {
    if (!beneficiario.email || !isValidEmail(beneficiario.email)) continue;

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
    .alert-box {
      background-color: #fff3cd; border-left: 4px solid #ffc107;
      padding: 16px; border-radius: 6px; margin: 20px 0;
    }
    .countdown {
      font-size: 24px; font-weight: bold; color: #dc3545; text-align: center;
      margin: 15px 0;
    }
    .button {
      background-color: #dc3545; color: #FFFFFF; text-decoration: none;
      padding: 12px 25px; border-radius: 8px; font-weight: bold;
      display: inline-block; margin-top: 10px;
    }
    .footer { margin-top: 30px; font-size: 0.8rem; color: #6c757d; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img class="logo" src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logo-focades-alcadia.png" alt="Logo FOCADES">
      <h2 style="color: #0D2C54; margin: 10px 0;">⏰ Recordatorio de Plazo</h2>
    </div>

    <p>Hola <strong>${beneficiario.nombre_completo || 'Beneficiario'}</strong>,</p>

    <div class="alert-box">
      <p style="margin: 0 0 10px 0; font-weight: bold;">
        Se acerca el cierre de la ventana de actualización: <strong>${ventana.nombre}</strong>
      </p>
      <div class="countdown">
        ⏳ ${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'} restantes
      </div>
      <p style="margin: 10px 0 0 0; font-size: 13px; color: #666;">
        La ventana cierra el <strong>${new Date(ventana.fecha_fin).toLocaleDateString('es-CO', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}</strong> a las 11:59 PM.
      </p>
    </div>

    <p style="margin-top: 20px; color: #666; line-height: 1.6;">
      <strong>¿Qué debes hacer?</strong>
    </p>
    <ul style="color: #666; line-height: 1.8;">
      <li>Ingresa al portal de beneficiarios</li>
      <li>Accede a la sección "Actualización Semestral"</li>
      <li>Carga los tres documentos requeridos:
        <ul>
          <li>Certificado Bancario (PDF)</li>
          <li>Certificado de Notas (PDF)</li>
          <li>Certificado de Matrícula (PDF)</li>
        </ul>
      </li>
      <li>Verifica tus datos e información bancaria</li>
      <li>Envía tu actualización</li>
    </ul>

    <p style="margin-top: 20px; text-align: center;">
      <a href="${process.env.VITE_APP_URL || 'https://app.focades.info'}/beneficiario/actualizacion" class="button">
        Enviar mi actualización ahora
      </a>
    </p>

    <p style="margin-top: 30px; color: #666; font-size: 13px;">
      <strong>Nota:</strong> Si ya enviaste tu actualización en la ventana actual, puedes ignorar este mensaje.
      La revisión administrativa puede tomar varios días.
    </p>

    <p class="footer">
      Este es un mensaje automático. Por favor, no respondas a este correo.<br>
      © ${year} Alcaldía de Montelíbano - Secretaría de Educación | FOCADES
    </p>
  </div>
</body>
</html>`;

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [beneficiario.email],
          subject: `⏰ FOCADES | Plazo próximo para actualización: ${ventana.nombre}`,
          html,
        }),
      });

      if (response.ok) {
        sentCount++;

        // Guardar notificación en DB
        try {
          await adminClient
            .from('portal_notificaciones_beneficiarios')
            .insert({
              beneficiario_id: beneficiario.id,
              tipo: 'plazo_próximo',
              titulo: `⏰ Plazo próximo: ${ventana.nombre}`,
              descripcion: `Te quedan ${diasRestantes} días para enviar tu actualización. Cierre: ${new Date(ventana.fecha_fin).toLocaleDateString('es-CO')}`,
              contexto: {
                ventana_id: ventana.id,
                ventana_nombre: ventana.nombre,
                dias_restantes: diasRestantes,
                fecha_cierre: ventana.fecha_fin,
              },
            });
        } catch (dbErr) {
          console.error('Error al guardar notificación en DB:', dbErr?.message);
        }
      } else {
        errors.push(`${beneficiario.email}: ${response.statusText}`);
      }
    } catch (err) {
      errors.push(`${beneficiario.email}: ${err?.message || 'Error desconocido'}`);
    }
  }

  const message =
    sentCount > 0
      ? `Se enviaron ${sentCount} recordatorio(s) de plazo.`
      : 'No se envió ningún recordatorio.';

  return new Response(JSON.stringify({ ok: true, message, sent: sentCount, errors }), {
    status: 200,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
