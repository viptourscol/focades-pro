import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * ResponsiveDrawer: Modal/Drawer responsive
 * - Desktop (≥1024px): Drawer lateral derecha (45% ancho) con overlay
 * - Tablet (768-1023px): Drawer 60% ancho
 * - Mobile (<768px): Modal centrado 95% ancho
 * 
 * Props:
 * - isOpen: boolean - Controla visibilidad
 * - onClose: function - Callback al cerrar
 * - title: string - Título del drawer/modal
 * - children: ReactNode - Contenido
 * - position: 'left'|'right'|'center' - Posición (default: 'right')
 */
export default function ResponsiveDrawer({
  isOpen,
  onClose,
  title,
  children,
  position = 'right',
}) {
  // Cerrar con ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Desktop: Drawer lateral (≥1024px)
  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer/Modal Container */}
      <div
        className={`
          absolute inset-y-0 flex transition-transform duration-300 ease-out
          max-w-full overflow-hidden
          
          /* Desktop: Drawer derecha (≥1024px) */
          lg:right-0 lg:w-[45%] lg:max-w-[600px]
          
          /* Tablet: Drawer derecha 60% (768px-1023px) */
          md:right-0 md:w-[60%] md:max-w-[600px]
          
          /* Mobile: Modal centrado 95% (<768px) */
          left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
          w-[95%] max-w-[500px] h-[90vh] md:h-auto
          
          bg-white rounded-2xl md:rounded-none shadow-2xl md:shadow-none
          flex flex-col
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
