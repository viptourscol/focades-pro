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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
      },
    })
  }

  try {
    const body = await req.json()
    const { beneficiario_id } = body

    if (!beneficiario_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'beneficiario_id requerido' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    console.log('📋 Cargando historial para beneficiario:', beneficiario_id)

    // 1. Obtener actualizaciones
    const { data: actualizaciones, error: actualizacionesError } = await supabase
      .from('portal_actualizaciones')
      .select('id,ventana_id,estado,semestre_actual,promedio_semestre_anterior,email,telefono,direccion,observacion_admin,revisado_at,created_at,updated_at,campos_a_corregir,documentos_a_corregir,marcado_subsanacion_at,subsanado_at')
      .eq('beneficiario_id', beneficiario_id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (actualizacionesError) {
      console.error('❌ Error obteniendo actualizaciones:', actualizacionesError)
      return new Response(
        JSON.stringify({ ok: false, error: actualizacionesError.message }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    const updateIds = (actualizaciones || []).map(item => item.id).filter(Boolean)
    const ventanaIds = Array.from(new Set((actualizaciones || []).map(item => item.ventana_id).filter(Boolean)))

    console.log(`📄 ${actualizaciones?.length || 0} actualizaciones encontradas`)

    // 2. Obtener documentos asociados
    let documentos = []
    if (updateIds.length > 0) {
      const { data: docsData, error: docsError } = await supabase
        .from('portal_actualizacion_documentos')
        .select('id,actualizacion_id,tipo_documento,nombre_original,mime_type,size_bytes,storage_path,created_at')
        .in('actualizacion_id', updateIds)
        .order('created_at', { ascending: false })

      if (!docsError) {
        documentos = docsData || []
        console.log(`📎 ${documentos.length} documentos encontrados`)
      }
    }

    // 3. Obtener ventanas de actualización
    let ventanas = []
    if (ventanaIds.length > 0) {
      const { data: ventanasData, error: ventanasError } = await supabase
        .from('portal_ventanas_actualizacion')
        .select('id,nombre,fecha_inicio,fecha_fin')
        .in('id', ventanaIds)

      if (!ventanasError) {
        ventanas = ventanasData || []
        console.log(`🪟 ${ventanas.length} ventanas encontradas`)
      }
    }

    console.log('✅ Historial cargado exitosamente')

    return new Response(
      JSON.stringify({
        ok: true,
        actualizaciones: actualizaciones || [],
        documentos: documentos,
        ventanas: ventanas,
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
    console.error('❌ Error en get-beneficiario-historial:', error)
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
