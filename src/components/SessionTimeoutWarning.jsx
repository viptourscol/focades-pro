import { useEffect, useRef } from 'react';
import { Clock, LogOut, ArrowRight } from 'lucide-react';

/**
 * Modal de advertencia cuando la sesión está por expirar
 * Se muestra 2 minutos antes de la expiración
 */
export function SessionTimeoutWarning({ isVisible, timeRemaining, onExtend, onLogout }) {
  const audioRef = useRef(null);

  // Reproducir sonido de alerta cuando quedan 30 segundos
  useEffect(() => {
    if (isVisible && timeRemaining === 30 && audioRef.current) {
      // Crear un sonido de beep simple si no se puede reproducir archivo
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    }
  }, [isVisible, timeRemaining]);

  if (!isVisible) return null;

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Color de alerta: rojo si quedan menos de 30 segundos, amarillo si menos de 1 minuto
  const isUrgent = timeRemaining < 30;
  const isWarning = timeRemaining < 60;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
      <div className={`bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden ${isUrgent ? 'ring-2 ring-red-500' : 'ring-2 ring-amber-300'}`}>
        {/* Header con color dinámico */}
        <div className={`px-6 py-6 ${isUrgent ? 'bg-red-50' : 'bg-amber-50'}`}>
          <div className="flex items-center gap-3 mb-2">
            <Clock className={`${isUrgent ? 'text-red-600 animate-pulse' : 'text-amber-600'}`} size={24} />
            <h2 className={`text-lg font-bold ${isUrgent ? 'text-red-900' : 'text-amber-900'}`}>
              Sesión por expirar
            </h2>
          </div>
          <p className={`text-sm ${isUrgent ? 'text-red-700' : 'text-amber-700'}`}>
            Tu sesión se cerrará por inactividad
          </p>
        </div>

        {/* Contenido */}
        <div className="px-6 py-6 space-y-4">
          {/* Contador de tiempo */}
          <div className="text-center">
            <div className={`text-5xl font-black font-mono ${isUrgent ? 'text-red-600' : 'text-amber-600'}`}>
              {formattedTime}
            </div>
            <p className="text-sm text-slate-600 mt-2">Tiempo restante</p>
          </div>

          {/* Barra de progreso */}
          <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isUrgent ? 'bg-red-600' : 'bg-amber-500'}`}
              style={{ width: `${(timeRemaining / 120) * 100}%` }}
            />
          </div>

          {/* Mensaje */}
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="text-sm text-slate-700">
              {isUrgent
                ? '⚠️ Si no haces clic en los próximos segundos, tu sesión se cerrará automáticamente.'
                : '💡 Si no haces clic en "Mantener sesión", la aplicación se cerrará automáticamente.'}
            </p>
          </div>
        </div>

        {/* Acciones */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex gap-3">
          {/* Botón Cerrar Sesión */}
          <button
            onClick={onLogout}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-900 py-2.5 font-semibold transition-colors"
          >
            <LogOut size={16} />
            Cerrar
          </button>

          {/* Botón Mantener Sesión (principal) */}
          <button
            onClick={onExtend}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-2.5 font-semibold transition-all ${
              isUrgent
                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}
          >
            Mantener sesión
            <ArrowRight size={16} />
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-900 text-slate-300 text-xs text-center">
          Actividad detectada: {timeRemaining <= 60 ? 'URGENTE' : 'Advertencia'}
        </div>
      </div>
    </div>
  );
}
