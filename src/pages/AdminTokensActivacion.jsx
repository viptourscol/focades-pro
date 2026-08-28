import { useState, useEffect } from 'react';
import { RefreshCw, Send, Copy, Check, AlertCircle, Clock, CheckCircle2, XCircle, Search, Mail, MailX, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showSuccessAlert, showErrorAlert, showConfirmAlert } from '../lib/alerts';

const ADMIN_API_KEY = 'focades-admin-2026'; // En producción, mover a variable de entorno

export default function AdminTokensActivacion() {
  const [beneficiarios, setBeneficiarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados para reenvío masivo
  const [showPendingEmails, setShowPendingEmails] = useState(false);
  const [pendingEmails, setPendingEmails] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sendingEmails, setSendingEmails] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });

  // Estados para reenvío masivo de tokens vencidos
  const [showExpiredTokens, setShowExpiredTokens] = useState(false);
  const [expiredTokens, setExpiredTokens] = useState([]);
  const [loadingExpired, setLoadingExpired] = useState(false);
  const [selectedExpiredIds, setSelectedExpiredIds] = useState(new Set());
  const [resendingExpired, setResendingExpired] = useState(false);
  const [resendProgress, setResendProgress] = useState({ current: 0, total: 0 });
  const [resendResults, setResendResults] = useState(null);

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
      const emailSent = data.email_sent;
      await navigator.clipboard.writeText(activationLink);

      await showSuccessAlert({
        title: emailSent ? 'Token y Email Enviados' : 'Token Generado',
        html: `
          <div class="text-left">
            <p class="mb-3">Token generado exitosamente para <strong>${beneficiario.nombre_completo}</strong></p>
            ${emailSent 
              ? `<div class="bg-green-50 p-3 rounded-lg border border-green-200 mb-3">
                   <p class="text-sm text-green-700"><strong>Email enviado a:</strong> ${beneficiario.email}</p>
                   <p class="text-xs text-green-600 mt-1">El beneficiario recibirá el link de activación en su correo</p>
                 </div>`
              : `<div class="bg-orange-50 p-3 rounded-lg border border-orange-200 mb-3">
                   <p class="text-sm text-orange-700"><strong>Email no enviado</strong></p>
                   <p class="text-xs text-orange-600 mt-1">${data.email_error || 'Error al enviar email'}</p>
                   <p class="text-xs text-slate-600 mt-2">Comparte el link manualmente:</p>
                 </div>`
            }
            <div class="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-3">
              <p class="text-xs text-slate-600 mb-1">Link de activación:</p>
              <p class="text-sm font-mono break-all text-primary">${activationLink}</p>
            </div>
            <p class="text-sm text-green-600">Link copiado al portapapeles</p>
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

  const loadPendingEmails = async () => {
    setLoadingPending(true);
    try {
      // Obtener beneficiarios con tokens válidos
      const { data: credentials, error: credsError } = await supabase
        .from('portal_auth_credentials')
        .select(`
          beneficiario_id,
          setup_token,
          setup_token_expires_at,
          setup_completed_at,
          portal_beneficiarios (
            id,
            nombre_completo,
            email,
            n_documento
          )
        `)
        .not('setup_token', 'is', null)
        .gt('setup_token_expires_at', new Date().toISOString())
        .is('setup_completed_at', null);

      if (credsError) throw credsError;

      const validBeneficiarios = credentials
        .filter(c => c.portal_beneficiarios)
        .map(c => ({
          id: c.beneficiario_id,
          ...c.portal_beneficiarios,
          token_expires_at: c.setup_token_expires_at,
        }));

      if (validBeneficiarios.length === 0) {
        setPendingEmails([]);
        return;
      }

      // Obtener logs de emails enviados
      const { data: emailLogs, error: logsError } = await supabase
        .from('portal_beneficiarios_email_log')
        .select('beneficiario_id, status, sent_at')
        .in('beneficiario_id', validBeneficiarios.map(b => b.id))
        .eq('email_type', 'setup-activation')
        .order('sent_at', { ascending: false });

      if (logsError) {
        console.warn('Error obteniendo logs:', logsError);
      }

      // Crear mapa de últimos estados de email
      const emailStatusMap = new Map();
      if (emailLogs) {
        emailLogs.forEach(log => {
          if (!emailStatusMap.has(log.beneficiario_id)) {
            emailStatusMap.set(log.beneficiario_id, {
              status: log.status,
              sent_at: log.sent_at,
            });
          }
        });
      }

      // Filtrar solo los que NO tienen email enviado exitosamente
      const pending = validBeneficiarios
        .map(b => ({
          ...b,
          email_status: emailStatusMap.get(b.id)?.status || 'pendiente',
          last_attempt: emailStatusMap.get(b.id)?.sent_at || null,
        }))
        .filter(b => b.email_status !== 'sent');

      setPendingEmails(pending);
    } catch (error) {
      console.error('Error cargando emails pendientes:', error);
      showErrorAlert({ title: 'Error', text: 'No se pudieron cargar los emails pendientes' });
    } finally {
      setLoadingPending(false);
    }
  };

  const handleToggleSelection = (id) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === pendingEmails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingEmails.map(b => b.id)));
    }
  };

  const handleSendPendingEmails = async () => {
    if (selectedIds.size === 0) {
      showErrorAlert({ title: 'Sin Selección', text: 'Selecciona al menos un beneficiario' });
      return;
    }

    const confirmed = await showConfirmAlert({
      title: '¿Enviar Emails de Activación?',
      text: `Se enviarán ${selectedIds.size} emails de activación. Este proceso puede tomar varios minutos.`,
      confirmButtonText: 'Sí, Enviar',
      cancelButtonText: 'Cancelar',
    });

    if (!confirmed) return;

    setSendingEmails(true);
    setSendProgress({ current: 0, total: selectedIds.size });

    const results = {
      sent: 0,
      failed: 0,
      errors: [],
    };

    let current = 0;
    for (const beneficiarioId of selectedIds) {
      current++;
      setSendProgress({ current, total: selectedIds.size });

      try {
        const { data, error } = await supabase.functions.invoke('send-setup-emails', {
          body: {
            method: 'send-setup-email',
            beneficiario_id: beneficiarioId,
          },
        });

        if (error || !data?.ok) {
          results.failed++;
          const beneficiario = pendingEmails.find(b => b.id === beneficiarioId);
          results.errors.push({
            nombre: beneficiario?.nombre_completo || 'Desconocido',
            email: beneficiario?.email || 'N/A',
            error: data?.error || error?.message || 'Error desconocido',
          });
        } else {
          results.sent++;
        }

        // Delay de 200ms entre emails
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        results.failed++;
        const beneficiario = pendingEmails.find(b => b.id === beneficiarioId);
        results.errors.push({
          nombre: beneficiario?.nombre_completo || 'Desconocido',
          email: beneficiario?.email || 'N/A',
          error: err.message || 'Error desconocido',
        });
      }
    }

    setSendingEmails(false);
    setSelectedIds(new Set());

    // Mostrar resultado
    const errorsList = results.errors.length > 0
      ? `<div class="mt-3 max-h-40 overflow-y-auto bg-red-50 p-3 rounded-lg border border-red-200">
           <p class="text-sm font-semibold text-red-800 mb-2">Errores:</p>
           <ul class="text-xs text-red-700 space-y-1">
             ${results.errors.map(e => `<li><strong>${e.nombre}:</strong> ${e.error}</li>`).join('')}
           </ul>
         </div>`
      : '';

    await showSuccessAlert({
      title: 'Envío Completado',
      html: `
        <div class="text-left">
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="bg-green-50 p-3 rounded-lg border border-green-200">
              <p class="text-xs text-green-600 mb-1">Enviados</p>
              <p class="text-2xl font-bold text-green-700">${results.sent}</p>
            </div>
            <div class="bg-red-50 p-3 rounded-lg border border-red-200">
              <p class="text-xs text-red-600 mb-1">Fallidos</p>
              <p class="text-2xl font-bold text-red-700">${results.failed}</p>
            </div>
          </div>
          ${errorsList}
        </div>
      `,
    });

    // Recargar lista
    await loadPendingEmails();
  };

  const handleShowPendingEmails = async () => {
    setShowPendingEmails(true);
    await loadPendingEmails();
  };

  const loadExpiredTokens = async () => {
    setLoadingExpired(true);
    setResendResults(null);
    try {
      const { data: credentials, error: credsError } = await supabase
        .from('portal_auth_credentials')
        .select(`
          beneficiario_id,
          setup_token_expires_at,
          setup_completed_at,
          portal_beneficiarios (
            id,
            nombre_completo,
            email,
            n_documento
          )
        `)
        .not('setup_token', 'is', null)
        .lt('setup_token_expires_at', new Date().toISOString())
        .is('setup_completed_at', null);

      if (credsError) throw credsError;

      const expired = (credentials || [])
        .filter((c) => c.portal_beneficiarios)
        .map((c) => ({
          id: c.beneficiario_id,
          ...c.portal_beneficiarios,
          token_expired_at: c.setup_token_expires_at,
        }));

      setExpiredTokens(expired);
      setSelectedExpiredIds(new Set(expired.map((b) => b.id)));
    } catch (error) {
      console.error('Error cargando tokens vencidos:', error);
      showErrorAlert({ title: 'Error', text: 'No se pudieron cargar los tokens vencidos' });
    } finally {
      setLoadingExpired(false);
    }
  };

  const handleShowExpiredTokens = async () => {
    setShowExpiredTokens(true);
    await loadExpiredTokens();
  };

  const handleToggleExpiredSelection = (id) => {
    const next = new Set(selectedExpiredIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedExpiredIds(next);
  };

  const handleSelectAllExpired = () => {
    if (selectedExpiredIds.size === expiredTokens.length) {
      setSelectedExpiredIds(new Set());
    } else {
      setSelectedExpiredIds(new Set(expiredTokens.map((b) => b.id)));
    }
  };

  const handleResendExpiredTokens = async () => {
    if (selectedExpiredIds.size === 0) return;

    const confirmed = await showConfirmAlert({
      title: '¿Reenviar tokens vencidos?',
      text: `Se generará un nuevo token de activación y se enviará el correo a ${selectedExpiredIds.size} beneficiario${selectedExpiredIds.size > 1 ? 's' : ''}.`,
      confirmButtonText: 'Sí, reenviar',
      cancelButtonText: 'Cancelar',
    });
    if (!confirmed) return;

    setResendingExpired(true);
    setResendProgress({ current: 0, total: selectedExpiredIds.size });

    let exitosos = 0;
    let fallidos = 0;
    let current = 0;

    for (const beneficiarioId of selectedExpiredIds) {
      current += 1;
      setResendProgress({ current, total: selectedExpiredIds.size });

      try {
        const { data, error } = await supabase.functions.invoke('auth-credentials', {
          body: {
            method: 'admin-resend-token',
            beneficiario_id: beneficiarioId,
            admin_api_key: ADMIN_API_KEY,
          },
        });

        if (error || !data?.ok) throw new Error(data?.error || error?.message || 'Error desconocido');
        exitosos += 1;
      } catch (error) {
        console.error(`Error reenviando token para beneficiario ${beneficiarioId}:`, error);
        fallidos += 1;
      }
    }

    setResendingExpired(false);
    setResendResults({ exitosos, fallidos, total: selectedExpiredIds.size });
    setSelectedExpiredIds(new Set());
    await loadExpiredTokens();
    await loadBeneficiarios();
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

  // Filtrar beneficiarios por término de búsqueda
  const beneficiariosFiltrados = beneficiarios.filter(b => {
    if (!searchTerm.trim()) return true;
    const termino = searchTerm.toLowerCase();
    return (
      b.nombre_completo?.toLowerCase().includes(termino) ||
      b.email?.toLowerCase().includes(termino) ||
      b.n_documento?.toString().toLowerCase().includes(termino)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Tokens de Activación</h1>
          <p className="text-slate-600 mt-1">Gestiona los tokens de acceso para beneficiarios históricos</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleShowExpiredTokens}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-semibold"
          >
            <AlertCircle size={18} />
            Reenviar Tokens Vencidos
          </button>
          <button
            onClick={handleShowPendingEmails}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-semibold"
          >
            <Mail size={18} />
            Emails Pendientes
          </button>
          <button
            onClick={loadBeneficiarios}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={18} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Modal de Tokens Vencidos */}
      {showExpiredTokens && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-primary">Reenviar Tokens Vencidos</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Se generará un token nuevo y se enviará el correo de activación a cada beneficiario seleccionado
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowExpiredTokens(false);
                    setSelectedExpiredIds(new Set());
                    setResendResults(null);
                  }}
                  disabled={resendingExpired}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle size={28} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingExpired ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Loader2 className="animate-spin mx-auto mb-4 text-primary" size={32} />
                    <p className="text-slate-600">Buscando tokens vencidos...</p>
                  </div>
                </div>
              ) : resendResults ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="mx-auto mb-4 text-green-500" size={48} />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Reenvío completado</h3>
                  <p className="text-slate-600">
                    {resendResults.exitosos} de {resendResults.total} tokens reenviados correctamente.
                    {resendResults.fallidos > 0 && (
                      <span className="block text-red-600 mt-1">{resendResults.fallidos} fallaron, revisa el listado nuevamente.</span>
                    )}
                  </p>
                </div>
              ) : expiredTokens.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="mx-auto mb-4 text-green-500" size={48} />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">¡Todo al día!</h3>
                  <p className="text-slate-600">
                    No hay beneficiarios con tokens vencidos pendientes de activar.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedExpiredIds.size === expiredTokens.length && expiredTokens.length > 0}
                        onChange={handleSelectAllExpired}
                        className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      <span className="text-sm font-semibold text-slate-700">
                        {selectedExpiredIds.size > 0
                          ? `${selectedExpiredIds.size} seleccionado${selectedExpiredIds.size > 1 ? 's' : ''}`
                          : 'Seleccionar todos'}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600">
                      Total: {expiredTokens.length} token{expiredTokens.length !== 1 ? 's' : ''} vencido{expiredTokens.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {expiredTokens.map((beneficiario) => (
                      <div
                        key={beneficiario.id}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          selectedExpiredIds.has(beneficiario.id)
                            ? 'border-primary bg-primary/5'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                        onClick={() => !resendingExpired && handleToggleExpiredSelection(beneficiario.id)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedExpiredIds.has(beneficiario.id)}
                          onChange={() => {}}
                          disabled={resendingExpired}
                          className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <div className="flex-1">
                          <div className="font-semibold text-slate-900">{beneficiario.nombre_completo}</div>
                          <div className="text-sm text-slate-600 mt-1">{beneficiario.email}</div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-orange-100 text-orange-700">
                              <AlertCircle size={12} />
                              Vencido {new Date(beneficiario.token_expired_at).toLocaleString('es-CO')}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {expiredTokens.length > 0 && !resendResults && (
              <div className="p-6 border-t border-slate-200 bg-slate-50">
                {resendingExpired ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm text-slate-700">
                      <span>Reenviando tokens...</span>
                      <span className="font-semibold">{resendProgress.current} / {resendProgress.total}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-orange-500 h-full transition-all duration-300 rounded-full"
                        style={{ width: `${(resendProgress.current / resendProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-600">
                      {selectedExpiredIds.size > 0
                        ? `${selectedExpiredIds.size} beneficiario${selectedExpiredIds.size > 1 ? 's' : ''} seleccionado${selectedExpiredIds.size > 1 ? 's' : ''}`
                        : 'Selecciona beneficiarios para reenviar'}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowExpiredTokens(false);
                          setSelectedExpiredIds(new Set());
                        }}
                        className="px-5 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors font-semibold"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleResendExpiredTokens}
                        disabled={selectedExpiredIds.size === 0}
                        className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send size={18} />
                        Reenviar {selectedExpiredIds.size > 0 ? `(${selectedExpiredIds.size})` : ''}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Emails Pendientes */}
      {showPendingEmails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header del Modal */}
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-primary">Reenviar Emails de Activación</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Beneficiarios con tokens válidos pero sin email enviado
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowPendingEmails(false);
                    setSelectedIds(new Set());
                  }}
                  disabled={sendingEmails}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle size={28} />
                </button>
              </div>
            </div>

            {/* Contenido del Modal */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingPending ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Loader2 className="animate-spin mx-auto mb-4 text-primary" size={32} />
                    <p className="text-slate-600">Cargando emails pendientes...</p>
                  </div>
                </div>
              ) : pendingEmails.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="mx-auto mb-4 text-green-500" size={48} />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">¡Todo al día!</h3>
                  <p className="text-slate-600">
                    No hay beneficiarios con emails pendientes. Todos los tokens con email enviado exitosamente.
                  </p>
                </div>
              ) : (
                <>
                  {/* Controles de selección */}
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === pendingEmails.length && pendingEmails.length > 0}
                        onChange={handleSelectAll}
                        className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      <span className="text-sm font-semibold text-slate-700">
                        {selectedIds.size > 0 
                          ? `${selectedIds.size} seleccionado${selectedIds.size > 1 ? 's' : ''}`
                          : 'Seleccionar todos'}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600">
                      Total: {pendingEmails.length} email{pendingEmails.length !== 1 ? 's' : ''} pendiente{pendingEmails.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Lista de beneficiarios */}
                  <div className="space-y-2">
                    {pendingEmails.map((beneficiario) => (
                      <div
                        key={beneficiario.id}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          selectedIds.has(beneficiario.id)
                            ? 'border-primary bg-primary/5'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                        onClick={() => !sendingEmails && handleToggleSelection(beneficiario.id)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(beneficiario.id)}
                          onChange={() => {}}
                          disabled={sendingEmails}
                          className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <div className="flex-1">
                          <div className="font-semibold text-slate-900">{beneficiario.nombre_completo}</div>
                          <div className="text-sm text-slate-600 mt-1">{beneficiario.email}</div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
                              beneficiario.email_status === 'failed'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {beneficiario.email_status === 'failed' ? (
                                <>
                                  <MailX size={12} />
                                  Email fallido
                                </>
                              ) : (
                                <>
                                  <Clock size={12} />
                                  Pendiente
                                </>
                              )}
                            </span>
                            {beneficiario.last_attempt && (
                              <span className="text-xs text-slate-500">
                                Último intento: {new Date(beneficiario.last_attempt).toLocaleString('es-CO')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Footer del Modal */}
            {pendingEmails.length > 0 && (
              <div className="p-6 border-t border-slate-200 bg-slate-50">
                {sendingEmails ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm text-slate-700">
                      <span>Enviando emails...</span>
                      <span className="font-semibold">{sendProgress.current} / {sendProgress.total}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all duration-300 rounded-full"
                        style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-600">
                      {selectedIds.size > 0
                        ? `${selectedIds.size} email${selectedIds.size > 1 ? 's' : ''} seleccionado${selectedIds.size > 1 ? 's' : ''}`
                        : 'Selecciona beneficiarios para enviar'}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowPendingEmails(false);
                          setSelectedIds(new Set());
                        }}
                        className="px-5 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors font-semibold"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSendPendingEmails}
                        disabled={selectedIds.size === 0}
                        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send size={18} />
                        Enviar {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Buscador */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nombre, email o documento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        {searchTerm && (
          <p className="text-sm text-slate-600 mt-2">
            Mostrando {beneficiariosFiltrados.length} de {beneficiarios.length} beneficiarios
          </p>
        )}
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
              {beneficiariosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center">
                    <p className="text-slate-500">
                      {searchTerm ? 'No se encontraron beneficiarios con ese criterio' : 'No hay beneficiarios'}
                    </p>
                  </td>
                </tr>
              ) : (
                beneficiariosFiltrados.map((beneficiario) => (
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
              ))
              )}
            </tbody>
          </table>
        </div>
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
