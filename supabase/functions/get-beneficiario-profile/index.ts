import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

Deno.serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  try {
    const { beneficiario_id } = await req.json()

    if (!beneficiario_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta beneficiario_id' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    console.log('🔍 Consultando perfil para beneficiario_id:', beneficiario_id)

    // Consultar perfil usando service key (bypasses RLS)
    const { data: profile, error } = await supabase
      .from('portal_beneficiarios')
      .select('*')
      .eq('id', beneficiario_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) {
      console.error('❌ Error consultando perfil:', error)
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    if (!profile) {
      console.log('⚠️ No se encontró beneficiario con ID:', beneficiario_id)
      return new Response(
        JSON.stringify({ ok: false, error: 'Beneficiario no encontrado' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    console.log('✅ Perfil encontrado:', profile.nombre_completo)

    return new Response(
      JSON.stringify({ ok: true, profile }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error) {
    console.error('❌ Error en get-beneficiario-profile:', error)
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Error interno del servidor',
        details: error.message,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
})
