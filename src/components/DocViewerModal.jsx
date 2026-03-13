import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, Loader2, X } from 'lucide-react';
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
 *   doc      – portal_actualizacion_documentos row (storage_path, tipo_documento,
 *              nombre_original, mime_type)
 *   onClose  – () => void
 */
const DocViewerModal = ({ doc, onClose }) => {
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [signedUrl, setSignedUrl] = useState(null);
  const [urlError, setUrlError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetchUrl = async () => {
      try {
        const { data, error } = await supabase.storage
          .from('soportes')
          .createSignedUrl(doc.storage_path, 300);
        if (!mounted) return;
        if (error) throw error;
        setSignedUrl(data.signedUrl);
      } catch (e) {
        if (!mounted) return;
        setUrlError(e.message || 'No se pudo generar el enlace del documento.');
      } finally {
        if (mounted) setLoadingUrl(false);
      }
    };
    fetchUrl();
    return () => { mounted = false; };
  }, [doc.storage_path]);

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
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <FileText size={18} className="text-secondary shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-slate-800 truncate">{label}</p>
              <p className="text-xs text-slate-400 truncate">{fileName}</p>
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
