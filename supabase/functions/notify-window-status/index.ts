// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const sanitize = (value: unknown, max = 500) => String(value || '').trim().slice(0, max);

const getBearerTokenFromRequest = (req: Request) => {
  const candidates = [
    req.headers.get('authorization'),
    req.headers.get('Authorization'),
    req.headers.get('x-authorization'),
    req.headers.get('X-Authorization'),
    req.headers.get('x-forwarded-authorization'),
    req.headers.get('X-Forwarded-Authorization'),
  ];

  for (const headerValue of candidates) {
    const token = String(headerValue || '').replace(/^Bearer\s+/i, '').trim();
    if (token) return token;
  }

  return '';
};

const resolveWindowState = (windowLike: any) => {
  const now = new Date();
  const start = windowLike?.fecha_inicio ? new Date(windowLike.fecha_inicio) : null;
  const end = windowLike?.fecha_fin ? new Date(windowLike.fecha_fin) : null;
  const isActive = Boolean(windowLike?.is_active);

  if (!isActive) return 'inactiva';
  if (start && now < start) return 'proxima';
  if (end && now > end) return 'cerrada';
  return 'habilitada';
};

const toDisplayDate = (value: unknown) => {
  const d = new Date(String(value || ''));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const buildNotificationPayload = ({ estado, ventanaNombre, fechaInicio, fechaFin }: any) => {
  if (estado === 'cerrada') {
    return {
      tipo: 'ventana_cerrada',
      titulo: `⏰ Ventana cerrada: ${ventanaNombre}`,
      descripcion: `La ventana de actualización "${ventanaNombre}" finalizó el ${toDisplayDate(fechaFin)}. Revisa nuevas fechas en tu portal.`,
    };
  }

  return {
    tipo: 'ventana_habilitada',
    titulo: `✅ Ventana habilitada: ${ventanaNombre}`,
    descripcion: `Ya está disponible la ventana "${ventanaNombre}". Vigencia: ${toDisplayDate(fechaInicio)} a ${toDisplayDate(fechaFin)}.`,
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      throw new HttpError('Metodo no permitido.', 405);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      throw new HttpError('Configuracion incompleta de Supabase.', 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const bodyToken = sanitize(body?.caller_token, 6000);
    const callerToken = getBearerTokenFromRequest(req) || bodyToken;
    if (!callerToken) throw new HttpError('Se requiere autenticacion.', 401);

    const {
      data: { user: callerUser },
      error: callerError,
    } = await adminClient.auth.getUser(callerToken);

    if (callerError || !callerUser?.id) {
      throw new HttpError('No autenticado.', 401);
    }

    const { data: adminRow } = await adminClient
      .from('portal_admin_users')
      .select('user_id')
      .eq('user_id', callerUser.id)
      .maybeSingle();

    if (!adminRow?.user_id) {
      throw new HttpError('Solo administradores pueden enviar notificaciones.', 403);
    }

    const ventanaId = Number(body?.ventana_id || 0);
    if (!Number.isInteger(ventanaId) || ventanaId <= 0) {
      throw new HttpError('ventana_id invalido.', 400);
    }

    const { data: ventana, error: ventanaError } = await adminClient
      .from('portal_ventanas_actualizacion')
      .select('id,nombre,fecha_inicio,fecha_fin,is_active')
      .eq('id', ventanaId)
      .maybeSingle();

    if (ventanaError || !ventana?.id) {
      throw new HttpError(ventanaError?.message || 'No se encontro la ventana.', 404);
    }

    const estadoBody = sanitize(body?.estado_ventana, 40).toLowerCase();
    const estado = ['habilitada', 'cerrada'].includes(estadoBody)
      ? estadoBody
      : resolveWindowState(ventana);

    if (!['habilitada', 'cerrada'].includes(estado)) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          message: `No se envia notificacion para estado ${estado}.`,
          estado,
        }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    const notificationTpl = buildNotificationPayload({
      estado,
      ventanaNombre: sanitize(ventana.nombre, 160) || 'Periodo vigente',
      fechaInicio: ventana.fecha_inicio,
      fechaFin: ventana.fecha_fin,
    });

    const { data: beneficiarios, error: beneficiariesError } = await adminClient
      .from('portal_beneficiarios')
      .select('id,nombre_completo,email,estado_beneficiario,auth_user_id,deleted_at')
      .eq('estado_beneficiario', 'activo')
      .is('deleted_at', null)
      .not('auth_user_id', 'is', null)
      .limit(20000);

    if (beneficiariesError) {
      throw new HttpError(beneficiariesError.message || 'No se pudieron consultar beneficiarios.', 500);
    }

    const targets = Array.isArray(beneficiarios) ? beneficiarios : [];
    const nowIso = new Date().toISOString();

    if (!targets.length) {
      return new Response(
        JSON.stringify({ ok: true, message: 'No hay beneficiarios activos para notificar.', sent: 0, stored: 0 }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    const notifRows = targets.map((item) => ({
      beneficiario_id: item.id,
      tipo: notificationTpl.tipo,
      titulo: notificationTpl.titulo,
      descripcion: notificationTpl.descripcion,
      contexto: {
        ventana_id: ventana.id,
        ventana_nombre: ventana.nombre,
        fecha_inicio: ventana.fecha_inicio,
        fecha_fin: ventana.fecha_fin,
        estado_ventana: estado,
        triggered_by: callerUser.id,
      },
      created_at: nowIso,
    }));

    let storedCount = 0;
    const chunkSize = 500;
    for (let i = 0; i < notifRows.length; i += chunkSize) {
      const chunk = notifRows.slice(i, i + chunkSize);
      const { error: insertError } = await adminClient
        .from('portal_notificaciones_beneficiarios')
        .insert(chunk);
      if (insertError) {
        throw new HttpError(insertError.message || 'No se pudieron insertar notificaciones de ventana.', 500);
      }
      storedCount += chunk.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        estado,
        ventana_id: ventana.id,
        beneficiarios_objetivo: targets.length,
        notificaciones_guardadas: storedCount,
      }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  } catch (err) {
    const status = err instanceof Error && 'status' in err ? (err as HttpError).status : 500;
    const message = err instanceof Error ? err.message : 'Error interno.';
    return new Response(JSON.stringify({ ok: false, message }), {
      status,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});
