import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * ResponsiveDrawer: Modal/Drawer responsive con SPLIT VIEW en desktop
 * - Desktop (≥1024px): Panel lateral FIJO derecha (45% ancho) - SIDE-BY-SIDE con modal
 * - Tablet (768-1023px): Panel 60% ancho
 * - Mobile (<768px): Modal centrado 95% ancho
 * 
 * Props:
 * - isOpen: boolean - Controla visibilidad
 * - onClose: function - Callback al cerrar
 * - title: string - Título del drawer/modal
 * - children: ReactNode - Contenido
 */
export default function ResponsiveDrawer({
  isOpen,
  onClose,
  title,
  children,
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

  return (
    <>
      {/* DESKTOP (≥1024px): Panel lateral fijo derecha (50% ancho) - Split View */}
      <div className="hidden lg:flex fixed right-0 top-0 h-screen w-1/2 bg-white border-l border-slate-200 flex-col shadow-2xl z-50">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0 bg-white sticky top-0 z-10">
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

      {/* TABLET & MOBILE: Modal overlay centrado */}
      <div className="lg:hidden fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl md:rounded-2xl shadow-2xl w-full md:max-w-[90vw] md:max-h-[90vh] flex flex-col h-[90vh] md:h-auto">
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

      {/* Overlay click to close (tablet/mobile only) */}
      <div
        className="lg:hidden fixed inset-0 z-40 bg-transparent"
        onClick={onClose}
        aria-hidden="true"
      />
    </>
  );
}
