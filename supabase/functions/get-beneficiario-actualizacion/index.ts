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
    const { beneficiario_id, ventana_id } = body

    if (!beneficiario_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'beneficiario_id es requerido' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    console.log('📋 Cargando actualización para beneficiario:', beneficiario_id, ventana_id ? `ventana: ${ventana_id}` : '(sin filtro de ventana)')

    // Construir query
    let query = supabase
      .from('portal_actualizaciones')
      .select('id,estado,created_at,observacion_admin,campos_a_corregir,documentos_a_corregir,marcado_subsanacion_at,semestre_actual,promedio_semestre_anterior,email,telefono,direccion,payload_formulario,ventana_id')
      .eq('beneficiario_id', beneficiario_id)
      .in('estado', ['en_revision', 'aprobada', 'rechazada', 'subsanacion'])
      .order('created_at', { ascending: false })

    // Si se especifica ventana_id, filtrar por esa ventana
    if (ventana_id) {
      query = query.eq('ventana_id', ventana_id)
    }

    const { data: actualizacion, error: actualizacionError } = await query.maybeSingle()

    if (actualizacionError) {
      console.error('❌ Error obteniendo actualización:', actualizacionError)
      return new Response(
        JSON.stringify({ ok: false, error: actualizacionError.message }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    if (actualizacion) {
      console.log('✅ Actualización encontrada:', actualizacion.id, 'estado:', actualizacion.estado, 'ventana:', actualizacion.ventana_id)
    } else {
      console.log('ℹ️ No hay actualización previa para este beneficiario')
    }

    return new Response(
      JSON.stringify({
        ok: true,
        actualizacion: actualizacion || null,
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
    console.error('❌ Error en Edge Function:', error.message)
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
})
