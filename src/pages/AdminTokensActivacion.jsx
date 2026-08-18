import { useState, useEffect } from 'react';
import { RefreshCw, Send, Copy, Check, AlertCircle, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showSuccessAlert, showErrorAlert, showConfirmAlert } from '../lib/alerts';

const ADMIN_API_KEY = 'focades-admin-2026'; // En producción, mover a variable de entorno

export default function AdminTokensActivacion() {
  const [beneficiarios, setBeneficiarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    loadBeneficiarios();
  }, []);

  const loadBeneficiarios = async () => {
    setLoading(true);
    try {
      // Obtener beneficiarios con su estado de autenticación
      const { data: beneficiarios, error: benefError } = await supabase
        .from('portal_beneficiarios')
        .select('id, nombre_completo, email, n_documento, created_at')
        .order('created_at', { ascending: false });

      if (benefError) throw benefError;

      // Obtener credenciales para verificar estado
      const { data: credentials, error: credError } = await supabase
        .from('portal_auth_credentials')
        .select('beneficiario_id, setup_token, setup_token_expires_at, setup_completed_at, password_hash');

      if (credError) throw credError;

      // Combinar datos
      const beneficiariosConEstado = beneficiarios.map(ben => {
        const cred = credentials?.find(c => c.beneficiario_id === ben.id);
        
        let estado = 'sin_activar';
        let detalleEstado = 'Sin token generado';
        let tokenValido = false;

        if (cred) {
          if (cred.setup_completed_at && cred.password_hash) {
            estado = 'activado';
            detalleEstado = 'Cuenta activada';
          } else if (cred.setup_token) {
            const expiresAt = new Date(cred.setup_token_expires_at);
            const now = new Date();
            
            if (expiresAt > now) {
              estado = 'token_activo';
              detalleEstado = `Token válido hasta ${expiresAt.toLocaleString('es-CO')}`;
              tokenValido = true;
            } else {
              estado = 'token_expirado';
              detalleEstado = `Token expiró el ${expiresAt.toLocaleString('es-CO')}`;
            }
          }
        }

        return {
          ...ben,
          estado,
          detalleEstado,
          tokenValido,
          credential: cred,
        };
      });

      setBeneficiarios(beneficiariosConEstado);
    } catch (error) {
      console.error('Error cargando beneficiarios:', error);
      showErrorAlert({ title: 'Error', text: 'No se pudieron cargar los beneficiarios' });
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateToken = async (beneficiario) => {
    if (beneficiario.estado === 'activado') {
      showErrorAlert({
        title: 'Ya Activado',
        text: 'Este beneficiario ya estableció su contraseña. No se puede regenerar el token.'
      });
      return;
    }

    const confirmed = await showConfirmAlert({
      title: '¿Regenerar Token?',
      text: `Se generará un nuevo token de activación para ${beneficiario.nombre_completo}. El token anterior quedará inválido.`,
      confirmButtonText: 'Sí, Regenerar',
      cancelButtonText: 'Cancelar',
    });

    if (!confirmed) return;

    setRegenerating(beneficiario.id);

    try {
      const { data, error } = await supabase.functions.invoke('auth-credentials', {
        body: {
          method: 'admin-resend-token',
          beneficiario_id: beneficiario.id,
          admin_api_key: ADMIN_API_KEY,
        },
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      // Copiar link al portapapeles automáticamente
      const activationLink = data.activation_link;
      await navigator.clipboard.writeText(activationLink);

      await showSuccessAlert({
        title: '¡Token Regenerado!',
        html: `
          <div class="text-left">
            <p class="mb-3">Token generado exitosamente para <strong>${beneficiario.nombre_completo}</strong></p>
            <div class="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-3">
              <p class="text-xs text-slate-600 mb-1">Link de activación:</p>
              <p class="text-sm font-mono break-all text-primary">${activationLink}</p>
            </div>
            <p class="text-sm text-green-600">✓ Link copiado al portapapeles</p>
            <p class="text-xs text-slate-500 mt-2">Válido por 24 horas</p>
          </div>
        `,
      });

      // Recargar lista
      loadBeneficiarios();
    } catch (error) {
      console.error('Error regenerando token:', error);
      showErrorAlert({ title: 'Error', text: error.message || 'No se pudo regenerar el token' });
    } finally {
      setRegenerating(null);
    }
  };

  const handleCopyEmail = async (beneficiario) => {
    try {
      await navigator.clipboard.writeText(beneficiario.email);
      setCopiedId(beneficiario.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Error copiando email:', error);
    }
  };

  const getEstadoBadge = (estado) => {
    switch (estado) {
      case 'activado':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
            <CheckCircle2 size={14} />
            Activado
          </span>
        );
      case 'token_activo':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
            <Clock size={14} />
            Token Válido
          </span>
        );
      case 'token_expirado':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
            <AlertCircle size={14} />
            Token Expirado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            <XCircle size={14} />
            Sin Activar
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="animate-spin mx-auto mb-4 text-primary" size={32} />
          <p className="text-slate-600">Cargando beneficiarios...</p>
        </div>
      </div>
    );
  }

  const sinActivar = beneficiarios.filter(b => b.estado === 'sin_activar').length;
  const tokenExpirado = beneficiarios.filter(b => b.estado === 'token_expirado').length;
  const tokenActivo = beneficiarios.filter(b => b.estado === 'token_activo').length;
  const activados = beneficiarios.filter(b => b.estado === 'activado').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Tokens de Activación</h1>
          <p className="text-slate-600 mt-1">Gestiona los tokens de acceso para beneficiarios históricos</p>
        </div>
        <button
          onClick={loadBeneficiarios}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={18} />
          Actualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Sin Activar</p>
              <p className="text-3xl font-bold text-slate-700 mt-1">{sinActivar}</p>
            </div>
            <XCircle className="text-slate-400" size={32} />
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Token Expirado</p>
              <p className="text-3xl font-bold text-orange-600 mt-1">{tokenExpirado}</p>
            </div>
            <AlertCircle className="text-orange-400" size={32} />
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Token Válido</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">{tokenActivo}</p>
            </div>
            <Clock className="text-blue-400" size={32} />
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Activados</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{activados}</p>
            </div>
            <CheckCircle2 className="text-green-400" size={32} />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Beneficiario
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Documento
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {beneficiarios.map((beneficiario) => (
                <tr key={beneficiario.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-slate-900">{beneficiario.nombre_completo}</div>
                    <div className="text-xs text-slate-500">{beneficiario.detalleEstado}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-900">{beneficiario.n_documento}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-900 truncate max-w-xs">{beneficiario.email}</span>
                      <button
                        onClick={() => handleCopyEmail(beneficiario)}
                        className="text-slate-400 hover:text-primary transition-colors"
                        title="Copiar email"
                      >
                        {copiedId === beneficiario.id ? (
                          <Check size={16} className="text-green-600" />
                        ) : (
                          <Copy size={16} />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getEstadoBadge(beneficiario.estado)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleRegenerateToken(beneficiario)}
                      disabled={regenerating === beneficiario.id || beneficiario.estado === 'activado'}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                        beneficiario.estado === 'activado'
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-primary text-white hover:bg-primary/90'
                      }`}
                      title={beneficiario.estado === 'activado' ? 'Cuenta ya activada' : 'Regenerar token de activación'}
                    >
                      {regenerating === beneficiario.id ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          Generando...
                        </>
                      ) : (
                        <>
                          <Send size={16} />
                          {beneficiario.estado === 'sin_activar' ? 'Generar Token' : 'Reenviar Token'}
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {beneficiarios.length === 0 && (
          <div className="text-center py-12">
            <AlertCircle className="mx-auto mb-4 text-slate-400" size={48} />
            <p className="text-slate-600">No hay beneficiarios registrados</p>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex gap-3">
          <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-2">Información importante:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Los tokens de activación son válidos por <strong>24 horas</strong></li>
              <li>Al regenerar un token, el anterior queda <strong>inmediatamente inválido</strong></li>
              <li>Una vez el beneficiario establece su contraseña, no se puede regenerar el token</li>
              <li>El link de activación se copia automáticamente al portapapeles para facilitar el envío</li>
              <li>Puedes enviar el link por WhatsApp, email o cualquier medio de comunicación</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
