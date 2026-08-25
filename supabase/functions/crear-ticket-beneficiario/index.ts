import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sanitizeText = (value: any, maxLength = 3000) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)

const buildTicketCode = () => {
  const year = new Date().getFullYear()
  const random = Math.floor(100000 + Math.random() * 900000)
  return `TKT-${year}-${random}`
}

Deno.serve(async (req) => {
  // Handle CORS preflight request FIRST, before any other code
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  try {
    // Initialize Supabase client inside handler
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing Supabase environment variables' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const body = await req.json()
    const { beneficiario_id, asunto, mensaje } = body

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

    const cleanAsunto = sanitizeText(asunto, 180)
    const cleanMensaje = sanitizeText(mensaje, 2500)

    if (!cleanAsunto) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Debes indicar el asunto de tu solicitud.' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    if (cleanMensaje.length < 20) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Describe tu solicitud con mayor detalle (mínimo 20 caracteres).' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    console.log('🎫 Creando ticket para beneficiario:', beneficiario_id)

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

    // Validar rate limiting (no más de 2 tickets en los últimos 2 minutos)
    const { data: recentTickets, error: recentError } = await supabase
      .from('soporte_tickets')
      .select('id,created_at')
      .eq('email_contacto', contactEmail)
      .gte('created_at', new Date(Date.now() - 120000).toISOString())
      .limit(2)

    if (!recentError && (recentTickets || []).length >= 2) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Ya registraste solicitudes hace pocos segundos. Espera un momento antes de enviar otro ticket.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    // Crear ticket con código único
    let createdTicket = null
    for (let attempts = 0; attempts < 6; attempts++) {
      const ticketCodigo = buildTicketCode()
      
      const { data, error: insertError } = await supabase
        .from('soporte_tickets')
        .insert({
          ticket_codigo: ticketCodigo,
          radicado: radicado || 'SIN-RADICADO',
          email_contacto: contactEmail,
          nombre_contacto: sanitizeText(profile.nombre_completo, 150) || 'Beneficiario',
          asunto: cleanAsunto,
          estado: 'recibido',
          prioridad: 'media',
        })
        .select('id,ticket_codigo,radicado,email_contacto,nombre_contacto,asunto,estado,prioridad,created_at')
        .single()

      if (data) {
        createdTicket = data
        break
      }

      // Si el error no es por código duplicado, lanzar error
      if (insertError && insertError.code !== '23505') {
        console.error('❌ Error creando ticket:', insertError)
        return new Response(
          JSON.stringify({ ok: false, error: insertError.message || 'No se pudo registrar tu ticket.' }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        )
      }
    }

    if (!createdTicket) {
      return new Response(
        JSON.stringify({ ok: false, error: 'No se pudo generar el número de ticket. Inténtalo nuevamente.' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    // Insertar el primer mensaje del beneficiario
    console.log('🔍 [DEBUG] Insertando mensaje inicial para ticket:', createdTicket.id)
    console.log('🔍 [DEBUG] Datos mensaje:', {
      ticket_id: createdTicket.id,
      autor_tipo: 'beneficiario',
      mensaje_length: cleanMensaje.length,
      admin_user_id: null,
    })

    const { data: mensajeData, error: mensajeError } = await supabase
      .from('portal_ticket_mensajes')
      .insert({
        ticket_id: createdTicket.id,
        autor_tipo: 'beneficiario',
        mensaje: cleanMensaje,
        admin_user_id: null,
      })
      .select()

    if (mensajeError) {
      console.error('❌ Error insertando mensaje inicial:', mensajeError)
      console.error('❌ Error code:', mensajeError.code)
      console.error('❌ Error details:', mensajeError.details)
      console.error('❌ Error hint:', mensajeError.hint)
      // FALLAR si no se puede crear el mensaje
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'No se pudo crear el mensaje inicial del ticket.',
          details: mensajeError.message,
          code: mensajeError.code,
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

    console.log('✅ Mensaje inicial creado:', mensajeData)

    console.log('✅ Ticket creado:', createdTicket.ticket_codigo)

    return new Response(
      JSON.stringify({
        ok: true,
        ticket: createdTicket,
        message: 'Tu ticket fue creado correctamente. El equipo revisará tu solicitud pronto.',
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
    console.error('❌ Error en crear-ticket-beneficiario:', error)
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
