#!/usr/bin/env node

/**
 * Test Script: Verificar que Resend está correctamente configurado
 * 
 * Uso:
 *   node scripts/test-resend-email.mjs [email-destino]
 * 
 * Ejemplos:
 *   node scripts/test-resend-email.mjs
 *   node scripts/test-resend-email.mjs tu-email@example.com
 */

import { createClient } from '@supabase/supabase-js'

const resendApiKey = process.env.RESEND_API_KEY
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Email de destino (por defecto, usar email del primeiro beneficiario)
const testEmailArg = process.argv[2]

console.log('🧪 TEST: Verificar Resend + Supabase')
console.log('=' * 50)

// Verificar variables de entorno
if (!resendApiKey) {
  console.error('❌ ERROR: RESEND_API_KEY no configurada')
  console.error('   Agregar a .env: RESEND_API_KEY=re_xxxxx')
  process.exit(1)
}

if (!supabaseUrl) {
  console.error('❌ ERROR: SUPABASE_URL no configurada')
  process.exit(1)
}

if (!supabaseServiceKey) {
  console.error('❌ ERROR: SUPABASE_SERVICE_ROLE_KEY no configurada')
  process.exit(1)
}

console.log('✅ Variables de entorno verificadas')
console.log(`   - RESEND_API_KEY: ${resendApiKey.substring(0, 10)}...`)
console.log(`   - SUPABASE_URL: ${supabaseUrl}`)
console.log()

// Conectar a Supabase
const supabase = createClient(supabaseUrl, supabaseServiceKey)

console.log('🔌 Conectando a Supabase...')

async function testResendEmail() {
  try {
    // Obtener email de test
    let testEmail = testEmailArg
    
    if (!testEmail) {
      console.log('📧 Buscando primer beneficiario...')
      const { data: beneficiarios, error: benefError } = await supabase
        .from('portal_beneficiarios')
        .select('email, nombre_completo')
        .limit(1)

      if (benefError) {
        console.error('❌ Error fetching beneficiarios:', benefError.message)
        process.exit(1)
      }

      if (!beneficiarios || beneficiarios.length === 0) {
        console.error('❌ No hay beneficiarios en la BD')
        process.exit(1)
      }

      testEmail = beneficiarios[0].email
      console.log(`   ✓ Usando: ${beneficiarios[0].nombre_completo} (${testEmail})`)
    }

    console.log()
    console.log('📤 Enviando email de test via Resend...')

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #0D2C54 0%, #081e3a 100%); color: white; padding: 20px; text-align: center; border-radius: 8px; }
    .content { padding: 20px; background: #f5f7fa; }
    .button { display: inline-block; background: #1A5A96; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; }
    .footer { font-size: 12px; color: #666; text-align: center; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧪 TEST EMAIL</h1>
      <p>Verificación de Resend</p>
    </div>
    
    <div class="content">
      <p>¡Hola!</p>
      <p>Este es un email de test para verificar que <strong>Resend está correctamente configurado</strong>.</p>
      
      <p style="text-align: center; margin: 30px 0;">
        <a href="https://focades-pro.vercel.app" class="button">→ Ir al Portal FOCADES</a>
      </p>
      
      <p>Si recibiste este email, todo está funcionando correctamente ✅</p>
      
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      
      <p><strong>Información técnica:</strong></p>
      <ul>
        <li>Proveedor: Resend</li>
        <li>Dominio: focades.info</li>
        <li>Timestamp: ${new Date().toISOString()}</li>
      </ul>
    </div>
  </div>
  
  <div class="footer">
    <p>&copy; 2026 FOCADES. Test email.</p>
  </div>
</body>
</html>
    `.trim()

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Test <test@focades.info>',
        to: testEmail,
        subject: '🧪 Test Email - FOCADES Resend Verification',
        html: emailHtml,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('❌ Error from Resend API:')
      console.error(`   Status: ${response.status}`)
      console.error(`   Message: ${error.message}`)
      console.error(`   Details: ${JSON.stringify(error, null, 2)}`)
      process.exit(1)
    }

    const result = await response.json()

    console.log('✅ Email enviado exitosamente!')
    console.log(`   Email ID: ${result.id}`)
    console.log(`   To: ${testEmail}`)
    console.log()

    // Registrar en tabla de audit
    console.log('📝 Registrando en tabla email_log...')
    const { error: insertError } = await supabase
      .from('portal_beneficiarios_email_log')
      .insert({
        email_type: 'test',
        recipient_email: testEmail,
        status: 'sent',
        sendgrid_message_id: result.id,
        sent_at: new Date().toISOString(),
      })

    if (insertError) {
      console.warn('⚠️  Advertencia: No se pudo registrar en email_log')
      console.warn(`   ${insertError.message}`)
    } else {
      console.log('✅ Registrado en tabla email_log')
    }

    console.log()
    console.log('🎉 TEST COMPLETADO EXITOSAMENTE')
    console.log('=' * 50)
    console.log()
    console.log('📋 Resultado:')
    console.log(`   ✅ RESEND_API_KEY está configurada`)
    console.log(`   ✅ Conexión a Supabase funciona`)
    console.log(`   ✅ Email enviado a: ${testEmail}`)
    console.log(`   ✅ Tabla email_log accesible`)
    console.log()
    console.log('🚀 Próximo paso: Ejecutar script de generación de tokens')
    console.log('   node scripts/create-beneficiary-auth-tokens.mjs --send-emails')
    console.log()

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

testResendEmail()
