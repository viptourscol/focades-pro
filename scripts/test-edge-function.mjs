#!/usr/bin/env node

/**
 * Script de prueba para la Edge Function send-setup-emails
 * Verifica CORS, conectividad y respuestas
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jwifxjzxdxjntbdqbyku.supabase.co'
const supabaseAnonKey = 'sb_publishable_em5D2P5WLzyhacklDGpXBA_GfQniMHk'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

console.log('🧪 PRUEBA: Llamando a Edge Function send-setup-emails\n')
console.log('📍 URL:', supabaseUrl)
console.log('🔑 ANON_KEY:', supabaseAnonKey.substring(0, 20) + '...\n')

try {
  console.log('📤 Invocando función con beneficiario_id = 1...')
  
  const response = await supabase.functions.invoke('send-setup-emails', {
    body: {
      method: 'send-setup-email',
      beneficiario_id: 1,
    },
  })

  console.log('\n✅ Respuesta recibida:')
  console.log('Status:', response.status)
  console.log('Data:', JSON.stringify(response.data, null, 2))
  
  if (response.error) {
    console.log('\n❌ Error en respuesta:')
    console.log(response.error)
  }

} catch (error) {
  console.error('\n❌ Error al llamar función:')
  console.error('Tipo:', error.name)
  console.error('Mensaje:', error.message)
  console.error('Stack:', error.stack)
}
