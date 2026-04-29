import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ImportStepper from '../components/ImportStepper'
import LoteInfoBanner from '../components/LoteInfoBanner'
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Users,
  Mail,
  MailX,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Send,
} from 'lucide-react'

const CLASIFICACION_CONFIG = {
  activo_confiable: {
    icon: CheckCircle2,
    iconColor: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    borderLeft: 'border-l-emerald-500',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-700',
    label: 'Activos y confiables',
    desc: 'Tienen correo válido y aún no están en el portal',
    seleccionable: true,
  },
  correo_dudoso: {
    icon: AlertCircle,
    iconColor: 'text-amber-500',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    borderLeft: 'border-l-amber-400',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-700',
    label: 'Correo sospechoso',
    desc: 'Formato de correo no estándar o incompleto',
    seleccionable: true,
  },
  sin_correo: {
    icon: MailX,
    iconColor: 'text-red-400',
    bg: 'bg-red-50',
    border: 'border-red-200',
    borderLeft: 'border-l-red-400',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
    label: 'Sin correo',
    desc: 'No tienen correo registrado — no se puede enviar invitación',
    seleccionable: false,
  },
  ya_portal: {
    icon: UserCheck,
    iconColor: 'text-blue-500',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    borderLeft: 'border-l-blue-400',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-700',
    label: 'Ya en portal',
    desc: 'Ya tienen cuenta activa en el sistema',
    seleccionable: false,
  },
}

const ESTADO_LABEL = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
  procesando: { label: 'Procesando', cls: 'bg-blue-100 text-blue-700' },
  completado: { label: 'Completado', cls: 'bg-emerald-100 text-emerald-700' },
  error: { label: 'Error', cls: 'bg-red-100 text-red-700' },
}

