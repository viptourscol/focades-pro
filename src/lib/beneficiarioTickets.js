import { clearLocalAuthSession, getSafeSession, supabase } from './supabase';

const parseInvokeResult = ({ data, error }) => {
  if (error || data?.ok === false) {
    return {
      ok: false,
      status: Number(error?.context?.status || data?.code || 0) || 0,
      error:
        error?.message ||
        data?.error ||
        data?.message ||
        'No se pudo comunicar con el servicio de tickets.',
    };
  }

  return { ok: true, status: 200, data };
};

export const invokeBeneficiarioTickets = async (payload) => {
  const baseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!baseUrl || !anonKey) {
    return { ok: false, error: 'Faltan variables de entorno de Supabase.' };
  }

  // Intentar obtener sesión de Supabase Auth (Google OAuth)
  const { session } = await getSafeSession();
  const accessToken = String(session?.access_token || '').trim();
  
  // Intentar obtener sesión de documento (localStorage)
  let beneficiarioId = null;
  try {
    const sessionStr = localStorage.getItem('focades:beneficiario-session');
    if (sessionStr) {
      const documentSession = JSON.parse(sessionStr);
      const sessionTime = new Date(documentSession.timestamp).getTime();
      const maxAge = 24 * 60 * 60 * 1000;
      
      if (Date.now() - sessionTime <= maxAge && documentSession.beneficiario_id) {
        beneficiarioId = documentSession.beneficiario_id;
      }
    }
  } catch (error) {
    console.error('Error leyendo sesión de documento:', error);
  }

  // Si no hay ninguna sesión válida, retornar error
  if (!accessToken && !beneficiarioId) {
    return {
      ok: false,
      error: 'Tu sesión expiró. Inicia sesión nuevamente para ver tus tickets.',
      authExpired: true,
    };
  }

  try {
    const executeCall = async () => {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      const bodyData = {
        ...(payload || {}),
      };
      
      // Incluir access_token o beneficiario_id según el tipo de sesión
      if (accessToken) {
        bodyData.access_token = accessToken;
      } else if (beneficiarioId) {
        bodyData.beneficiario_id = beneficiarioId;
      }
      
      const result = await supabase.functions.invoke('beneficiary-support-tickets', {
        headers,
        body: bodyData,
      });
      return parseInvokeResult(result);
    };

    let result = await executeCall();
    const normalizedError = String(result?.error || '').toLowerCase();
    
    // Solo intentar refresh si estamos usando JWT (no aplica para sesión de documento)
    const isJwtError =
      accessToken && // Solo si hay JWT
      (result?.status === 401 || normalizedError.includes('unauthorized')) &&
      (normalizedError.includes('invalid jwt') ||
        normalizedError.includes('jwt expired') ||
        normalizedError.includes('missing authorization') ||
        normalizedError.includes('sesión inválida'));

    if (isJwtError) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      const retryToken = String(refreshed?.session?.access_token || '').trim();

      if (!refreshError && retryToken) {
        result = await executeCall();
      }

      if (!result.ok && result.status === 401) {
        const finalError = String(result.error || '').toLowerCase();
        const definitelyExpired =
          finalError.includes('invalid jwt') ||
          finalError.includes('jwt expired') ||
          finalError.includes('missing authorization') ||
          finalError.includes('sesión inválida');

        if (definitelyExpired) {
          await clearLocalAuthSession();
          return {
            ok: false,
            error: 'Tu sesión expiró o es inválida. Inicia sesión nuevamente para continuar.',
            authExpired: true,
          };
        }

        return {
          ok: false,
          error: result.error || 'No autorizado para consultar tickets en este momento.',
        };
      }
    }
    
    // Si hay error 401 con sesión de documento, limpiar localStorage
    if (!accessToken && beneficiarioId && result?.status === 401) {
      localStorage.removeItem('focades:beneficiario-session');
      return {
        ok: false,
        error: 'Tu sesión expiró. Inicia sesión nuevamente para continuar.',
        authExpired: true,
      };
    }

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return { ok: true, data: result.data };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || 'No se pudo comunicar con el servicio de tickets.',
    };
  }
};
