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
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Loader2, AlertCircle } from 'lucide-react';

const Requisitos = () => {
  const [loading, setLoading] = useState(true);
  const [requisitos, setRequisitos] = useState([]);
  const [activeTab, setActiveTab] = useState('tecnico');
  const [error, setError] = useState(null);

  useEffect(() => {
    loadRequisitos();
  }, []);

  const loadRequisitos = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('portal_requisitos_modalidad')
        .select('*')
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (fetchError) throw fetchError;

      setRequisitos(data || []);
    } catch (err) {
      console.error('Error cargando requisitos:', err);
      setError('No se pudieron cargar los requisitos. Por favor, intenta de nuevo más tarde.');
    } finally {
      setLoading(false);
    }
  };

  const getRequisitosByModalidad = (modalidad) => {
    return requisitos.find((r) => r.modalidad === modalidad);
  };

  const modalidades = [
    { id: 'general', label: 'Requisitos Generales', color: 'blue' },
    { id: 'tecnico', label: 'Técnico Profesional', color: 'teal' },
    { id: 'tecnologo', label: 'Tecnólogo', color: 'purple' },
    { id: 'profesional', label: 'Profesional Universitario', color: 'amber' },
  ];

  const getTabColors = (color, isActive) => {
    const colors = {
      blue: isActive
        ? 'bg-blue-600 text-white'
        : 'bg-blue-50 text-blue-700 hover:bg-blue-100',
      teal: isActive
        ? 'bg-teal-600 text-white'
        : 'bg-teal-50 text-teal-700 hover:bg-teal-100',
      purple: isActive
        ? 'bg-purple-600 text-white'
        : 'bg-purple-50 text-purple-700 hover:bg-purple-100',
      amber: isActive
        ? 'bg-amber-600 text-white'
        : 'bg-amber-50 text-amber-700 hover:bg-amber-100',
    };
    return colors[color] || colors.blue;
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
            Requisitos de Inscripción
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
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Hero Section */}
          <section className="bg-white border border-border rounded-2xl p-6 md:p-8 shadow-sm animate-fade-in">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="text-primary" size={24} />
                </div>
              </div>
              <div className="flex-1">
                <h2 className="text-2xl md:text-3xl font-extrabold text-primary mb-2">
                  Requisitos por Modalidad
                </h2>
                <p className="text-slate-600 text-sm md:text-base leading-relaxed">
                  Consulta los documentos y requisitos necesarios según tu nivel de formación. 
                  Asegúrate de cumplir con todos los requisitos <strong>obligatorios</strong> antes de iniciar tu inscripción.
                </p>
              </div>
            </div>
          </section>

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 animate-fade-in">
              <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Tabs Navigation */}
          <div className="bg-white border border-border rounded-2xl p-4 shadow-sm animate-slide-up" style={{ animationDelay: '100ms' }}>
            <div className="flex flex-wrap gap-2">
              {modalidades.map((modalidad) => (
                <button
                  key={modalidad.id}
                  onClick={() => setActiveTab(modalidad.id)}
                  className={`px-4 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 ${getTabColors(
                    modalidad.color,
                    activeTab === modalidad.id
                  )}`}
                >
                  {modalidad.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content Area */}
          {modalidades.map((modalidad) => {
            if (activeTab !== modalidad.id) return null;

            const data = getRequisitosByModalidad(modalidad.id);

            if (!data) {
              return (
                <div key={modalidad.id} className="bg-white border border-border rounded-2xl p-8 text-center animate-fade-in">
                  <Circle className="mx-auto text-slate-300 mb-3" size={48} />
                  <p className="text-slate-500">No hay requisitos configurados para esta modalidad.</p>
                </div>
              );
            }

            const requisitosArray = Array.isArray(data.requisitos) ? data.requisitos : [];

            return (
              <section
                key={modalidad.id}
                className="bg-white border border-border rounded-2xl p-6 md:p-8 shadow-sm animate-slide-up"
                style={{ animationDelay: '200ms' }}
              >
                <h3 className="text-xl font-extrabold text-primary mb-2">{data.titulo}</h3>
                {data.descripcion && (
                  <p className="text-slate-600 text-sm mb-6">{data.descripcion}</p>
                )}

                <div className="space-y-3">
                  {requisitosArray.map((req, idx) => (
                    <div
                      key={idx}
                      className="border border-border rounded-xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-slide-up"
                      style={{ animationDelay: `${250 + idx * 50}ms` }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {req.obligatorio ? (
                            <CheckCircle2 className="text-emerald-600" size={20} />
                          ) : (
                            <Circle className="text-amber-500" size={20} />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-semibold text-primary text-sm">{req.texto}</p>
                            {req.obligatorio ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 flex-shrink-0">
                                Obligatorio
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 flex-shrink-0">
                                Opcional
                              </span>
                            )}
                          </div>
                          {req.nota && (
                            <p className="text-xs text-slate-500 mt-1">{req.nota}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          {/* CTA Section */}
          <section className="bg-gradient-to-br from-primary to-secondary border border-border rounded-2xl p-6 md:p-8 shadow-lg text-white animate-slide-up" style={{ animationDelay: '300ms' }}>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold mb-1">¿Cumples con los requisitos?</h3>
                <p className="text-white/90 text-sm">
                  Inicia tu proceso de inscripción al programa FOCADES ahora mismo.
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

export default Requisitos;