const AdminMigracionHistoricos = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const loteId = searchParams.get('lote')

  const [lote, setLote] = useState(null)
  const [clasificaciones, setClasificaciones] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [paso, setPaso] = useState('clasificacion')
  const [selected, setSelected] = useState(new Set())
  const [activationResult, setActivationResult] = useState(null)

  useEffect(() => {
    if (!loteId) {
      setLoading(false)
      return
    }
    loadLoteAndClassifications()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loteId])

  const loadLoteAndClassifications = async () => {
    setLoading(true)
    setError(null)

    try {
      const { data: loteData, error: loteError } = await supabase
        .from('portal_migracion_lotes')
        .select('*')
        .eq('id', loteId)
        .single()

      if (loteError) {
        setError('No se encontró el lote especificado.')
        setLoading(false)
        return
      }

      setLote(loteData)

      const { data: clasifData, error: clasifError } = await supabase.rpc(
        'beneficiarios_lote_clasificados',
        { p_lote_id: loteId }
      )

      if (clasifError) {
        setError(`Error al clasificar beneficiarios: ${clasifError.message}`)
        setLoading(false)
        return
      }

      const classMap = {}
      clasifData?.forEach(({ clasificacion, cantidad, beneficiarios }) => {
        classMap[clasificacion] = { cantidad, beneficiarios: beneficiarios || [] }
      })
      setClasificaciones(classMap)
    } catch (err) {
      setError(`Error inesperado: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = (beneficiarioId, clasificacion) => {
    const key = `${clasificacion}::${beneficiarioId}`
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSelectGroup = (clasificacion, beneficiarios, select) => {
    setSelected((prev) => {
      const next = new Set(prev)
      beneficiarios.forEach(({ id }) => {
        const key = `${clasificacion}::${id}`
        if (select) next.add(key)
        else next.delete(key)
      })
      return next
    })
  }

  const getSelectedIds = () => {
    const ids = []
    selected.forEach((key) => {
      const parts = key.split('::')
      ids.push(parts[parts.length - 1])
    })
    return ids
  }

  const activateBeneficiarios = async () => {
    const beneficiarioIds = getSelectedIds()
    if (beneficiarioIds.length === 0) {
      setError('Selecciona al menos 1 beneficiario.')
      return
    }
    setPaso('procesando')
    setError(null)

    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'activate-beneficiarios-batch',
        { body: { lote_id: loteId, beneficiario_ids: beneficiarioIds, solo_confiables: true } }
      )

      if (invokeError) {
        setError(`Error: ${invokeError.message}`)
        setPaso('seleccion')
        return
      }
      if (!data.exito) {
        setError(data.error || 'No se pudo completar la activación.')
        setPaso('seleccion')
        return
      }
      setActivationResult(data.resultado)
      setPaso('exito')
    } catch (err) {
      setError(`Error: ${err.message}`)
      setPaso('seleccion')
    }
  }

  // ── Sin lote: estado vacío ────────────────────────────────────────────────
  if (!loteId) {
    return (
      <div className="space-y-4">
        <ImportStepper currentStep={4} />
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Users size={28} className="text-slate-400" />
          </div>
          <h2 className="text-lg font-black text-slate-700 mb-2">No se especificó un lote</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-xs mx-auto">
            Accede a esta página desde el flujo de importación para activar los beneficiarios de un lote concreto.
          </p>
          <button
            onClick={() => navigate('/admin/importar')}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700"
          >
            Ir a importación
          </button>
        </div>
      </div>
    )
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <ImportStepper currentStep={4} loteId={loteId} />
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  const estadoCfg = ESTADO_LABEL[lote?.estado] || { label: lote?.estado || '—', cls: 'bg-slate-100 text-slate-500' }
  const totalSeleccionados = selected.size

  return (
    <div className="space-y-4">
      <ImportStepper currentStep={4} loteId={loteId} />
      {loteId && <LoteInfoBanner loteId={loteId} />}

      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-800">
              {lote?.titulo || 'Activación de beneficiarios'}
            </h2>
            {lote?.descripcion && <p className="text-slate-500 text-sm mt-1">{lote.descripcion}</p>}
          </div>
          <span className={`self-start sm:self-auto inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${estadoCfg.cls}`}>
            {estadoCfg.label}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* ── Paso: clasificación ── */}
      {paso === 'clasificacion' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 px-1">
            Resumen de beneficiarios en este lote. Solo los grupos <strong>seleccionables</strong> recibirán invitación por correo.
          </p>
          {Object.entries(clasificaciones).length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
              No se encontraron beneficiarios en este lote.
            </div>
          ) : (
            Object.entries(clasificaciones).map(([clave, { cantidad }]) => {
              const cfg = CLASIFICACION_CONFIG[clave] || {
                icon: Users, iconColor: 'text-slate-400', bg: 'bg-slate-50', border: 'border-slate-200',
                borderLeft: 'border-l-slate-300', badgeBg: 'bg-slate-100', badgeText: 'text-slate-600',
                label: clave, desc: '', seleccionable: true,
              }
              const Icon = cfg.icon
              return (
                <div
                  key={clave}
                  className={`bg-white rounded-2xl border ${cfg.border} border-l-4 ${cfg.borderLeft} p-5 flex items-center gap-4`}
                >
                  <div className={`w-10 h-10 rounded-full ${cfg.bg} flex items-center justify-center shrink-0`}>
                    <Icon size={20} className={cfg.iconColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">{cfg.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{cfg.desc}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-black text-slate-800">{cantidad}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}>
                      {cfg.seleccionable ? 'Seleccionable' : 'Solo lectura'}
                    </span>
                  </div>
                </div>
              )
            })
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-slate-600 font-semibold text-sm rounded-xl hover:bg-slate-100"
            >
              <ChevronLeft size={16} /> Atrás
            </button>
            <button
              onClick={() => setPaso('seleccion')}
              disabled={Object.keys(clasificaciones).length === 0}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white font-semibold text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50"
            >
              Seleccionar y activar <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Paso: selección ── */}
      {paso === 'seleccion' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 px-1">
            Selecciona los beneficiarios que recibirán la invitación por correo. Los grupos sin correo o ya activos no son seleccionables.
          </p>

          {Object.entries(clasificaciones).map(([clave, { beneficiarios }]) => {
            const cfg = CLASIFICACION_CONFIG[clave] || {
              icon: Users, iconColor: 'text-slate-400', bg: 'bg-slate-50', border: 'border-slate-200',
              borderLeft: 'border-l-slate-300', label: clave, seleccionable: true,
            }
            const Icon = cfg.icon
            const seleccionables = cfg.seleccionable ? beneficiarios : []
            const groupSelected = seleccionables.length > 0 && seleccionables.every(({ id }) => selected.has(`${clave}::${id}`))
            const groupPartial = !groupSelected && seleccionables.some(({ id }) => selected.has(`${clave}::${id}`))

            return (
              <div key={clave} className={`bg-white rounded-2xl border ${cfg.border} border-l-4 ${cfg.borderLeft} overflow-hidden`}>
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
                  {cfg.seleccionable ? (
                    <input
                      type="checkbox"
                      checked={groupSelected}
                      ref={(el) => { if (el) el.indeterminate = groupPartial }}
                      onChange={(e) => handleSelectGroup(clave, beneficiarios, e.target.checked)}
                      className="w-4 h-4 accent-blue-600"
                    />
                  ) : (
                    <div className="w-4 h-4" />
                  )}
                  <div className={`w-7 h-7 rounded-full ${cfg.bg} flex items-center justify-center`}>
                    <Icon size={14} className={cfg.iconColor} />
                  </div>
                  <span className="font-semibold text-slate-700 text-sm flex-1">{cfg.label}</span>
                  <span className="text-xs text-slate-400">{beneficiarios.length} registros</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {beneficiarios.map(({ id, nombre, cedula, correo }) => (
                    <label
                      key={id}
                      className={`flex items-start gap-3 px-5 py-3 ${cfg.seleccionable ? 'cursor-pointer hover:bg-slate-50' : 'opacity-60'}`}
                    >
                      {cfg.seleccionable ? (
                        <input
                          type="checkbox"
                          checked={selected.has(`${clave}::${id}`)}
                          onChange={() => handleToggle(id, clave)}
                          className="w-4 h-4 mt-0.5 accent-blue-600"
                        />
                      ) : (
                        <div className="w-4 h-4 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm">{nombre}</p>
                        <p className="text-xs text-slate-500">C.C. {cedula}</p>
                        {correo ? (
                          <p className="text-xs text-blue-600 truncate">{correo}</p>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Sin correo</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setPaso('clasificacion')}
              className="flex items-center gap-1.5 px-4 py-2.5 text-slate-600 font-semibold text-sm rounded-xl hover:bg-slate-100"
            >
              <ChevronLeft size={16} /> Volver
            </button>
            <button
              onClick={activateBeneficiarios}
              disabled={totalSeleccionados === 0}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white font-semibold text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50"
            >
              <Send size={15} />
              Activar {totalSeleccionados > 0 ? `${totalSeleccionados} seleccionado${totalSeleccionados !== 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>
      )}

      {/* ── Paso: procesando ── */}
      {paso === 'procesando' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-5" />
          <h3 className="text-base font-bold text-slate-800 mb-1">Enviando invitaciones…</h3>
          <p className="text-slate-400 text-sm">Por favor espera mientras procesamos los datos.</p>
        </div>
      )}

      {/* ── Paso: éxito ── */}
      {paso === 'exito' && activationResult && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={34} className="text-emerald-600" />
            </div>
            <h3 className="text-xl font-black text-emerald-800 mb-1">Activación completada</h3>
            <p className="text-emerald-700 text-sm">Las invitaciones han sido enviadas exitosamente.</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Invitaciones enviadas', value: activationResult.invitados, cls: 'text-emerald-600' },
              { label: 'Fallidas', value: activationResult.fallidos, cls: 'text-red-500' },
              { label: 'Omitidas', value: activationResult.beneficiarios_skipped, cls: 'text-amber-500' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">{stat.label}</p>
                <p className={`text-3xl font-black ${stat.cls}`}>{stat.value ?? 0}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/admin')}
              className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50"
            >
              Ir al panel
            </button>
            <button
              onClick={() => navigate('/admin/importar')}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700"
            >
              Nueva importación
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminMigracionHistoricos

