import { useEffect, useState } from 'react';
import { ExternalLink, Megaphone, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showInfoAlert } from '../lib/alerts';

const NewsModal = ({ item, onClose }) => {
  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {item.image_url && (
          <img src={item.image_url} alt={item.title || 'Noticia'} className="w-full h-52 object-cover shrink-0" />
        )}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 shrink-0">
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-secondary">
              <Megaphone size={13} /> Programa FOCADES
            </p>
            <h2 className="text-xl font-extrabold text-primary mt-0.5 leading-tight">{item.title || 'Sin título'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4 flex-1 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
          {item.content || item.summary || 'Sin contenido.'}
        </div>
        {(item.button_url || item.publish_at) && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-4 shrink-0">
            {item.publish_at && (
              <p className="text-xs text-slate-400">
                {new Date(item.publish_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
            {item.button_url && (
              <a
                href={item.button_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-bold text-secondary hover:underline ml-auto"
              >
                {item.button_label || 'Ver más'} <ExternalLink size={14} />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const BeneficiarioHome = () => {
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState([]);
  const [selectedNews, setSelectedNews] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      const nowIso = new Date().toISOString();

      const [{ data: newsData }, { data: modalData }] = await Promise.all([
        supabase
          .from('portal_noticias')
          .select('*')
          .eq('is_active', true)
          .lte('publish_at', nowIso)
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('publish_at', { ascending: false })
          .limit(20),
        supabase
          .from('portal_modal_anuncios')
          .select('*')
          .eq('is_active', true)
          .lte('visible_desde', nowIso)
          .or(`visible_hasta.is.null,visible_hasta.gte.${nowIso}`)
          .order('priority', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!mounted) return;

      setNews(Array.isArray(newsData) ? newsData : []);
      setLoading(false);

      const modalDismissKey = `portal:modal:${modalData?.id || ''}:dismissed`;
      if (modalData?.id && !sessionStorage.getItem(modalDismissKey)) {
        await showInfoAlert({
          title: modalData.title || 'Información importante',
          text: modalData.content || '',
        });
        sessionStorage.setItem(modalDismissKey, '1');
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <NewsModal item={selectedNews} onClose={() => setSelectedNews(null)} />

      <section className="bg-white border border-border rounded-2xl p-5 md:p-6">
        <h2 className="text-xl font-extrabold text-primary">Inicio</h2>
        <p className="text-sm text-slate-600 mt-1">Noticias y avisos relevantes del programa.</p>
      </section>

      {loading ? (
        <div className="bg-white border border-border rounded-2xl p-8 text-center text-slate-500">Cargando contenido...</div>
      ) : news.length === 0 ? (
        <div className="bg-white border border-border rounded-2xl p-8 text-center text-slate-500">No hay publicaciones activas.</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {news.map((item) => (
            <article
              key={item.id}
              className="bg-white border border-border rounded-2xl overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
              onClick={() => setSelectedNews(item)}
            >
              {item.image_url && (
                <img src={item.image_url} alt={item.title || 'Noticia'} className="w-full h-40 object-cover group-hover:brightness-95 transition-all" />
              )}
              <div className="p-4 space-y-2">
                <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-secondary">
                  <Megaphone size={13} /> Programa FOCADES
                </p>
                <h3 className="font-bold text-primary leading-tight group-hover:text-secondary transition-colors">{item.title || 'Sin título'}</h3>
                <p className="text-sm text-slate-600 line-clamp-3">{item.summary || item.content || 'Sin descripción.'}</p>
                <p className="text-xs text-secondary font-semibold mt-1">Leer más →</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default BeneficiarioHome;
