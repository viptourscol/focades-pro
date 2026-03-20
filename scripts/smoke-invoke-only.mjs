import { createClient } from '@supabase/supabase-js'

const url = 'https://jwifxjzxdxjntbdqbyku.supabase.co'
const anonKey = 'sb_publishable_em5D2P5WLzyhacklDGpXBA_GfQniMHk'
const email = 'reyterjannyer@gmail.com'
const otp = '631911'

const supabase = createClient(url, anonKey)
const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' })
if (verifyError || !verifyData?.session) {
  console.error('OTP_VERIFY_ERROR', verifyError?.message || 'No session')
  process.exit(1)
}

const runId = Date.now()
const payload = {
  titulo: `Smoke Test Lote ${runId}`,
  descripcion: 'Prueba por functions.invoke',
  archivo_nombre: `smoke-${runId}.csv`,
  archivo_size_bytes: 123,
  checksum_md5: `smoke-${runId}`,
  beneficiarios: [
    {
      nombre: 'Smoke Test Beneficiario',
      cedula: String(1000000000 + (runId % 10000000)),
      correo: `smoke.${runId}@example.com`
    }
  ]
}

const { data, error } = await supabase.functions.invoke('import-historicos-lote', {
  body: payload
})

if (error) {
  console.error('FUNCTION_INVOKE_ERROR', JSON.stringify(error))
  process.exit(1)
}
console.log('FUNCTION_INVOKE_OK', JSON.stringify(data))
