import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle, User, BookOpen, DollarSign, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showErrorAlert, showSuccessAlert } from '../lib/alerts';

/**
 * Componente: Completar Perfil Beneficiario
 * 
 * Se muestra después del primer login para recolectar/validar información
 * académica y bancaria que no se capturó durante la importación CSV.
 * 
 * Props:
 *   - beneficiarioId: ID del beneficiario
 *   - initialData: Datos pre-llenados del CSV
 * 
 * Flujo:
 *   1. Detecta campos faltantes o vacíos
 *   2. Muestra formulario con secciones (Personal, Académica, Bancaria)
 *   3. Valida en tiempo real
 *   4. Guarda cambios
 *   5. Marca perfil como completo
 */

export default function BeneficiarioCompletarPerfil({ beneficiarioId, onComplete }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [perfil, setPerfil] = useState(null);
  const [activeTab, setActiveTab] = useState('personal');
  const [errors, setErrors] = useState({});

  const [formData, setFormData] = useState({
    // Personal
    genero: '',
    telefono: '',
    // Académica
    nombre_colegio: '',
    nombre_universidad: '',
    programa_academico: '',
    tipo_educacion: 'PROFESIONAL',
    modalidad_beca: '',
    año_convocatoria: new Date().getFullYear(),
    // Bancaria
    nombre_banco: '',
    numero_cuenta: '',
    tipo_cuenta_bancaria: 'AHORROS',
  });

  useEffect(() => {
    const fetchPerfil = async () => {
      try {
        const { data, error } = await supabase
          .from('portal_beneficiarios')
          .select('*')
          .eq('id', beneficiarioId)
          .single();

        if (error) throw error;
        setPerfil(data);

        // Pre-llenar formulario con datos existentes
        setFormData({
          genero: data.genero || '',
          telefono: data.telefono || '',
          nombre_colegio: data.nombre_colegio || '',
          nombre_universidad: data.nombre_universidad || '',
          programa_academico: data.programa_academico || '',
          tipo_educacion: data.tipo_educacion || 'PROFESIONAL',
          modalidad_beca: data.modalidad_beca || '',
          año_convocatoria: data.año_convocatoria || new Date().getFullYear(),
          nombre_banco: data.nombre_banco || '',
          numero_cuenta: data.numero_cuenta || '',
          tipo_cuenta_bancaria: data.tipo_cuenta_bancaria || 'AHORROS',
        });
      } catch (error) {
        console.error('Error cargando perfil:', error);
        await showErrorAlert({
          title: 'Error',
          text: 'No se pudo cargar tu perfil. Intenta más tarde.',
        });
        navigate('/beneficiario/login');
      } finally {
        setLoading(false);
      }
    };

    fetchPerfil();
  }, [beneficiarioId, navigate]);

  const validateForm = () => {
    const newErrors = {};

    // Validaciones requeridas
    if (!formData.genero) newErrors.genero = 'Campo requerido';
    if (!formData.telefono) newErrors.telefono = 'Campo requerido';
    if (!formData.nombre_universidad) newErrors.nombre_universidad = 'Campo requerido';
    if (!formData.programa_academico) newErrors.programa_academico = 'Campo requerido';
    if (!formData.nombre_banco) newErrors.nombre_banco = 'Campo requerido';
    if (!formData.numero_cuenta) newErrors.numero_cuenta = 'Campo requerido';

    // Validar formato de teléfono (10 dígitos en Colombia)
    if (formData.telefono && !/^\d{10}$/.test(formData.telefono.replace(/\D/g, ''))) {
      newErrors.telefono = 'Teléfono inválido (10 dígitos)';
    }

    // Validar cuenta bancaria (números)
    if (formData.numero_cuenta && !/^\d+$/.test(formData.numero_cuenta.replace(/\s/g, ''))) {
      newErrors.numero_cuenta = 'Solo se permiten números';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpiar error al empezar a escribir
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      await showErrorAlert({
        title: 'Validación fallida',
        text: 'Por favor completa todos los campos requeridos correctamente.',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('portal_beneficiarios')
        .update({
          ...formData,
          perfil_completado_en: new Date().toISOString(),
        })
        .eq('id', beneficiarioId);

      if (error) throw error;

      await showSuccessAlert({
        title: '¡Perfil completado!',
        text: 'Tu información ha sido guardada exitosamente.',
      });

      if (onComplete) onComplete();
      navigate('/beneficiario');
    } catch (error) {
      console.error('Error guardando perfil:', error);
      await showErrorAlert({
        title: 'Error al guardar',
        text: 'No se pudo guardar tu información. Intenta más tarde.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F7FA' }}>
        <div className="w-10 h-10 border-4 border-slate-200 rounded-full animate-spin" style={{ borderTopColor: '#1A5A96' }} />
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#F5F7FA' }} className="min-h-screen py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
            style={{ background: '#0D2C54' }}
          >
            <User size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-primary mb-2">Completa tu perfil</h1>
          <p className="text-slate-600">
            Para acceder al portal, necesitamos validar tu información académica y bancaria.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-lg overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            {[
              { id: 'personal', label: '👤 Personal', icon: User },
              { id: 'academica', label: '📚 Académica', icon: BookOpen },
              { id: 'bancaria', label: '💳 Bancaria', icon: DollarSign },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-4 px-6 font-semibold text-sm transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'text-primary border-b-2'
                    : 'text-slate-500 border-b-2 border-transparent hover:text-primary'
                }`}
                style={{
                  borderBottomColor: activeTab === tab.id ? '#0D2C54' : 'transparent',
                  color: activeTab === tab.id ? '#0D2C54' : undefined,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-8 space-y-6">
            {/* TAB: Personal */}
            {activeTab === 'personal' && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Género */}
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      Género <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.genero}
                      onChange={e => handleChange('genero', e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border transition-colors ${
                        errors.genero
                          ? 'border-red-300 focus:ring-red-200'
                          : 'border-slate-200 focus:ring-blue-200'
                      } focus:outline-none focus:ring-2`}
                    >
                      <option value="">Selecciona...</option>
                      <option value="MASCULINO">Masculino</option>
                      <option value="FEMENINO">Femenino</option>
                      <option value="OTRO">Otro</option>
                    </select>
                    {errors.genero && (
                      <p className="text-red-500 text-xs mt-1">{errors.genero}</p>
                    )}
                  </div>

                  {/* Teléfono */}
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      Teléfono <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={formData.telefono}
                      onChange={e => handleChange('telefono', e.target.value)}
                      placeholder="3001234567"
                      className={`w-full px-4 py-3 rounded-xl border transition-colors ${
                        errors.telefono
                          ? 'border-red-300 focus:ring-red-200'
                          : 'border-slate-200 focus:ring-blue-200'
                      } focus:outline-none focus:ring-2`}
                    />
                    {errors.telefono && (
                      <p className="text-red-500 text-xs mt-1">{errors.telefono}</p>
                    )}
                  </div>
                </div>

                <div
                  className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
                  style={{ background: 'rgba(26,90,150,0.08)', border: '1px solid rgba(26,90,150,0.15)' }}
                >
                  <AlertCircle size={14} className="mt-0.5 shrink-0" style={{ color: '#1A5A96' }} />
                  <p style={{ color: 'rgba(26,90,150,0.75)' }}>
                    Esta información será usada para contactarte respecto a tu beneficio.
                  </p>
                </div>
              </div>
            )}

            {/* TAB: Académica */}
            {activeTab === 'academica' && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Colegio */}
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      Institución educativa de procedencia
                    </label>
                    <input
                      type="text"
                      value={formData.nombre_colegio}
                      onChange={e => handleChange('nombre_colegio', e.target.value)}
                      placeholder="Ej: I.E. Santa María"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>

                  {/* Universidad */}
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      Universidad <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.nombre_universidad}
                      onChange={e => handleChange('nombre_universidad', e.target.value)}
                      placeholder="Ej: Universidad de Antioquia"
                      className={`w-full px-4 py-3 rounded-xl border transition-colors ${
                        errors.nombre_universidad
                          ? 'border-red-300 focus:ring-red-200'
                          : 'border-slate-200 focus:ring-blue-200'
                      } focus:outline-none focus:ring-2`}
                    />
                    {errors.nombre_universidad && (
                      <p className="text-red-500 text-xs mt-1">{errors.nombre_universidad}</p>
                    )}
                  </div>

                  {/* Programa */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-primary mb-2">
                      Programa académico <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.programa_academico}
                      onChange={e => handleChange('programa_academico', e.target.value)}
                      placeholder="Ej: Ingeniería de Sistemas"
                      className={`w-full px-4 py-3 rounded-xl border transition-colors ${
                        errors.programa_academico
                          ? 'border-red-300 focus:ring-red-200'
                          : 'border-slate-200 focus:ring-blue-200'
                      } focus:outline-none focus:ring-2`}
                    />
                    {errors.programa_academico && (
                      <p className="text-red-500 text-xs mt-1">{errors.programa_academico}</p>
                    )}
                  </div>

                  {/* Tipo Educación */}
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      Tipo de educación
                    </label>
                    <select
                      value={formData.tipo_educacion}
                      onChange={e => handleChange('tipo_educacion', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="PROFESIONAL">Profesional</option>
                      <option value="TECNOLOGICO">Tecnológico</option>
                      <option value="TECNICO">Técnico</option>
                    </select>
                  </div>

                  {/* Modalidad */}
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      Modalidad de beca
                    </label>
                    <input
                      type="text"
                      value={formData.modalidad_beca}
                      onChange={e => handleChange('modalidad_beca', e.target.value)}
                      placeholder="Ej: MÉRITO, SUEÑOS"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>

                  {/* Año Convocatoria */}
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      Año convocatoria
                    </label>
                    <input
                      type="number"
                      value={formData.año_convocatoria}
                      onChange={e => handleChange('año_convocatoria', parseInt(e.target.value))}
                      min="2015"
                      max={new Date().getFullYear() + 1}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Bancaria */}
            {activeTab === 'bancaria' && (
              <div className="space-y-6">
                <div
                  className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
                  style={{ background: 'rgba(249,160,63,0.10)', border: '1px solid rgba(249,160,63,0.20)' }}
                >
                  <AlertCircle size={14} className="mt-0.5 shrink-0" style={{ color: '#F9A03F' }} />
                  <p style={{ color: 'rgba(249,160,63,0.8)' }}>
                    Esta información es para el depósito del beneficio. Asegúrate de que los datos sean correctos.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Banco */}
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      Banco <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.nombre_banco}
                      onChange={e => handleChange('nombre_banco', e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border transition-colors ${
                        errors.nombre_banco
                          ? 'border-red-300 focus:ring-red-200'
                          : 'border-slate-200 focus:ring-blue-200'
                      } focus:outline-none focus:ring-2`}
                    >
                      <option value="">Selecciona banco...</option>
                      <option value="BANCOLOMBIA">Bancolombia</option>
                      <option value="BANCO DE BOGOTÁ">Banco de Bogotá</option>
                      <option value="DAVIVIENDA">Davivienda</option>
                      <option value="BANCO BBVA">BANCO BBVA</option>
                      <option value="BANCO FALABELLA">Banco Falabella</option>
                      <option value="BANCO POPULAR">Banco Popular</option>
                      <option value="BANCO AGRARIO">Banco Agrario</option>
                      <option value="ITAÚ">Itaú</option>
                      <option value="SCOTIABANK">Scotiabank</option>
                      <option value="NEQUI">Nequi</option>
                      <option value="OTRO">Otro</option>
                    </select>
                    {errors.nombre_banco && (
                      <p className="text-red-500 text-xs mt-1">{errors.nombre_banco}</p>
                    )}
                  </div>

                  {/* Tipo Cuenta */}
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">
                      Tipo de cuenta
                    </label>
                    <select
                      value={formData.tipo_cuenta_bancaria}
                      onChange={e => handleChange('tipo_cuenta_bancaria', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="AHORROS">Ahorros</option>
                      <option value="CORRIENTE">Corriente</option>
                    </select>
                  </div>

                  {/* Número Cuenta */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-primary mb-2">
                      Número de cuenta <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.numero_cuenta}
                      onChange={e => handleChange('numero_cuenta', e.target.value.replace(/\D/g, ''))}
                      placeholder="Ej: 12345678901234567890"
                      className={`w-full px-4 py-3 rounded-xl border transition-colors font-mono text-sm ${
                        errors.numero_cuenta
                          ? 'border-red-300 focus:ring-red-200'
                          : 'border-slate-200 focus:ring-blue-200'
                      } focus:outline-none focus:ring-2`}
                    />
                    {errors.numero_cuenta && (
                      <p className="text-red-500 text-xs mt-1">{errors.numero_cuenta}</p>
                    )}
                    <p className="text-slate-500 text-xs mt-1">
                      {formData.numero_cuenta.length} dígitos
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer con botones */}
          <div className="px-8 py-6 bg-slate-50 border-t border-slate-200 flex gap-4">
            <button
              onClick={() => navigate('/beneficiario/login')}
              className="flex-1 px-6 py-3 rounded-xl border border-slate-300 font-semibold text-primary hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-6 py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
              style={{ background: '#0D2C54' }}
            >
              {saving ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CheckCircle size={18} />
                  Guardar y continuar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
