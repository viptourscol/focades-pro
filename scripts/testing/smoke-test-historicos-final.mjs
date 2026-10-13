import { createClient, FunctionsHttpError } from '@supabase/supabase-js'

const url = 'https://jwifxjzxdxjntbdqbyku.supabase.co'
const legacyAnon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aWZ4anp4ZHhqbnRiZHFieWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjMxOTAsImV4cCI6MjA4NzY5OTE5MH0.taA7VQcshARKnaUal_qrdWf9ug-ziQvu2o89U4rlc1U'
const email = 'reyterjannyer@gmail.com'
const otp = '508897'

const supabase = createClient(url, legacyAnon)

const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' })
if (verifyError || !verifyData?.session) {
  console.error('OTP_VERIFY_ERROR', verifyError?.message || 'No session')
  process.exit(1)
}

console.log('OTP_VERIFY_OK')

const runId = Date.now()
const importPayload = {
  titulo: `Smoke Test Lote ${runId}`,
  descripcion: 'Prueba automatizada e2e',
  archivo_nombre: `smoke-${runId}.csv`,
  archivo_size_bytes: 256,
  checksum_md5: `smoke-${runId}`,
  beneficiarios: [
    {
      nombre: 'Smoke Test Beneficiario',
      cedula: String(1000000000 + (runId % 10000000)),
      correo: `test.historico.${runId}@example.com`,
      telefono: '3000000000',
      grado_academico: 'Tecnologo',
      institucion_academica: 'Instituto Prueba',
      anio_graduacion: 2024,
      observaciones: 'Creado por smoke test automatizado'
    }
  ]
}

let importData = null
try {
  const { data, error } = await supabase.functions.invoke('import-historicos-lote', { body: importPayload })
  if (error) throw error
  importData = data
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

const loteId = importData?.lote_id
if (!loteId) {
  console.error('IMPORT_NO_LOTE_ID')
  process.exit(1)
}

const { data: loteBenefs, error: loteFetchError } = await supabase
  .from('portal_beneficiarios')
  .select('id, email, auth_user_id')
  .eq('pertenece_lote_id', loteId)

if (loteFetchError) {
  console.error('LOTE_BENEF_FETCH_ERROR', JSON.stringify(loteFetchError))
  process.exit(1)
}

const beneficiarioIds = (loteBenefs || [])
  .filter((b) => !!b.email && !b.auth_user_id)
  .map((b) => b.id)

console.log('BENEFICIARIOS_ACTIVABLES', beneficiarioIds.length)

try {
  const { data: actData, error: actError } = await supabase.functions.invoke('activate-beneficiarios-batch', {
    body: {
      lote_id: loteId,
      beneficiario_ids: beneficiarioIds,
      solo_confiables: true
    }
  })
  if (actError) throw actError
  console.log('ACTIVATE_OK', JSON.stringify(actData))
} catch (err) {
  if (err instanceof FunctionsHttpError) {
    const text = await err.context.text()
    console.error('ACTIVATE_FUNCTION_HTTP_ERROR', text)
  } else {
    console.error('ACTIVATE_OTHER_ERROR', String(err))
  }
  process.exit(1)
}

console.log('SMOKE_TEST_OK', loteId)
