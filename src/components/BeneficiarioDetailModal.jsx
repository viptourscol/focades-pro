import { useState, useEffect } from 'react';
import { X, Save, User, GraduationCap, CreditCard, Shield, AlertCircle, FileText, Edit2, Check, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showSuccessAlert, showErrorAlert } from '../lib/alerts';

const BeneficiarioDetailModal = ({ beneficiario, isOpen, onClose, onSave }) => {
  const [activeTab, setActiveTab] = useState('personal');
  const [formData, setFormData] = useState({});
  const [loading, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  useEffect(() => {
    if (beneficiario) {
      setFormData({
        // Datos personales
        nombre_completo: beneficiario.nombre_completo || '',
        n_documento: beneficiario.n_documento || '',
        tipo_documento: beneficiario.tipo_documento || 'CC',
        email: beneficiario.email || '',
        telefono: beneficiario.telefono || '',
        direccion: beneficiario.direccion || '',
        genero: beneficiario.genero || '',
        
        // Datos académicos
        programa_academico: beneficiario.programa_academico || '',
        nombre_universidad: beneficiario.nombre_universidad || '',
        nombre_colegio: beneficiario.nombre_colegio || '',
        tipo_educacion: beneficiario.tipo_educacion || '',
        nivel_formacion: beneficiario.nivel_formacion || '',
        modalidad_beca: beneficiario.modalidad_beca || '',
        semestre_actual: beneficiario.semestre_actual || '',
        semestre_ingreso: beneficiario.semestre_ingreso || '',
        año_convocatoria: beneficiario.año_convocatoria || '',
        
        // Datos bancarios
        nombre_banco: beneficiario.nombre_banco || '',
        numero_cuenta: beneficiario.numero_cuenta || '',
        tipo_cuenta_bancaria: beneficiario.tipo_cuenta_bancaria || '',
        
        // Estado
        estado_beneficiario: beneficiario.estado_beneficiario || 'activo',
      });
      setHasChanges(false);
      setIsEditing(false);
      loadDocuments();
    }
  }, [beneficiario]);

  const loadDocuments = async () => {
    if (!beneficiario?.id) return;
    
    setLoadingDocs(true);
    try {
      // Cargar documentos de actualizaciones
      const { data: updates } = await supabase
        .from('portal_actualizaciones')
        .select('id')
        .eq('beneficiario_id', beneficiario.id);
      
      const updateIds = updates?.map(u => u.id) || [];
      
      const docsQueries = [];
      
      // Documentos de actualizaciones
      if (updateIds.length > 0) {
        docsQueries.push(
          supabase
            .from('portal_actualizacion_documentos')
            .select('*, portal_actualizaciones!inner(ventana_id)')
            .in('actualizacion_id', updateIds)
            .order('created_at', { ascending: false })
        );
      } else {
        docsQueries.push(Promise.resolve({ data: [] }));
      }
      
      // Documentos históricos
      docsQueries.push(
        supabase
          .from('portal_beneficiario_documentos_historicos')
          .select('*')
          .eq('beneficiario_id', beneficiario.id)
          .order('created_at', { ascending: false })
      );
      
      const [actualizacionDocs, historicoDocs] = await Promise.all(docsQueries);
      
      const allDocs = [
        ...(actualizacionDocs.data || []).map(d => ({ ...d, source: 'actualizacion' })),
        ...(historicoDocs.data || []).map(d => ({ ...d, source: 'historico' }))
      ];
      
      setDocuments(allDocs);
    } catch (error) {
      console.error('Error cargando documentos:', error);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const getChangedFields = () => {
    const changes = {};
    const oldState = {};
    const newState = {};

    Object.keys(formData).forEach(key => {
      if (formData[key] !== (beneficiario[key] || '')) {
        changes[key] = formData[key];
        oldState[key] = beneficiario[key];
        newState[key] = formData[key];
      }
    });

    return { changes, oldState, newState };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { changes, oldState, newState } = getChangedFields();
      
      if (Object.keys(changes).length === 0) {
        await showErrorAlert({ title: 'Sin cambios', text: 'No hay cambios para guardar' });
        setSaving(false);
        return;
      }

      // Actualizar beneficiario
      const { error: updateError } = await supabase
        .from('portal_beneficiarios')
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq('id', beneficiario.id);

      if (updateError) throw updateError;

      // Registrar en bitácora
      const { data: { user } } = await supabase.auth.getUser();
      
      for (const field of Object.keys(changes)) {
        await supabase.from('portal_beneficiario_bitacora').insert({
          beneficiario_id: beneficiario.id,
          tipo_evento: 'beneficiario_datos_actualizado',
          categoria: 'general',
          accion: 'update',
          campo_cambio: field,
          estado_anterior: { [field]: oldState[field] },
          estado_nuevo: { [field]: newState[field] },
          nota: `Campo "${field}" actualizado desde admin`,
          actor_user_id: user?.id,
          actor_email: user?.email,
        });
      }

      await showSuccessAlert({ title: 'Guardado', text: 'Beneficiario actualizado correctamente' });
      setHasChanges(false);
      setIsEditing(false);
      
      if (onSave) onSave({ ...beneficiario, ...changes });
    } catch (error) {
      console.error('Error guardando beneficiario:', error);
      await showErrorAlert({ title: 'Error', text: 'Error al guardar los cambios' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !beneficiario) return null;

  const tabs = [
    { id: 'personal', label: 'Datos Personales', icon: User },
    { id: 'academico', label: 'Datos Académicos', icon: GraduationCap },
    { id: 'bancario', label: 'Datos Bancarios', icon: CreditCard },
    { id: 'estado', label: 'Estado y Vinculación', icon: Shield },
    { id: 'documentos', label: 'Documentos', icon: FileText },
  ];

  const handleCancelEdit = () => {
    // Restaurar datos originales
    setFormData({
      nombre_completo: beneficiario.nombre_completo || '',
      n_documento: beneficiario.n_documento || '',
      tipo_documento: beneficiario.tipo_documento || 'CC',
      email: beneficiario.email || '',
      telefono: beneficiario.telefono || '',
      direccion: beneficiario.direccion || '',
      genero: beneficiario.genero || '',
      programa_academico: beneficiario.programa_academico || '',
      nombre_universidad: beneficiario.nombre_universidad || '',
      nombre_colegio: beneficiario.nombre_colegio || '',
      tipo_educacion: beneficiario.tipo_educacion || '',
      nivel_formacion: beneficiario.nivel_formacion || '',
      modalidad_beca: beneficiario.modalidad_beca || '',
      semestre_actual: beneficiario.semestre_actual || '',
      semestre_ingreso: beneficiario.semestre_ingreso || '',
      año_convocatoria: beneficiario.año_convocatoria || '',
      nombre_banco: beneficiario.nombre_banco || '',
      numero_cuenta: beneficiario.numero_cuenta || '',
      tipo_cuenta_bancaria: beneficiario.tipo_cuenta_bancaria || '',
      estado_beneficiario: beneficiario.estado_beneficiario || 'activo',
    });
    setHasChanges(false);
    setIsEditing(false);
  };

  const formatDateTime = (value) => {
    if (!value) return 'No disponible';
    return new Date(value).toLocaleString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Componente auxiliar para campos
  const Field = ({ label, value, type = 'text', options = null, onChange = null, disabled = false, placeholder = '', className = '' }) => {
    const displayValue = value || 'No especificado';
    
    if (!isEditing) {
      return (
        <div className={className}>
          <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
          <div className="px-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900">
            {displayValue}
          </div>
        </div>
      );
    }
    
    if (type === 'select' && options) {
      return (
        <div className={className}>
          <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
          <select
            value={value}
            onChange={onChange}
            disabled={disabled}
            className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:cursor-not-allowed"
          >
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      );
    }
    
    return (
      <div className={className}>
        <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
        <input
          type={type}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:cursor-not-allowed"
        />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-900">
                {beneficiario.nombre_completo}
              </h2>
              {isEditing ? (
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full flex items-center gap-1">
                  <Edit2 size={12} /> EDITANDO
                </span>
              ) : (
                <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full flex items-center gap-1">
                  <Eye size={12} /> SOLO LECTURA
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 mt-1">
              ID: {beneficiario.id} • {beneficiario.n_documento}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && activeTab !== 'documentos' && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Edit2 size={16} />
                Editar
              </button>
            )}
            {isEditing && (
              <button
                onClick={handleCancelEdit}
                disabled={loading}
                className="px-4 py-2 border-2 border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar edición
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X size={24} className="text-slate-600" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-6 pt-4 border-b border-slate-200">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 font-semibold rounded-t-xl transition-all ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-700'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon size={18} />
                <span className="text-sm">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Datos Personales */}
          {activeTab === 'personal' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field
                label="Nombre Completo"
                value={formData.nombre_completo}
                onChange={(e) => handleChange('nombre_completo', e.target.value)}
              />

              <Field
                label="Tipo de Documento"
                type="select"
                value={formData.tipo_documento}
                onChange={(e) => handleChange('tipo_documento', e.target.value)}
                options={[
                  { value: 'CC', label: 'Cédula de Ciudadanía' },
                  { value: 'TI', label: 'Tarjeta de Identidad' },
                  { value: 'CE', label: 'Cédula de Extranjería' },
                  { value: 'PA', label: 'Pasaporte' }
                ]}
              />

              <Field
                label="Número de Documento"
                value={formData.n_documento}
                onChange={(e) => handleChange('n_documento', e.target.value)}
              />

              <Field
                label="Género"
                type="select"
                value={formData.genero}
                onChange={(e) => handleChange('genero', e.target.value)}
                options={[
                  { value: '', label: 'Seleccionar...' },
                  { value: 'MASCULINO', label: 'Masculino' },
                  { value: 'FEMENINO', label: 'Femenino' },
                  { value: 'OTRO', label: 'Otro' }
                ]}
              />

              <Field
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
              />

              <Field
                label="Teléfono"
                type="tel"
                value={formData.telefono}
                onChange={(e) => handleChange('telefono', e.target.value)}
              />

              <Field
                label="Dirección"
                value={formData.direccion}
                onChange={(e) => handleChange('direccion', e.target.value)}
                className="md:col-span-2"
              />
            </div>
          )}

          {/* Datos Académicos */}
          {activeTab === 'academico' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field
                label="Programa Académico"
                value={formData.programa_academico}
                onChange={(e) => handleChange('programa_academico', e.target.value)}
                placeholder="Ej: Ingeniería de Sistemas"
              />

              <Field
                label="Universidad"
                value={formData.nombre_universidad}
                onChange={(e) => handleChange('nombre_universidad', e.target.value)}
                placeholder="Nombre de la institución"
              />

              <Field
                label="Colegio de Procedencia"
                value={formData.nombre_colegio}
                onChange={(e) => handleChange('nombre_colegio', e.target.value)}
              />

              <Field
                label="Tipo de Educación"
                type="select"
                value={formData.tipo_educacion}
                onChange={(e) => handleChange('tipo_educacion', e.target.value)}
                options={[
                  { value: '', label: 'Seleccionar...' },
                  { value: 'TECNICO', label: 'Técnico' },
                  { value: 'TECNOLOGICO', label: 'Tecnológico' },
                  { value: 'PROFESIONAL', label: 'Profesional' }
                ]}
              />

              <Field
                label="Modalidad de Beca"
                type="select"
                value={formData.modalidad_beca}
                onChange={(e) => handleChange('modalidad_beca', e.target.value)}
                options={[
                  { value: '', label: 'Seleccionar...' },
                  { value: 'SUEÑO EDUCATIVO', label: 'Sueño Educativo' },
                  { value: 'MÉRITO EDUCATIVO', label: 'Mérito Educativo' }
                ]}
              />

              <Field
                label="Semestre Actual"
                type="number"
                value={formData.semestre_actual}
                onChange={(e) => handleChange('semestre_actual', e.target.value)}
              />

              <Field
                label="Semestre de Ingreso"
                value={formData.semestre_ingreso}
                onChange={(e) => handleChange('semestre_ingreso', e.target.value)}
                placeholder="Ej: 2025-1"
              />

              <Field
                label="Año de Convocatoria"
                type="number"
                value={formData.año_convocatoria}
                onChange={(e) => handleChange('año_convocatoria', e.target.value)}
              />
            </div>
          )}

          {/* Datos Bancarios */}
          {activeTab === 'bancario' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field
                label="Banco"
                value={formData.nombre_banco}
                onChange={(e) => handleChange('nombre_banco', e.target.value)}
                placeholder="Nombre del banco"
              />

              <Field
                label="Tipo de Cuenta"
                type="select"
                value={formData.tipo_cuenta_bancaria}
                onChange={(e) => handleChange('tipo_cuenta_bancaria', e.target.value)}
                options={[
                  { value: '', label: 'Seleccionar...' },
                  { value: 'AHORROS', label: 'Ahorros' },
                  { value: 'CORRIENTE', label: 'Corriente' }
                ]}
              />

              <Field
                label="Número de Cuenta"
                value={formData.numero_cuenta}
                onChange={(e) => handleChange('numero_cuenta', e.target.value)}
                placeholder="Sin espacios ni guiones"
                className="md:col-span-2"
              />

              {formData.numero_cuenta && (
                <div className="md:col-span-2 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
                    <div className="text-sm text-blue-800">
                      <p className="font-semibold mb-1">Información importante</p>
                      <p>Los datos bancarios son sensibles. Asegúrate de verificar la información antes de guardar.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Estado y Vinculación */}
          {activeTab === 'estado' && (
            <div className="space-y-6">
              <Field
                label="Estado del Beneficiario"
                type="select"
                value={formData.estado_beneficiario}
                onChange={(e) => handleChange('estado_beneficiario', e.target.value)}
                options={[
                  { value: 'activo', label: 'Activo' },
                  { value: 'suspendido', label: 'Suspendido' },
                  { value: 'retirado', label: 'Retirado' },
                  { value: 'condonado', label: 'Condonado' },
                  { value: 'egresado', label: 'Egresado' }
                ]}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-xs font-bold text-slate-600 mb-1">ORIGEN DEL REGISTRO</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {beneficiario.origen_registro === 'historico' ? 'Beneficiario Histórico' : 'Nueva Inscripción'}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-xs font-bold text-slate-600 mb-1">ONBOARDING</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {beneficiario.onboarding_completado ? '✓ Completado' : '⏳ Pendiente'}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-xs font-bold text-slate-600 mb-1">AUTH USER ID</p>
                  <p className="text-sm font-mono text-slate-900 break-all">
                    {beneficiario.auth_user_id || 'No vinculado'}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-xs font-bold text-slate-600 mb-1">INSCRIPCIÓN ID</p>
                  <p className="text-sm font-mono text-slate-900 break-all">
                    {beneficiario.inscripcion_id || 'N/A'}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                  <div className="text-sm text-amber-800">
                    <p className="font-semibold mb-1">Campos de solo lectura</p>
                    <p>Los campos de origen, onboarding, auth_user_id e inscripción_id son de solo lectura y se gestionan automáticamente por el sistema.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Documentos */}
          {activeTab === 'documentos' && (
            <div className="space-y-6">
              {loadingDocs ? (
                <p className="text-center text-slate-500 py-8">Cargando documentos...</p>
              ) : documents.length === 0 ? (
                <div className="text-center py-12">
                  <FileText size={48} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-500">No hay documentos subidos</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-800">
                      Documentos del beneficiario ({documents.length})
                    </h3>
                  </div>
                  
                  <div className="space-y-3">
                    {documents.map((doc) => (
                      <div key={doc.id} className="border border-slate-200 rounded-xl p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <FileText size={18} className="text-blue-600" />
                              <p className="font-semibold text-slate-900">
                                {doc.nombre_original || doc.tipo_documento || 'Documento'}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                              <span className={`px-2 py-1 rounded-md ${
                                doc.source === 'historico' 
                                  ? 'bg-purple-100 text-purple-700' 
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                {doc.source === 'historico' ? 'Documento histórico' : 'Actualización semestral'}
                              </span>
                              {doc.tipo_documento && (
                                <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md">
                                  {doc.tipo_documento}
                                </span>
                              )}
                              <span>{formatDateTime(doc.created_at)}</span>
                            </div>
                          </div>
                          
                          {doc.url_documento && (
                            <a
                              href={doc.url_documento}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
                            >
                              <Eye size={16} />
                              Ver documento
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-slate-200 bg-slate-50">
          <div>
            {isEditing && hasChanges && (
              <p className="text-sm text-amber-600 font-semibold flex items-center gap-2">
                <AlertCircle size={16} />
                Tienes cambios sin guardar
              </p>
            )}
          </div>
          <div className="flex gap-3">
            {isEditing ? (
              <>
                <button
                  onClick={handleCancelEdit}
                  disabled={loading}
                  className="px-6 py-2.5 border-2 border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading || !hasChanges}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Save size={18} className="animate-pulse" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      Guardar cambios
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-slate-700 text-white rounded-xl font-semibold hover:bg-slate-800 transition-colors"
              >
                Cerrar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BeneficiarioDetailModal;
