import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

// Cliente público sin autenticación
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Loader2,
  Mail,
  User,
  Home,
  GraduationCap,
  School,
  FileUp,
  PenTool,
  AlertCircle,
  Lightbulb,
} from 'lucide-react';

const iconMap = {
  Mail,
  User,
  Home,
  GraduationCap,
  School,
  FileUp,
  PenTool,
  Clock,
};

const GuiaInscripcion = () => {
  const [loading, setLoading] = useState(true);
  const [pasos, setPasos] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [expandedSteps, setExpandedSteps] = useState(new Set([1]));
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [error, setError] = useState(null);

  useEffect(() => {
    loadGuiaData();
    loadCompletedSteps();
  }, []);

  const loadGuiaData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [pasosResult, docsResult] = await Promise.all([
        supabase
          .from('portal_guia_inscripcion')
          .select('*')
          .eq('activo', true)
          .order('orden', { ascending: true }),
        supabase
          .from('portal_documentos_descargables')
          .select('*')
          .eq('tipo', 'guia_inscripcion')
          .eq('activo', true),
      ]);

      if (pasosResult.error) throw pasosResult.error;
      if (docsResult.error) throw docsResult.error;

      setPasos(pasosResult.data || []);
      setDocumentos(docsResult.data || []);
    } catch (err) {
      console.error('Error cargando guía:', err);
      setError('No se pudo cargar la guía de inscripción.');
    } finally {
      setLoading(false);
    }
  };

  const loadCompletedSteps = () => {
    try {
      const saved = localStorage.getItem('focades:guia:completed');
      if (saved) {
        setCompletedSteps(new Set(JSON.parse(saved)));
      }
    } catch (err) {
      console.error('Error cargando progreso:', err);
    }
  };

  const toggleStep = (stepId) => {
    setExpandedSteps((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  };

  const toggleCompleted = (stepId) => {
    setCompletedSteps((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      localStorage.setItem('focades:guia:completed', JSON.stringify([...newSet]));
      return newSet;
    });
  };

  const handleDownload = async (documento) => {
    try {
      // Incrementar contador de descargas
      await supabase
        .from('portal_documentos_descargables')
        .update({ descargas: documento.descargas + 1 })
        .eq('id', documento.id);

      // Abrir documento
      window.open(documento.archivo_url, '_blank');
    } catch (err) {
      console.error('Error en descarga:', err);
    }
  };

  const totalSteps = pasos.length;
  const completedCount = completedSteps.size;
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  const getIconComponent = (iconName) => {
    const IconComponent = iconMap[iconName] || Clock;
    return IconComponent;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={42} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-[72px] bg-white border-b border-border px-4 md:px-8 flex items-center justify-between gap-4">
        <Link to="/registro" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
          <img
            src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logofocades-solo.png"
            alt="FOCADES"
            className="h-10"
          />
          <h1 className="text-primary font-bold text-base md:text-lg hidden sm:block">
            Guía de Inscripción
          </h1>
        </Link>
        <Link
          to="/registro"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Volver a Inscripción</span>
          <span className="sm:hidden">Volver</span>
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-10">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Hero + Progress */}
          <section className="bg-white border border-border rounded-2xl p-6 md:p-8 shadow-sm animate-fade-in">
            <h2 className="text-2xl md:text-3xl font-extrabold text-primary mb-2">
              Guía Paso a Paso
            </h2>
            <p className="text-slate-600 text-sm md:text-base mb-6">
              Sigue estos pasos para completar tu inscripción al programa FOCADES de manera exitosa.
            </p>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-slate-700">
                  Tu progreso: {completedCount} de {totalSteps} pasos
                </span>
                <span className="text-sm font-bold text-primary">{progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </section>

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Timeline de Pasos */}
          <div className="space-y-4">
            {pasos.map((paso, idx) => {
              const Icon = getIconComponent(paso.icono);
              const isExpanded = expandedSteps.has(paso.paso_numero);
              const isCompleted = completedSteps.has(paso.paso_numero);

              return (
                <div
                  key={paso.id}
                  className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden animate-slide-up"
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  {/* Step Header */}
                  <button
                    onClick={() => toggleStep(paso.paso_numero)}
                    className="w-full px-6 py-5 flex items-center gap-4 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div
                      className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                        isCompleted
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 size={24} /> : <Icon size={24} />}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Paso {paso.paso_numero}
                        </span>
                        {paso.duracion_estimada && (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <Clock size={12} />
                            {paso.duracion_estimada}
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-primary text-base md:text-lg">
                        {paso.titulo}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCompleted(paso.paso_numero);
                        }}
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                          isCompleted
                            ? 'bg-emerald-600 border-emerald-600'
                            : 'border-slate-300 hover:border-emerald-400'
                        }`}
                        title={isCompleted ? 'Marcar como pendiente' : 'Marcar como completado'}
                      >
                        {isCompleted && <CheckCircle2 size={14} className="text-white" />}
                      </button>
                      {isExpanded ? (
                        <ChevronUp className="text-slate-400" size={20} />
                      ) : (
                        <ChevronDown className="text-slate-400" size={20} />
                      )}
                    </div>
                  </button>

                  {/* Step Content */}
                  {isExpanded && (
                    <div className="px-6 pb-6 border-t border-border animate-fade-in">
                      <p className="text-slate-700 text-sm mb-4 mt-4">{paso.descripcion}</p>

                      {/* Detalles */}
                      {paso.detalles && paso.detalles.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm font-bold text-primary mb-2">Detalles:</h4>
                          <ul className="space-y-2">
                            {paso.detalles.map((detalle, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                                <span className="text-primary mt-1">▸</span>
                                {detalle}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Consejos */}
                      {paso.consejos && paso.consejos.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                          <div className="flex items-start gap-2 mb-2">
                            <Lightbulb className="text-amber-600 flex-shrink-0" size={18} />
                            <h4 className="text-sm font-bold text-amber-900">Consejos:</h4>
                          </div>
                          <ul className="space-y-1.5">
                            {paso.consejos.map((consejo, i) => (
                              <li key={i} className="text-sm text-amber-800 pl-6">
                                • {consejo}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Documentos Descargables */}
          {documentos.length > 0 && (
            <section className="bg-white border border-border rounded-2xl p-6 md:p-8 shadow-sm animate-slide-up">
              <h3 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
                <Download size={20} />
                Documentos Descargables
              </h3>
              <div className="space-y-3">
                {documentos.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => handleDownload(doc)}
                    className="w-full border border-border rounded-xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all text-left group"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-semibold text-primary group-hover:text-secondary transition-colors">
                          {doc.titulo}
                        </p>
                        {doc.descripcion && (
                          <p className="text-xs text-slate-500 mt-1">{doc.descripcion}</p>
                        )}
                        {doc.tamanio_mb && (
                          <p className="text-xs text-slate-400 mt-1">
                            Tamaño: {doc.tamanio_mb} MB
                          </p>
                        )}
                      </div>
                      <Download className="text-primary group-hover:text-secondary transition-colors flex-shrink-0" size={20} />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* CTA Final */}
          <section className="bg-gradient-to-br from-primary to-secondary border border-border rounded-2xl p-6 md:p-8 shadow-lg text-white animate-slide-up">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold mb-1">¿Listo para comenzar?</h3>
                <p className="text-white/90 text-sm">
                  Inicia tu proceso de inscripción siguiendo esta guía paso a paso.
                </p>
              </div>
              <Link
                to="/registro"
                className="inline-flex items-center gap-2 bg-white text-primary px-6 py-3 rounded-full font-bold text-sm hover:shadow-xl transition-all hover:-translate-y-0.5 flex-shrink-0"
              >
                Iniciar Inscripción
                <ArrowRight size={18} />
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default GuiaInscripcion;
