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
</head>
<body style="font-family: Arial, sans-serif; background:#f4f4f4; margin:0; padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          
          <!-- Header con logo -->
          <tr>
            <td style="background:#1e3a5f; padding:32px; text-align:center;">
              <img src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logo-focades-alcadia.png" 
                   alt="Logo FOCADES" 
                   style="max-width:200px; height:auto; margin:0 auto 16px auto; display:block;" />
              <h1 style="color:#ffffff; margin:0; font-size:22px;">FOCADES</h1>
              <p style="color:#a8c4e0; margin:8px 0 0 0; font-size:13px;">Portal de Beneficiarios</p>
            </td>
          </tr>
          
          <!-- Cuerpo del mensaje -->
          <tr>
            <td style="padding:36px;">
              <h2 style="color:#1e3a5f; margin:0 0 16px 0;">¡Hola, ${beneficiarioData.nombre_completo || 'Beneficiario'}!</h2>
              <p style="color:#444; line-height:1.7; margin:0 0 16px 0;">
                Bienvenido al <strong>Portal de Beneficiarios FOCADES</strong>. Tu cuenta ha sido creada exitosamente 
                y está lista para activarse.
              </p>
              
              <!-- Aviso importante -->
              <div style="background:#fff3cd; border-left:4px solid #f9a03f; padding:16px; border-radius:6px; margin:0 0 24px 0;">
                <p style="margin:0; color:#856404; font-size:14px;">
                  <strong>▸ Importante:</strong> Este link de activación expira en <strong>24 horas</strong>. 
                  Te recomendamos completar el proceso cuanto antes.
                </p>
              </div>
              
              <!-- Botón de activación -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td align="center">
                    <a href="${setupLink}" 
                       style="display:inline-block; background:#1e3a5f; color:#ffffff; text-decoration:none; padding:14px 32px; border-radius:8px; font-weight:bold; font-size:15px;">
                      → Activar mi cuenta ahora
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="color:#666; font-size:13px; text-align:center; margin:0 0 32px 0;">
                O copia este enlace en tu navegador:<br>
                <span style="color:#1e3a5f; word-break:break-all; font-size:11px;">${setupLink}</span>
              </p>
              
              <!-- Pasos siguientes -->
              <h3 style="color:#1e3a5f; margin:24px 0 16px 0; font-size:18px;">¿Qué viene después?</h3>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="background:#f8f9fa; border-left:3px solid #f9a03f; padding:16px; margin:8px 0;">
                    <p style="margin:0 0 8px 0; color:#1e3a5f; font-weight:bold;">
                      <span style="display:inline-block; background:#f9a03f; color:#ffffff; width:24px; height:24px; border-radius:50%; text-align:center; line-height:24px; margin-right:8px; font-size:13px;">1</span>
                      Verifica tu documento
                    </p>
                    <p style="margin:0; color:#666; font-size:13px; padding-left:32px;">
                      Ingresa tu número de documento y correo electrónico
                    </p>
                  </td>
                </tr>
              </table>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="background:#f8f9fa; border-left:3px solid #f9a03f; padding:16px; margin:8px 0;">
                    <p style="margin:0 0 8px 0; color:#1e3a5f; font-weight:bold;">
                      <span style="display:inline-block; background:#f9a03f; color:#ffffff; width:24px; height:24px; border-radius:50%; text-align:center; line-height:24px; margin-right:8px; font-size:13px;">2</span>
                      Crea tu contraseña
                    </p>
                    <p style="margin:0; color:#666; font-size:13px; padding-left:32px;">
                      Establece una contraseña segura (mínimo 8 caracteres)
                    </p>
                  </td>
                </tr>
              </table>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="background:#f8f9fa; border-left:3px solid #f9a03f; padding:16px; margin:8px 0;">
                    <p style="margin:0 0 8px 0; color:#1e3a5f; font-weight:bold;">
                      <span style="display:inline-block; background:#f9a03f; color:#ffffff; width:24px; height:24px; border-radius:50%; text-align:center; line-height:24px; margin-right:8px; font-size:13px;">3</span>
                      Completa tu perfil
                    </p>
                    <p style="margin:0; color:#666; font-size:13px; padding-left:32px;">
                      Datos personales, académicos y bancarios (importante para pagos)
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- Consejo -->
              <div style="background:#e8f4fd; border-left:4px solid #1e3a5f; padding:16px; border-radius:6px; margin:0 0 24px 0;">
                <p style="margin:0; color:#1e3a5f; font-size:14px;">
                  <strong>▸ Consejo:</strong> El proceso es rápido (aproximadamente 10 minutos). 
                  Una vez completado, tendrás acceso inmediato a tu portal.
                </p>
              </div>
              
              <!-- Ayuda -->
              <h3 style="color:#1e3a5f; margin:24px 0 16px 0; font-size:18px;">¿Necesitas ayuda?</h3>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 0; color:#666; font-size:14px;">
                    <strong style="color:#1e3a5f;">▸ Email:</strong> notificaciones@focades.info
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0; color:#666; font-size:14px;">
                    <strong style="color:#1e3a5f;">▸ Teléfono:</strong> +57 300 000 0000
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0; color:#666; font-size:14px;">
                    <strong style="color:#1e3a5f;">▸ Horario:</strong> Lunes a Viernes, 8:00 AM - 5:00 PM
                  </td>
                </tr>
              </table>
              
              <hr style="border:none; border-top:1px solid #e9ecef; margin:30px 0;">
              
              <!-- Nota de seguridad -->
              <p style="color:#888; font-size:12px; line-height:1.6; margin:0;">
                <strong style="color:#666;">Información de seguridad:</strong><br>
                Este es un email automático de FOCADES. No responda a este mensaje.<br>
                Si no solicitaste esta cuenta, por favor contacta a soporte.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
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
