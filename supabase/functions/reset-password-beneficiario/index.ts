import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const resendApiKey = Deno.env.get('RESEND_API_KEY')
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Genera un token aleatorio para reset de contraseña
function generateResetToken() {
  return crypto.getRandomValues(new Uint8Array(32)).reduce((a, b) => a + b.toString(16).padStart(2, '0'), '')
}

// Valida y hashea contraseña
async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres')
  }
  const saltRounds = 10
  return await bcrypt.hash(password, saltRounds)
}

// Headers CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-api-key',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
}

// Envía email de recuperación de contraseña con Resend
async function sendResetEmail(email: string, resetToken: string, nombreCompleto: string) {
  if (!resendApiKey) {
    console.warn('⚠️ RESEND_API_KEY no configurada - no se enviará email')
    return { ok: false, error: 'Servicio de correo no configurado' }
  }

  const resetLink = `https://focades-pro.vercel.app/beneficiario/reset-password?token=${resetToken}`
  
  const emailHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperación de Contraseña - Portal FOCADES</title>
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
              <h2 style="color:#1e3a5f; margin:0 0 16px 0;">Recuperación de contraseña</h2>
              <p style="color:#444; line-height:1.7; margin:0 0 16px 0;">
                Hola, <strong>${nombreCompleto}</strong>
              </p>
              <p style="color:#444; line-height:1.7; margin:0 0 16px 0;">
                Hemos recibido una solicitud para restablecer tu contraseña del <strong>Portal de Beneficiarios FOCADES</strong>.
              </p>
              
              <!-- Aviso importante -->
              <div style="background:#fff3cd; border-left:4px solid #f9a03f; padding:16px; border-radius:6px; margin:0 0 24px 0;">
                <p style="margin:0; color:#856404; font-size:14px;">
                  <strong>▸ Importante:</strong> Este link de recuperación expira en <strong>1 hora</strong>.
                </p>
              </div>
              
              <!-- Botón de recuperación -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetLink}" 
                       style="display:inline-block; background:#1e3a5f; color:#ffffff; text-decoration:none; padding:14px 32px; border-radius:8px; font-weight:bold; font-size:15px;">
                      → Restablecer mi contraseña
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="color:#666; font-size:13px; text-align:center; margin:0 0 32px 0;">
                O copia y pega este enlace en tu navegador:<br>
                <a href="${resetLink}" style="color:#1e3a5f; text-decoration:none; word-break: break-all;">${resetLink}</a>
              </p>
              
              <!-- Aviso de seguridad -->
              <div style="background:#f8f9fa; border:1px solid #dee2e6; padding:16px; border-radius:6px; margin:24px 0 0 0;">
                <p style="margin:0; color:#666; font-size:13px; line-height:1.6;">
                  <strong>⚠️ ¿No solicitaste este cambio?</strong><br>
                  Si no solicitaste restablecer tu contraseña, ignora este correo. Tu contraseña actual permanecerá sin cambios.
                  Por seguridad, considera contactar al administrador del sistema.
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fa; padding:24px; text-align:center; border-top:1px solid #e9ecef;">
              <p style="margin:0 0 8px 0; color:#6c757d; font-size:12px;">
                Este es un correo automático, por favor no respondas a este mensaje.
              </p>
              <p style="margin:0; color:#6c757d; font-size:11px;">
                &copy; ${new Date().getFullYear()} FOCADES - Alcaldía de Montería
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FOCADES Portal <noreply@focades.info>',
        to: [email],
        subject: 'Recuperación de contraseña - Portal FOCADES',
        html: emailHtml,
      }),
    })

    const responseData = await response.json()

    if (!response.ok) {
      console.error('❌ Error enviando email:', responseData)
      return { ok: false, error: responseData.message || 'Error al enviar email' }
    }

    console.log('✅ Email de recuperación enviado:', email)
    return { ok: true, emailId: responseData.id }
  } catch (error) {
    console.error('❌ Error enviando email:', error)
    return { ok: false, error: error.message }
  }
}

