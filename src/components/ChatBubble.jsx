import { MessageSquare, User } from 'lucide-react';

/**
 * Componente para mostrar un mensaje individual en el chat
 * @param {Object} props
 * @param {string} props.autorTipo - 'beneficiario' o 'admin'
 * @param {string} props.mensaje - Texto del mensaje
 * @param {string} props.timestamp - Fecha/hora del mensaje
 * @param {string} [props.nombreAdmin] - Nombre del admin (opcional)
 */
export default function ChatBubble({ autorTipo, mensaje, timestamp, nombreAdmin }) {
  const isAdmin = autorTipo === 'admin';
  
  // Formatear timestamp
  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    const timeStr = date.toLocaleTimeString('es-CO', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
    
    if (diffDays === 0) {
      return `Hoy ${timeStr}`;
    } else if (diffDays === 1) {
      return `Ayer ${timeStr}`;
    } else if (diffDays < 7) {
      const dayName = date.toLocaleDateString('es-CO', { weekday: 'short' });
      return `${dayName} ${timeStr}`;
    } else {
      return date.toLocaleDateString('es-CO', { 
        day: 'numeric', 
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  return (
    <div className={`flex gap-3 mb-4 ${isAdmin ? 'flex-row' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div 
        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
          isAdmin 
            ? 'bg-gradient-to-br from-blue-500 to-blue-600' 
            : 'bg-gradient-to-br from-green-500 to-green-600'
        }`}
      >
        {isAdmin ? (
          <MessageSquare className="w-5 h-5 text-white" />
        ) : (
          <User className="w-5 h-5 text-white" />
        )}
      </div>

      {/* Contenido del mensaje */}
      <div className={`flex flex-col max-w-[75%] ${isAdmin ? 'items-start' : 'items-end'}`}>
        {/* Nombre del autor (solo para admin) */}
        {isAdmin && nombreAdmin && (
          <span className="text-xs text-gray-500 mb-1 px-1">
            {nombreAdmin}
          </span>
        )}
        
        {/* Burbuja del mensaje */}
        <div
          className={`rounded-2xl px-4 py-2.5 shadow-sm ${
            isAdmin
              ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
              : 'bg-gradient-to-br from-green-500 to-green-600 text-white rounded-tr-sm'
          }`}
        >
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {mensaje}
          </p>
        </div>
        
        {/* Timestamp */}
        <span className={`text-xs mt-1 px-1 ${isAdmin ? 'text-gray-500' : 'text-gray-600'}`}>
          {formatTime(timestamp)}
        </span>
      </div>
    </div>
  );
}
