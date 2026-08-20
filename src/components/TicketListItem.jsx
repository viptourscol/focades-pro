import { Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

/**
 * Item de la lista de tickets
 * @param {Object} props
 * @param {Object} props.ticket - Objeto del ticket
 * @param {boolean} props.selected - Si está seleccionado
 * @param {function} props.onClick - Callback al hacer click
 * @param {number} props.unreadCount - Número de mensajes no leídos (opcional)
 */
export default function TicketListItem({ ticket, selected, onClick, unreadCount = 0 }) {
  // Estados posibles: recibido, en_revision, respondido, cerrado
  const getStatusConfig = (estado, cerradoAt) => {
    if (cerradoAt) {
      return {
        icon: XCircle,
        color: 'text-gray-500',
        bgColor: 'bg-gray-100',
        label: 'Cerrado'
      };
    }
    
    switch (estado) {
      case 'recibido':
        return {
          icon: Clock,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          label: 'Recibido'
        };
      case 'en_revision':
        return {
          icon: AlertCircle,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          label: 'En revisión'
        };
      case 'respondido':
        return {
          icon: CheckCircle2,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          label: 'Respondido'
        };
      default:
        return {
          icon: Clock,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          label: estado
        };
    }
  };

  const statusConfig = getStatusConfig(ticket.estado, ticket.cerrado_at);
  const StatusIcon = statusConfig.icon;

  // Formatear fecha
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Hoy';
    } else if (diffDays === 1) {
      return 'Ayer';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('es-CO', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
    }
  };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors ${
        selected ? 'bg-green-50 border-l-4 border-l-green-500' : 'border-l-4 border-l-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Contenido principal */}
        <div className="flex-1 min-w-0">
          {/* Asunto */}
          <h3 className={`font-semibold text-sm mb-1 truncate ${
            selected ? 'text-green-700' : 'text-gray-800'
          }`}>
            {ticket.asunto}
          </h3>
          
          {/* Código del ticket */}
          <p className="text-xs text-gray-500 mb-2 font-mono">
            {ticket.ticket_codigo}
          </p>
          
          {/* Estado */}
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {statusConfig.label}
            </span>
            
            {/* Badge de mensajes no leídos */}
            {unreadCount > 0 && !ticket.cerrado_at && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-green-500 text-white text-xs font-bold rounded-full">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
        </div>

        {/* Fecha */}
        <div className="flex-shrink-0 text-right">
          <span className="text-xs text-gray-500">
            {formatDate(ticket.created_at)}
          </span>
        </div>
      </div>
    </button>
  );
}
