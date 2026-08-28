import { useState, useMemo } from 'react';
import { ChevronDown, Filter, Search, Clock } from 'lucide-react';

const BitacoraCompact = ({ rows = [], loading = false, formatDateTime }) => {
  const [expandedId, setExpandedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

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

  // Paginación
  const totalPages = Math.ceil(filteredRows.length / itemsPerPage);
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

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

  const getCategoryBgColor = (category) => {
    const colors = {
      'perfil': 'bg-blue-50 text-blue-700',
      'estado': 'bg-purple-50 text-purple-700',
      'pago': 'bg-emerald-50 text-emerald-700',
      'documento': 'bg-orange-50 text-orange-700',
      'ticket': 'bg-pink-50 text-pink-700',
      'general': 'bg-slate-50 text-slate-700',
    };
    return colors[category] || colors.general;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-slate-500">Cargando bitácora...</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Clock size={32} className="text-slate-300 mb-2" />
        <p className="text-sm text-slate-500">No hay eventos registrados todavía para este beneficiario.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Búsqueda */}
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar en bitácora..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filtro de categoría */}
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-500" />
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'Todas las categorías' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla compacta */}
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left font-semibold text-slate-700 w-8"></th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Evento</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Actor</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Fecha y Hora</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Categoría</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row) => (
              <tbody key={row.id}>
                {/* Fila principal (collapsible) */}
                <tr className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleExpand(row.id)}
                      className="p-1 hover:bg-slate-200 rounded transition-colors"
                    >
                      <ChevronDown
                        size={16}
                        className={`text-slate-500 transition-transform ${expandedId === row.id ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-medium">
                    {getAccionDescriptiva(row)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {getActorName(row)}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-md text-[11px] font-semibold ${getCategoryBgColor(row.categoria)}`}>
                      {row.categoria || 'general'}
                    </span>
                  </td>
                </tr>

                {/* Fila expandida (detalles) */}
                {expandedId === row.id && (
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <td colSpan="5" className="px-4 py-4">
                      <div className="space-y-3">
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-bold uppercase text-slate-600 mb-1">Acción</p>
                            <p className="text-sm text-slate-800">{row.accion || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase text-slate-600 mb-1">Tipo de evento</p>
                            <p className="text-sm text-slate-800">{row.tipo_evento || '—'}</p>
                          </div>
                          {row.campo_cambio && (
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-600 mb-1">Campo</p>
                              <p className="text-sm text-slate-800">{row.campo_cambio}</p>
                            </div>
                          )}
                          {row.valor_anterior && (
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-600 mb-1">Valor anterior</p>
                              <p className="text-sm text-slate-800 font-mono bg-white px-2 py-1 rounded border border-slate-200">
                                {row.valor_anterior}
                              </p>
                            </div>
                          )}
                          {row.valor_nuevo && (
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-600 mb-1">Valor nuevo</p>
                              <p className="text-sm text-slate-800 font-mono bg-white px-2 py-1 rounded border border-slate-200">
                                {row.valor_nuevo}
                              </p>
                            </div>
                          )}
                        </div>

                        {row.nota && (
                          <div className="pt-2 border-t border-slate-200">
                            <p className="text-xs font-bold uppercase text-slate-600 mb-1">Nota</p>
                            <p className="text-sm text-slate-800 whitespace-pre-wrap">{row.nota}</p>
                          </div>
                        )}

                        <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase text-slate-600 mb-1">Actor</p>
                            <p className="text-sm text-slate-800">
                              {getActorName(row)}
                              {row.actor_email && <span className="text-xs text-slate-500 ml-1">({row.actor_email})</span>}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold uppercase text-slate-600 mb-1">ID del evento</p>
                            <p className="text-xs font-mono text-slate-600">{row.id}</p>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Mostrando {Math.min(itemsPerPage, filteredRows.length)} de {filteredRows.length} registros
            {selectedCategory !== 'all' && ` • Filtrado por: ${selectedCategory}`}
            {searchTerm && ` • Búsqueda: "${searchTerm}"`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Anterior
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-2 py-1 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === page
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BitacoraCompact;
