import { useState, useMemo } from 'react';
import { Filter, Search, Clock } from 'lucide-react';

const BitacoraTimeline = ({ rows = [], loading = false, formatDateTime }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  // Obtener categorías únicas
  const categories = useMemo(() => {
    const cats = [...new Set(rows.map(r => r.categoria || 'general'))];
    return ['all', ...cats];
  }, [rows]);

  // Filtrar y buscar
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      const matchesCategory = selectedCategory === 'all' || row.categoria === selectedCategory;
      const matchesSearch = 
        searchTerm === '' || 
        row.accion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.nota?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.actor?.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.actor_email?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [rows, selectedCategory, searchTerm]);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getAccionDescriptiva = (row) => {
    if (row.nota) return row.nota;
    
    const accionMap = {
      'create': 'Creación',
      'update': 'Actualización',
      'delete': 'Eliminación',
      'insert': 'Registro',
      'assign': 'Asignación',
      'change': 'Cambio',
      'approve': 'Aprobación',
      'reject': 'Rechazo',
      'review': 'Revisión',
      'send': 'Envío',
      'upload': 'Carga',
    };
    
    const accionTexto = accionMap[row.accion] || row.accion || 'Acción';
    const campoTexto = row.campo_cambio ? ` (${row.campo_cambio})` : '';
    
    return `${accionTexto}${campoTexto}`;
  };

  const getActorName = (row) => {
    return row.actor?.nombre_completo || row.actor_email || row.actor?.email || 'Sistema';
  };

  const getCategoryColor = (category) => {
    const colors = {
      'perfil': { bg: 'bg-blue-500', light: 'bg-blue-50', text: 'text-blue-700' },
      'estado': { bg: 'bg-purple-500', light: 'bg-purple-50', text: 'text-purple-700' },
      'pago': { bg: 'bg-emerald-500', light: 'bg-emerald-50', text: 'text-emerald-700' },
      'documento': { bg: 'bg-orange-500', light: 'bg-orange-50', text: 'text-orange-700' },
      'ticket': { bg: 'bg-pink-500', light: 'bg-pink-50', text: 'text-pink-700' },
      'general': { bg: 'bg-slate-500', light: 'bg-slate-50', text: 'text-slate-700' },
    };
    return colors[category] || colors.general;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="animate-spin mb-3 w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full mx-auto"></div>
          <p className="text-sm text-slate-500">Cargando bitácora...</p>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Clock size={40} className="text-slate-300 mb-3" />
        <p className="text-sm text-slate-500">No hay eventos registrados todavía para este beneficiario.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Búsqueda */}
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar en bitácora..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
        </div>

        {/* Filtro de categoría */}
        <div className="flex items-center gap-2 min-w-max">
          <Filter size={16} className="text-slate-500" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'Todas las categorías' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Línea central */}
        <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-200 via-slate-200 to-slate-100 -translate-x-1/2"></div>

        {/* Eventos */}
        <div className="space-y-4">
          {filteredRows.map((row, index) => {
            const isLeft = index % 2 === 0;
            const colors = getCategoryColor(row.categoria);
            const isExpanded = expandedId === row.id;

            return (
              <div key={row.id} className={`flex items-start ${isLeft ? 'flex-row' : 'flex-row-reverse'} gap-4`}>
                {/* Contenedor de evento */}
                <div className={`flex-1 ${isLeft ? 'text-right' : 'text-left'}`}>
                  <div
                    onClick={() => toggleExpand(row.id)}
                    className={`group cursor-pointer transition-all duration-300 ${
                      isExpanded
                        ? `${colors.light} ring-2 ring-offset-1 ring-blue-300 shadow-md`
                        : 'hover:shadow-md hover:ring-1 hover:ring-slate-300'
                    } border border-slate-200 rounded-lg p-3`}
                  >
                    {/* Header compacto */}
                    <div className="flex items-start justify-between gap-2">
                      <div className={`flex-1 ${isLeft ? 'text-right' : 'text-left'}`}>
                        <div className="flex items-center gap-2 justify-between flex-wrap">
                          <span className={`${colors.bg} text-white px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest inline-block`}>
                            {row.categoria || 'general'}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            {formatDateTime(row.created_at)}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mt-2 leading-snug">
                          {getAccionDescriptiva(row)}
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          👤 {getActorName(row)}
                        </p>
                      </div>
                      <div className={`text-slate-400 group-hover:text-blue-500 transition-colors text-sm font-bold ${isExpanded ? 'rotate-180' : ''}`}>
                        ▼
                      </div>
                    </div>

                    {/* Detalles expandibles */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-slate-300 space-y-3 animate-in fade-in duration-200">
                        <div className="grid md:grid-cols-2 gap-3">
                          {row.accion && (
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-600 mb-1">Acción</p>
                              <p className="text-sm text-slate-800">{row.accion}</p>
                            </div>
                          )}
                          {row.tipo_evento && (
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-600 mb-1">Tipo de evento</p>
                              <p className="text-sm text-slate-800">{row.tipo_evento}</p>
                            </div>
                          )}
                          {row.campo_cambio && (
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-600 mb-1">Campo</p>
                              <p className="text-sm text-slate-800 font-mono">{row.campo_cambio}</p>
                            </div>
                          )}
                          {row.valor_anterior && (
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-600 mb-1">Valor anterior</p>
                              <p className="text-sm text-slate-700 font-mono bg-slate-100/50 px-2 py-1 rounded truncate">
                                {row.valor_anterior}
                              </p>
                            </div>
                          )}
                          {row.valor_nuevo && (
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-600 mb-1">Valor nuevo</p>
                              <p className="text-sm text-slate-700 font-mono bg-slate-100/50 px-2 py-1 rounded truncate">
                                {row.valor_nuevo}
                              </p>
                            </div>
                          )}
                        </div>

                        {row.nota && (
                          <div className="pt-2 border-t border-slate-300">
                            <p className="text-xs font-bold uppercase text-slate-600 mb-1">Nota</p>
                            <p className="text-sm text-slate-800 whitespace-pre-wrap">{row.nota}</p>
                          </div>
                        )}

                        <div className="pt-2 border-t border-slate-300 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase text-slate-600 mb-1">Actor</p>
                            <p className="text-sm text-slate-800">
                              {getActorName(row)}
                              {row.actor_email && <span className="text-xs text-slate-500 block">{row.actor_email}</span>}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold uppercase text-slate-600 mb-1">ID</p>
                            <p className="text-xs font-mono text-slate-600">{row.id}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Punto en la línea */}
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center">
                    <div className={`w-4 h-4 ${colors.bg} rounded-full ring-4 ring-white shadow-md`}></div>
                  </div>
                </div>

                {/* Espaciador en el lado opuesto */}
                <div className="flex-1"></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resumen */}
      {filteredRows.length > 0 && (
        <div className="text-center text-xs text-slate-500 pt-4">
          Mostrando {filteredRows.length} de {rows.length} eventos
          {selectedCategory !== 'all' && ` • Filtrado por: ${selectedCategory}`}
          {searchTerm && ` • Búsqueda: "${searchTerm}"`}
        </div>
      )}
    </div>
  );
};

export default BitacoraTimeline;
