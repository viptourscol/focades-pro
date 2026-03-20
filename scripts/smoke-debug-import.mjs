import { createClient, FunctionsHttpError } from '@supabase/supabase-js'

const url = 'https://jwifxjzxdxjntbdqbyku.supabase.co'
const anonKey = 'sb_publishable_em5D2P5WLzyhacklDGpXBA_GfQniMHk'
const email = 'reyterjannyer@gmail.com'
const otp = '699756'

const supabase = createClient(url, anonKey)

const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
  email,
  token: otp,
  type: 'email'
})

if (verifyError || !verifyData?.session) {
  console.error('OTP_VERIFY_ERROR', verifyError?.message || 'No session')
  process.exit(1)
}

console.log('OTP_VERIFY_OK')

const runId = Date.now()
const payload = {
  titulo: `Smoke Test Lote ${runId}`,
  descripcion: 'Debug import error body',
  archivo_nombre: `smoke-${runId}.csv`,
  archivo_size_bytes: 100,
  checksum_md5: `smoke-${runId}`,
  beneficiarios: [
    {
      nombre: 'Smoke Test Beneficiario',
      cedula: String(1000000000 + (runId % 10000000)),
      correo: `smoke.${runId}@example.com`
    }
  ]
}

try {
  const { data, error } = await supabase.functions.invoke('import-historicos-lote', { body: payload })
  if (error) throw error
  console.log('IMPORT_OK', JSON.stringify(data))
} catch (err) {
  if (err instanceof FunctionsHttpError) {
    const text = await err.context.text()
    console.error('IMPORT_FUNCTION_HTTP_ERROR', text)
  } else {
    console.error('IMPORT_OTHER_ERROR', String(err))
  }
  process.exit(1)
}
