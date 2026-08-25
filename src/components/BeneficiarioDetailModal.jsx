import { useState, useEffect } from 'react';
import { X, Save, User, GraduationCap, CreditCard, Shield, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showSuccessAlert, showErrorAlert } from '../lib/alerts';

const BeneficiarioDetailModal = ({ beneficiario, isOpen, onClose, onSave }) => {
  const [activeTab, setActiveTab] = useState('personal');
  const [formData, setFormData] = useState({});
  const [loading, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

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
    }
  }, [beneficiario]);

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
      
      if (onSave) onSave({ ...beneficiario, ...changes });
      onClose();
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
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {beneficiario.nombre_completo}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              ID: {beneficiario.id} • {beneficiario.n_documento}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X size={24} className="text-slate-600" />
          </button>
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
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={formData.nombre_completo}
                  onChange={(e) => handleChange('nombre_completo', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Tipo de Documento
                </label>
                <select
                  value={formData.tipo_documento}
                  onChange={(e) => handleChange('tipo_documento', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                >
                  <option value="CC">Cédula de Ciudadanía</option>
                  <option value="TI">Tarjeta de Identidad</option>
                  <option value="CE">Cédula de Extranjería</option>
                  <option value="PA">Pasaporte</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Número de Documento
                </label>
                <input
                  type="text"
                  value={formData.n_documento}
                  onChange={(e) => handleChange('n_documento', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Género
                </label>
                <select
                  value={formData.genero}
                  onChange={(e) => handleChange('genero', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                >
                  <option value="">Seleccionar...</option>
                  <option value="MASCULINO">Masculino</option>
                  <option value="FEMENINO">Femenino</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={formData.telefono}
                  onChange={(e) => handleChange('telefono', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Dirección
                </label>
                <input
                  type="text"
                  value={formData.direccion}
                  onChange={(e) => handleChange('direccion', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
            </div>
          )}

          {/* Datos Académicos */}
          {activeTab === 'academico' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Programa Académico
                </label>
                <input
                  type="text"
                  value={formData.programa_academico}
                  onChange={(e) => handleChange('programa_academico', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  placeholder="Ej: Ingeniería de Sistemas"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Universidad
                </label>
                <input
                  type="text"
                  value={formData.nombre_universidad}
                  onChange={(e) => handleChange('nombre_universidad', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  placeholder="Nombre de la institución"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Colegio de Procedencia
                </label>
                <input
                  type="text"
                  value={formData.nombre_colegio}
                  onChange={(e) => handleChange('nombre_colegio', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Tipo de Educación
                </label>
                <select
                  value={formData.tipo_educacion}
                  onChange={(e) => handleChange('tipo_educacion', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                >
                  <option value="">Seleccionar...</option>
                  <option value="TECNICO">Técnico</option>
                  <option value="TECNOLOGICO">Tecnológico</option>
                  <option value="PROFESIONAL">Profesional</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Modalidad de Beca
                </label>
                <select
                  value={formData.modalidad_beca}
                  onChange={(e) => handleChange('modalidad_beca', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                >
                  <option value="">Seleccionar...</option>
                  <option value="SUEÑO EDUCATIVO">Sueño Educativo</option>
                  <option value="MÉRITO EDUCATIVO">Mérito Educativo</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Semestre Actual
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={formData.semestre_actual}
                  onChange={(e) => handleChange('semestre_actual', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Semestre de Ingreso
                </label>
                <input
                  type="text"
                  value={formData.semestre_ingreso}
                  onChange={(e) => handleChange('semestre_ingreso', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  placeholder="Ej: 2025-1"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Año de Convocatoria
                </label>
                <input
                  type="number"
                  min="2015"
                  max="2030"
                  value={formData.año_convocatoria}
                  onChange={(e) => handleChange('año_convocatoria', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
            </div>
          )}

          {/* Datos Bancarios */}
          {activeTab === 'bancario' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Banco
                </label>
                <input
                  type="text"
                  value={formData.nombre_banco}
                  onChange={(e) => handleChange('nombre_banco', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  placeholder="Nombre del banco"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Tipo de Cuenta
                </label>
                <select
                  value={formData.tipo_cuenta_bancaria}
                  onChange={(e) => handleChange('tipo_cuenta_bancaria', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                >
                  <option value="">Seleccionar...</option>
                  <option value="AHORROS">Ahorros</option>
                  <option value="CORRIENTE">Corriente</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Número de Cuenta
                </label>
                <input
                  type="text"
                  value={formData.numero_cuenta}
                  onChange={(e) => handleChange('numero_cuenta', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  placeholder="Sin espacios ni guiones"
                />
              </div>

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
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Estado del Beneficiario
                </label>
                <select
                  value={formData.estado_beneficiario}
                  onChange={(e) => handleChange('estado_beneficiario', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                >
                  <option value="activo">Activo</option>
                  <option value="suspendido">Suspendido</option>
                  <option value="retirado">Retirado</option>
                  <option value="condonado">Condonado</option>
                  <option value="egresado">Egresado</option>
                </select>
              </div>

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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-slate-200 bg-slate-50">
          <div>
            {hasChanges && (
              <p className="text-sm text-amber-600 font-semibold flex items-center gap-2">
                <AlertCircle size={16} />
                Tienes cambios sin guardar
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
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
              <Save size={18} />
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BeneficiarioDetailModal;
