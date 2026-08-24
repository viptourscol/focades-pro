// @ts-nocheck
// Edge Function: notify-beneficiario
// Envía un correo de confirmación al beneficiario cuando envía su actualización semestral.
// Requiere la variable de entorno RESEND_API_KEY configurada en el dashboard de Supabase.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const sanitize = (value: unknown, max = 500) =>
  String(value || '').trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'FOCADES <noreply@focades.gov.co>';

    if (!resendApiKey) {
      // No bloqueamos al cliente si no está configurado el servicio de correo
      console.warn('RESEND_API_KEY no configurada — correo de confirmación omitido.');
      return new Response(JSON.stringify({ ok: false, reason: 'email_not_configured' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const email = sanitize(body?.email, 150).toLowerCase();
    const nombre = sanitize(body?.nombre, 100) || 'Beneficiario';
    const ventanaNombre = sanitize(body?.ventana_nombre, 200) || 'Periodo vigente';
    const semestre = sanitize(body?.semestre, 10) || '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ ok: false, reason: 'invalid_email' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const semestreLabel = semestre ? ` (Semestre ${semestre})` : '';
    const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8" /></head>
<body style="font-family: Arial, sans-serif; background:#f4f4f4; margin:0; padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#1e3a5f; padding:32px; text-align:center;">
              <img src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logo-focades-alcadia.png" 
                   alt="Logo FOCADES" 
                   style="max-width:200px; height:auto; margin:0 auto 16px auto; display:block;" />
              <h1 style="color:#ffffff; margin:0; font-size:22px;">FOCADES</h1>
              <p style="color:#a8c4e0; margin:8px 0 0 0; font-size:13px;">Fondo de Apoyo a la Educación Superior</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px;">
              <h2 style="color:#1e3a5f; margin:0 0 16px 0;">¡Actualización recibida, ${nombre}!</h2>
              <p style="color:#444; line-height:1.7; margin:0 0 16px 0;">
                Hemos recibido correctamente tu <strong>actualización semestral</strong> correspondiente al periodo
                <strong>${ventanaNombre}${semestreLabel}</strong>.
              </p>
              <div style="background:#f0f7ff; border-left:4px solid #1e3a5f; padding:16px; border-radius:6px; margin:0 0 24px 0;">
                <p style="margin:0; color:#1e3a5f; font-size:14px;">
                  Tu actualización está en <strong>revisión administrativa</strong>. Recibirás una respuesta
                  cuando el equipo de FOCADES haya validado los documentos enviados.
                </p>
              </div>
              <p style="color:#666; font-size:13px; line-height:1.6; margin:0 0 8px 0;">
                Puedes consultar el estado de tus envíos en cualquier momento ingresando a tu portal de beneficiarios
                y revisando la sección <strong>Historial</strong>.
              </p>
              <p style="color:#888; font-size:12px; margin:24px 0 0 0;">
                Si no realizaste este envío, contáctanos de inmediato respondiendo este correo.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8f9fa; padding:20px; text-align:center; border-top:1px solid #e9ecef;">
              <p style="color:#999; font-size:12px; margin:0;">
                © ${new Date().getFullYear()} Alcaldía de Montelíbano — Secretaría de Educación
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: `✅ FOCADES — Actualización semestral recibida: ${ventanaNombre}${semestreLabel}`,
        html: htmlBody,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text().catch(() => 'unknown');
      console.error('Resend error:', resendResponse.status, errText);
      return new Response(JSON.stringify({ ok: false, reason: 'resend_error', detail: errText }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendData = await resendResponse.json().catch(() => ({}));
    return new Response(JSON.stringify({ ok: true, id: resendData?.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('notify-beneficiario error:', err);
    return new Response(JSON.stringify({ ok: false, reason: 'internal_error' }), {
      status: 200, // siempre 200 para no bloquear al cliente
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
