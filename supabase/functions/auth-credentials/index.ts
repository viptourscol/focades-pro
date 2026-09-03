import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Genera un token aleatorio para setup
function generateSetupToken() {
  return crypto.getRandomValues(new Uint8Array(32)).reduce((a, b) => a + b.toString(16).padStart(2, '0'), '')
}

// Hash basado en webcrypto (compatible con Deno) - SINCRONIZADO CON reset-password-beneficiario
async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error('Contraseña debe tener al menos 8 caracteres')
  }
  
  try {
    // Generar salt aleatorio
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const saltHex = Array.from(salt)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    
    // Concatenar password + salt y hacer hash
    const encoder = new TextEncoder()
    const combined = encoder.encode(password + saltHex)
    const hashBuffer = await crypto.subtle.digest('SHA-256', combined)
    
    // Convertir hash a string hex
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    
    // Retornar salt:hash para verificación posterior
    return `${saltHex}:${hashHex}`
  } catch (error) {
    console.error('❌ Error en hashPassword:', error)
    throw new Error('Error al procesar contraseña: ' + (error as Error).message)
  }
}

// Verifica contraseña - SINCRONIZADO CON reset-password-beneficiario
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    // Extraer salt del formato saltHex:hashHex
    const [saltHex, storedHashHex] = hash.split(':')
    
    if (!saltHex || !storedHashHex) {
      console.error('❌ Formato de hash inválido (esperado saltHex:hashHex)')
      return false
    }
    
    // Recalcular hash con el salt almacenado
    const encoder = new TextEncoder()
    const combined = encoder.encode(password + saltHex)
    const hashBuffer = await crypto.subtle.digest('SHA-256', combined)
    
    // Convertir a hex
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const calculatedHashHex = hashArray
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    
    // Comparar hashes
    return calculatedHashHex === storedHashHex
  } catch (error) {
    console.error('❌ Error en verifyPassword:', error)
    return false
  }
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
          email_verified: email.trim(),
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

      // Obtener datos completos del beneficiario para pre-cargar formulario
      const { data: beneficiarioCompleto } = await supabase
        .from('portal_beneficiarios')
        .select('*')
        .eq('id', beneficiario.id)
        .single()

      return new Response(
        JSON.stringify({
          ok: true,
          message: 'Token de setup generado. Revisa tu correo.',
          setup_token: setupToken,
          beneficiario: beneficiarioCompleto || {
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
          beneficiario_id: cred.beneficiario_id,
          has_completed_setup: true,
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

      // 5. Obtener perfil del beneficiario
      const { data: beneficiario, error: benefError } = await supabase
        .from('portal_beneficiarios')
        .select('*')
        .eq('id', cred.beneficiario_id)
        .single()

      if (benefError || !beneficiario) {
        return new Response(
          JSON.stringify({ ok: false, error: 'No se pudo obtener el perfil del beneficiario' }),
          { status: 500, headers: corsHeaders }
        )
      }

      // 6. Verificar si necesita completar onboarding
      const needsOnboarding = !beneficiario.onboarding_completado

      return new Response(
        JSON.stringify({
          ok: true,
          message: 'Login exitoso',
          beneficiario_id: cred.beneficiario_id,
          profile: beneficiario,
          needs_onboarding: needsOnboarding,
          redirect_to: needsOnboarding ? '/beneficiario/completar-onboarding' : '/beneficiario',
        }),
        { status: 200, headers: corsHeaders }
      )
    }

    // === update-profile: Actualizar perfil durante onboarding ===
    if (method === 'update-profile') {
      const { beneficiario_id, profile_data } = body

      console.log('🔍 DEBUG update-profile:', {
        beneficiario_id,
        has_profile_data: !!profile_data,
        profile_data_keys: profile_data ? Object.keys(profile_data) : [],
      })

      if (!beneficiario_id || !profile_data) {
        return new Response(
          JSON.stringify({ ok: false, error: 'ID de beneficiario y datos de perfil requeridos' }),
          { status: 400, headers: corsHeaders }
        )
      }

      // Campos permitidos para actualizar
      const allowedFields = [
        'genero', 'fecha_nacimiento', 'telefono', 'direccion_residencia', 'barrio_corregimiento',
        'pais_nacimiento', 'dpto_nacimiento', 'municipio_nacimiento', 'dpto_residencia', 
        'municipio_residencia', 'zona_residencia', 'sisben_grupo', 'recibe_subsidio', 
        'cual_subsidio', 'enfoque_diferencial', 'labora_actualmente', 'nombre_padre', 
        'documento_padre', 'ocupacion_padre', 'ingresos_padre', 'nombre_madre', 
        'documento_madre', 'ocupacion_madre', 'ingresos_madre', 'titulo_obtenido', 
        'ano_graduacion', 'establecimiento_educativo', 'puntaje_icfes', 
        'institucion_superior', 'programa_academico', 
        'tipo_educacion', 'semestre_ingreso', 'semestre_actual', 'dpto_institucion', 
        'municipio_institucion', 'modalidad', 'modalidad_beca', 'año_convocatoria', 
        'nombre_banco', 'numero_cuenta', 'tipo_cuenta_bancaria', 'nombre_colegio', 
        'nombre_universidad', 'direccion'
      ]

      // Filtrar solo campos permitidos y limpiar valores vacíos
      const updateData: any = {}
      for (const [key, value] of Object.entries(profile_data)) {
        if (allowedFields.includes(key)) {
          // Omitir valores vacíos/null/undefined
          if (value === '' || value === null || value === undefined) {
            continue
          }
          
          // Para campos numéricos específicos, asegurar que sean números o null
          const numericFields = ['semestre_ingreso', 'semestre_actual', 'puntaje_icfes', 'ano_graduacion', 'año_convocatoria']
          if (numericFields.includes(key)) {
            const parsed = typeof value === 'string' ? parseInt(value) : value
            if (isNaN(parsed)) {
              console.warn(`Campo numérico ${key} tiene valor inválido: ${value}, omitiendo`)
              continue
            }
            updateData[key] = parsed
          } else {
            updateData[key] = value
          }
        }
      }

      updateData.updated_at = new Date().toISOString()

      console.log('🔍 Campos a actualizar:', Object.keys(updateData))
      console.log('🔍 Valores:', JSON.stringify(updateData, null, 2))

      // Actualizar beneficiario
      const { data: updateResult, error: updateErr } = await supabase
        .from('portal_beneficiarios')
        .update(updateData)
        .eq('id', beneficiario_id)
        .select()

      if (updateErr) {
        console.error('❌ Error updating profile:', {
          code: updateErr.code,
          message: updateErr.message,
          details: updateErr.details,
          hint: updateErr.hint,
        })
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: 'Error al actualizar perfil',
            error_details: updateErr.message,
            error_code: updateErr.code,
          }),
          { status: 500, headers: corsHeaders }
        )
      }

      console.log('✅ Perfil actualizado exitosamente')

      return new Response(
        JSON.stringify({
          ok: true,
          message: 'Perfil actualizado exitosamente',
          updated_fields: Object.keys(updateData),
        }),
        { status: 200, headers: corsHeaders }
      )
    }

    // === complete-onboarding: Marcar onboarding como completado ===
    if (method === 'complete-onboarding') {
      const { beneficiario_id, acepta_terminos, acepta_datos } = body

      if (!beneficiario_id) {
        return new Response(
          JSON.stringify({ ok: false, error: 'ID de beneficiario requerido' }),
          { status: 400, headers: corsHeaders }
        )
      }

      if (!acepta_terminos || !acepta_datos) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Debes aceptar los términos y el tratamiento de datos' }),
          { status: 400, headers: corsHeaders }
        )
      }

      const now = new Date().toISOString()

      // Marcar onboarding como completado
      const { error: updateErr } = await supabase
        .from('portal_beneficiarios')
        .update({
          onboarding_completado: true,
          acepta_terminos_at: now,
          acepta_datos_at: now,
          perfil_completado_en: now,
          perfil_incompleto_fields: null,
          updated_at: now,
        })
        .eq('id', beneficiario_id)

      if (updateErr) {
        console.error('Error completing onboarding:', updateErr)
        return new Response(
          JSON.stringify({ ok: false, error: 'Error al completar onboarding' }),
          { status: 500, headers: corsHeaders }
        )
      }

      return new Response(
        JSON.stringify({
          ok: true,
          message: 'Onboarding completado exitosamente',
        }),
        { status: 200, headers: corsHeaders }
      )
    }

    // === register-document: Registrar documento subido (sin subir archivo) ===
    if (method === 'register-document') {
      const { beneficiario_id, titulo, tipo_documento, storage_path, archivo_size_bytes } = body

      if (!beneficiario_id || !tipo_documento || !storage_path) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Campos requeridos: beneficiario_id, tipo_documento, storage_path' }),
          { status: 400, headers: corsHeaders }
        )
      }

      // Verificar que el beneficiario existe
      const { data: beneficiario, error: benefErr } = await supabase
        .from('portal_beneficiarios')
        .select('id')
        .eq('id', beneficiario_id)
        .maybeSingle()

      if (benefErr || !beneficiario) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Beneficiario no encontrado' }),
          { status: 404, headers: corsHeaders }
        )
      }

      // Registrar documento en la tabla (usando service role, evita RLS)
      const { data: documento, error: docErr } = await supabase
        .from('portal_beneficiario_documentos_historicos')
        .insert({
          beneficiario_id: beneficiario_id,
          titulo: titulo || tipo_documento,
          tipo_documento: tipo_documento,
          estado: 'cargado',
          storage_bucket: 'soportes',
          storage_path: storage_path,
          archivo_mime_type: 'application/pdf',
          archivo_size_bytes: archivo_size_bytes || 0,
        })
        .select()
        .single()

      if (docErr) {
        console.error('Error registrando documento:', docErr)
        return new Response(
          JSON.stringify({ ok: false, error: `Error al registrar documento: ${docErr.message}` }),
          { status: 500, headers: corsHeaders }
        )
      }

      return new Response(
        JSON.stringify({
          ok: true,
          message: 'Documento registrado exitosamente',
          documento: documento,
        }),
        { status: 200, headers: corsHeaders }
      )
    }

    // === admin-resend-token: Regenerar y reenviar token de activación ===
    if (method === 'admin-resend-token') {
      const { beneficiario_id, document_number, admin_api_key } = body

      // Validación básica de admin (puedes mejorar esto con un API key real)
      const expectedAdminKey = Deno.env.get('ADMIN_API_KEY') || 'focades-admin-2026'
      if (admin_api_key !== expectedAdminKey) {
        return new Response(
          JSON.stringify({ ok: false, error: 'No autorizado' }),
          { status: 403, headers: corsHeaders }
        )
      }

      if (!beneficiario_id && !document_number) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Debes proporcionar beneficiario_id o document_number' }),
          { status: 400, headers: corsHeaders }
        )
      }

      // 1. Buscar beneficiario
      let query = supabase.from('portal_beneficiarios').select('id, nombre_completo, email, n_documento')
      
      if (beneficiario_id) {
        query = query.eq('id', beneficiario_id)
      } else {
        query = query.eq('n_documento', document_number.trim())
      }

      const { data: beneficiario, error: benefErr } = await query.maybeSingle()

      if (benefErr || !beneficiario) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Beneficiario no encontrado' }),
          { status: 404, headers: corsHeaders }
        )
      }

      // 2. Verificar si ya completó la configuración
      const { data: existingCred } = await supabase
        .from('portal_auth_credentials')
        .select('setup_completed_at, password_hash')
        .eq('beneficiario_id', beneficiario.id)
        .maybeSingle()

      if (existingCred?.setup_completed_at && existingCred?.password_hash) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Este beneficiario ya ha establecido su contraseña. No se puede regenerar el token.',
            info: 'Si necesita restablecer su contraseña, usa la función de recuperación de contraseña.',
          }),
          { status: 400, headers: corsHeaders }
        )
      }

      // 3. Generar nuevo token (invalida el anterior)
      const setupToken = generateSetupToken()
      const setupExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h

      const { error: credErr } = await supabase
        .from('portal_auth_credentials')
        .upsert({
          beneficiario_id: beneficiario.id,
          document_number: beneficiario.n_documento,
          email_verified: beneficiario.email,
          setup_token: setupToken,
          setup_token_expires_at: setupExpiresAt,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'beneficiario_id' })

      if (credErr) {
        console.error('Error regenerando token:', credErr)
        return new Response(
          JSON.stringify({ ok: false, error: 'Error al generar nuevo token' }),
          { status: 500, headers: corsHeaders }
        )
      }

      // 4. Enviar email con nuevo link
      const activationLink = `https://focades-pro.vercel.app/beneficiario/completar-onboarding?token=${setupToken}`
      console.log(`🔄 Token regenerado para ${beneficiario.nombre_completo}`)
      console.log(`   Link: ${activationLink}`)

      // Intentar enviar email automáticamente
      let emailSent = false
      let emailError = null

      try {
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-setup-emails`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            method: 'send-setup-email',
            beneficiario_id: beneficiario.id,
          }),
        })

        const emailData = await emailResponse.json()
        
        if (emailData.ok) {
          emailSent = true
          console.log('[EMAIL] Email enviado automáticamente')
        } else {
          emailError = emailData.error || 'Error desconocido'
          console.warn('[EMAIL] No se pudo enviar email:', emailError)
        }
      } catch (err) {
        emailError = err.message
        console.error('[EMAIL] Error al intentar enviar email:', err)
      }

      return new Response(
        JSON.stringify({
          ok: true,
          message: emailSent 
            ? 'Token regenerado y email enviado exitosamente' 
            : 'Token regenerado. Email no enviado - comparte el link manualmente',
          beneficiario: {
            id: beneficiario.id,
            nombre_completo: beneficiario.nombre_completo,
            email: beneficiario.email,
            documento: beneficiario.n_documento,
          },
          setup_token: setupToken,
          activation_link: activationLink,
          expires_at: setupExpiresAt,
          email_sent: emailSent,
          email_error: emailError,
          note: emailSent 
            ? 'Email enviado al beneficiario con el link de activación' 
            : 'Copia el link de activación y envíaselo al beneficiario por email o WhatsApp',
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
    console.error('❌ Function error:', error)
    console.error('❌ Error stack:', error.stack)
    console.error('❌ Error message:', error.message)
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: 'Error interno del servidor',
        error_message: error.message,
        error_details: error.toString(),
      }),
      { status: 500, headers: corsHeaders }
    )
  }
})
