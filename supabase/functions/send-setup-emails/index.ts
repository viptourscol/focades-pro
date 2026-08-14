import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const resendApiKey = Deno.env.get('RESEND_API_KEY')

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, x-auth-token, apikey, x-api-key',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
}

/**
 * Edge Function: send-setup-emails
 * 
 * Envía emails de activación de cuenta a beneficiarios
 * Integrado con Resend para envío masivo confiable
 * 
 * Body esperado:
 * {
 *   "method": "send-setup-email" | "send-batch" | "resend-email",
 *   "beneficiario_id": "uuid" (para send-setup-email),
 *   "batch_ids": ["uuid", "uuid"] (para send-batch),
 *   "email": "user@example.com" (para resend-email)
 * }
 */

// Envía email individual de setup con Resend
async function sendSetupEmail(beneficiarioId: string, beneficiarioData: any, setupToken: string) {
  if (!resendApiKey) {
    console.warn('⚠️ RESEND_API_KEY no configurada - no se enviará email')
    return { ok: true, message: 'Email no enviado (Resend no configurado)' }
  }

  if (!beneficiarioData?.email) {
    console.error('❌ Email vacío para beneficiario:', beneficiarioId)
    return { ok: false, error: 'Email del beneficiario vacío' }
  }

  const setupLink = `https://focades-pro.vercel.app/beneficiario/auth-setup?token=${setupToken}`
  
  const emailHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activa tu Cuenta - Portal FOCADES</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #0D2C54 0%, #081e3a 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .body { background: #f5f7fa; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #1A5A96; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
    .button:hover { background: #0D2C54; }
    .info-box { background: #e3f2fd; border-left: 4px solid #1A5A96; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .footer { font-size: 12px; color: #666; text-align: center; margin-top: 30px; }
    .step { margin: 15px 0; padding: 10px; background: white; border-left: 3px solid #F9A03F; }
    .step-number { display: inline-block; background: #F9A03F; color: #0D2C54; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; margin-right: 10px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Activa tu Cuenta</h1>
      <p>Portal de Beneficiarios FOCADES</p>
    </div>
    
    <div class="body">
      <p>¡Hola <strong>${beneficiarioData.nombre_completo || 'Beneficiario'}</strong>!</p>
      
      <p>Bienvenido al Portal de Beneficiarios FOCADES. Tu cuenta ha sido creada y está lista para activarse.</p>
      
      <div class="info-box">
        <strong>⏰ Importante:</strong> Este link expira en <strong>24 horas</strong>. Actívalo cuanto antes.
      </div>
      
      <p style="text-align: center;">
        <a href="${setupLink}" class="button">→ ACTIVAR MI CUENTA AHORA</a>
      </p>
      
      <h3>¿Qué viene después?</h3>
      
      <div class="step">
        <span class="step-number">1</span>
        <strong>Verifica tu documento</strong>
        <p>Ingresa tu número de documento y correo electrónico</p>
      </div>
      
      <div class="step">
        <span class="step-number">2</span>
        <strong>Crea tu contraseña</strong>
        <p>Establecerá una contraseña segura (mínimo 8 caracteres)</p>
      </div>
      
      <div class="step">
        <span class="step-number">3</span>
        <strong>Completa tu perfil</strong>
        <p>Datos personales, académicos y bancarios (importante para pagos)</p>
      </div>
      
      <div class="info-box">
        <strong>💡 Consejo:</strong> Proceso rápido (10 minutos). Tendrás acceso inmediato al portal.
      </div>
      
      <h3>¿Necesitas ayuda?</h3>
      <p>
        📧 Email: <strong>notificaciones@focades.info</strong><br>
        📞 Teléfono: <strong>+57 300 000 0000</strong><br>
        🕐 Horario: Lunes a Viernes, 8:00 AM - 5:00 PM
      </p>
      
      <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
      
      <p style="font-size: 13px; color: #666;">
        ℹ️ <strong>Información de seguridad:</strong><br>
        Este es un email automático de FOCADES. No responda a este mensaje.<br>
        Si no solicitaste esta cuenta, por favor contacta a soporte.
      </p>
    </div>
  </div>
  
  <div class="footer">
    <p>&copy; 2026 FOCADES. Todos los derechos reservados.</p>
  </div>
</body>
</html>
  `.trim()

  try {
    console.log(`📧 Enviando email a: ${beneficiarioData.email}`)
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Notificaciones FOCADES <notificaciones@focades.info>',
        to: beneficiarioData.email,
        subject: '🔐 Activa tu Acceso - Portal FOCADES',
        html: emailHtml,
        reply_to: 'notificaciones@focades.info',
      }),
    })

    console.log(`Resend response status: ${response.status}`)

    if (!response.ok) {
      const errorData = await response.json()
      console.error('❌ Resend error:', errorData)
      
      // Intentar registrar error (pero no fallar si falla)
      try {
        await supabase
          .from('portal_beneficiarios_email_log')
          .insert({
            beneficiario_id: beneficiarioId,
            email_type: 'setup-activation',
            recipient_email: beneficiarioData.email,
            status: 'failed',
            error_message: `Resend API error: ${errorData.message || JSON.stringify(errorData)}`,
          })
      } catch (logError) {
        console.warn('⚠️ No se pudo registrar error en BD:', logError)
      }
      
      return { ok: false, error: `Email no enviado: ${response.status}` }
    }

    const result = await response.json()
    console.log(`✅ Email enviado exitosamente. ID: ${result.id}`)

    // Intentar registrar envío exitoso (pero no fallar si falla)
    try {
      await supabase
        .from('portal_beneficiarios_email_log')
        .insert({
          beneficiario_id: beneficiarioId,
          email_type: 'setup-activation',
          recipient_email: beneficiarioData.email,
          status: 'sent',
          sendgrid_message_id: result.id,
          sent_at: new Date().toISOString(),
        })
    } catch (logError) {
      console.warn('⚠️ No se pudo registrar envío en BD:', logError)
    }

    return { ok: true, message: 'Email enviado exitosamente', email_id: result.id }
  } catch (error) {
    console.error('❌ Error enviando email:', error)
    
    // Intentar registrar error (pero no fallar si falla)
    try {
      await supabase
        .from('portal_beneficiarios_email_log')
        .insert({
          beneficiario_id: beneficiarioId,
          email_type: 'setup-activation',
          recipient_email: beneficiarioData.email,
          status: 'failed',
          error_message: error instanceof Error ? error.message : String(error),
        })
    } catch (logError) {
      console.warn('⚠️ No se pudo registrar error en BD:', logError)
    }
    
    return { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' }
  }
}

// Envía emails en lote
async function sendBatchEmails(beneficiarioIds: string[]) {
  const results = []

  for (const id of beneficiarioIds) {
    // Obtener datos del beneficiario
    const { data: benef, error: benefError } = await supabase
      .from('portal_beneficiarios')
      .select('id, nombre_completo, email')
      .eq('id', id)
      .single()

    if (benefError || !benef) {
      results.push({ beneficiario_id: id, ok: false, error: 'Beneficiario no encontrado' })
      continue
    }

    // Obtener token de setup
    const { data: cred, error: credError } = await supabase
      .from('portal_auth_credentials')
      .select('setup_token')
      .eq('beneficiario_id', id)
      .single()

    if (credError || !cred?.setup_token) {
      results.push({ beneficiario_id: id, ok: false, error: 'Setup token no encontrado' })
      continue
    }

    // Enviar email
    const result = await sendSetupEmail(id, benef, cred.setup_token)
    results.push({ beneficiario_id: id, ...result })

    // Pequeño delay para evitar rate limits
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return results
}

// Reenviar email a beneficiario
async function resendEmail(email: string) {
  const { data: benef, error: benefError } = await supabase
    .from('portal_beneficiarios')
    .select('id, nombre_completo, email')
    .eq('email', email)
    .single()

  if (benefError || !benef) {
    return { ok: false, error: 'Beneficiario no encontrado con ese email' }
  }

  const { data: cred, error: credError } = await supabase
    .from('portal_auth_credentials')
    .select('setup_token, setup_token_expires_at')
    .eq('beneficiario_id', benef.id)
    .single()

  if (credError || !cred?.setup_token) {
    return { ok: false, error: 'No hay setup token activo' }
  }

  // Verificar que no esté expirado
  if (new Date(cred.setup_token_expires_at) < new Date()) {
    return { ok: false, error: 'Setup token expirado. Genera uno nuevo.' }
  }

  return await sendSetupEmail(benef.id, benef, cred.setup_token)
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Solo POST permitido' }), {
      status: 405,
      headers: corsHeaders,
    })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Body JSON inválido' }), {
      status: 400,
      headers: corsHeaders,
    })
  }

  const method = body.method

  try {
    // === send-setup-email: Envía email individual ===
    if (method === 'send-setup-email') {
      const { beneficiario_id, email, nombre_completo } = body

      if (!beneficiario_id) {
        return new Response(
          JSON.stringify({ ok: false, error: 'beneficiario_id requerido' }),
          { status: 400, headers: corsHeaders }
        )
      }

      console.log(`📨 Procesando email para beneficiario ${beneficiario_id}`)

      let benef = { id: beneficiario_id, email, nombre_completo }
      
      // Si no se pasó email/nombre, intenta obtenerlo de la BD
      if (!email || !nombre_completo) {
        console.log('📖 Buscando datos del beneficiario en BD...')
        try {
          const { data: dbBenef, error: benefError } = await supabase
            .from('portal_beneficiarios')
            .select('id, nombre_completo, email')
            .eq('id', beneficiario_id)
            .single()

          if (benefError) {
            console.error('Error buscando beneficiario:', benefError)
            return new Response(
              JSON.stringify({ ok: false, error: `Beneficiario no encontrado: ${benefError.message}` }),
              { status: 404, headers: corsHeaders }
            )
          }
          
          if (!dbBenef) {
            return new Response(
              JSON.stringify({ ok: false, error: 'Beneficiario no encontrado en BD' }),
              { status: 404, headers: corsHeaders }
            )
          }
          
          benef = dbBenef
        } catch (queryError) {
          console.error('❌ Error en query beneficiario:', queryError)
          // Si la query falla pero tenemos al menos el ID, continuamos
          if (!email) {
            return new Response(
              JSON.stringify({ ok: false, error: 'No se puede obtener datos del beneficiario' }),
              { status: 400, headers: corsHeaders }
            )
          }
        }
      }

      console.log(`📧 Enviando email a: ${benef.email}`)

      // Obtener setup token
      let setupToken = null
      try {
        const { data: cred, error: credError } = await supabase
          .from('portal_auth_credentials')
          .select('setup_token')
          .eq('beneficiario_id', beneficiario_id)
          .single()

        if (credError) {
          console.error('Error obteniendo token:', credError)
          return new Response(
            JSON.stringify({ ok: false, error: `Setup token no encontrado: ${credError.message}` }),
            { status: 404, headers: corsHeaders }
          )
        }

        setupToken = cred?.setup_token
      } catch (queryError) {
        console.error('❌ Error en query token:', queryError)
        return new Response(
          JSON.stringify({ ok: false, error: 'No se puede obtener el token' }),
          { status: 400, headers: corsHeaders }
        )
      }

      if (!setupToken) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Setup token vacío' }),
          { status: 404, headers: corsHeaders }
        )
      }

      const result = await sendSetupEmail(beneficiario_id, benef, setupToken)
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 500,
        headers: corsHeaders,
      })
    }

    // === send-batch: Envía emails en lote ===
    if (method === 'send-batch') {
      const { batch_ids } = body

      if (!batch_ids || !Array.isArray(batch_ids)) {
        return new Response(
          JSON.stringify({ ok: false, error: 'batch_ids debe ser un array' }),
          { status: 400, headers: corsHeaders }
        )
      }

      const results = await sendBatchEmails(batch_ids)
      const successCount = results.filter(r => r.ok).length

      return new Response(
        JSON.stringify({
          ok: true,
          message: `${successCount}/${results.length} emails enviados`,
          results,
        }),
        { status: 200, headers: corsHeaders }
      )
    }

    // === resend-email: Reenvía email a beneficiario ===
    if (method === 'resend-email') {
      const { email } = body

      if (!email) {
        return new Response(
          JSON.stringify({ ok: false, error: 'email requerido' }),
          { status: 400, headers: corsHeaders }
        )
      }

      const result = await resendEmail(email)
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 400,
        headers: corsHeaders,
      })
    }

    // Método desconocido
    return new Response(
      JSON.stringify({ ok: false, error: `Método desconocido: ${method}` }),
      { status: 400, headers: corsHeaders }
    )
  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ ok: false, error: 'Error interno del servidor' }),
      { status: 500, headers: corsHeaders }
    )
  }
})
