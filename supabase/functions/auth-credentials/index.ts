import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Genera un token aleatorio para setup
function generateSetupToken() {
  return crypto.getRandomValues(new Uint8Array(32)).reduce((a, b) => a + b.toString(16).padStart(2, '0'), '')
}

// Valida y hashea contraseña
async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error('Contraseña debe tener al menos 8 caracteres')
  }
  return await bcrypt.hash(password)
}

// Verifica contraseña
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash)
}

// Headers CORS para permitir requests desde el frontend
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-api-key',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
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
    // === setup-init: Inicia el setup: documento -> genera token -> envía email ===
    if (method === 'setup-init') {
      const { document_number, email } = body

      if (!document_number || !email) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Documento y correo requeridos' }),
          { status: 400, headers: corsHeaders }
        )
      }

      // 1. Buscar beneficiario por documento
      const { data: beneficiario, error: benefErr } = await supabase
        .from('portal_beneficiarios')
        .select('id, nombre_completo, email')
        .eq('n_documento', document_number.trim())
        .maybeSingle()

      if (benefErr || !beneficiario) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Documento no encontrado en el sistema' }),
          { status: 404, headers: corsHeaders }
        )
      }

      // 2. Crear o actualizar registro en portal_auth_credentials
      const setupToken = generateSetupToken()
      const setupExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h

      const { data: cred, error: credErr } = await supabase
        .from('portal_auth_credentials')
        .upsert({
          beneficiario_id: beneficiario.id,
          document_number: document_number.trim(),
          email_verified: email,
          setup_token: setupToken,
          setup_token_expires_at: setupExpiresAt,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'beneficiario_id' })
        .select()
        .single()

      if (credErr) {
        console.error('Error upserting credentials:', credErr)
        return new Response(
          JSON.stringify({ ok: false, error: 'Error al procesar solicitud' }),
          { status: 500, headers: corsHeaders }
        )
      }

      // 3. TODO: Enviar email con link de setup
      // Por ahora solo retornamos el token (en producción sería por email)
      console.log(`Setup token for ${beneficiario.nombre_completo}: ${setupToken}`)

      return new Response(
        JSON.stringify({
          ok: true,
          message: 'Token de setup generado. Revisa tu correo.',
          setup_token: setupToken,
          beneficiario: {
            id: beneficiario.id,
            nombre_completo: beneficiario.nombre_completo,
            email: beneficiario.email,
          },
        }),
        { status: 200, headers: corsHeaders }
      )
    }

    // === setup-complete: Completa setup: setup_token + password -> crea usuario en auth ===
    if (method === 'setup-complete') {
      const { setup_token, password, password_confirm } = body

      console.log('🔍 DEBUG setup-complete:', {
        has_token: !!setup_token,
        token_length: setup_token?.length,
        has_password: !!password,
        has_password_confirm: !!password_confirm,
      })

      if (!setup_token || !password || !password_confirm) {
        console.error('❌ Faltan campos requeridos')
        return new Response(
          JSON.stringify({ ok: false, error: 'Token, contraseña y confirmación requeridos' }),
          { status: 400, headers: corsHeaders }
        )
      }

      if (password !== password_confirm) {
        console.error('❌ Contraseñas no coinciden')
        return new Response(
          JSON.stringify({ ok: false, error: 'Las contraseñas no coinciden' }),
          { status: 400, headers: corsHeaders }
        )
      }

      // 1. Validar token de setup
      console.log('🔍 Buscando token en BD:', setup_token.substring(0, 10) + '...')
      const { data: cred, error: credErr } = await supabase
        .from('portal_auth_credentials')
        .select('id, beneficiario_id, email_verified, setup_token_expires_at, document_number')
        .eq('setup_token', setup_token)
        .gt('setup_token_expires_at', new Date().toISOString())
        .maybeSingle()

      console.log('🔍 Resultado búsqueda token:', { found: !!cred, error: credErr?.message })

      if (credErr || !cred) {
        console.error('❌ Token inválido o expirado')
        return new Response(
          JSON.stringify({ ok: false, error: 'Token inválido o expirado' }),
          { status: 401, headers: corsHeaders }
        )
      }

      // 2. Hash contraseña
      let passwordHash: string
      try {
        console.log('🔍 Hasheando contraseña...')
        passwordHash = await hashPassword(password)
        console.log('✅ Contraseña hasheada exitosamente')
      } catch (err) {
        console.error('❌ Error hasheando contraseña:', err.message)
        return new Response(
          JSON.stringify({ ok: false, error: err.message }),
          { status: 400, headers: corsHeaders }
        )
      }

      // 3. Actualizar credenciales
      const { error: updateErr } = await supabase
        .from('portal_auth_credentials')
        .update({
          password_hash: passwordHash,
          setup_completed_at: new Date().toISOString(),
          setup_token: null,
          setup_token_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cred.id)

      if (updateErr) {
        console.error('Error updating credentials:', updateErr)
        return new Response(
          JSON.stringify({ ok: false, error: 'Error al guardar contraseña' }),
          { status: 500, headers: corsHeaders }
        )
      }

      return new Response(
        JSON.stringify({
          ok: true,
          message: 'Contraseña establecida exitosamente. Ya puedes iniciar sesión.',
        }),
        { status: 200, headers: corsHeaders }
      )
    }

    // === login: Login por documento + contraseña ===
    if (method === 'login') {
      const { document_number, password } = body

      if (!document_number || !password) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Documento y contraseña requeridos' }),
          { status: 400, headers: corsHeaders }
        )
      }

      // 1. Buscar credenciales
      const { data: cred, error: credErr } = await supabase
        .from('portal_auth_credentials')
        .select('id, beneficiario_id, password_hash, failed_login_attempts, locked_until')
        .eq('document_number', document_number.trim())
        .maybeSingle()

      if (credErr || !cred) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Documento o contraseña incorrectos' }),
          { status: 401, headers: corsHeaders }
        )
      }

      // 2. Verificar bloqueo temporal
      if (cred.locked_until && new Date(cred.locked_until) > new Date()) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Cuenta bloqueada temporalmente. Intenta más tarde.' }),
          { status: 429, headers: corsHeaders }
        )
      }

      // 3. Verificar contraseña
      if (!cred.password_hash || !(await verifyPassword(password, cred.password_hash))) {
        // Registrar intento fallido
        const newAttempts = (cred.failed_login_attempts || 0) + 1
        const shouldLock = newAttempts >= 5
        const lockUntil = shouldLock ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null

        await supabase
          .from('portal_auth_credentials')
          .update({
            failed_login_attempts: newAttempts,
            locked_until: lockUntil,
            updated_at: new Date().toISOString(),
          })
          .eq('id', cred.id)

        return new Response(
          JSON.stringify({
            ok: false,
            error: shouldLock
              ? 'Demasiados intentos fallidos. Intenta en 15 minutos.'
              : 'Documento o contraseña incorrectos',
          }),
          { status: 401, headers: corsHeaders }
        )
      }

      // 4. Resetear intentos fallidos
      await supabase
        .from('portal_auth_credentials')
        .update({
          failed_login_attempts: 0,
          locked_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cred.id)

      // 5. TODO: Crear sesión en auth o retornar token
      return new Response(
        JSON.stringify({
          ok: true,
          message: 'Login exitoso',
          beneficiario_id: cred.beneficiario_id,
        }),
        { status: 200, headers: corsHeaders }
      )
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
