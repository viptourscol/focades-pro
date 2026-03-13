// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      throw new HttpError('Método no permitido.', 405);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      throw new HttpError('Faltan variables de entorno del proyecto Supabase.', 500);
    }

    // Cliente con service role para operaciones admin de Auth
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verificar que el caller es un admin registrado
    const authHeader = req.headers.get('authorization') ?? '';
    const callerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!callerToken) throw new HttpError('Se requiere autenticación.', 401);

    const { data: { user: callerUser }, error: callerError } = await adminClient.auth.getUser(callerToken);
    if (callerError || !callerUser?.id) throw new HttpError('No autenticado.', 401);

    const { data: adminRow } = await adminClient
      .from('portal_admin_users')
      .select('user_id')
      .eq('user_id', callerUser.id)
      .maybeSingle();

    if (!adminRow?.user_id) throw new HttpError('Solo administradores pueden enviar invitaciones.', 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const nombre = String(body?.nombre || '').trim() || 'Beneficiario';

    if (!email || !isValidEmail(email)) {
      throw new HttpError('El correo electrónico no es válido.', 400);
    }

    // Verificar que existe un beneficiario con ese email
    const { data: beneficiarios } = await adminClient
      .from('portal_beneficiarios')
      .select('id, email, auth_user_id')
      .ilike('email', email)
      .order('updated_at', { ascending: false })
      .limit(1);

    const beneficiario = Array.isArray(beneficiarios) ? beneficiarios[0] || null : null;

    if (!beneficiario) {
      throw new HttpError('No se encontró un beneficiario con ese correo.', 404);
    }

    // Si ya tiene auth_user_id activo, informar sin reenviar
    if (beneficiario.auth_user_id) {
      return new Response(
        JSON.stringify({ ok: true, already_linked: true, message: 'Este beneficiario ya tiene acceso activo al portal.' }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // Verificar si ya existe una cuenta auth con ese email para evitar duplicados
    const { data: { users: existingUsers } } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null;
    const alreadyInAuth = Boolean(existingUser?.id);

    if (alreadyInAuth) {
      // Ya tiene cuenta auth: vincular inmediatamente para evitar bucles de login.
      const { error: linkError } = await adminClient
        .from('portal_beneficiarios')
        .update({
          auth_user_id: existingUser.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', beneficiario.id)
        .is('auth_user_id', null);

      if (linkError) {
        throw new HttpError(linkError.message || 'No se pudo vincular el beneficiario con su cuenta de acceso.', 500);
      }

      return new Response(
        JSON.stringify({
          ok: true,
          already_linked: true,
          message: 'Beneficiario vinculado con su cuenta de acceso. Ya puede iniciar sesión con Google.',
        }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // Enviar invitación — Supabase crea la cuenta auth y envía el email con link de activación
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: `${Deno.env.get('SITE_URL') ?? 'https://focades.vercel.app'}/beneficiario/login`,
        data: { role: 'beneficiario', nombre },
      }
    );

    if (inviteError) {
      throw new HttpError(inviteError.message || 'No se pudo enviar la invitación.', 500);
    }

    const invitedUserId = String(inviteData?.user?.id || '').trim();
    if (invitedUserId) {
      await adminClient
        .from('portal_beneficiarios')
        .update({
          auth_user_id: invitedUserId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', beneficiario.id)
        .is('auth_user_id', null);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        already_linked: false,
        message: `Solicitud de invitación procesada para ${email}. Si el correo no llega, el beneficiario puede iniciar sesión con Google usando ese mismo correo.`,
      }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  } catch (err) {
    const status = err instanceof Error && 'status' in err ? (err as HttpError).status : 500;
    const message = err instanceof Error ? err.message : 'Error interno del servidor.';
    return new Response(
      JSON.stringify({ ok: false, message }),
      { status, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  }
});
