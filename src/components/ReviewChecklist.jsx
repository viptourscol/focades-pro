import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

const ReviewChecklist = ({ 
  aspiranteId, 
  checklist = {}, 
  onChecklistChange = () => {} 
}) => {
  const items = [
    { key: 'documentos', label: 'Documentos revisados', icon: '📄' },
    { key: 'datos_personales', label: 'Datos personales', icon: '👤' },
    { key: 'informacion_academica', label: 'Información académica', icon: '🎓' },
    { key: 'certificado_bancario', label: 'Certificado bancario', icon: '🏦' },
    { key: 'revisor_asignado', label: 'Revisor asignado', icon: '👨‍💼' },
  ];

  const handleToggle = (key) => {
    const newChecklist = {
      ...checklist,
      [key]: !checklist[key],
    };
    onChecklistChange(newChecklist);
  };

  const completedCount = Object.values(checklist).filter(Boolean).length;
  const totalCount = items.length;
  const isComplete = completedCount === totalCount;

  return (
    <div className="border-l-4 border-primary bg-blue-50 p-4 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-primary text-sm">
          Lista de revisión
        </h3>
        <span className={`text-xs font-bold px-2 py-1 rounded ${
          isComplete 
            ? 'bg-green-100 text-green-700' 
            : 'bg-amber-100 text-amber-700'
        }`}>
          {completedCount}/{totalCount}
        </span>
      </div>
      
      <div className="space-y-2">
        {items.map(({ key, label, icon }) => {
          const isChecked = checklist[key] || false;
          return (
            <button
              key={key}
              onClick={() => handleToggle(key)}
              className={`w-full flex items-center gap-2 p-2 rounded transition-colors text-left text-sm ${
                isChecked
                  ? 'bg-green-100 text-green-700'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {isChecked ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <Circle className="w-4 h-4 flex-shrink-0" />
              )}
              <span className={isChecked ? 'line-through' : ''}>
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {isComplete && (
        <div className="mt-3 pt-3 border-t border-green-200 bg-green-50 p-2 rounded text-xs text-green-700 text-center font-medium">
          ✓ Revisión completa
        </div>
      )}
    </div>
  );
};

export default ReviewChecklist;
