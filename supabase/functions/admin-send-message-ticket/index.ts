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
    const { ticket_id, mensaje, prioridad, estado } = body

    if (!ticket_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'ticket_id requerido' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const cleanMensaje = sanitizeText(mensaje, 2500)

    if (cleanMensaje.length < 10) {
      return new Response(
        JSON.stringify({ ok: false, error: 'El mensaje debe tener al menos 10 caracteres.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    console.log('💬 [Admin] Enviando mensaje al ticket:', ticket_id)

    // Verificar que el ticket existe
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

    // Validar que el ticket no está cerrado
    if (ticket.cerrado_at) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Este ticket está cerrado. No se pueden agregar más mensajes.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Insertar mensaje en portal_ticket_mensajes
    const { data: nuevoMensaje, error: insertError } = await supabase
      .from('portal_ticket_mensajes')
      .insert({
        ticket_id: ticket_id,
        autor_tipo: 'admin',
        mensaje: cleanMensaje,
        admin_user_id: user.id,
      })
      .select('id,ticket_id,autor_tipo,mensaje,admin_user_id,created_at')
      .single()

    if (insertError || !nuevoMensaje) {
      console.error('❌ Error insertando mensaje:', insertError)
      return new Response(
        JSON.stringify({ ok: false, error: insertError?.message || 'No se pudo enviar el mensaje.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Actualizar el ticket (estado, prioridad, admin_user_id, respondido_at)
    const updateData: any = {
      admin_user_id: user.id,
      respondido_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (estado && ['recibido', 'en_revision', 'respondido', 'cerrado'].includes(estado)) {
      updateData.estado = estado
    } else {
      updateData.estado = 'en_revision'
    }

    if (prioridad && ['baja', 'media', 'alta'].includes(prioridad)) {
      updateData.prioridad = prioridad
    }

    const { error: updateError } = await supabase
      .from('soporte_tickets')
      .update(updateData)
      .eq('id', ticket_id)

    if (updateError) {
      console.error('⚠️ Error actualizando ticket:', updateError)
      // No fallamos si no se puede actualizar el estado, el mensaje ya fue guardado
    }

    console.log('✅ [Admin] Mensaje enviado:', ticket.ticket_codigo)

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Mensaje enviado correctamente.',
        mensaje: nuevoMensaje,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (error) {
    console.error('❌ Error en admin-send-message-ticket:', error)
    return new Response(
      JSON.stringify({ ok: false, error: 'Error interno del servidor', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
