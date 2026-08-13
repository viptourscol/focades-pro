import { useState, useEffect } from 'react'
import { Mail, Zap, CheckCircle, AlertCircle, Loader, RefreshCw, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Swal from 'sweetalert2'

/**
 * Admin Panel: Generar Setup Tokens y Enviar Emails
 * 
 * Permite a admins:
 * 1. Ver beneficiarios sin tokens configurados
 * 2. Generar tokens setup con un clic
 * 3. Enviar emails de activación automáticamente
 * 4. Monitorear progreso en tiempo real
 * 5. Ver logs de emails enviados
 */

export default function AdminTokenGeneratorPanel() {
  // Estado general
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({
    totalBeneficiarios: 0,
    conTokens: 0,
    sinTokens: 0,
  })
  
  // Parámetros de generación
  const [batchSize, setBatchSize] = useState(50)
  const [sendEmails, setSendEmails] = useState(true)
  const [includeExisting, setIncludeExisting] = useState(false)
  
  // Progreso
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 })
  const [generatedIds, setGeneratedIds] = useState([])
  
  // Logs
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)

  // Cargar estadísticas
  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 30000) // Actualizar cada 30s
    return () => clearInterval(interval)
  }, [])

  const loadStats = async () => {
    try {
      // Total beneficiarios
      const { count: total } = await supabase
        .from('portal_beneficiarios')
        .select('*', { count: 'exact', head: true })

      // Con tokens
      const { count: withTokens } = await supabase
        .from('portal_auth_credentials')
        .select('*', { count: 'exact', head: true })

      setStats({
        totalBeneficiarios: total || 0,
        conTokens: withTokens || 0,
        sinTokens: (total || 0) - (withTokens || 0),
      })
    } catch (error) {
      console.error('Error loading stats:', error)
    }
  }

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, { message, type, timestamp }])
  }

  const generateTokens = async () => {
    if (stats.sinTokens === 0 && !includeExisting) {
      Swal.fire({
        icon: 'info',
        title: 'No hay beneficiarios',
        text: 'No hay beneficiarios sin tokens. Marca "Incluir existentes" para regenerar.',
      })
      return
    }

    const shouldProceed = await Swal.fire({
      icon: 'warning',
      title: '¿Generar tokens?',
      html: `
        <div style="text-align: left;">
          <p><strong>Cantidad:</strong> hasta ${batchSize} beneficiarios</p>
          <p><strong>Enviar emails:</strong> ${sendEmails ? 'Sí ✅' : 'No'}</p>
          <p><strong>Incluir existentes:</strong> ${includeExisting ? 'Sí' : 'No'}</p>
          <hr>
          <p style="color: #666; font-size: 12px;">
            Los beneficiarios recibirán un email con link de activación (válido 24h)
          </p>
        </div>
      `,
      confirmButtonText: 'Generar',
      cancelButtonText: 'Cancelar',
      showCancelButton: true,
    })

    if (!shouldProceed.isConfirmed) return

    setGenerating(true)
    setLogs([])
    setGeneratedIds([])
    addLog(`🚀 Iniciando generación de tokens...`)

    try {
      // Obtener beneficiarios sin tokens (o todos si includeExisting)
      let query = supabase.from('portal_beneficiarios').select('id, nombre_completo, email')

      if (!includeExisting) {
        // Usar NOT IN para excluir los que ya tienen credenciales
        const { data: existingIds } = await supabase
          .from('portal_auth_credentials')
          .select('beneficiario_id')

        const existingIdList = existingIds?.map(r => r.beneficiario_id) || []
        if (existingIdList.length > 0) {
          query = query.not('id', 'in', `(${existingIdList.map(id => `'${id}'`).join(',')})`)
        }
      }

      const { data: beneficiarios, error } = await query.limit(batchSize)

      if (error) throw error
      if (!beneficiarios || beneficiarios.length === 0) {
        addLog('⚠️ No hay beneficiarios para procesar', 'warning')
        setGenerating(false)
        return
      }

      addLog(`📋 ${beneficiarios.length} beneficiarios encontrados`)
      setProgress({ current: 0, total: beneficiarios.length, percentage: 0 })

      let successCount = 0
      let errorCount = 0

      // Procesar cada beneficiario
      for (let i = 0; i < beneficiarios.length; i++) {
        const benef = beneficiarios[i]
        const index = i + 1

        try {
          // Generar token (32-byte hex)
          const setupToken = Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')

          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

          // Insertar o actualizar credentials
          const { error: insertError } = await supabase
            .from('portal_auth_credentials')
            .upsert({
              beneficiario_id: benef.id,
              setup_token: setupToken,
              setup_token_expires_at: expiresAt,
            })

          if (insertError) throw insertError

          addLog(`✅ [${index}/${beneficiarios.length}] Token generado: ${benef.nombre_completo}`)
          setGeneratedIds(prev => [...prev, benef.id])
          successCount++

          // Enviar email si está habilitado
          if (sendEmails) {
            try {
              const setupLink = `https://focades-pro.vercel.app/beneficiario/auth-setup?token=${setupToken}`

              // Invocar Edge Function
              const response = await supabase.functions.invoke('send-setup-emails', {
                body: {
                  method: 'send-setup-email',
                  beneficiario_id: benef.id,
                }
              })

              if (response.error) {
                addLog(`⚠️ Email fallido para ${benef.nombre_completo}: ${response.error.message}`, 'warning')
              } else {
                addLog(`📧 Email enviado: ${benef.email}`)
              }
            } catch (emailError) {
              addLog(`⚠️ Error enviando email: ${emailError.message}`, 'warning')
            }
          }

          // Actualizar progreso
          const newProgress = Math.round((index / beneficiarios.length) * 100)
          setProgress({ 
            current: index, 
            total: beneficiarios.length, 
            percentage: newProgress 
          })

          // Pequeño delay para evitar rate limits
          await new Promise(resolve => setTimeout(resolve, 100))

        } catch (error) {
          addLog(`❌ Error en ${benef.nombre_completo}: ${error.message}`, 'error')
          errorCount++
        }
      }

      // Resultado final
      addLog('')
      addLog(`🎉 COMPLETADO: ${successCount} exitosos, ${errorCount} errores`, 'success')
      
      // Actualizar estadísticas
      await loadStats()

      // Mostrar resumen
      Swal.fire({
        icon: 'success',
        title: '¡Generación Completada!',
        html: `
          <div style="text-align: left;">
            <p><strong>✅ Exitosos:</strong> ${successCount}</p>
            <p><strong>❌ Errores:</strong> ${errorCount}</p>
            <p><strong>📧 Emails:</strong> ${sendEmails ? 'Enviados' : 'No enviados'}</p>
            <hr>
            <p style="color: #666; font-size: 12px;">
              Ver logs abajo para más detalles
            </p>
          </div>
        `,
        confirmButtonText: 'OK',
      })

    } catch (error) {
      console.error('Error generating tokens:', error)
      addLog(`🔴 Error fatal: ${error.message}`, 'error')
      Swal.fire('Error', error.message, 'error')
    } finally {
      setGenerating(false)
    }
  }

  const resetLogs = () => {
    setLogs([])
    setGeneratedIds([])
    setProgress({ current: 0, total: 0, percentage: 0 })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-lg">
        <div className="flex items-center gap-3 mb-2">
          <Zap className="w-6 h-6" />
          <h2 className="text-2xl font-bold">Generador de Tokens de Setup</h2>
        </div>
        <p className="text-blue-100">Genera tokens de activación y envía emails automáticamente a beneficiarios</p>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-gray-600 text-sm font-medium mb-1">Total Beneficiarios</div>
          <div className="text-3xl font-bold text-gray-900">{stats.totalBeneficiarios}</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="text-green-700 text-sm font-medium mb-1">Con Tokens</div>
          <div className="text-3xl font-bold text-green-600">{stats.conTokens}</div>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
          <div className="text-orange-700 text-sm font-medium mb-1">Sin Tokens</div>
          <div className="text-3xl font-bold text-orange-600">{stats.sinTokens}</div>
        </div>
      </div>

      {/* Controles */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Configuración</h3>

        {/* Batch Size */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cantidad de Beneficiarios a Procesar
          </label>
          <input
            type="number"
            min="1"
            max={stats.sinTokens || 100}
            value={batchSize}
            onChange={(e) => setBatchSize(parseInt(e.target.value))}
            disabled={generating}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Máximo disponible: {stats.sinTokens} sin tokens
          </p>
        </div>

        {/* Opciones */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sendEmails}
              onChange={(e) => setSendEmails(e.target.checked)}
              disabled={generating}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm font-medium text-gray-700">
              📧 Enviar emails de activación automáticamente
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeExisting}
              onChange={(e) => setIncludeExisting(e.target.checked)}
              disabled={generating}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm font-medium text-gray-700">
              🔄 Incluir beneficiarios que ya tienen tokens (regenerar)
            </span>
          </label>
        </div>

        {/* Botón */}
        <button
          onClick={generateTokens}
          disabled={generating || stats.sinTokens === 0}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition flex items-center justify-center gap-2"
        >
          {generating ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              Procesando...
            </>
          ) : (
            <>
              <Zap className="w-5 h-5" />
              Generar Tokens
            </>
          )}
        </button>
      </div>

      {/* Barra de Progreso */}
      {progress.total > 0 && (
        <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Progreso: {progress.current} / {progress.total}
            </span>
            <span className="text-sm font-bold text-blue-600">{progress.percentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Logs */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex items-center gap-2 font-semibold text-gray-900 hover:text-blue-600 transition"
          >
            <ChevronDown
              className={`w-5 h-5 transition-transform ${showLogs ? 'rotate-180' : ''}`}
            />
            Logs ({logs.length})
          </button>
          {logs.length > 0 && (
            <button
              onClick={resetLogs}
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <RefreshCw className="w-4 h-4" />
              Limpiar
            </button>
          )}
        </div>

        {showLogs && (
          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto space-y-1">
            {logs.length === 0 ? (
              <p className="text-gray-500">Los logs aparecerán aquí...</p>
            ) : (
              logs.map((log, idx) => (
                <div
                  key={idx}
                  className={`flex gap-2 ${
                    log.type === 'error'
                      ? 'text-red-400'
                      : log.type === 'warning'
                      ? 'text-yellow-400'
                      : log.type === 'success'
                      ? 'text-green-400'
                      : 'text-gray-300'
                  }`}
                >
                  <span className="text-gray-600 min-w-fit">[{log.timestamp}]</span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">ℹ️ Información importante:</p>
            <ul className="space-y-1 text-xs">
              <li>• Cada token es válido por <strong>24 horas</strong></li>
              <li>• Los emails se envían via <strong>Resend</strong> desde <strong>activacion@focades.info</strong></li>
              <li>• Hay un delay de 100ms entre emails para evitar rate limits</li>
              <li>• Los logs se guardan en <strong>portal_beneficiarios_email_log</strong></li>
              <li>• El admin dashboard se actualiza automáticamente</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
