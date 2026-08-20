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
        JSON.stringify({ ok: false, message: 'beneficiario_id requerido' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    console.log('📊 Cargando módulo de condonación para beneficiario:', beneficiario_id)

    // 1. Obtener perfil del beneficiario
    const { data: profile, error: profileError } = await supabase
      .from('portal_beneficiarios')
      .select('id,semestre_actual,nivel_formacion,estado_beneficiario')
      .eq('id', beneficiario_id)
      .maybeSingle()

    if (profileError || !profile) {
      console.error('❌ Error obteniendo perfil:', profileError)
      return new Response(
        JSON.stringify({ ok: false, message: 'No hay beneficiario vinculado.' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    // 2. Obtener condonaciones semestrales
    const { data: condonaciones, error: condonacionesError } = await supabase
      .from('portal_condonacion_semestral')
      .select(`
        id,
        pago_id,
        actualizacion_id,
        semestre_texto,
        monto_desembolsado,
        promedio_reportado,
        estado_condonacion,
        motivo_no_condonada,
        revisado_at,
        portal_condonacion_certificados!inner(codigo_certificado)
      `)
      .eq('beneficiario_id', beneficiario_id)
      .eq('portal_condonacion_certificados.estado', 'vigente')
      .order('created_at', { ascending: false })

    // 3. Obtener condonación final
    const { data: condonacionFinal, error: finalError } = await supabase
      .from('portal_condonacion_final')
      .select('*')
      .eq('beneficiario_id', beneficiario_id)
      .maybeSingle()

    // 4. Obtener documentos finales
    const { data: documentos, error: docError } = await supabase
      .from('portal_condonacion_final_documentos')
      .select('id,tipo_documento,storage_path,nombre_original,estado_validacion,created_at')
      .eq('beneficiario_id', beneficiario_id)
      .order('created_at', { ascending: false })

    // 5. Obtener sugerencias de cobro
    const { data: sugerencias, error: sugerenciasError } = await supabase
      .from('portal_sugerencias_cobro_coactivo')
      .select('id,motivo_causal,monto_sugerido,estado,created_at')
      .eq('beneficiario_id', beneficiario_id)
      .order('created_at', { ascending: false })

    console.log('✅ Módulo de condonación cargado:', {
      condonaciones: condonaciones?.length || 0,
      documentos: documentos?.length || 0,
      sugerencias: sugerencias?.length || 0,
    })

    return new Response(
      JSON.stringify({
        ok: true,
        beneficiario_id,
        beneficiario_profile: profile,
        condonaciones: condonaciones || [],
        condonacion_final: condonacionFinal || null,
        documentos_finales: documentos || [],
        sugerencias_cobro: sugerencias || [],
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
    console.error('❌ Error en get-condonacion-modulo:', error)
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'Error interno del servidor',
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
