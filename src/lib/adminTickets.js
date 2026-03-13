import { getSafeSession } from './supabase';

export const invokeAdminTickets = async (payload) => {
  const baseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!baseUrl || !anonKey) {
    return { ok: false, error: 'Faltan variables de entorno de Supabase.' };
  }

  const { session } = await getSafeSession();
  const accessToken = String(session?.access_token || '').trim();

  const headers = {
    'Content-Type': 'application/json',
    apikey: anonKey,
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(`${baseUrl}/functions/v1/admin-support-tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload || {}),
    });

    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    if (!response.ok || json?.ok === false) {
      return {
        ok: false,
        error: json?.error || json?.message || `${response.status} ${response.statusText}`,
      };
    }

    return { ok: true, data: json };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || 'No se pudo comunicar con administración de tickets.',
    };
  }
};
