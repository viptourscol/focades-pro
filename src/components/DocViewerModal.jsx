import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, Loader2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

const DOC_LABELS = {
  certificado_bancario: 'Certificado bancario',
  certificado_notas: 'Certificado de notas',
  certificado_matricula: 'Certificado de matrícula',
};

const getExt = (value) => String(value || '').split('.').pop().toLowerCase();

const isPdf = (mime, path, name) => {
  if (mime === 'application/pdf') return true;
  return [getExt(path), getExt(name)].includes('pdf');
};

const isImage = (mime, path, name) => {
  if (mime && mime.startsWith('image/')) return true;
  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'];
  return IMAGE_EXTS.includes(getExt(path)) || IMAGE_EXTS.includes(getExt(name));
};

/**
 * DocViewerModal
 * Props:
 *   doc          – portal_actualizacion_documentos row (storage_path, tipo_documento,
 *                  nombre_original, mime_type)
 *   onClose      – () => void
 *   allDocs      – (opcional) array de todos los documentos para navegación
 *   currentIndex – (opcional) índice del documento actual en allDocs
 *   onNavigate   – (opcional) función (newIndex) => void para cambiar de documento
 */
const DocViewerModal = ({ doc, onClose, allDocs = [], currentIndex = -1, onNavigate }) => {
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [signedUrl, setSignedUrl] = useState(null);
  const [urlError, setUrlError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetchUrl = async () => {
      if (!doc?.storage_path) {
        setUrlError('El documento no tiene una ruta de almacenamiento válida para previsualizar.');
        setLoadingUrl(false);
        return;
      }
      setLoadingUrl(true);
      setUrlError(null);
      setSignedUrl(null);
      try {
        console.log('[DocViewerModal] Solicitando signed URL para:', doc.storage_path);
        
        // Usar Edge Function para generar signed URL (bypasses RLS)
        const { data: result, error: invokeError } = await supabase.functions.invoke('get-signed-url', {
          body: {
            storage_path: doc.storage_path,
            expires_in: 300,
          },
        });

        if (!mounted) return;

        if (invokeError) {
          console.error('[DocViewerModal] Error invocando Edge Function:', invokeError);
          throw new Error(invokeError.message || 'Error al generar enlace del documento');
        }

        if (!result?.ok) {
          console.error('[DocViewerModal] Error en respuesta:', result);
          throw new Error(result.error || 'No se pudo generar el enlace del documento');
        }

        console.log('[DocViewerModal] Signed URL generada exitosamente');
        setSignedUrl(result.signedUrl);
      } catch (e) {
        if (!mounted) return;
        console.error('[DocViewerModal] Error:', e);
        setUrlError(e.message || 'No se pudo generar el enlace del documento.');
      } finally {
        if (mounted) setLoadingUrl(false);
      }
    };
    fetchUrl();
    return () => { mounted = false; };
  }, [doc?.storage_path, doc?.id]);

  // Navegación con teclado
  useEffect(() => {
    if (!doc) return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [doc, currentIndex, allDocs]);

  const goToPrevious = () => {
    if (!onNavigate || !allDocs.length || currentIndex <= 0) return;
    onNavigate(currentIndex - 1);
  };

  const goToNext = () => {
    if (!onNavigate || !allDocs.length || currentIndex >= allDocs.length - 1) return;
    onNavigate(currentIndex + 1);
  };

  const canNavigate = onNavigate && allDocs.length > 1;
  const hasPrevious = canNavigate && currentIndex > 0;
  const hasNext = canNavigate && currentIndex < allDocs.length - 1;

  const label = DOC_LABELS[doc.tipo_documento] || doc.tipo_documento || 'Documento';
  const fileName = doc.nombre_original || doc.storage_path?.split('/').pop() || 'archivo';
  const mime = doc.mime_type || '';
  const path = doc.storage_path || '';

  const showPdf = !loadingUrl && !urlError && signedUrl && isPdf(mime, path, fileName);
  const showImage = !loadingUrl && !urlError && signedUrl && !isPdf(mime, path, fileName) && isImage(mime, path, fileName);
  const showUnknown = !loadingUrl && !urlError && signedUrl && !isPdf(mime, path, fileName) && !isImage(mime, path, fileName);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden relative"
        style={{ maxHeight: '92vh' }}
      >
        {/* Botones de navegación flotantes */}
        {hasPrevious && (
          <button
            onClick={goToPrevious}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white p-2 rounded-full shadow-lg transition-all"
            title="Documento anterior (←)"
          >
            <ChevronLeft size={24} className="text-slate-700" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={goToNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white p-2 rounded-full shadow-lg transition-all"
            title="Siguiente documento (→)"
          >
            <ChevronRight size={24} className="text-slate-700" />
          </button>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <FileText size={18} className="text-secondary shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-slate-800 truncate">{label}</p>
              <p className="text-xs text-slate-400 truncate">{fileName}</p>
              {canNavigate && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Documento {currentIndex + 1} de {allDocs.length}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            {signedUrl && (
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-secondary border border-slate-200 rounded-xl px-3 py-1.5 transition-colors"
              >
                <ExternalLink size={13} />
                Abrir en pestaña
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Viewer area */}
        <div className="flex-1 bg-slate-100 flex items-center justify-center overflow-hidden min-h-0">
          {/* Loading */}
          {loadingUrl && (
            <div className="flex flex-col items-center gap-3 text-slate-400 p-12">
              <Loader2 size={30} className="animate-spin" />
              <p className="text-sm">Cargando documento…</p>
            </div>
          )}

          {/* Error */}
          {!loadingUrl && urlError && (
            <div className="flex flex-col items-center gap-3 text-slate-500 p-12 text-center">
              <FileText size={40} strokeWidth={1.5} className="text-slate-300" />
              <p className="text-sm text-red-500">{urlError}</p>
            </div>
          )}

          {/* PDF */}
          {showPdf && (
            <iframe
              src={signedUrl}
              title={label}
              className="w-full border-0"
              style={{ height: '74vh' }}
            />
          )}

          {/* Image */}
          {showImage && (
            <div className="overflow-auto p-6 flex items-center justify-center w-full h-full">
              <img
                src={signedUrl}
                alt={label}
                className="max-w-full object-contain rounded-xl shadow-lg"
                style={{ maxHeight: '72vh' }}
              />
            </div>
          )}

          {/* Unknown type */}
          {showUnknown && (
            <div className="flex flex-col items-center gap-4 p-12 text-center text-slate-500">
              <FileText size={48} strokeWidth={1.5} className="text-slate-300" />
              <p className="text-sm">Este tipo de archivo no se puede previsualizar directamente.</p>
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={fileName}
                className="flex items-center gap-2 bg-secondary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-secondary/90"
              >
                <Download size={16} />
                Descargar archivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocViewerModal;
