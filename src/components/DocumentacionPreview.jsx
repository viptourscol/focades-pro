import {
  CheckCircle2, Circle, Clock, Download, Lightbulb, ChevronUp,
  Mail, User, Home, GraduationCap, School, FileUp, PenTool,
} from 'lucide-react';

// Debe mantenerse alineado con el iconMap de GuiaInscripcion.jsx: un ícono que
// no exista allí se renderiza como Clock en el portal público.
export const ICONOS_GUIA = {
  Mail, User, Home, GraduationCap, School, FileUp, PenTool, Clock,
};

const Marco = ({ children }) => (
  <div className="bg-background rounded-2xl p-4 border border-border">{children}</div>
);

const SinContenido = ({ mensaje }) => (
  <Marco>
    <p className="text-sm text-slate-400 text-center py-8">{mensaje}</p>
  </Marco>
);

// Replica el bloque de una modalidad tal como aparece en /requisitos.
export function PreviewRequisitos({ data }) {
  const requisitos = Array.isArray(data?.requisitos) ? data.requisitos : [];
  const conTexto = requisitos.filter((r) => String(r?.texto || '').trim());

  if (!String(data?.titulo || '').trim() && conTexto.length === 0) {
    return <SinContenido mensaje="Escribe un título y agrega requisitos para ver la vista previa." />;
  }

  return (
    <Marco>
      <section className="bg-white border border-border rounded-2xl p-5 shadow-sm">
        <h3 className="text-xl font-extrabold text-primary mb-2">
          {data.titulo || 'Título del grupo'}
        </h3>
        {data.descripcion && <p className="text-slate-600 text-sm mb-5">{data.descripcion}</p>}

        <div className="space-y-3">
          {conTexto.map((req, idx) => (
            <div key={idx} className="border border-border rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {req.obligatorio
                    ? <CheckCircle2 className="text-emerald-600" size={20} />
                    : <Circle className="text-amber-500" size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-primary text-sm">{req.texto}</p>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${
                        req.obligatorio
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {req.obligatorio ? 'Obligatorio' : 'Opcional'}
                    </span>
                  </div>
                  {req.nota && <p className="text-xs text-slate-500 mt-1">{req.nota}</p>}
                </div>
              </div>
            </div>
          ))}
          {conTexto.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">
              Aún no has agregado requisitos a este grupo.
            </p>
          )}
        </div>
      </section>
    </Marco>
  );
}

// Replica un paso expandido de /guia-inscripcion.
export function PreviewGuia({ data }) {
  const Icono = ICONOS_GUIA[data?.icono] || Clock;
  const detalles = (data?.detalles || []).filter((d) => String(d).trim());
  const consejos = (data?.consejos || []).filter((c) => String(c).trim());

  if (!String(data?.titulo || '').trim() && !String(data?.descripcion || '').trim()) {
    return <SinContenido mensaje="Escribe el título y la descripción para ver la vista previa." />;
  }

  return (
    <Marco>
      <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="w-full px-5 py-4 flex items-center gap-4 text-left">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
            <Icono size={24} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Paso {data.paso_numero || 1}
              </span>
              {data.duracion_estimada && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <Clock size={12} />
                  {data.duracion_estimada}
                </span>
              )}
            </div>
            <h3 className="font-bold text-primary text-base">{data.titulo || 'Título del paso'}</h3>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="w-6 h-6 rounded border-2 border-slate-300" />
            <ChevronUp className="text-slate-400" size={20} />
          </div>
        </div>

        <div className="px-5 pb-5 border-t border-border">
          <p className="text-slate-700 text-sm mb-4 mt-4">{data.descripcion}</p>

          {detalles.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-bold text-primary mb-2">Detalles:</h4>
              <ul className="space-y-2">
                {detalles.map((detalle, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="text-primary mt-1">▸</span>
                    {detalle}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {consejos.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-2 mb-2">
                <Lightbulb className="text-amber-600 flex-shrink-0" size={18} />
                <h4 className="text-sm font-bold text-amber-900">Consejos:</h4>
              </div>
              <ul className="space-y-1.5">
                {consejos.map((consejo, i) => (
                  <li key={i} className="text-sm text-amber-800 pl-6">• {consejo}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Marco>
  );
}

// Replica una tarjeta de documento descargable de /guia-inscripcion.
export function PreviewDocumento({ data }) {
  if (!String(data?.titulo || '').trim()) {
    return <SinContenido mensaje="Escribe el título del documento para ver la vista previa." />;
  }

  return (
    <Marco>
      <section className="bg-white border border-border rounded-2xl p-5 shadow-sm">
        <h3 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
          <Download size={18} />
          Documentos Descargables
        </h3>
        <div className="w-full border border-border rounded-xl p-4 text-left">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-primary">{data.titulo}</p>
              {data.descripcion && <p className="text-xs text-slate-500 mt-1">{data.descripcion}</p>}
              {data.tamanio_mb && (
                <p className="text-xs text-slate-400 mt-1">Tamaño: {data.tamanio_mb} MB</p>
              )}
            </div>
            <Download className="text-primary flex-shrink-0" size={20} />
          </div>
        </div>
      </section>
    </Marco>
  );
}
