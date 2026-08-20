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

    console.log('🎫 Cargando tickets para beneficiario:', beneficiario_id)

    // Obtener perfil del beneficiario
    const { data: profile, error: profileError } = await supabase
      .from('portal_beneficiarios')
      .select('id,email,radicado_inscripcion,nombre_completo')
      .eq('id', beneficiario_id)
      .maybeSingle()

    if (profileError || !profile) {
      console.error('❌ Error obteniendo perfil:', profileError)
      return new Response(
        JSON.stringify({ ok: false, error: 'No se pudo validar tu perfil de beneficiario.' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    const contactEmail = String(profile.email || '').trim().toLowerCase()
    const radicado = String(profile.radicado_inscripcion || '').trim()

    if (!contactEmail) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Tu perfil no tiene un correo válido para registrar tickets.' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    // Obtener tickets del beneficiario con sus mensajes
    const { data: tickets, error: ticketsError } = await supabase
      .from('soporte_tickets')
      .select('id,ticket_codigo,radicado,email_contacto,nombre_contacto,asunto,estado,prioridad,admin_user_id,created_at,updated_at,respondido_at,cerrado_at,cerrado_por')
      .eq('email_contacto', contactEmail)
      .order('created_at', { ascending: false })
      .limit(50)

    if (ticketsError) {
      console.error('❌ Error obteniendo tickets:', ticketsError)
      return new Response(
        JSON.stringify({ ok: false, error: ticketsError.message || 'No se pudieron cargar tus tickets.' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    const ticketIds = (tickets || []).map(t => t.id)

    // Obtener mensajes de todos los tickets
    let mensajes = []
    if (ticketIds.length > 0) {
      const { data: mensajesData, error: mensajesError } = await supabase
        .from('portal_ticket_mensajes')
        .select('id,ticket_id,autor_tipo,mensaje,admin_user_id,created_at')
        .in('ticket_id', ticketIds)
        .order('created_at', { ascending: true })

      if (!mensajesError && mensajesData) {
        mensajes = mensajesData
      }
    }

    console.log(`✅ ${tickets?.length || 0} tickets cargados con ${mensajes.length} mensajes`)

    return new Response(
      JSON.stringify({
        ok: true,
        tickets: tickets || [],
        mensajes: mensajes,
        profile: {
          email: contactEmail,
          radicado,
          nombre_completo: profile.nombre_completo || '',
        },
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
    console.error('❌ Error en get-beneficiario-tickets:', error)
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
