import { createClient, FunctionsHttpError } from '@supabase/supabase-js'

function getArg(name, defaultValue = '') {
  const prefix = `--${name}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : defaultValue
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function printHelp() {
  console.log(`
Smoke test para migracion historica (OTP + import + activacion)

Uso:
  node scripts/smoke-historicos.mjs --email=tu_correo_admin
  node scripts/smoke-historicos.mjs --email=tu_correo_admin --otp=123456

Opciones:
  --email=...            Correo de admin (obligatorio)
  --otp=...              Codigo OTP de 6 digitos
  --skip-activate        Solo prueba import, omite activacion
  --redirect=...         Redirect para OTP (default: http://localhost:5173)
  --help                 Muestra esta ayuda

Variables de entorno requeridas:
  SUPABASE_URL
  SUPABASE_LEGACY_ANON_KEY

Notas:
  1) Primera ejecucion sin --otp: envia el OTP y termina.
  2) Segunda ejecucion con --otp: ejecuta import + activacion.
`)
}

async function parseFunctionError(error, prefix) {
  if (error instanceof FunctionsHttpError) {
    const text = await error.context.text().catch(() => '')
    console.error(`${prefix}_HTTP_ERROR`, text || '(sin body)')
    return
  }
  console.error(`${prefix}_ERROR`, String(error))
}

async function main() {
  if (hasFlag('help')) {
    printHelp()
    return
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const apiKey =
    process.env.SUPABASE_LEGACY_ANON_KEY ||
    process.env.SUPABASE_ANON_LEGACY_KEY ||
    ''

  const email = getArg('email')
  const otp = getArg('otp')
  const redirect = getArg('redirect', 'http://localhost:5173')
  const skipActivate = hasFlag('skip-activate')

  if (!url) {
    console.error('Falta SUPABASE_URL (o VITE_SUPABASE_URL).')
    process.exit(1)
  }

  if (!apiKey) {
    console.error('Falta SUPABASE_LEGACY_ANON_KEY.')
    process.exit(1)
  }

  if (!email) {
    console.error('Falta --email=tu_correo_admin')
    process.exit(1)
  }

  const supabase = createClient(url, apiKey)

  if (!otp) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirect,
      },
    })

    if (error) {
      console.error('OTP_SEND_ERROR', error.message)
      process.exit(1)
    }

    console.log('OTP_SEND_OK', email)
    console.log(
      `Siguiente paso: node scripts/smoke-historicos.mjs --email=${email} --otp=CODIGO`
    )
    return
  }

  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token: otp,
    type: 'email',
  })

  if (verifyError || !verifyData?.session) {
    console.error('OTP_VERIFY_ERROR', verifyError?.message || 'No se obtuvo sesion')
    process.exit(1)
  }

  console.log('OTP_VERIFY_OK', email)

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
        observaciones: 'Creado por smoke test automatizado',
      },
    ],
  }

  let importData = null
  try {
    const { data, error } = await supabase.functions.invoke('import-historicos-lote', {
      body: importPayload,
    })
    if (error) throw error
    importData = data
  } catch (error) {
    await parseFunctionError(error, 'IMPORT')
    process.exit(1)
  }

  if (!importData?.lote_id) {
    console.error('IMPORT_INVALID_RESPONSE', JSON.stringify(importData || {}))
    process.exit(1)
  }

  const loteId = importData.lote_id
  console.log('IMPORT_OK', JSON.stringify(importData))

  if (skipActivate) {
    console.log('SMOKE_TEST_OK_IMPORT_ONLY', loteId)
    return
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

  console.log('ACTIVATE_INPUT_IDS', JSON.stringify(beneficiarioIds))

  let activateData = null
  try {
    const { data, error } = await supabase.functions.invoke('activate-beneficiarios-batch', {
      body: {
        lote_id: loteId,
        beneficiario_ids: beneficiarioIds,
        solo_confiables: true,
      },
    })
    if (error) throw error
    activateData = data
  } catch (error) {
    await parseFunctionError(error, 'ACTIVATE')
    process.exit(1)
  }

  console.log('ACTIVATE_OK', JSON.stringify(activateData || {}))
  console.log('SMOKE_TEST_OK', loteId)
}

main().catch((error) => {
  console.error('UNHANDLED_ERROR', String(error))
  process.exit(1)
})
