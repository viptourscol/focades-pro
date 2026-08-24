import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const getSupabaseSingleton = () => {
	const globalKey = '__focades_supabase_client__'
	const globalScope = globalThis

	if (!globalScope[globalKey]) {
		globalScope[globalKey] = createClient(supabaseUrl, supabaseAnonKey, {
			auth: {
				persistSession: true,
				autoRefreshToken: true,
				detectSessionInUrl: true,
				flowType: 'implicit',
				storageKey: 'focades-auth-token',
			},
		})
	}

	return globalScope[globalKey]
}

export const supabase = getSupabaseSingleton()

let sessionRequestInFlight = null
let cachedSessionResult = { session: null, error: null, fetchedAt: 0 }
const SESSION_CACHE_TTL_MS = 1500

export const clearLocalAuthSession = async () => {
	try {
		await supabase.auth.signOut({ scope: 'local' })
	} catch {
		// ignore client signout errors
	}

	try {
		localStorage.removeItem('focades-auth-token')
		sessionStorage.removeItem('focades-auth-token')
	} catch {
		// ignore storage cleanup errors
	}
}

export const getSafeSession = async () => {
	const nowMs = Date.now()
	if (nowMs - cachedSessionResult.fetchedAt < SESSION_CACHE_TTL_MS) {
		return {
			session: cachedSessionResult.session,
			error: cachedSessionResult.error,
		}
	}

	if (sessionRequestInFlight) {
		return sessionRequestInFlight
	}

	sessionRequestInFlight = (async () => {
	const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
	let session = sessionData?.session || null

	if (sessionError) {
		await clearLocalAuthSession()
		const result = { session: null, error: sessionError }
		cachedSessionResult = { ...result, fetchedAt: Date.now() }
		return result
	}

	if (!session?.access_token) {
		const result = { session: null, error: null }
		cachedSessionResult = { ...result, fetchedAt: Date.now() }
		return result
	}

	const now = Math.floor(Date.now() / 1000)
	const expiresAt = Number(session.expires_at || 0)

	if (expiresAt > 0 && expiresAt - now <= 90) {
		const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
		if (!refreshError && refreshed?.session) {
			session = refreshed.session
		}
	}

	const token = String(session?.access_token || '').trim()
	if (!token) {
		return { session: null, error: null }
	}

	const { error: userError } = await supabase.auth.getUser(token)
	if (!userError) {
		const result = { session, error: null }
		cachedSessionResult = { ...result, fetchedAt: Date.now() }
		return result
	}

	const message = String(userError.message || '').toLowerCase()
	const shouldRefresh =
		userError.status === 401 ||
		message.includes('invalid jwt') ||
		message.includes('jwt expired') ||
		message.includes('token has expired')

	if (shouldRefresh) {
		const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
		if (!refreshError && refreshed?.session) {
			const result = { session: refreshed.session, error: null }
			cachedSessionResult = { ...result, fetchedAt: Date.now() }
			return result
		}
	}

	await clearLocalAuthSession()
	const result = { session: null, error: userError }
	cachedSessionResult = { ...result, fetchedAt: Date.now() }
	return result
	})()

	try {
		return await sessionRequestInFlight
	} finally {
		sessionRequestInFlight = null
	}
}

/**
 * Cierre de sesión debido a timeout por inactividad
 * Limpia la sesión y redirige al usuario a la página de login
 */
export const logoutDueToTimeout = async () => {
	try {
		await clearLocalAuthSession()
		// Guardar razón de logout para mostrar mensaje en login
		sessionStorage.setItem('focades:logout-reason', 'session-expired')
	} catch (error) {
		console.error('Error limpiando sesión por timeout:', error)
	}
	
	// Redirigir a login
	if (typeof window !== 'undefined') {
		window.location.href = '/login?reason=session-expired'
	}
}