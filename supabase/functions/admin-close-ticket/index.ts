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
    // Validar autenticación admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: 'No autorizado' }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: 'No autorizado' }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Verificar que el usuario es admin
    const { data: adminUser, error: adminError } = await supabase
      .from('portal_admin_users')
      .select('user_id,role,is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (adminError || !adminUser) {
      return new Response(
        JSON.stringify({ ok: false, error: 'No tienes permisos de administrador' }),
        { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const body = await req.json()
    const { ticket_id } = body

    if (!ticket_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'ticket_id requerido' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    console.log('🔒 [Admin] Cerrando ticket:', ticket_id)

    // Verificar que el ticket existe y no está cerrado
    const { data: ticket, error: ticketError } = await supabase
      .from('soporte_tickets')
      .select('id,ticket_codigo,cerrado_at')
      .eq('id', ticket_id)
      .maybeSingle()

    if (ticketError || !ticket) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Ticket no encontrado.' }),
        { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    if (ticket.cerrado_at) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Este ticket ya está cerrado.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Cerrar el ticket
    const { data: updatedTicket, error: updateError } = await supabase
      .from('soporte_tickets')
      .update({
        estado: 'cerrado',
        cerrado_at: new Date().toISOString(),
        cerrado_por: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticket_id)
      .select('id,ticket_codigo,estado,cerrado_at,cerrado_por')
      .single()

    if (updateError || !updatedTicket) {
      console.error('❌ Error cerrando ticket:', updateError)
      return new Response(
        JSON.stringify({ ok: false, error: updateError?.message || 'No se pudo cerrar el ticket.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    console.log('✅ [Admin] Ticket cerrado:', ticket.ticket_codigo)

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Ticket cerrado correctamente.',
        ticket: updatedTicket,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (error) {
    console.error('❌ Error en admin-close-ticket:', error)
    return new Response(
      JSON.stringify({ ok: false, error: 'Error interno del servidor', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
