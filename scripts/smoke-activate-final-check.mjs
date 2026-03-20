import { createClient, FunctionsHttpError } from '@supabase/supabase-js'

const url = 'https://jwifxjzxdxjntbdqbyku.supabase.co'
const legacyAnon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aWZ4anp4ZHhqbnRiZHFieWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjMxOTAsImV4cCI6MjA4NzY5OTE5MH0.taA7VQcshARKnaUal_qrdWf9ug-ziQvu2o89U4rlc1U'
const email = 'reyterjannyer@gmail.com'
const otp = '298921'

const supabase = createClient(url, legacyAnon)
const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' })
if (verifyError || !verifyData?.session) {
  console.error('OTP_VERIFY_ERROR', verifyError?.message || 'No session')
  process.exit(1)
}

const loteId = 'c43b8137-ceec-46d2-b6e0-3cb6df56b2e6'
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

console.log('ACTIVATION_INPUT_IDS', JSON.stringify(beneficiarioIds))

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
