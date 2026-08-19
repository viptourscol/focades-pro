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
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
      },
    })
  }

  try {
    console.log('🔍 Consultando ventana de actualización activa...')

    const nowIso = new Date().toISOString()

    // Consultar ventana activa usando service key (bypasses RLS)
    const { data: ventana, error: ventanaError } = await supabase
      .from('portal_ventanas_actualizacion')
      .select('*')
      .eq('is_active', true)
      .lte('fecha_inicio', nowIso)
      .gte('fecha_fin', nowIso)
      .order('fecha_inicio', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (ventanaError) {
      console.error('❌ Error consultando ventana:', ventanaError)
    } else {
      console.log('✅ Ventana encontrada:', ventana ? ventana.nombre : 'ninguna')
    }

    // Consultar configuración activa
    const { data: config, error: configError } = await supabase
      .from('portal_configuracion')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (configError) {
      console.error('❌ Error consultando config:', configError)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        ventana: ventana || null,
        config: config || null,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error) {
    console.error('❌ Error en get-ventana-actualizacion:', error)
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
