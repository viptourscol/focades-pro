import { useState, useEffect } from 'react';
import { X, Save, User, GraduationCap, CreditCard, Shield, AlertCircle, FileText, Edit2, Check, Eye, ChevronLeft, ChevronRight, Printer, Download } from 'lucide-react';
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
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedDocUrl, setSelectedDocUrl] = useState('');
  const [currentDocIndex, setCurrentDocIndex] = useState(-1);
  const [docPreviewLoading, setDocPreviewLoading] = useState(false);
  const [docPreviewError, setDocPreviewError] = useState('');

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
        fecha_nacimiento: beneficiario.fecha_nacimiento || '',
        pais_nacimiento: beneficiario.pais_nacimiento || 'COLOMBIA',
        dpto_nacimiento: beneficiario.dpto_nacimiento || '',
        municipio_nacimiento: beneficiario.municipio_nacimiento || '',
        dpto_residencia: beneficiario.dpto_residencia || '',
        municipio_residencia: beneficiario.municipio_residencia || '',
        direccion_residencia: beneficiario.direccion_residencia || '',
        barrio_corregimiento: beneficiario.barrio_corregimiento || '',
        zona_residencia: beneficiario.zona_residencia || '',
        
        // Información socioeconómica
        sisben_grupo: beneficiario.sisben_grupo || '',
        recibe_subsidio: beneficiario.recibe_subsidio || '',
        cual_subsidio: beneficiario.cual_subsidio || '',
        enfoque_diferencial: beneficiario.enfoque_diferencial || 'NINGUNO',
        labora_actualmente: beneficiario.labora_actualmente || '',
        
        // Composición familiar
        nombre_padre: beneficiario.nombre_padre || '',
        documento_padre: beneficiario.documento_padre || '',
        ocupacion_padre: beneficiario.ocupacion_padre || '',
        ingresos_padre: beneficiario.ingresos_padre || '',
        nombre_madre: beneficiario.nombre_madre || '',
        documento_madre: beneficiario.documento_madre || '',
        ocupacion_madre: beneficiario.ocupacion_madre || '',
        ingresos_madre: beneficiario.ingresos_madre || '',
        
        // Formación secundaria
        titulo_obtenido: beneficiario.titulo_obtenido || '',
        ano_graduacion: beneficiario.ano_graduacion || '',
        establecimiento_educativo: beneficiario.establecimiento_educativo || '',
        puntaje_icfes: beneficiario.puntaje_icfes || '',
        
        // Datos académicos
        programa_academico: beneficiario.programa_academico || '',
        nombre_universidad: beneficiario.nombre_universidad || '',
        institucion_superior: beneficiario.institucion_superior || '',
        nombre_colegio: beneficiario.nombre_colegio || '',
        tipo_educacion: beneficiario.tipo_educacion || '',
        nivel_formacion: beneficiario.nivel_formacion || '',
        modalidad_beca: beneficiario.modalidad_beca || '',
        modalidad: beneficiario.modalidad || '',
        semestre_actual: beneficiario.semestre_actual || '',
        semestre_ingreso: beneficiario.semestre_ingreso || '',
        año_convocatoria: beneficiario.año_convocatoria || '',
        ciudad_institucion: beneficiario.ciudad_institucion || '',
        dpto_institucion: beneficiario.dpto_institucion || '',
        municipio_institucion: beneficiario.municipio_institucion || '',
        promedio_anterior: beneficiario.promedio_anterior || '',
        
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

  // Keyboard shortcuts para navegación de documentos
  useEffect(() => {
    if (!selectedDoc) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPreviousDoc();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNextDoc();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closePreviewModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDoc, currentDocIndex, documents]);

  const loadDocuments = async () => {
    if (!beneficiario?.id) return;
    
    setLoadingDocs(true);
    try {
      // Cargar solo documentos históricos del onboarding
      const { data: historicoDocs } = await supabase
        .from('portal_beneficiario_documentos_historicos')
        .select('*')
        .eq('beneficiario_id', beneficiario.id)
        .order('created_at', { ascending: false });
      
      setDocuments(historicoDocs || []);
    } catch (error) {
      setDocuments([]);
    } finally {
      setLoadingDocs(false);
    }
  };

  const resolveDocumentUrl = async (path) => {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    // Limpiar el path: remover prefijo del bucket si existe
    // storage_path puede venir como "soportes/ruta/archivo.pdf" pero .from('soportes') 
    // ya especifica el bucket, así que necesitamos solo "ruta/archivo.pdf"
    let cleanPath = path;
    const bucketPrefix = 'soportes/';
    if (cleanPath.startsWith(bucketPrefix)) {
      cleanPath = cleanPath.substring(bucketPrefix.length);
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from('soportes')
      .createSignedUrl(cleanPath, 60 * 30);

    if (!signedError && signedData?.signedUrl) {
      return signedData.signedUrl;
    }

    const publicData = supabase.storage.from('soportes').getPublicUrl(cleanPath);
    const publicUrl = String(publicData?.data?.publicUrl || '').trim();
    if (publicUrl) return publicUrl;

    throw new Error(signedError?.message || 'No se pudo obtener una URL para visualizar el documento.');
  };

  const handleOpenDocument = async (doc) => {
    setSelectedDoc(doc);
    setSelectedDocUrl('');
    setDocPreviewError('');
    setDocPreviewLoading(true);
    
    const idx = documents.findIndex(d => d.id === doc.id);
    setCurrentDocIndex(idx !== -1 ? idx : -1);

    try {
      const url = await resolveDocumentUrl(doc.storage_path);
      setSelectedDocUrl(url);
    } catch (error) {
      setDocPreviewError(error?.message || 'No se pudo abrir el documento.');
    } finally {
      setDocPreviewLoading(false);
    }
  };

  const goToPreviousDoc = async () => {
    if (currentDocIndex <= 0) return;
    const prevIndex = currentDocIndex - 1;
    const prevDoc = documents[prevIndex];
    if (prevDoc) {
      setCurrentDocIndex(prevIndex);
      setSelectedDoc(prevDoc);
      setSelectedDocUrl('');
      setDocPreviewError('');
      setDocPreviewLoading(true);

      try {
        const url = await resolveDocumentUrl(prevDoc.storage_path);
        setSelectedDocUrl(url);
      } catch (error) {
        setDocPreviewError(error?.message || 'No se pudo abrir el documento.');
      } finally {
        setDocPreviewLoading(false);
      }
    }
  };

  const goToNextDoc = async () => {
    if (currentDocIndex >= documents.length - 1) return;
    const nextIndex = currentDocIndex + 1;
    const nextDoc = documents[nextIndex];
    if (nextDoc) {
      setCurrentDocIndex(nextIndex);
      setSelectedDoc(nextDoc);
      setSelectedDocUrl('');
      setDocPreviewError('');
      setDocPreviewLoading(true);

      try {
        const url = await resolveDocumentUrl(nextDoc.storage_path);
        setSelectedDocUrl(url);
      } catch (error) {
        setDocPreviewError(error?.message || 'No se pudo abrir el documento.');
      } finally {
        setDocPreviewLoading(false);
      }
    }
  };

  const closePreviewModal = () => {
    setSelectedDoc(null);
    setSelectedDocUrl('');
    setDocPreviewError('');
    setDocPreviewLoading(false);
    setCurrentDocIndex(-1);
  };

  const handlePrintDocument = () => {
    if (selectedDocUrl) {
      window.open(selectedDocUrl, '_blank');
    }
  };

  const looksLikePdf = (value) => /\.pdf(\?|$)/i.test(String(value || ''));
  const looksLikeImage = (value) => /\.(png|jpg|jpeg|webp)(\?|$)/i.test(String(value || ''));

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
    } catch (error) {await showErrorAlert({ title: 'Error', text: 'Error al guardar los cambios' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !beneficiario) return null;

  const tabs = [
    { id: 'personal', label: 'Personal', icon: User },
    { id: 'socioeconomico', label: 'Socioeconómico', icon: Shield },
    { id: 'familiar', label: 'Familiar', icon: User },
    { id: 'secundaria', label: 'Secundaria', icon: GraduationCap },
    { id: 'academico', label: 'Académico', icon: GraduationCap },
    { id: 'bancario', label: 'Bancario', icon: CreditCard },
    { id: 'estado', label: 'Estado', icon: Shield },
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] flex flex-col">
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
        <div className="overflow-x-auto border-b border-slate-200 hide-scrollbar">
          <div className="flex gap-2 px-6 pt-4 min-w-max">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isDocTab = tab.id === 'documentos';
              const docCount = isDocTab ? documents.length : 0;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 font-semibold rounded-t-xl transition-all whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white border-b-4 border-blue-700 shadow-md'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon size={18} />
                  <span className="text-sm">{tab.label}</span>
                  {isDocTab && docCount > 0 && (
                    <span className={`ml-1 px-2 py-0.5 text-xs font-bold rounded-full ${
                      activeTab === tab.id 
                        ? 'bg-white text-blue-600' 
                        : 'bg-blue-600 text-white'
                    }`}>
                      {docCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6" style={{ minHeight: '500px', maxHeight: 'calc(90vh - 240px)' }}>
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
                label="Fecha de Nacimiento"
                type="date"
                value={formData.fecha_nacimiento}
                onChange={(e) => handleChange('fecha_nacimiento', e.target.value)}
              />

              <Field
                label="País de Nacimiento"
                value={formData.pais_nacimiento}
                onChange={(e) => handleChange('pais_nacimiento', e.target.value)}
              />

              <Field
                label="Departamento de Nacimiento"
                value={formData.dpto_nacimiento}
                onChange={(e) => handleChange('dpto_nacimiento', e.target.value)}
              />

              <Field
                label="Municipio de Nacimiento"
                value={formData.municipio_nacimiento}
                onChange={(e) => handleChange('municipio_nacimiento', e.target.value)}
              />

              <Field
                label="Departamento de Residencia"
                value={formData.dpto_residencia}
                onChange={(e) => handleChange('dpto_residencia', e.target.value)}
              />

              <Field
                label="Municipio de Residencia"
                value={formData.municipio_residencia}
                onChange={(e) => handleChange('municipio_residencia', e.target.value)}
              />

              <Field
                label="Dirección de Residencia"
                value={formData.direccion_residencia}
                onChange={(e) => handleChange('direccion_residencia', e.target.value)}
                className="md:col-span-2"
              />

              <Field
                label="Barrio/Corregimiento"
                value={formData.barrio_corregimiento}
                onChange={(e) => handleChange('barrio_corregimiento', e.target.value)}
              />

              <Field
                label="Zona de Residencia"
                type="select"
                value={formData.zona_residencia}
                onChange={(e) => handleChange('zona_residencia', e.target.value)}
                options={[
                  { value: '', label: 'Seleccionar...' },
                  { value: 'URBANA', label: 'Urbana' },
                  { value: 'RURAL', label: 'Rural' }
                ]}
              />

              <Field
                label="Dirección"
                value={formData.direccion}
                onChange={(e) => handleChange('direccion', e.target.value)}
                className="md:col-span-2"
              />
            </div>
          )}

          {/* Información Socioeconómica */}
          {activeTab === 'socioeconomico' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field
                label="Grupo SISBEN"
                type="select"
                value={formData.sisben_grupo}
                onChange={(e) => handleChange('sisben_grupo', e.target.value)}
                options={[
                  { value: '', label: 'Seleccionar...' },
                  { value: 'A', label: 'Grupo A' },
                  { value: 'B', label: 'Grupo B' },
                  { value: 'C', label: 'Grupo C' },
                  { value: 'D', label: 'Grupo D' },
                  { value: 'NO_APLICA', label: 'No Aplica' }
                ]}
              />

              <Field
                label="¿Recibe Subsidio?"
                type="select"
                value={formData.recibe_subsidio}
                onChange={(e) => handleChange('recibe_subsidio', e.target.value)}
                options={[
                  { value: '', label: 'Seleccionar...' },
                  { value: 'SI', label: 'Sí' },
                  { value: 'NO', label: 'No' }
                ]}
              />

              {formData.recibe_subsidio === 'SI' && (
                <Field
                  label="¿Cuál Subsidio?"
                  value={formData.cual_subsidio}
                  onChange={(e) => handleChange('cual_subsidio', e.target.value)}
                  className="md:col-span-2"
                />
              )}

              <Field
                label="Enfoque Diferencial"
                type="select"
                value={formData.enfoque_diferencial}
                onChange={(e) => handleChange('enfoque_diferencial', e.target.value)}
                options={[
                  { value: 'NINGUNO', label: 'Ninguno' },
                  { value: 'INDIGENA', label: 'Indígena' },
                  { value: 'AFROCOLOMBIANO', label: 'Afrocolombiano' },
                  { value: 'ROM', label: 'Rom (Gitano)' },
                  { value: 'RAIZAL', label: 'Raizal' },
                  { value: 'PALENQUERO', label: 'Palenquero' },
                  { value: 'DISCAPACIDAD', label: 'Persona con Discapacidad' },
                  { value: 'VICTIMA_CONFLICTO', label: 'Víctima del Conflicto' },
                  { value: 'LGBTIQ', label: 'LGBTIQ+' },
                  { value: 'OTRO', label: 'Otro' }
                ]}
              />

              <Field
                label="¿Labora Actualmente?"
                type="select"
                value={formData.labora_actualmente}
                onChange={(e) => handleChange('labora_actualmente', e.target.value)}
                options={[
                  { value: '', label: 'Seleccionar...' },
                  { value: 'SI', label: 'Sí' },
                  { value: 'NO', label: 'No' }
                ]}
              />
            </div>
          )}

          {/* Información Familiar */}
          {activeTab === 'familiar' && (
            <div className="space-y-6">
              <div className="border-b border-slate-200 pb-4">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Información del Padre</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field
                    label="Nombre Completo"
                    value={formData.nombre_padre}
                    onChange={(e) => handleChange('nombre_padre', e.target.value)}
                  />

                  <Field
                    label="Documento"
                    value={formData.documento_padre}
                    onChange={(e) => handleChange('documento_padre', e.target.value)}
                  />

                  <Field
                    label="Ocupación"
                    value={formData.ocupacion_padre}
                    onChange={(e) => handleChange('ocupacion_padre', e.target.value)}
                  />

                  <Field
                    label="Ingresos Mensuales"
                    type="number"
                    value={formData.ingresos_padre}
                    onChange={(e) => handleChange('ingresos_padre', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4">Información de la Madre</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field
                    label="Nombre Completo"
                    value={formData.nombre_madre}
                    onChange={(e) => handleChange('nombre_madre', e.target.value)}
                  />

                  <Field
                    label="Documento"
                    value={formData.documento_madre}
                    onChange={(e) => handleChange('documento_madre', e.target.value)}
                  />

                  <Field
                    label="Ocupación"
                    value={formData.ocupacion_madre}
                    onChange={(e) => handleChange('ocupacion_madre', e.target.value)}
                  />

                  <Field
                    label="Ingresos Mensuales"
                    type="number"
                    value={formData.ingresos_madre}
                    onChange={(e) => handleChange('ingresos_madre', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Formación Secundaria */}
          {activeTab === 'secundaria' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field
                label="Título Obtenido"
                type="select"
                value={formData.titulo_obtenido}
                onChange={(e) => handleChange('titulo_obtenido', e.target.value)}
                options={[
                  { value: '', label: 'Seleccionar...' },
                  { value: 'BACHILLER_ACADEMICO', label: 'Bachiller Académico' },
                  { value: 'BACHILLER_TECNICO', label: 'Bachiller Técnico' },
                  { value: 'BACHILLER_COMERCIAL', label: 'Bachiller Comercial' },
                  { value: 'BACHILLER_PEDAGOGICO', label: 'Bachiller Pedagógico' },
                  { value: 'NORMALISTA', label: 'Normalista' },
                  { value: 'OTRO', label: 'Otro' }
                ]}
              />

              <Field
                label="Año de Graduación"
                type="number"
                value={formData.ano_graduacion}
                onChange={(e) => handleChange('ano_graduacion', e.target.value)}
              />

              <Field
                label="Establecimiento Educativo"
                value={formData.establecimiento_educativo}
                onChange={(e) => handleChange('establecimiento_educativo', e.target.value)}
                className="md:col-span-2"
              />

              <Field
                label="Colegio de Procedencia"
                value={formData.nombre_colegio}
                onChange={(e) => handleChange('nombre_colegio', e.target.value)}
              />

              <Field
                label="Puntaje ICFES"
                type="number"
                value={formData.puntaje_icfes}
                onChange={(e) => handleChange('puntaje_icfes', e.target.value)}
              />
            </div>
          )}

          {/* Educación Superior (Datos Académicos) */}
          {activeTab === 'academico' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field
                label="Programa Académico"
                value={formData.programa_academico}
                onChange={(e) => handleChange('programa_academico', e.target.value)}
                placeholder="Ej: Ingeniería de Sistemas"
              />

              <Field
                label="Universidad / Institución"
                value={formData.nombre_universidad}
                onChange={(e) => handleChange('nombre_universidad', e.target.value)}
                placeholder="Nombre de la institución"
              />

              <Field
                label="Institución Superior"
                value={formData.institucion_superior}
                onChange={(e) => handleChange('institucion_superior', e.target.value)}
              />

              <Field
                label="Departamento de la Institución"
                value={formData.dpto_institucion}
                onChange={(e) => handleChange('dpto_institucion', e.target.value)}
              />

              <Field
                label="Municipio de la Institución"
                value={formData.municipio_institucion}
                onChange={(e) => handleChange('municipio_institucion', e.target.value)}
              />

              <Field
                label="Ciudad de la Institución"
                value={formData.ciudad_institucion}
                onChange={(e) => handleChange('ciudad_institucion', e.target.value)}
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
                label="Modalidad de Estudio"
                type="select"
                value={formData.modalidad}
                onChange={(e) => handleChange('modalidad', e.target.value)}
                options={[
                  { value: '', label: 'Seleccionar...' },
                  { value: 'PRESENCIAL', label: 'Presencial' },
                  { value: 'VIRTUAL', label: 'Virtual' },
                  { value: 'DISTANCIA', label: 'Distancia' },
                  { value: 'SEMIPRESENCIAL', label: 'Semipresencial' }
                ]}
              />

              <Field
                label="Promedio Anterior"
                type="number"
                value={formData.promedio_anterior}
                onChange={(e) => handleChange('promedio_anterior', e.target.value)}
                placeholder="0.0 - 5.0"
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

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-xs font-bold text-slate-600 mb-1">ACEPTA TÉRMINOS</p>
                  <p className="text-sm text-slate-900">
                    {beneficiario.acepta_terminos_at ? formatDateTime(beneficiario.acepta_terminos_at) : 'No aceptado'}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-xs font-bold text-slate-600 mb-1">ACEPTA POLÍTICA DE DATOS</p>
                  <p className="text-sm text-slate-900">
                    {beneficiario.acepta_datos_at ? formatDateTime(beneficiario.acepta_datos_at) : 'No aceptado'}
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
              {/* Información sobre documentos */}
              <div className="bg-slate-50 border border-slate-300 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <FileText size={20} className="text-slate-700 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-slate-800">
                    <p className="font-semibold mb-1">Documentos del Onboarding</p>
                    <p className="text-slate-600">
                      Aquí se muestran los documentos históricos subidos por el beneficiario durante el proceso de registro inicial (onboarding), 
                      incluyendo: cédula, certificados académicos, soportes bancarios, constancias, etc.
                    </p>
                  </div>
                </div>
              </div>

              {loadingDocs ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent mb-4"></div>
                  <p className="text-slate-600 font-medium">Cargando documentos...</p>
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-12">
                  <FileText size={56} className="mx-auto text-slate-300 mb-4" />
                  <h4 className="text-lg font-bold text-slate-700 mb-2">Sin documentos</h4>
                  <p className="text-slate-500">El beneficiario aún no ha subido ningún documento</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-800">
                      Documentos de Onboarding: {documents.length}
                    </h3>
                  </div>
                  
                  <div className="space-y-3">
                    {documents.map((doc) => (
                      <div key={doc.id} className="border-2 border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-all">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText size={20} className="text-slate-700 flex-shrink-0" />
                              <p className="font-bold text-slate-900 text-base truncate">
                                {doc.titulo || doc.tipo_documento || 'Documento sin nombre'}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              {doc.tipo_documento && (
                                <span className="bg-slate-700 text-white px-2.5 py-1 rounded-lg font-bold">
                                  {doc.tipo_documento.toUpperCase()}
                                </span>
                              )}
                              {doc.descripcion && (
                                <span className="bg-slate-50 text-slate-600 px-2.5 py-1 rounded-lg text-xs border border-slate-200">
                                  {doc.descripcion}
                                </span>
                              )}
                              <span className="text-slate-600 font-medium">
                                {formatDateTime(doc.created_at)}
                              </span>
                            </div>
                          </div>
                          
                          {doc.storage_path && (
                            <button
                              onClick={() => handleOpenDocument(doc)}
                              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-700 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-md hover:shadow-lg flex-shrink-0"
                            >
                              <Eye size={18} />
                              Ver Documento
                            </button>
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

      {/* Modal de visualización de documentos */}
      {selectedDoc && (
        <div
          className="fixed inset-0 z-[70] bg-slate-900/60 p-4 flex items-center justify-center"
          onClick={closePreviewModal}
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Visualización de documento</p>
                <p className="text-sm font-bold text-slate-700 truncate">
                  {selectedDoc.titulo || selectedDoc.tipo_documento || 'Documento'}
                </p>
                {documents.length > 1 && (
                  <p className="text-xs text-slate-500 mt-1">
                    {currentDocIndex + 1} de {documents.length}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {documents.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={goToPreviousDoc}
                      disabled={currentDocIndex <= 0 || docPreviewLoading}
                      className="p-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      aria-label="Documento anterior"
                      title="Anterior (←)"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={goToNextDoc}
                      disabled={currentDocIndex >= documents.length - 1 || docPreviewLoading}
                      className="p-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      aria-label="Documento siguiente"
                      title="Siguiente (→)"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handlePrintDocument}
                  disabled={!selectedDocUrl}
                  className="p-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  aria-label="Imprimir documento"
                  title="Imprimir"
                >
                  <Printer size={16} />
                </button>
                <button
                  type="button"
                  onClick={closePreviewModal}
                  className="p-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100"
                  aria-label="Cerrar visualización"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-3 bg-slate-100 max-h-[80vh] overflow-auto">
              {docPreviewLoading && <p className="text-sm text-slate-500">Cargando vista del documento...</p>}
              {!docPreviewLoading && docPreviewError && <p className="text-sm text-red-600">{docPreviewError}</p>}

              {!docPreviewLoading && !docPreviewError && selectedDocUrl && (
                <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
                  {looksLikeImage(selectedDocUrl) ? (
                    <img src={selectedDocUrl} alt={selectedDoc.titulo || 'Documento'} className="w-full max-h-[74vh] object-contain bg-slate-50" />
                  ) : looksLikePdf(selectedDocUrl) ? (
                    <iframe title={selectedDoc.titulo || 'Documento'} src={selectedDocUrl} className="w-full h-[74vh]" />
                  ) : (
                    <iframe title={selectedDoc.titulo || 'Documento'} src={selectedDocUrl} className="w-full h-[74vh]" />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BeneficiarioDetailModal;
