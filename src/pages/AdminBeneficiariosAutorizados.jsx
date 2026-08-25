import { useState, useEffect, useMemo } from 'react';
import { 
  UserPlus, 
  Search, 
  Filter, 
  RefreshCw, 
  Download, 
  UserCheck, 
  UserX, 
  Shield, 
  Edit2, 
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
  Unlink,
  Mail,
  Phone,
  MapPin,
  FileText,
  Calendar
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showSuccessAlert, showErrorAlert, showConfirmAlert } from '../lib/alerts';

const ESTADOS_BENEFICIARIO = ['activo', 'suspendido', 'retirado', 'condonado', 'egresado'];
const TIPOS_DOCUMENTO = ['CC', 'TI', 'CE', 'PAS'];
const ESTADOS_VINCULACION = ['todos', 'vinculados', 'pendientes'];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const emptyBeneficiario = {
  radicado_inscripcion: '',
  nombre_completo: '',
  tipo_documento: 'CC',
  n_documento: '',
  email: '',
  telefono: '',
  direccion: '',
  semestre_actual: '1',
  estado_beneficiario: 'activo',
  convocatoria_nombre: '',
  modalidad_beca: '',
};

const AdminBeneficiariosAutorizados = () => {
  const [beneficiarios, setBeneficiarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('activo');
  const [vinculacionFilter, setVinculacionFilter] = useState('todos');
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyBeneficiario);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadBeneficiarios();
  }, []);

  const loadBeneficiarios = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('portal_beneficiarios')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBeneficiarios(data || []);
    } catch (error) {
      console.error('Error cargando beneficiarios:', error);
      showErrorAlert({ title: 'Error', text: 'No se pudieron cargar los beneficiarios' });
    } finally {
      setLoading(false);
    }
  };

  // Filtrado
  const beneficiariosFiltrados = useMemo(() => {
    return beneficiarios.filter(b => {
      // Filtro de búsqueda
      if (searchTerm.trim()) {
        const termino = searchTerm.toLowerCase();
        const matchSearch = 
          b.nombre_completo?.toLowerCase().includes(termino) ||
          b.email?.toLowerCase().includes(termino) ||
          b.n_documento?.toString().toLowerCase().includes(termino) ||
          b.radicado_inscripcion?.toLowerCase().includes(termino);
        if (!matchSearch) return false;
      }

      // Filtro de estado
      if (estadoFilter && estadoFilter !== 'todos') {
        if (b.estado_beneficiario !== estadoFilter) return false;
      }

      // Filtro de vinculación
      if (vinculacionFilter === 'vinculados' && !b.auth_user_id) return false;
      if (vinculacionFilter === 'pendientes' && b.auth_user_id) return false;

      return true;
    });
  }, [beneficiarios, searchTerm, estadoFilter, vinculacionFilter]);

  // Paginación
  const totalPages = Math.ceil(beneficiariosFiltrados.length / pageSize);
  const paginatedData = beneficiariosFiltrados.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Estadísticas
  const stats = useMemo(() => {
    const total = beneficiarios.length;
    const vinculados = beneficiarios.filter(b => b.auth_user_id).length;
    const pendientes = total - vinculados;
    const activos = beneficiarios.filter(b => b.estado_beneficiario === 'activo').length;

    return { total, vinculados, pendientes, activos };
  }, [beneficiarios]);

  const handleOpenCreate = () => {
    setForm(emptyBeneficiario);
    setEditingId(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (beneficiario) => {
    setForm({
      radicado_inscripcion: beneficiario.radicado_inscripcion || '',
      nombre_completo: beneficiario.nombre_completo || '',
      tipo_documento: beneficiario.tipo_documento || 'CC',
      n_documento: beneficiario.n_documento || '',
      email: beneficiario.email || '',
      telefono: beneficiario.telefono || '',
      direccion: beneficiario.direccion || '',
      semestre_actual: String(beneficiario.semestre_actual || '1'),
      estado_beneficiario: beneficiario.estado_beneficiario || 'activo',
      convocatoria_nombre: beneficiario.convocatoria_nombre || '',
      modalidad_beca: beneficiario.modalidad_beca || '',
    });
    setEditingId(beneficiario.id);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyBeneficiario);
  };

  const handleSave = async () => {
    const email = String(form.email || '').trim().toLowerCase();

    if (!form.nombre_completo || !email || !form.n_documento) {
      showErrorAlert({
        title: 'Datos incompletos',
        text: 'Debes completar nombre, correo y número de documento.',
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        radicado_inscripcion: String(form.radicado_inscripcion || '').trim() || null,
        nombre_completo: String(form.nombre_completo || '').trim(),
        tipo_documento: String(form.tipo_documento || 'CC').trim(),
        n_documento: String(form.n_documento || '').trim(),
        email,
        telefono: String(form.telefono || '').trim() || null,
        direccion: String(form.direccion || '').trim() || null,
        semestre_actual: Number(form.semestre_actual || 1),
        estado_beneficiario: String(form.estado_beneficiario || 'activo').trim(),
        convocatoria_nombre: String(form.convocatoria_nombre || '').trim() || null,
        modalidad_beca: String(form.modalidad_beca || '').trim() || null,
      };

      let error;
      if (editingId) {
        // Actualizar
        ({ error } = await supabase
          .from('portal_beneficiarios')
          .update(payload)
          .eq('id', editingId));
      } else {
        // Crear
        ({ error } = await supabase
          .from('portal_beneficiarios')
          .insert(payload));
      }

      if (error) throw error;

      await loadBeneficiarios();
      handleCloseModal();
      showSuccessAlert({
        title: editingId ? 'Beneficiario actualizado' : 'Beneficiario creado',
        text: 'El beneficiario podrá vincularse con Google usando su correo autorizado.',
      });
    } catch (error) {
      console.error('Error guardando:', error);
      showErrorAlert({
        title: 'Error',
        text: error.message || 'No se pudo guardar el beneficiario.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, nombre) => {
    const confirmed = await showConfirmAlert({
      title: '¿Eliminar beneficiario?',
      text: `Se eliminará a ${nombre}. Esta acción no se puede deshacer.`,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('portal_beneficiarios')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await loadBeneficiarios();
      showSuccessAlert({ title: 'Eliminado', text: 'Beneficiario eliminado correctamente.' });
    } catch (error) {
      console.error('Error eliminando:', error);
      showErrorAlert({ title: 'Error', text: 'No se pudo eliminar el beneficiario.' });
    }
  };

  const handleRelease = async (id, nombre) => {
    const confirmed = await showConfirmAlert({
      title: '¿Liberar vinculación?',
      text: `Se liberará la vinculación de ${nombre}. Podrá volver a vincularse con su correo.`,
      confirmButtonText: 'Sí, liberar',
      cancelButtonText: 'Cancelar',
    });

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('portal_beneficiarios')
        .update({ auth_user_id: null })
        .eq('id', id);

      if (error) throw error;

      await loadBeneficiarios();
      showSuccessAlert({ title: 'Liberado', text: 'Vinculación liberada correctamente.' });
    } catch (error) {
      console.error('Error liberando:', error);
      showErrorAlert({ title: 'Error', text: 'No se pudo liberar la vinculación.' });
    }
  };

  const handleExportCSV = () => {
    const headers = ['Radicado', 'Nombre', 'Tipo Doc', 'Documento', 'Email', 'Teléfono', 'Estado', 'Vinculación'];
    const rows = beneficiariosFiltrados.map(b => [
      b.radicado_inscripcion || '',
      b.nombre_completo || '',
      b.tipo_documento || '',
      b.n_documento || '',
      b.email || '',
      b.telefono || '',
      b.estado_beneficiario || '',
      b.auth_user_id ? 'Vinculado' : 'Pendiente',
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `beneficiarios-autorizados-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getEstadoBadge = (estado) => {
    const colores = {
      activo: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
      suspendido: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
      retirado: 'bg-red-100 text-red-700 ring-1 ring-red-200',
      condonado: 'bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200',
      egresado: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
    };
    return colores[estado] || 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Beneficiarios Autorizados</h1>
          <p className="text-slate-600 mt-1">Gestiona los beneficiarios preautorizados y su vinculación con Google</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadBeneficiarios}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors font-semibold text-sm"
          >
            <RefreshCw size={18} />
            Actualizar
          </button>
          <button
            onClick={handleExportCSV}
            disabled={beneficiariosFiltrados.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={18} />
            Exportar CSV
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-xl hover:bg-secondary/90 transition-colors font-semibold text-sm"
          >
            <UserPlus size={18} />
            Nuevo Beneficiario
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 font-semibold">Total</p>
              <p className="text-3xl font-bold text-primary mt-1">{stats.total}</p>
            </div>
            <UserCheck className="text-primary" size={32} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 font-semibold">Vinculados</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{stats.vinculados}</p>
            </div>
            <LinkIcon className="text-green-400" size={32} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 font-semibold">Pendientes</p>
              <p className="text-3xl font-bold text-orange-600 mt-1">{stats.pendientes}</p>
            </div>
            <AlertCircle className="text-orange-400" size={32} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 font-semibold">Activos</p>
              <p className="text-3xl font-bold text-emerald-600 mt-1">{stats.activos}</p>
            </div>
            <CheckCircle2 className="text-emerald-400" size={32} />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2 text-primary font-bold">
          <Filter size={20} />
          Filtros
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por nombre, email o documento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          {/* Filtro de estado */}
          <select
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value)}
            className="px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          >
            <option value="">Todos los estados</option>
            {ESTADOS_BENEFICIARIO.map(estado => (
              <option key={estado} value={estado}>{estado.charAt(0).toUpperCase() + estado.slice(1)}</option>
            ))}
          </select>

          {/* Filtro de vinculación */}
          <select
            value={vinculacionFilter}
            onChange={(e) => setVinculacionFilter(e.target.value)}
            className="px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          >
            <option value="todos">Todas las vinculaciones</option>
            <option value="vinculados">Solo vinculados</option>
            <option value="pendientes">Solo pendientes</option>
          </select>
        </div>

        {searchTerm && (
          <p className="text-sm text-slate-600">
            Mostrando {beneficiariosFiltrados.length} de {beneficiarios.length} beneficiarios
          </p>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Beneficiario</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Contacto</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Vinculación</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <UserX className="mx-auto mb-3 text-slate-400" size={48} />
                    <p className="text-slate-600 font-semibold">
                      {searchTerm || estadoFilter || vinculacionFilter !== 'todos'
                        ? 'No se encontraron beneficiarios con los filtros aplicados'
                        : 'No hay beneficiarios autorizados registrados'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedData.map((beneficiario) => (
                  <tr key={beneficiario.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 p-2 rounded-lg bg-primary/10 text-primary">
                          <Shield size={18} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{beneficiario.nombre_completo}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-600">
                            <span className="flex items-center gap-1">
                              <FileText size={12} />
                              {beneficiario.tipo_documento} {beneficiario.n_documento}
                            </span>
                            {beneficiario.radicado_inscripcion && (
                              <span>Radicado: {beneficiario.radicado_inscripcion}</span>
                            )}
                          </div>
                          {beneficiario.semestre_actual && (
                            <span className="inline-flex items-center gap-1 mt-1 text-xs text-slate-500">
                              <Calendar size={12} />
                              Semestre {beneficiario.semestre_actual}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-slate-700">
                          <Mail size={14} className="text-slate-400" />
                          {beneficiario.email}
                        </div>
                        {beneficiario.telefono && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <Phone size={14} className="text-slate-400" />
                            {beneficiario.telefono}
                          </div>
                        )}
                        {beneficiario.direccion && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <MapPin size={14} className="text-slate-400" />
                            {beneficiario.direccion}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${getEstadoBadge(beneficiario.estado_beneficiario)}`}>
                        {beneficiario.estado_beneficiario}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {beneficiario.auth_user_id ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                          <LinkIcon size={14} />
                          Vinculado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                          <AlertCircle size={14} />
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEdit(beneficiario)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        {beneficiario.auth_user_id && (
                          <button
                            onClick={() => handleRelease(beneficiario.id, beneficiario.nombre_completo)}
                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Liberar vinculación"
                          >
                            <Unlink size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(beneficiario.id, beneficiario.nombre_completo)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span>Mostrar</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-3 py-1 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {PAGE_SIZE_OPTIONS.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              <span>registros por página</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold text-sm"
              >
                Anterior
              </button>
              <span className="px-4 py-2 text-sm text-slate-600">
                Página {currentPage} de {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold text-sm"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Crear/Editar */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={handleCloseModal} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-primary flex items-center gap-2">
                  <UserPlus size={24} />
                  {editingId ? 'Editar Beneficiario' : 'Nuevo Beneficiario'}
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Nombre completo *</label>
                    <input
                      type="text"
                      value={form.nombre_completo}
                      onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="Juan Pérez García"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Email autorizado *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="beneficiario@email.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Tipo documento</label>
                    <select
                      value={form.tipo_documento}
                      onChange={(e) => setForm({ ...form, tipo_documento: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      {TIPOS_DOCUMENTO.map(tipo => (
                        <option key={tipo} value={tipo}>{tipo}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Número documento *</label>
                    <input
                      type="text"
                      value={form.n_documento}
                      onChange={(e) => setForm({ ...form, n_documento: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="1234567890"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Radicado</label>
                    <input
                      type="text"
                      value={form.radicado_inscripcion}
                      onChange={(e) => setForm({ ...form, radicado_inscripcion: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="RAD-2026-001"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Teléfono</label>
                    <input
                      type="text"
                      value={form.telefono}
                      onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="3001234567"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-1">Dirección</label>
                    <input
                      type="text"
                      value={form.direccion}
                      onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="Calle 123 #45-67"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Semestre actual</label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={form.semestre_actual}
                      onChange={(e) => setForm({ ...form, semestre_actual: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Estado</label>
                    <select
                      value={form.estado_beneficiario}
                      onChange={(e) => setForm({ ...form, estado_beneficiario: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      {ESTADOS_BENEFICIARIO.map(estado => (
                        <option key={estado} value={estado}>{estado.charAt(0).toUpperCase() + estado.slice(1)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Convocatoria</label>
                    <input
                      type="text"
                      value={form.convocatoria_nombre}
                      onChange={(e) => setForm({ ...form, convocatoria_nombre: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="2026-A"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Modalidad</label>
                    <input
                      type="text"
                      value={form.modalidad_beca}
                      onChange={(e) => setForm({ ...form, modalidad_beca: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="Técnico, Tecnólogo, Profesional"
                    />
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
                  <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">Información importante:</p>
                    <p>El beneficiario podrá vincularse automáticamente cuando inicie sesión con Google usando el correo autorizado.</p>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
                <button
                  onClick={handleCloseModal}
                  className="px-6 py-2 border border-slate-300 rounded-xl hover:bg-white transition-colors font-semibold"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-secondary text-white rounded-xl hover:bg-secondary/90 transition-colors font-semibold disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      {editingId ? 'Actualizar' : 'Crear'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminBeneficiariosAutorizados;
