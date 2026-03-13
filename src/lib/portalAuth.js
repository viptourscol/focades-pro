import { getSafeSession, supabase } from './supabase';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const PORTAL_AUTH_ERROR_STORAGE_KEY = 'focades:beneficiario-auth-error';

export const setPortalAuthErrorMessage = (message) => {
  const value = String(message || '').trim();
  if (!value) return;

  try {
    sessionStorage.setItem(PORTAL_AUTH_ERROR_STORAGE_KEY, value);
  } catch {
    // ignore storage errors
  }
};

export const consumePortalAuthErrorMessage = () => {
  try {
    const value = sessionStorage.getItem(PORTAL_AUTH_ERROR_STORAGE_KEY) || '';
    sessionStorage.removeItem(PORTAL_AUTH_ERROR_STORAGE_KEY);
    return value;
  } catch {
    return '';
  }
};

export const resolvePortalAccess = async ({ attemptClaim = true } = {}) => {
  const { session, error: sessionError } = await getSafeSession();
  const user = session?.user || null;

  if (sessionError || !session || !user?.id) {
    return {
      ok: false,
      hasSession: false,
      isAdmin: false,
      profile: null,
      session: null,
      reason: 'NO_SESSION',
    };
  }

  const userId = String(user.id || '').trim();
  const email = normalizeEmail(user.email);

  const [{ data: adminRow }, { data: linkedProfile }] = await Promise.all([
    supabase.from('portal_admin_users').select('user_id').eq('user_id', userId).maybeSingle(),
    supabase.from('portal_beneficiarios').select('*').eq('auth_user_id', userId).maybeSingle(),
  ]);

  if (linkedProfile) {
    return {
      ok: true,
      hasSession: true,
      isAdmin: Boolean(adminRow?.user_id),
      profile: linkedProfile,
      session,
      reason: '',
    };
  }

  if (!attemptClaim || !email) {
    return {
      ok: Boolean(adminRow?.user_id),
      hasSession: true,
      isAdmin: Boolean(adminRow?.user_id),
      profile: null,
      session,
      reason: adminRow?.user_id ? '' : 'NOT_LINKED',
    };
  }

  const { data: claimedRows } = await supabase
    .from('portal_beneficiarios')
    .update({
      auth_user_id: userId,
      updated_at: new Date().toISOString(),
    })
    .is('auth_user_id', null)
    .ilike('email', email)
    .select('*');

  const claimedProfile = Array.isArray(claimedRows) ? claimedRows[0] || null : null;

  if (claimedProfile) {
    return {
      ok: true,
      hasSession: true,
      isAdmin: Boolean(adminRow?.user_id),
      profile: claimedProfile,
      session,
      reason: 'CLAIMED',
    };
  }

  return {
    ok: Boolean(adminRow?.user_id),
    hasSession: true,
    isAdmin: Boolean(adminRow?.user_id),
    profile: null,
    session,
    reason: adminRow?.user_id ? '' : 'NOT_LINKED',
  };
};
