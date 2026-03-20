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

const DOC_LABELS: Record<string, string> = {
  certificado_bancario: 'Certificado Bancario',
  certificado_notas: 'Certificado de Notas',
  certificado_matricula: 'Certificado de Matrícula',
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
    
    // Nuevos parámetros para mejorar notificaciones
    const beneficiarioId = body?.beneficiario_id ? Number(body.beneficiario_id) : null;
    const actualizacionId = body?.actualizacion_id ? Number(body.actualizacion_id) : null;
    const documentosFaltantes = Array.isArray(body?.documentos_faltantes) ? body.documentos_faltantes : [];
    const montoElegible = body?.monto_elegible ? Number(body.monto_elegible) : null;
    const plazoReenvio = sanitize(body?.plazo_reenvio, 20); // Ej: "7 días"
    const proximaPago = sanitize(body?.proxima_fecha_pago, 20); // Ej: "15 de abril"

    if (!email || !isValidEmail(email)) {
      throw new HttpError('Correo inválido para notificación.', 400);
    }

    const badgeClass = statusClass(estado);
    const year = new Date().getFullYear();

    // Generar sección de documentos según el estado
    let seccionDocumentos = '';
    if (documentosFaltantes && documentosFaltantes.length > 0) {
      const docsList = documentosFaltantes
        .map(doc => `<li style="margin-bottom:8px;">${DOC_LABELS[doc] || doc}</li>`)
        .join('');
      seccionDocumentos = `
        <div style="background:#ffe6e6; border-left:4px solid #dc3545; padding:16px; border-radius:6px; margin:20px 0;">
          <p style="margin:0 0 10px 0; color:#721c24; font-weight:bold;">⚠️ Documentos faltantes:</p>
          <ul style="margin:0; padding-left:20px; color:#721c24;">
            ${docsList}
          </ul>
          <p style="margin:10px 0 0 0; font-size:12px; color:#721c24;">
            ${plazoReenvio ? `Plazo para reenviar: <strong>${plazoReenvio}</strong>` : 'Por favor, actualiza lo antes posible.'}
          </p>
        </div>
      `;
    }

    // Sección de monto elegible si aplica
    let seccionMonto = '';
    if (montoElegible && estado.toLowerCase().includes('aprob')) {
      seccionMonto = `
        <div style="background:#e6f7ff; border-left:4px solid #1e3a5f; padding:16px; border-radius:6px; margin:20px 0;">
          <p style="margin:0 0 10px 0; color:#0d2c54; font-weight:bold;">✓ Derecho de pago confirmado:</p>
          <p style="margin:0; font-size:18px; font-weight:bold; color:#0d6efd;">
            $${new Intl.NumberFormat('es-CO').format(montoElegible)}
          </p>
          ${proximaPago ? `
            <p style="margin:10px 0 0 0; font-size:12px; color:#0d2c54;">
              Próximo desembolso: <strong>${proximaPago}</strong>
            </p>
          ` : ''}
        </div>
      `;
    }

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
    h2 { color: #0D2C54; margin:10px 0; }
    .status-badge {
        display: inline-block; padding: 8px 16px; border-radius: 20px;
        font-weight: bold; color: white; font-size:14px;
    }
    .status-Resuelto { background-color: #198754; }
    .status-ConObservaciones { background-color: #dc3545; }
    .status-Asignado { background-color: #0d6efd; }
    .note {
        background-color: #fff3cd; border-left: 4px solid #ffc107;
        padding: 15px; margin-top: 20px; font-size: 0.95rem; border-radius:6px;
    }
    .button-container { text-align: center; margin-top: 30px; }
    .button {
      background-color: #F9A03F; color: #FFFFFF; text-decoration: none;
      padding: 12px 25px; border-radius: 8px; font-weight: bold;
      display: inline-block;
    }
    .button:hover { opacity: 0.9; }
    .footer { margin-top: 30px; font-size: 0.8rem; color: #6c757d; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
        <img class="logo" src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logo-focades-alcadia.png" alt="Logo FOCADES">
        <h2>Actualización de tu Beneficio</h2>
    </div>

    <p>Hola <strong>${nombreEstudiante}</strong>,</p>
    <p>Te informamos que tu actualización semestral ha sido procesada. Aquí están los detalles:</p>

    <div style="text-align: center; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; color: #666; font-size: 12px;">Estado de la actualización</p>
      <span class="status-badge ${badgeClass}">${estado}</span>
      <p style="margin: 10px 0 0 0; color: #666; font-size: 12px;">
        Referencia: <strong>${numeroPeticion}</strong>
      </p>
    </div>

    ${seccionMonto}
    ${seccionDocumentos}

    ${nota ? `
      <div class="note">
          <strong>💬 Nota del revisor:</strong>
          <p style="margin-top: 5px; margin-bottom: 0;">${nota}</p>
      </div>
    ` : ''}

    <p style="margin-top: 20px; color: #666; font-size: 14px;">
      ${estado.toLowerCase().includes('rechaz') 
        ? 'Tu actualización fue rechazada. Por favor revisa los documentos faltantes o las observaciones anteriores y reenvia en el plazo indicado.'
        : estado.toLowerCase().includes('aprob')
        ? '¡Tu actualización fue aprobada! Mantente atento a los próximos pasos y confirmaciones de pago.'
        : 'Tu actualización está en proceso de revisión. Te notificaremos cuando haya cambios.'}
    </p>

    <div class="button-container">
      <a href="${portalUrl}/beneficiario/historial" target="_blank" class="button">Ver detalles en el portal</a>
    </div>

    <p class="footer">
      Este es un mensaje automático. Por favor, no respondas a este correo.<br>
      © ${year} Alcaldía de Montelíbano - Secretaría de Educación | FOCADES
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

    // 🔔 Guardar notificación en base de datos si los parámetros están disponibles
    if (beneficiarioId && adminClient) {
      try {
        const tipoNotif = estado.toLowerCase().includes('rechaz') 
          ? 'actualización_rechazada'
          : estado.toLowerCase().includes('aprob')
          ? 'actualización_aprobada'
          : 'actualización_confirmada';

        await adminClient
          .from('portal_notificaciones_beneficiarios')
          .insert({
            beneficiario_id: beneficiarioId,
            tipo: tipoNotif,
            titulo: `Tu actualización fue ${estado.toLowerCase()}`,
            descripcion: nota || `Estado actual: ${estado}`,
            estado_actualizacion_id: actualizacionId || null,
            contexto: {
              numero_peticion: numeroPeticion,
              estado,
              documentos_faltantes: documentosFaltantes,
              monto_elegible: montoElegible,
              plazo_reenvio: plazoReenvio,
              proxima_fecha_pago: proximaPago,
            },
          });
      } catch (dbErr) {
        // No es crítico si falla el registro en DB, el correo ya se envió
        console.error('Error al guardar notificación en DB:', dbErr?.message);
      }
    }

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