// Envía email informando que la cuenta no está activada
async function sendAccountNotActivatedEmail(email: string, nombreCompleto: string) {
  if (!resendApiKey) {
    console.warn('⚠️ RESEND_API_KEY no configurada - no se enviará email')
    return { ok: false, error: 'Servicio de correo no configurado' }
  }

  const activateLink = `https://focades-pro.vercel.app/beneficiario/auth-setup`
  
  const emailHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cuenta no activada - Portal FOCADES</title>
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
              <h2 style="color:#1e3a5f; margin:0 0 16px 0;">Cuenta no activada</h2>
              <p style="color:#444; line-height:1.7; margin:0 0 16px 0;">
                Hola, <strong>${nombreCompleto}</strong>
              </p>
              <p style="color:#444; line-height:1.7; margin:0 0 16px 0;">
                Intentaste recuperar tu contraseña, pero tu cuenta aún no ha sido activada.
              </p>
              
              <!-- Aviso importante -->
              <div style="background:#fff3cd; border-left:4px solid #f9a03f; padding:16px; border-radius:6px; margin:0 0 24px 0;">
                <p style="margin:0; color:#856404; font-size:14px;">
                  <strong>▸ ¿Ya recibiste tu token de activación?</strong><br>
                  Debes activar tu cuenta antes de poder iniciar sesión. Si no has recibido tu token de activación, 
                  contacta al administrador del sistema.
                </p>
              </div>
              
              <!-- Botón de activación -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td align="center">
                    <a href="${activateLink}" 
                       style="display:inline-block; background:#1e3a5f; color:#ffffff; text-decoration:none; padding:14px 32px; border-radius:8px; font-weight:bold; font-size:15px;">
                      → Activar mi cuenta
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="color:#666; font-size:13px; text-align:center; margin:0 0 32px 0;">
                Si ya activaste tu cuenta, intenta iniciar sesión directamente.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fa; padding:24px; text-align:center; border-top:1px solid #e9ecef;">
              <p style="margin:0 0 8px 0; color:#6c757d; font-size:12px;">
                Este es un correo automático, por favor no respondas a este mensaje.
              </p>
              <p style="margin:0; color:#6c757d; font-size:11px;">
                &copy; ${new Date().getFullYear()} FOCADES - Alcaldía de Montería
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FOCADES Portal <noreply@focades.info>',
        to: [email],
        subject: 'Tu cuenta aún no está activada - Portal FOCADES',
        html: emailHtml,
      }),
    })

    const responseData = await response.json()

    if (!response.ok) {
      console.error('❌ Error enviando email:', responseData)
      return { ok: false, error: responseData.message || 'Error al enviar email' }
    }

    console.log('✅ Email de cuenta no activada enviado:', email)
    return { ok: true, emailId: responseData.id }
  } catch (error) {
    console.error('❌ Error enviando email:', error)
    return { ok: false, error: error.message }
  }
}

