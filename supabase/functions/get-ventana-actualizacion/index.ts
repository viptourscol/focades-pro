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
    
    // Obtener parámetros del body (para subsanación, puede incluir ventana_id)
    let ventanaId = null
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        ventanaId = body.ventana_id
      } catch {
        // Si no hay body válido, continuar sin ventana_id
      }
    }

    let ventana = null
    let ventanaError = null

    // Si se especifica ventana_id (subsanación), buscar esa ventana específica
    // aunque esté cerrada por fecha
    if (ventanaId) {
      console.log(`🔍 Buscando ventana específica: ${ventanaId} (subsanación)`)
      const query = await supabase
        .from('portal_ventanas_actualizacion')
        .select('*')
        .eq('id', ventanaId)
        .maybeSingle()
      ventana = query.data
      ventanaError = query.error
      
      if (!ventana) {
        console.warn(`⚠️ Ventana ${ventanaId} no encontrada`)
      } else {
        console.log(`✅ Ventana encontrada (subsanación): ${ventana.nombre}`)
      }
    } else {
      // Sin ventana_id, buscar ventana activa por fechas (para nuevas actualizaciones)
      console.log('🔍 Buscando ventana activa por fechas (nueva actualización)')
      const query = await supabase
        .from('portal_ventanas_actualizacion')
        .select('*')
        .eq('is_active', true)
        .lte('fecha_inicio', nowIso)
        .gte('fecha_fin', nowIso)
        .order('fecha_inicio', { ascending: false })
        .limit(1)
        .maybeSingle()
      ventana = query.data
      ventanaError = query.error
      
      if (ventanaError) {
        console.error('❌ Error consultando ventana:', ventanaError)
      } else {
        console.log('✅ Ventana encontrada:', ventana ? ventana.nombre : 'ninguna')
      }
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
        subsanacionDeadline: ventana?.fecha_cierre_subsanacion || null,
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
