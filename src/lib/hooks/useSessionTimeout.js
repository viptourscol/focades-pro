import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Hook para detectar inactividad del usuario y expiracion de sesion
 * @param {number} timeoutSeconds - Segundos de inactividad antes de logout
 * @param {Function} onTimeout - Callback cuando la sesión expira
 * @param {boolean} enabled - Si el hook debe estar activo
 * @returns {Object} { isWarning, timeRemaining, extendSession, isExpired }
 */
export function useSessionTimeout(timeoutSeconds = 1800, onTimeout = () => {}, enabled = true) {
  const [isWarning, setIsWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  const lastActivityRef = useRef(Date.now());
  const warningTimeRef = useRef(null);
  const expiryTimeRef = useRef(null);
  const checkIntervalRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const expiryTimeoutRef = useRef(null);

  // Convertir a milisegundos
  const timeoutMs = timeoutSeconds * 1000;
  const warningTimeMs = (timeoutSeconds - 120) * 1000; // 2 minutos antes

  /**
   * Resetear la actividad del usuario
   */
  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsWarning(false);
    setTimeRemaining(0);
  }, []);

  /**
   * Extender la sesión (cuando usuario hace clic en modal)
   */
  const extendSession = useCallback(() => {
    resetActivity();
    
    // Limpiar timeouts anteriores
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    if (expiryTimeoutRef.current) clearTimeout(expiryTimeoutRef.current);

    // Establecer nuevos timeouts
    warningTimeoutRef.current = setTimeout(() => {
      setIsWarning(true);
    }, warningTimeMs);

    expiryTimeoutRef.current = setTimeout(() => {
      setIsExpired(true);
      onTimeout();
    }, timeoutMs);
  }, [timeoutMs, warningTimeMs, onTimeout]);

  /**
   * Listeners de eventos para detectar actividad
   */
  useEffect(() => {
    if (!enabled) return;

    const events = ['mousemove', 'keypress', 'scroll', 'click', 'touchstart'];

    const handleActivity = () => {
      // Solo resetear si ya no estamos en estado de advertencia
      // (permite que la advertencia se muestre sin resetear en cada movimiento)
      if (!isWarning && !isExpired) {
        resetActivity();
      }
    };

    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isWarning, isExpired, enabled, resetActivity]);

  /**
   * Establecer timeouts iniciales y monitorear inactividad
   */
  useEffect(() => {
    if (!enabled) return;

    // Limpiar cualquier intervalo/timeout anterior
    if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    if (expiryTimeoutRef.current) clearTimeout(expiryTimeoutRef.current);

    // Resetear estado inicial
    lastActivityRef.current = Date.now();
    setIsWarning(false);
    setIsExpired(false);

    // Timeout para mostrar advertencia
    warningTimeoutRef.current = setTimeout(() => {
      setIsWarning(true);
    }, warningTimeMs);

    // Timeout para expirar sesión
    expiryTimeoutRef.current = setTimeout(() => {
      setIsExpired(true);
      onTimeout();
    }, timeoutMs);

    // Interval para actualizar tiempo restante en la advertencia
    checkIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;
      const remaining = Math.max(0, Math.floor((timeoutMs - elapsed) / 1000));
      setTimeRemaining(remaining);
    }, 100); // Actualizar cada 100ms para fluidez

    return () => {
      clearInterval(checkIntervalRef.current);
      clearTimeout(warningTimeoutRef.current);
      clearTimeout(expiryTimeoutRef.current);
    };
  }, [enabled, timeoutMs, warningTimeMs, onTimeout]);

  return {
    isWarning,
    timeRemaining,
    extendSession,
    isExpired,
    resetActivity,
  };
}
