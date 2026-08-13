import { useState, useEffect } from 'react';
import {
  Mail,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Send,
  Eye,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showErrorAlert, showSuccessAlert } from '../lib/alerts';

/**
 * Componente: Monitor de Activación de Beneficiarios
 * 
 * Muestra:
 * - Estado de generación de tokens
 * - Progreso de activaciones
 * - Email logs
 * - Estadísticas de completitud
 * - Acciones para reenvío de emails
 */

export default function AdminBeneficiarioActivacionMonitor() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    tokenGenerado: 0,
    setupCompleto: 0,
    perfilCompleto: 0,
    conProblemas: 0,
    ultimoRefresh: null,
  });
  const [emailLogs, setEmailLogs] = useState([]);
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [filtro, setFiltro] = useState('all'); // all, pendiente, activo, completado

  // Cargar estadísticas
  const loadStats = async () => {
    setLoading(true);
    try {
      // Total de beneficiarios
      const { data: all, error: allError } = await supabase
        .from('portal_beneficiarios')
        .select('id', { count: 'exact' });

      if (allError) throw allError;

      // Con token generado
      const { data: tokenGen } = await supabase
        .from('portal_auth_credentials')
        .select('beneficiario_id', { count: 'exact' })
        .not('setup_token', 'is', null);

      // Setup completado
      const { data: setupDone } = await supabase
        .from('portal_auth_credentials')
        .select('beneficiario_id', { count: 'exact' })
        .not('setup_completed_at', 'is', null);

      // Perfil completado
      const { data: perfilDone } = await supabase
        .from('portal_beneficiarios')
        .select('id', { count: 'exact' })
        .not('perfil_completado_en', 'is', null);

      // Con problemas (lockout)
      const { data: problems } = await supabase
        .from('portal_auth_credentials')
        .select('beneficiario_id', { count: 'exact' })
        .not('locked_until', 'is', null)
        .gt('locked_until', new Date().toISOString());

      setStats({
        total: all?.length || 0,
        tokenGenerado: tokenGen?.length || 0,
        setupCompleto: setupDone?.length || 0,
        perfilCompleto: perfilDone?.length || 0,
        conProblemas: problems?.length || 0,
        ultimoRefresh: new Date(),
      });

      // Cargar logs recientes
      const { data: logs } = await supabase
        .from('portal_beneficiarios_email_log')
        .select('*, portal_beneficiarios(nombre_completo, email)')
        .order('created_at', { ascending: false })
        .limit(20);

      setEmailLogs(logs || []);
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
      await showErrorAlert({
        title: 'Error',
        text: 'No se pudieron cargar las estadísticas',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    // Refresh cada 30 segundos
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Reenviar email
  const handleResendEmail = async () => {
    if (!resendEmail) {
      await showErrorAlert({
        title: 'Email requerido',
        text: 'Ingresa el correo del beneficiario',
      });
      return;
    }

    setResendLoading(true);
    try {
      const result = await supabase.functions.invoke('send-setup-emails', {
        body: {
          method: 'resend-email',
          email: resendEmail,
        },
      });

      if (result.data?.ok) {
        await showSuccessAlert({
          title: '✅ Email reenviado',
          text: 'Se ha enviado el link de activación nuevamente',
        });
        setResendEmail('');
        setTimeout(loadStats, 1000);
      } else {
        await showErrorAlert({
          title: 'Error',
          text: result.data?.error || 'No se pudo reenviar el email',
        });
      }
    } catch (error) {
      await showErrorAlert({
        title: 'Error',
        text: error.message,
      });
    } finally {
      setResendLoading(false);
    }
  };

  // Calcular porcentajes
  const porcentajeSetup = stats.total > 0 ? Math.round((stats.setupCompleto / stats.total) * 100) : 0;
  const porcentajePerfil = stats.total > 0 ? Math.round((stats.perfilCompleto / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-primary">
            📊 Monitor de Activación
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Seguimiento en tiempo real del setup de beneficiarios
          </p>
        </div>
        <button
          onClick={loadStats}
          disabled={loading}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Estadísticas principales */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Total */}
        <div className="bg-white rounded-xl p-4 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-600 uppercase">Total</p>
            <TrendingUp size={16} className="text-primary" />
          </div>
          <p className="text-3xl font-bold text-primary">{stats.total}</p>
          <p className="text-xs text-slate-500 mt-1">Beneficiarios</p>
        </div>

        {/* Token Generado */}
        <div className="bg-white rounded-xl p-4 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-600 uppercase">Token</p>
            <Mail size={16} className="text-amber-500" />
          </div>
          <p className="text-3xl font-bold text-amber-600">{stats.tokenGenerado}</p>
          <p className="text-xs text-slate-500 mt-1">
            {stats.total > 0 && `${Math.round((stats.tokenGenerado / stats.total) * 100)}%`}
          </p>
        </div>

        {/* Setup Completado */}
        <div className="bg-white rounded-xl p-4 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-600 uppercase">Setup</p>
            <Clock size={16} className="text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-blue-600">{stats.setupCompleto}</p>
          <div className="text-xs text-slate-500 mt-1 space-y-1">
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${porcentajeSetup}%` }}
              />
            </div>
            {porcentajeSetup}%
          </div>
        </div>

        {/* Perfil Completado */}
        <div className="bg-white rounded-xl p-4 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-600 uppercase">Perfil</p>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <p className="text-3xl font-bold text-emerald-600">{stats.perfilCompleto}</p>
          <div className="text-xs text-slate-500 mt-1 space-y-1">
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${porcentajePerfil}%` }}
              />
            </div>
            {porcentajePerfil}%
          </div>
        </div>

        {/* Con Problemas */}
        <div className="bg-white rounded-xl p-4 border border-red-200 shadow-sm bg-red-50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-red-600 uppercase">Problemas</p>
            <AlertCircle size={16} className="text-red-500" />
          </div>
          <p className="text-3xl font-bold text-red-600">{stats.conProblemas}</p>
          <p className="text-xs text-red-600 mt-1">Cuentas bloqueadas</p>
        </div>
      </div>

      {/* Embudo de activación */}
      <div className="bg-white rounded-xl p-6 border border-border shadow-sm">
        <h3 className="font-bold text-primary mb-4">🔄 Embudo de Activación</h3>
        <div className="space-y-3">
          {[
            { label: 'Total de beneficiarios', value: stats.total, color: 'bg-slate-200' },
            { label: '↓ Con token generado', value: stats.tokenGenerado, color: 'bg-amber-200' },
            { label: '↓ Setup completado', value: stats.setupCompleto, color: 'bg-blue-200' },
            { label: '↓ Perfil completo', value: stats.perfilCompleto, color: 'bg-emerald-200' },
          ].map((step, idx) => (
            <div key={idx} className="flex items-center gap-4">
              <div className="w-32 text-sm font-semibold text-slate-600">{step.label}</div>
              <div className="flex-1 flex items-center gap-3">
                <div className="h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white" style={{
                  width: `${stats.total > 0 ? (step.value / stats.total) * 100 : 0}%`,
                  minWidth: '60px',
                  background: step.color.replace('bg-', '').replace('-200', '-500'),
                }}>
                  {step.value}
                </div>
                <div className="text-xs text-slate-600">
                  {stats.total > 0 ? Math.round((step.value / stats.total) * 100) : 0}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reenvío de email */}
      <div className="bg-white rounded-xl p-6 border border-border shadow-sm">
        <h3 className="font-bold text-primary mb-4 flex items-center gap-2">
          <Send size={18} />
          Reenviar Email de Activación
        </h3>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="correo@beneficiario.com"
            value={resendEmail}
            onChange={e => setResendEmail(e.target.value)}
            className="flex-1 px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
            disabled={resendLoading}
          />
          <button
            onClick={handleResendEmail}
            disabled={resendLoading || !resendEmail}
            className="px-6 py-2 bg-secondary text-white rounded-lg font-semibold hover:bg-secondary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {resendLoading ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send size={16} />
                Enviar
              </>
            )}
          </button>
        </div>
      </div>

      {/* Email Logs */}
      <div className="bg-white rounded-xl p-6 border border-border shadow-sm">
        <h3 className="font-bold text-primary mb-4 flex items-center gap-2">
          <Mail size={18} />
          Logs de Email (Últimos 20)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-border">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">Beneficiario</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">Correo</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">Tipo</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">Estado</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">Enviado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {emailLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-4 text-center text-slate-500">
                    No hay registros de email
                  </td>
                </tr>
              ) : (
                emailLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-primary">
                        {log.portal_beneficiarios?.nombre_completo}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {log.recipient_email}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                        {log.email_type.replace('-', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {log.status === 'sent' && (
                          <>
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-emerald-700 font-semibold">Enviado</span>
                          </>
                        )}
                        {log.status === 'failed' && (
                          <>
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <span className="text-red-700 font-semibold">Error</span>
                          </>
                        )}
                        {log.status === 'bounced' && (
                          <>
                            <div className="w-2 h-2 rounded-full bg-orange-500" />
                            <span className="text-orange-700 font-semibold">Rebotado</span>
                          </>
                        )}
                        {log.status === 'queued' && (
                          <>
                            <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                            <span className="text-yellow-700 font-semibold">Pendiente</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {log.sent_at ? new Date(log.sent_at).toLocaleString('es-CO') : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-900">
          <strong>ℹ️ Nota:</strong> Las estadísticas se actualizan automáticamente cada 30 segundos.
          Los setup tokens expiran en 24 horas. Haz clic en "Reenviar Email" para beneficiarios que no recibieron el link.
        </p>
      </div>
    </div>
  );
}