Deno.serve(async (req) => {
  // Manejo de preflight requests (OPTIONS)
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
    // === request-reset: Solicita el reset de contraseña ===
    if (method === 'request-reset') {
      const { email } = body

      if (!email || !email.trim()) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Correo electrónico requerido' }),
          { status: 400, headers: corsHeaders }
        )
      }

      // 1. Buscar beneficiario por email
      const { data: beneficiario, error: benefErr } = await supabase
        .from('portal_beneficiarios')
        .select('id, nombre_completo, email, n_documento')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle()

      if (benefErr) {
        console.error('Error buscando beneficiario:', benefErr)
        return new Response(
          JSON.stringify({ ok: false, error: 'Error al buscar beneficiario' }),
          { status: 500, headers: corsHeaders }
        )
      }

      // Seguridad: siempre devolver éxito para no revelar si el email existe
      if (!beneficiario) {
        console.log('📧 Email no encontrado, pero devolvemos éxito por seguridad:', email)
        return new Response(
          JSON.stringify({ 
            ok: true, 
            message: 'Si el correo está registrado, recibirás un link de recuperación.' 
          }),
          { status: 200, headers: corsHeaders }
        )
      }

      // 2. Verificar que el beneficiario tenga credenciales configuradas
      const { data: cred, error: credErr } = await supabase
        .from('portal_auth_credentials')
        .select('id, password_hash')
        .eq('beneficiario_id', beneficiario.id)
        .maybeSingle()

      if (credErr) {
        console.error('Error buscando credenciales:', credErr)
        return new Response(
          JSON.stringify({ ok: false, error: 'Error al buscar credenciales' }),
          { status: 500, headers: corsHeaders }
        )
      }

      // Si no tiene credenciales o no tiene contraseña establecida, no puede recuperar
      if (!cred || !cred.password_hash) {
        console.log('📧 Beneficiario sin contraseña establecida:', email)
        
        // Enviar email explicando que debe activar su cuenta primero
        if (beneficiario.email) {
          await sendAccountNotActivatedEmail(
            beneficiario.email,
            beneficiario.nombre_completo
          )
        }
        
        return new Response(
          JSON.stringify({ 
            ok: true, 
            message: 'Si el correo está registrado, recibirás un link de recuperación.' 
          }),
          { status: 200, headers: corsHeaders }
        )
      }

      // 3. Generar token de reset
      const resetToken = generateResetToken()
      const resetExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hora

      // 4. Guardar token en base de datos
      const { error: updateErr } = await supabase
        .from('portal_auth_credentials')
        .update({
          password_reset_token: resetToken,
          password_reset_token_expires_at: resetExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cred.id)

      if (updateErr) {
        console.error('Error guardando token:', updateErr)
        return new Response(
          JSON.stringify({ ok: false, error: 'Error al generar token de recuperación' }),
          { status: 500, headers: corsHeaders }
        )
      }

      // 5. Enviar email
      console.log('✅ Enviando email de recuperación a:', beneficiario.email)
      const emailResult = await sendResetEmail(
        beneficiario.email,
        resetToken,
        beneficiario.nombre_completo
      )

      if (!emailResult.ok) {
        console.error('❌ Error enviando email de recuperación:', emailResult.error)
        // No revelamos el error específico al usuario
      } else {
        console.log('✅ Email de recuperación enviado exitosamente:', emailResult.emailId)
      }

      // Siempre devolvemos éxito por seguridad
      return new Response(
        JSON.stringify({ 
          ok: true, 
          message: 'Si el correo está registrado, recibirás un link de recuperación en tu bandeja de entrada.' 
        }),
        { status: 200, headers: corsHeaders }
      )
    }

    // === verify-reset-token: Verifica si un token es válido ===
    if (method === 'verify-reset-token') {
      const { token } = body

      if (!token || !token.trim()) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Token requerido' }),
          { status: 400, headers: corsHeaders }
        )
      }

      const { data: cred, error: credErr } = await supabase
        .from('portal_auth_credentials')
        .select('id, beneficiario_id, password_reset_token_expires_at')
        .eq('password_reset_token', token.trim())
        .maybeSingle()

      if (credErr || !cred) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Token inválido o expirado' }),
          { status: 400, headers: corsHeaders }
        )
      }

      // Verificar expiración
      const now = new Date()
      const expiresAt = new Date(cred.password_reset_token_expires_at)
      
      if (now > expiresAt) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Token expirado' }),
          { status: 400, headers: corsHeaders }
        )
      }

      return new Response(
        JSON.stringify({ ok: true, valid: true }),
        { status: 200, headers: corsHeaders }
      )
    }

    // === reset-password: Cambia la contraseña con el token ===
    if (method === 'reset-password') {
      const { token, new_password } = body

      if (!token || !token.trim()) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Token requerido' }),
          { status: 400, headers: corsHeaders }
        )
      }

      if (!new_password || new_password.length < 8) {
        return new Response(
          JSON.stringify({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' }),
          { status: 400, headers: corsHeaders }
        )
      }

      // 1. Buscar credenciales por token
      const { data: cred, error: credErr } = await supabase
        .from('portal_auth_credentials')
        .select('id, beneficiario_id, password_reset_token_expires_at')
        .eq('password_reset_token', token.trim())
        .maybeSingle()

      if (credErr || !cred) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Token inválido o expirado' }),
          { status: 400, headers: corsHeaders }
        )
      }

      // 2. Verificar expiración
      const now = new Date()
      const expiresAt = new Date(cred.password_reset_token_expires_at)
      
      if (now > expiresAt) {
        return new Response(
          JSON.stringify({ ok: false, error: 'El token ha expirado. Solicita un nuevo link de recuperación.' }),
          { status: 400, headers: corsHeaders }
        )
      }

      // 3. Hashear nueva contraseña
      const passwordHash = await hashPassword(new_password)

      // 4. Actualizar contraseña y limpiar token
      const { error: updateErr } = await supabase
        .from('portal_auth_credentials')
        .update({
          password_hash: passwordHash,
          password_reset_token: null,
          password_reset_token_expires_at: null,
          last_password_change_at: new Date().toISOString(),
          failed_login_attempts: 0,
          locked_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cred.id)

      if (updateErr) {
        console.error('Error actualizando contraseña:', updateErr)
        return new Response(
          JSON.stringify({ ok: false, error: 'Error al actualizar contraseña' }),
          { status: 500, headers: corsHeaders }
        )
      }

      console.log('✅ Contraseña restablecida exitosamente para beneficiario:', cred.beneficiario_id)

      return new Response(
        JSON.stringify({ 
          ok: true, 
          message: 'Contraseña restablecida exitosamente' 
        }),
        { status: 200, headers: corsHeaders }
      )
    }

    // Método no reconocido
    return new Response(
      JSON.stringify({ ok: false, error: `Método '${method}' no reconocido` }),
      { status: 400, headers: corsHeaders }
    )

  } catch (error) {
    console.error('❌ Error en reset-password-beneficiario:', error)
    return new Response(
      JSON.stringify({ ok: false, error: error.message || 'Error interno del servidor' }),
      { status: 500, headers: corsHeaders }
    )
  }
})
