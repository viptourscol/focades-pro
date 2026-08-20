import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';

/**
 * Componente de input para enviar mensajes en el chat
 * @param {Object} props
 * @param {function} props.onSend - Callback cuando se envía un mensaje (recibe el texto)
 * @param {boolean} props.disabled - Si está deshabilitado (ticket cerrado)
 * @param {string} [props.placeholder] - Texto placeholder
 * @param {boolean} [props.loading] - Estado de carga
 */
export default function ChatInput({ onSend, disabled, placeholder = 'Escribe tu mensaje...', loading = false }) {
  const [mensaje, setMensaje] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = mensaje.trim();
    if (!trimmed || disabled || loading) return;
    
    onSend(trimmed);
    setMensaje('');
  };

  const handleKeyDown = (e) => {
    // Enviar con Enter (sin Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
      {/* Textarea con autoexpand */}
      <div className="flex-1 relative">
        <textarea
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Este ticket fue cerrado' : placeholder}
          disabled={disabled || loading}
          rows={1}
          className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed transition-all"
          style={{
            minHeight: '48px',
            maxHeight: '120px',
            overflowY: mensaje.split('\n').length > 3 ? 'auto' : 'hidden'
          }}
        />
        {/* Contador de caracteres */}
        {!disabled && mensaje.length > 0 && (
          <span className={`absolute bottom-2 right-3 text-xs ${
            mensaje.length > 2500 ? 'text-red-500' : 'text-gray-400'
          }`}>
            {mensaje.length}/2500
          </span>
        )}
      </div>

      {/* Botón enviar */}
      <button
        type="submit"
        disabled={disabled || loading || !mensaje.trim() || mensaje.length < 10}
        className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-green-600 text-white flex items-center justify-center hover:from-green-600 hover:to-green-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg disabled:shadow-none"
        title={
          disabled ? 'Ticket cerrado' : 
          mensaje.length < 10 ? 'Mínimo 10 caracteres' :
          'Enviar mensaje (Enter)'
        }
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Send className="w-5 h-5" />
        )}
      </button>
    </form>
  );
}
