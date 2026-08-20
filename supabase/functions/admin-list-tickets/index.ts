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
    const { estado, query, limit } = body

    console.log('🎫 [Admin] Listando tickets...', { estado, query })

    // Query base para tickets
    let ticketsQuery = supabase
      .from('soporte_tickets')
      .select('id,ticket_codigo,radicado,email_contacto,nombre_contacto,asunto,estado,prioridad,admin_user_id,created_at,updated_at,respondido_at,cerrado_at,cerrado_por')
      .order('created_at', { ascending: false })

    // Filtro por estado
    if (estado && estado !== 'all') {
      ticketsQuery = ticketsQuery.eq('estado', estado)
    }

    // Búsqueda por texto
    if (query && query.trim()) {
      const searchTerm = query.trim().toLowerCase()
      ticketsQuery = ticketsQuery.or(
        `ticket_codigo.ilike.%${searchTerm}%,radicado.ilike.%${searchTerm}%,email_contacto.ilike.%${searchTerm}%,asunto.ilike.%${searchTerm}%`
      )
    }

    // Límite de resultados
    ticketsQuery = ticketsQuery.limit(limit || 100)

    const { data: tickets, error: ticketsError } = await ticketsQuery

    if (ticketsError) {
      console.error('❌ Error obteniendo tickets:', ticketsError)
      return new Response(
        JSON.stringify({ ok: false, error: ticketsError.message || 'No se pudieron cargar los tickets.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
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

    // Obtener estadísticas
    const { data: statsData } = await supabase
      .from('soporte_tickets')
      .select('estado')

    const stats = {
      total: (statsData || []).length,
      recibido: (statsData || []).filter(t => t.estado === 'recibido').length,
      en_revision: (statsData || []).filter(t => t.estado === 'en_revision').length,
      respondido: (statsData || []).filter(t => t.estado === 'respondido').length,
      cerrado: (statsData || []).filter(t => t.estado === 'cerrado').length,
      activos: (statsData || []).filter(t => t.estado !== 'cerrado').length,
      resueltos: (statsData || []).filter(t => t.estado === 'cerrado').length,
      pendientes: (statsData || []).filter(t => t.estado === 'recibido').length,
    }

    console.log(`✅ [Admin] ${tickets?.length || 0} tickets, ${mensajes.length} mensajes`)

    return new Response(
      JSON.stringify({
        ok: true,
        tickets: tickets || [],
        mensajes: mensajes,
        stats: stats,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (error) {
    console.error('❌ Error en admin-list-tickets:', error)
    return new Response(
      JSON.stringify({ ok: false, error: 'Error interno del servidor', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
