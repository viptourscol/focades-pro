import { createClient } from '@supabase/supabase-js'

const url = 'https://jwifxjzxdxjntbdqbyku.supabase.co'
const anonKey = 'sb_publishable_em5D2P5WLzyhacklDGpXBA_GfQniMHk'
const email = 'reyterjannyer@gmail.com'
const otp = '879996'

const supabase = createClient(url, anonKey)

const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
  email,
  token: otp,
  type: 'email'
})

if (verifyError || !verifyData?.session?.access_token) {
  console.error('OTP_VERIFY_ERROR', verifyError?.message || 'Sin session token')
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

const { data: importData, error: importError } = await supabase.functions.invoke('import-historicos-lote', {
  body: importPayload
})

if (importError) {
  console.error('IMPORT_ERROR', JSON.stringify(importError))
  process.exit(1)
}

console.log('IMPORT_OK', JSON.stringify(importData))

const loteId = importData?.lote_id
if (!loteId) {
  console.error('IMPORT_NO_LOTE_ID')
  process.exit(1)
}

const { data: clasificados, error: clasifError } = await supabase.rpc('beneficiarios_lote_clasificados', {
  p_lote_id: loteId
})

if (clasifError) {
  console.error('CLASIFICACION_ERROR', JSON.stringify(clasifError))
  process.exit(1)
}

const activos = Array.isArray(clasificados)
  ? clasificados.find((g) => g.clasificacion === 'activo_confiable')
  : null

const beneficiarioIds = (activos?.beneficiarios || []).map((b) => b?.id).filter(Boolean)
console.log('BENEFICIARIOS_ACTIVOS', beneficiarioIds.length)

const { data: activateData, error: activateError } = await supabase.functions.invoke('activate-beneficiarios-batch', {
  body: {
    lote_id: loteId,
    beneficiario_ids: beneficiarioIds,
    solo_confiables: true
  }
})

if (activateError) {
  console.error('ACTIVATE_ERROR', JSON.stringify(activateError))
  process.exit(1)
}

console.log('ACTIVATE_OK', JSON.stringify(activateData))
console.log('SMOKE_TEST_OK', loteId)
