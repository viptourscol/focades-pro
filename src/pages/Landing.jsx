import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FileClock,
  GraduationCap,
  HelpCircle,
  Megaphone,
  ShieldCheck,
  Sparkles,
  UserCircle2,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// Paleta Registro: primary #0D2C54 · secondary #1A5A96 · accent #F9A03F · background #F5F7FA · border #dee2e6

// ── Scroll-reveal hook ──────────────────────────────────────────
const useReveal = (threshold = 0.12) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
};

// Wrapper genérico con delay opcional
const Reveal = ({ children, delay = 0, className = '', as: Tag = 'div', ...rest }) => {
  const [ref, visible] = useReveal();
  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(28px)',
        transition: `opacity 0.65s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.65s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
};

const FEATURES = [
  {
    icon: UserCircle2,
    title: 'Consulta tu estado',
    desc: 'Revisa el estado actual de tu beneficio, pagos y datos registrados en el programa.',
  },
  {
    icon: ClipboardList,
    title: 'Actualización semestral',
    desc: 'Envía tus documentos e información cada semestre de forma segura y completamente en línea.',
  },
  {
    icon: FileClock,
    title: 'Historial completo',
    desc: 'Consulta el historial de tus envíos, observaciones y fechas de pago en un solo lugar.',
  },
  {
    icon: ShieldCheck,
    title: 'Seguro y verificado',
    desc: 'Acceso protegido con cuenta institucional y validación oficial de la Alcaldía.',
  },
];

const NewsModal = ({ item, onClose }) => {
  if (!item) return null;
  return (
    <div className="ui-modal-backdrop animate-fade-in" onClick={onClose}>
      <div
        className="ui-modal-surface max-h-[90vh] flex flex-col animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {item.image_url && (
          <img
            src={item.image_url}
            alt={item.title || 'Noticia'}
            className="w-full h-56 object-cover shrink-0"
          />
        )}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 shrink-0">
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#F9A03F' }}>
              <Megaphone size={13} /> Programa FOCADES
            </p>
            <h2 className="text-2xl font-bold mt-1 leading-tight" style={{ color: '#0D2C54' }}>
              {item.title || 'Sin título'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-9 h-9 rounded-xl border bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-600"
            style={{ borderColor: '#dee2e6' }}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4 flex-1 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
          {item.content || item.summary || 'Sin contenido.'}
        </div>
        {(item.button_url || item.publish_at) && (
          <div className="px-6 py-4 border-t flex items-center justify-between gap-4 shrink-0" style={{ borderColor: '#dee2e6' }}>
            {item.publish_at && (
              <p className="text-xs text-slate-500">
                {new Date(item.publish_at).toLocaleDateString('es-CO', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            )}
            {item.button_url && (
              <a
                href={item.button_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-bold hover:underline ml-auto"
                style={{ color: '#1A5A96' }}
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

// ── FAQ section con spotlight cursor ───────────────────────────
const FaqSection = ({ faq, faqLoading }) => {
  const sectionRef = useRef(null);
  const [spot, setSpot] = useState({ x: 50, y: 50, active: false });

  const handleMouseMove = (e) => {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSpot({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
      active: true,
    });
  };

  const handleMouseLeave = () => setSpot((s) => ({ ...s, active: false }));

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative py-20 md:py-28 overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0D2C54 0%, #0e3566 55%, #0D2C54 100%)' }}
    >
      {/* Spotlight que sigue el cursor */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(600px circle at ${spot.x}% ${spot.y}%, rgba(249,160,63,0.09), transparent 55%)`,
          opacity: spot.active ? 1 : 0,
          transition: 'opacity 0.4s',
        }}
      />
      {/* Puntos decorativos */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />
      <div
        className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-15 blur-3xl pointer-events-none"
        style={{ background: '#F9A03F', transform: 'translate(25%, -25%)' }}
      />
      <div
        className="absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: '#009933', transform: 'translate(-30%, 30%)' }}
      />
      <div className="relative max-w-7xl mx-auto px-5 md:px-10">
        <Reveal>
          <div className="max-w-2xl mb-14">
            <p
              className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em]"
              style={{ color: '#F9A03F' }}
            >
              <HelpCircle size={13} /> Preguntas frecuentes
            </p>
            <h2
              className="mt-4 text-4xl md:text-5xl font-extrabold tracking-tight text-white"
              style={{ fontFamily: "'Familjen Grotesk', sans-serif" }}
            >
              Todo lo que necesitas saber.
            </h2>
            <p className="mt-3 text-base" style={{ color: 'rgba(255,255,255,0.58)' }}>
              Resolvemos las dudas más comunes sobre el programa FOCADES.
            </p>
          </div>
        </Reveal>
        {faqLoading ? (
          <div className="grid md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-16 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4 items-start">
            {faq.map((item, i) => (
              <Reveal key={item.id} delay={i * 60}>
                <FaqItem question={item.question} answer={item.answer} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

const Landing = () => {
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [convocatoriaActiva, setConvocatoriaActiva] = useState(null);
  const [selectedNews, setSelectedNews] = useState(null);
  const [faq, setFaq] = useState([]);
  const [faqLoading, setFaqLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const nowIso = new Date().toISOString();
      const [newsRes, convRes, faqRes] = await Promise.all([
        supabase
          .from('portal_noticias')
          .select('id,title,summary,content,image_url,button_label,button_url,publish_at')
          .eq('is_active', true)
          .lte('publish_at', nowIso)
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('publish_at', { ascending: false })
          .limit(6),
        supabase
          .from('convocatorias')
          .select('id,nombre,fecha_inicio,fecha_fin,activa')
          .eq('activa', true)
          .order('fecha_inicio', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('portal_faq')
          .select('id,question,answer')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
      ]);

      if (!mounted) return;
      setNews(Array.isArray(newsRes?.data) ? newsRes.data : []);
      setNewsLoading(false);
      if (convRes?.data) setConvocatoriaActiva(convRes.data);
      setFaq(Array.isArray(faqRes?.data) ? faqRes.data : []);
      setFaqLoading(false);
    };

    load().catch(() => {
      if (mounted) { setNewsLoading(false); setFaqLoading(false); }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="min-h-screen w-full overflow-x-hidden" style={{ backgroundColor: '#F5F7FA' }}>
      {/* ─────────── HERO ─────────── */}
      <section className="relative isolate overflow-hidden text-white">
        {/* Fondo: institucional #009933 con destellos accent #F9A03F */}
        <div
          className="absolute inset-0 -z-20"
          style={{
            background:
              'radial-gradient(800px 450px at 88% -10%, rgba(249,160,63,0.38), transparent 52%), radial-gradient(600px 400px at -5% 115%, rgba(0,100,30,0.7), transparent 55%), linear-gradient(160deg, #009933 0%, #007a28 100%)',
          }}
        />
        {/* Grid sutil */}
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '52px 52px',
            maskImage: 'radial-gradient(ellipse at center, #000 35%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, #000 35%, transparent 75%)',
          }}
        />

        {/* Top bar */}
        <header className="relative z-10 max-w-7xl mx-auto px-5 md:px-10 pt-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logofocades-solo.png" alt="FOCADES" className="h-10" />
            <div className="leading-tight">
              <p className="text-[11px] font-bold tracking-[0.22em] text-white/55 uppercase">
                Alcaldía de Montelíbano
              </p>
              <p className="text-base font-extrabold text-white">FOCADES</p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <a
              href="#noticias"
              className="hidden md:inline-flex text-sm font-semibold text-white/65 hover:text-white px-3 py-2 transition-colors"
            >
              Noticias
            </a>
            <a
              href="#programa"
              className="hidden md:inline-flex text-sm font-semibold text-white/65 hover:text-white px-3 py-2 transition-colors"
            >
              El programa
            </a>
          </nav>
        </header>

        {/* Hero content */}
        <div className="relative z-10 max-w-7xl mx-auto px-5 md:px-10 pt-16 pb-28 md:pt-24 md:pb-36 grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-7">
            {convocatoriaActiva && (
              <div
                style={{
                  opacity: 1,
                  animation: 'slideUp 0.55s cubic-bezier(0.16,1,0.3,1) 0.05s both',
                }}
              >
                <span
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border mb-6"
                  style={{ borderColor: 'rgba(249,160,63,0.5)', color: '#F9A03F', background: 'rgba(249,160,63,0.12)' }}
                >
                  <Sparkles size={13} /> Convocatoria abierta
                </span>
              </div>
            )}
            <h1
              className="text-5xl md:text-7xl font-extrabold leading-[0.95] tracking-tight text-white"
              style={{
                fontFamily: "'Familjen Grotesk', sans-serif",
                animation: 'slideUp 0.65s cubic-bezier(0.16,1,0.3,1) 0.1s both',
              }}
            >
              Tu educación,
              <br />
              <span style={{ color: '#F9A03F' }}>tu futuro.</span>
            </h1>
            <p
              className="mt-6 max-w-xl text-base md:text-lg leading-relaxed"
              style={{
                color: 'rgba(255,255,255,0.72)',
                animation: 'slideUp 0.65s cubic-bezier(0.16,1,0.3,1) 0.2s both',
              }}
            >
              <strong className="text-white">Fondo Educativo por el Camino de la Educación Superior</strong> —
              el programa de la Alcaldía de Montelíbano que acompaña a estudiantes y profesionales
              en su formación académica. Postúlate, actualiza tu información o consulta el estado de tu beneficio.
            </p>

            <div
              className="mt-10 flex flex-col sm:flex-row gap-3"
              style={{ animation: 'slideUp 0.65s cubic-bezier(0.16,1,0.3,1) 0.3s both' }}
            >
              <Link
                to="/registro"
                className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full font-bold shadow-xl hover:brightness-110 transition-all"
                style={{ background: '#F9A03F', color: '#0D2C54' }}
              >
                Quiero postularme
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                to="/beneficiario/login"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full font-bold border border-white/25 bg-white/5 hover:bg-white/12 backdrop-blur transition-all text-white"
              >
                <UserCircle2 size={18} /> Soy beneficiario
              </Link>
            </div>

            <div
              className="mt-10 flex items-center gap-6 text-xs"
              style={{ color: 'rgba(255,255,255,0.45)', animation: 'slideUp 0.65s cubic-bezier(0.16,1,0.3,1) 0.4s both' }}
            >
              <span className="inline-flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-400" /> Acceso seguro
              </span>
              <span className="inline-flex items-center gap-2">
                <GraduationCap size={14} style={{ color: '#F9A03F' }} /> Programa oficial
              </span>
            </div>
          </div>

          {/* Card info derecha */}
          <div
            className="md:col-span-5 relative"
            style={{ animation: 'slideUp 0.75s cubic-bezier(0.16,1,0.3,1) 0.25s both' }}
          >
            <div
              className="absolute -inset-6 rounded-[40px] blur-3xl opacity-35 -z-10"
              style={{ background: 'radial-gradient(circle, rgba(249,160,63,0.55), transparent 65%)'  }}
            />
            <div
              className="relative rounded-[28px] p-7 border overflow-hidden"
              style={{
                background: 'linear-gradient(160deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 100%)',
                borderColor: 'rgba(255,255,255,0.12)',
                backdropFilter: 'blur(16px)',
              }}
            >
              <div className="flex items-center justify-between mb-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Información clave
                </p>
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.75)]" />
              </div>

              {convocatoriaActiva ? (
                <>
                  <h3 className="text-xl font-bold leading-snug text-white">
                    {convocatoriaActiva.nombre}
                  </h3>
                  {convocatoriaActiva.fecha_fin && (
                    <p className="mt-3 text-sm inline-flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.65)' }}>
                      <Calendar size={15} style={{ color: '#F9A03F' }} />
                      Cierra el{' '}
                      {new Date(convocatoriaActiva.fecha_fin).toLocaleDateString('es-CO', {
                        year: 'numeric', month: 'long', day: 'numeric',
                      })}
                    </p>
                  )}
                  <Link
                    to="/registro"
                    className="mt-6 inline-flex items-center gap-2 text-sm font-bold transition-colors hover:text-white"
                    style={{ color: '#F9A03F' }}
                  >
                    Iniciar mi inscripción <ArrowRight size={15} />
                  </Link>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-bold leading-snug text-white">Próxima convocatoria</h3>
                  <p className="mt-3 text-sm" style={{ color: 'rgba(255,255,255,0.62)' }}>
                    Mantente atento a las publicaciones oficiales. Aquí anunciaremos
                    fechas, requisitos y documentos.
                  </p>
                </>
              )}

              <div className="mt-7 pt-5 grid grid-cols-2 gap-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
                <div>
                  <p className="text-3xl font-extrabold text-white">100%</p>
                  <p className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.45)' }}>En línea</p>
                </div>
                <div>
                  <p className="text-3xl font-extrabold text-white">24/7</p>
                  <p className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.45)' }}>Disponible</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Onda inferior hacia #F5F7FA */}
        <svg
          className="absolute bottom-0 left-0 right-0 w-full"
          viewBox="0 0 1440 80"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" fill="#F5F7FA" />
        </svg>
      </section>

      {/* ─────────── PROGRAMA / FEATURES ─────────── */}
      <section id="programa" style={{ backgroundColor: '#F5F7FA' }} className="relative max-w-7xl mx-auto px-5 md:px-10 py-20 md:py-28">
        <Reveal>
          <div className="max-w-3xl">
            <p
              className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em]"
              style={{ color: '#F9A03F' }}
            >
              <BookOpen size={13} /> Sobre el programa
            </p>
            <h2
              className="mt-4 text-4xl md:text-5xl font-extrabold tracking-tight"
              style={{ fontFamily: "'Familjen Grotesk', sans-serif", color: '#0D2C54' }}
            >
              Todo lo que necesitas, en un solo lugar.
            </h2>
            <p className="mt-4 text-base md:text-lg text-slate-600 leading-relaxed">
              Una plataforma diseñada para que estudiantes y beneficiarios gestionen su
              relación con FOCADES de forma sencilla, transparente y digital.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <Reveal key={f.title} delay={i * 90}>
                <div
                  className="group relative overflow-hidden hover:-translate-y-1 transition-transform rounded-2xl p-6 border h-full"
                  style={{ background: '#ffffff', borderColor: '#dee2e6', boxShadow: '0 2px 12px rgba(13,44,84,0.07)' }}
                >
                  <div
                    className="absolute -top-8 -right-8 w-28 h-28 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-2xl"
                    style={{ background: 'rgba(249,160,63,0.22)' }}
                  />
                  <div
                    className="relative w-12 h-12 rounded-2xl flex items-center justify-center mb-4 text-white shadow-md"
                    style={{ background: '#0D2C54' }}
                  >
                    <Icon size={22} />
                  </div>
                  <h3 className="text-lg font-bold" style={{ color: '#0D2C54' }}>{f.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.desc}</p>
                  <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
                    0{i + 1}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ─────────── NOTICIAS ─────────── */}
      <section
        id="noticias"
        className="relative py-20 md:py-28"
        style={{ background: 'linear-gradient(180deg, #eef2f7 0%, #F5F7FA 100%)' }}
      >
        <div className="max-w-7xl mx-auto px-5 md:px-10">
          <div className="flex items-end justify-between flex-wrap gap-6 mb-12">
            <Reveal className="max-w-2xl">
              <div>
                <p
                  className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em]"
                  style={{ color: '#F9A03F' }}
                >
                  <Megaphone size={13} /> Noticias y anuncios
                </p>
                <h2
                  className="mt-4 text-4xl md:text-5xl font-extrabold tracking-tight"
                  style={{ fontFamily: "'Familjen Grotesk', sans-serif", color: '#0D2C54' }}
                >
                  Lo último del programa.
                </h2>
                <p className="mt-3 text-base text-slate-600">
                  Comunicados oficiales, novedades y fechas importantes que debes conocer.
                </p>
              </div>
            </Reveal>
          </div>

          {newsLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse h-72 rounded-2xl" style={{ background: '#e2e8f0' }} />
              ))}
            </div>
          ) : news.length === 0 ? (
            <div
              className="rounded-2xl border p-8 text-center text-sm"
              style={{ borderColor: '#dee2e6', background: '#fff', color: '#556884' }}
            >
              <Megaphone size={28} className="mx-auto mb-3 text-slate-400" />
              <p className="font-semibold" style={{ color: '#0D2C54' }}>No hay noticias publicadas por el momento.</p>
              <p className="text-xs mt-1 text-slate-500">Vuelve pronto para ver los próximos anuncios oficiales.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {news.map((item, i) => (
                <Reveal key={item.id} delay={i * 80}>
                  <button
                    type="button"
                    onClick={() => setSelectedNews(item)}
                    className="text-left group relative overflow-hidden hover:-translate-y-1 transition-transform rounded-2xl border w-full h-full"
                    style={{ background: '#ffffff', borderColor: '#dee2e6', boxShadow: '0 2px 12px rgba(13,44,84,0.06)' }}
                  >
                  {item.image_url ? (
                    <div className="h-44 overflow-hidden rounded-t-2xl">
                      <img
                        src={item.image_url}
                        alt={item.title || 'Noticia'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  ) : (
                    <div
                      className="h-44 flex items-center justify-center rounded-t-2xl"
                      style={{ background: 'linear-gradient(135deg, #0D2C54 0%, #1A5A96 100%)' }}
                    >
                      <Megaphone size={42} style={{ color: 'rgba(255,255,255,0.25)' }} />
                    </div>
                  )}
                  <div className="p-5">
                    {item.publish_at && (
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#F9A03F' }}>
                        {new Date(item.publish_at).toLocaleDateString('es-CO', {
                          year: 'numeric', month: 'short', day: 'numeric',
                        })}
                      </p>
                    )}
                    <h3 className="mt-2 text-lg font-bold leading-snug line-clamp-2" style={{ color: '#0D2C54' }}>
                      {item.title || 'Sin título'}
                    </h3>
                    {item.summary && (
                      <p className="mt-2 text-sm text-slate-600 line-clamp-3 leading-relaxed">{item.summary}</p>
                    )}
                    <p
                      className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold group-hover:gap-2.5 transition-all"
                      style={{ color: '#1A5A96' }}
                    >
                      Leer más <ArrowRight size={13} />
                    </p>
                  </div>
                </button>
              </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─────────── CTA FINAL ─────────── */}
      <section className="relative max-w-7xl mx-auto px-5 md:px-10 py-20">
        <Reveal>
          <div
            className="relative overflow-hidden rounded-[32px] p-10 md:p-16 text-white"
            style={{ background: 'linear-gradient(135deg, #007a28 0%, #009933 55%, #0D2C54 130%)' }}
          >
          {/* Puntos decorativos */}
          <div
            className="absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          />
          {/* Destello accent */}
          <div
            className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-20 blur-3xl"
            style={{ background: '#F9A03F', transform: 'translate(30%, -30%)' }}
          />
          <div className="relative grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2
                className="text-3xl md:text-5xl font-extrabold leading-tight text-white"
                style={{ fontFamily: "'Familjen Grotesk', sans-serif" }}
              >
                ¿Listo para dar el siguiente paso?
              </h2>
              <p className="mt-4 text-base md:text-lg" style={{ color: 'rgba(255,255,255,0.72)' }}>
                Si eres aspirante, comienza tu inscripción. Si ya eres beneficiario,
                accede a tu portal personal.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row md:justify-end gap-3">
              <Link
                to="/registro"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full font-bold shadow-xl hover:brightness-110 transition-all"
                style={{ background: '#F9A03F', color: '#0D2C54' }}
              >
                Inscribirme <ArrowRight size={18} />
              </Link>
              <Link
                to="/beneficiario/login"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full font-bold border border-white/30 bg-white/5 hover:bg-white/10 backdrop-blur transition-all text-white"
              >
                <UserCircle2 size={18} /> Portal beneficiarios
              </Link>
            </div>
          </div>
          </div>
        </Reveal>
      </section>
      {(faqLoading || faq.length > 0) && (
        <FaqSection faq={faq} faqLoading={faqLoading} />
      )}

      {/* ─────────── FOOTER ─────────── */}
      <footer className="bg-primary text-white px-8 py-6 text-center text-sm">
        <img src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logoalcaldiasecretariablanco.png" alt="Alcaldía" className="h-14 mx-auto mb-3" />
        <p>© {year} Alcaldía de Montelíbano - Secretaría de Educación</p>
      </footer>

      <NewsModal item={selectedNews} onClose={() => setSelectedNews(null)} />
    </div>
  );
};

const FaqItem = ({ question, answer }) => {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rounded-2xl overflow-hidden"
      style={{
        background: open ? 'rgba(255,255,255,0.10)' : hovered ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${open ? 'rgba(249,160,63,0.55)' : hovered ? 'rgba(249,160,63,0.30)' : 'rgba(255,255,255,0.10)'}`,
        boxShadow: open
          ? '0 4px 24px rgba(0,0,0,0.18)'
          : hovered
          ? '0 0 32px rgba(249,160,63,0.15), 0 2px 16px rgba(0,0,0,0.15)'
          : 'none',
        transform: hovered && !open ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'background 0.25s, border-color 0.25s, box-shadow 0.25s, transform 0.25s',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left font-semibold text-sm"
        style={{ color: open ? '#F9A03F' : hovered ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.85)', transition: 'color 0.2s' }}
      >
        <span className="leading-snug">{question}</span>
        <ChevronDown
          size={18}
          className="shrink-0 mt-0.5"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            color: open ? '#F9A03F' : hovered ? 'rgba(249,160,63,0.6)' : 'rgba(255,255,255,0.35)',
            transition: 'transform 0.3s, color 0.2s',
          }}
        />
      </button>
      {open && (
        <div
          className="px-5 pb-5 text-sm leading-relaxed whitespace-pre-line border-t"
          style={{ color: 'rgba(255,255,255,0.65)', borderColor: 'rgba(249,160,63,0.25)' }}
        >
          {answer}
        </div>
      )}
    </div>
  );
};

export default Landing;
