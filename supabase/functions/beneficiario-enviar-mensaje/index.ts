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

const sanitizeText = (value: any, maxLength = 3000) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)

Deno.serve(async (req) => {
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
    const body = await req.json()
    const { beneficiario_id, ticket_id, mensaje } = body

    if (!beneficiario_id || !ticket_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'beneficiario_id y ticket_id requeridos' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    const cleanMensaje = sanitizeText(mensaje, 2500)

    if (cleanMensaje.length < 10) {
      return new Response(
        JSON.stringify({ ok: false, error: 'El mensaje debe tener al menos 10 caracteres.' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    const { data: profile, error: profileError } = await supabase
      .from('portal_beneficiarios')
      .select('id,email')
      .eq('id', beneficiario_id)
      .maybeSingle()

    if (profileError || !profile) {
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

    const { data: ticket, error: ticketError } = await supabase
      .from('soporte_tickets')
      .select('id,ticket_codigo,email_contacto,estado,cerrado_at')
      .eq('id', ticket_id)
      .eq('email_contacto', contactEmail)
      .maybeSingle()

    if (ticketError || !ticket) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Ticket no encontrado.' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    if (ticket.cerrado_at) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Este ticket fue cerrado por el administrador.' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    const { data: mensaje_insertado, error: insertError } = await supabase
      .from('portal_ticket_mensajes')
      .insert({
        ticket_id: ticket_id,
        autor_tipo: 'beneficiario',
        mensaje: cleanMensaje,
        admin_user_id: null,
      })
      .select('id,ticket_id,autor_tipo,mensaje,created_at')
      .single()

    if (insertError || !mensaje_insertado) {
      return new Response(
        JSON.stringify({ ok: false, error: insertError?.message || 'No se pudo enviar el mensaje.' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }
    
    await supabase
      .from('soporte_tickets')
      .update({
        estado: 'respondido',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticket_id)

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Mensaje enviado correctamente.',
        mensaje: mensaje_insertado,
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
