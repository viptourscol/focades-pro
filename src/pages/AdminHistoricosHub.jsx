import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { UploadCloud, FolderOpen, HandCoins, UserPlus, Plus, ChevronRight } from 'lucide-react'

const ESTADO_CONFIG = {
  en_preparacion: { label: 'En preparación', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  validado:       { label: 'Validado',       color: 'bg-blue-100 text-blue-800 border-blue-200' },
  cargado:        { label: 'Cargado',        color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  activado:       { label: 'Activado',       color: 'bg-green-100 text-green-800 border-green-200' },
  error:          { label: 'Error',          color: 'bg-red-100 text-red-800 border-red-200' },
}

const STEPS = [
  { n: 1, label: 'Importar Beneficiarios', desc: 'Carga el archivo Excel con los datos', icon: <UploadCloud size={22} />, path: 'importar' },
  { n: 2, label: 'Documentos',             desc: 'Sube soportes por beneficiario',       icon: <FolderOpen size={22} />,  path: 'documentos' },
  { n: 3, label: 'Pagos',                  desc: 'Importa historial de pagos',           icon: <HandCoins size={22} />,   path: 'pagos' },
  { n: 4, label: 'Activar',               desc: 'Envía invitaciones a los activos',     icon: <UserPlus size={22} />,    path: 'activacion' },
]

function getActions(lote) {
  const qs = `?lote=${lote.id}`
  switch (lote.estado) {
    case 'en_preparacion':
    case 'validado':
    case 'error':
      return [{ label: 'Continuar importando', href: `/admin/historicos/importar${qs}`, primary: true }]
    case 'cargado':
      return [
        { label: 'Documentos',  href: `/admin/historicos/documentos${qs}` },
        { label: 'Pagos',       href: `/admin/historicos/pagos${qs}` },
        { label: 'Activar',     href: `/admin/historicos/activacion${qs}`, primary: true },
      ]
    case 'activado':
      return [
        { label: 'Ver documentos', href: `/admin/historicos/documentos${qs}` },
        { label: 'Ver activación', href: `/admin/historicos/activacion${qs}` },
      ]
    default:
      return []
  }
}

export default function AdminHistoricosHub() {
  const [lotes, setLotes]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const fetchLotes = async () => {
      const { data } = await supabase
        .from('portal_migracion_lotes')
        .select('id, titulo, descripcion, estado, cantidad_registros, cantidad_documentos, created_at')
        .order('created_at', { ascending: false })
        .limit(100)
      if (mounted) {
        setLotes(data || [])
        setLoading(false)
      }
    }
    fetchLotes()
    return () => { mounted = false }
  }, [])

  return (
    <div className="space-y-8">

      {/* Flujo visual de 4 pasos */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-800">Flujo de importación histórica</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Sigue los 4 pasos para incorporar beneficiarios históricos. Cada paso es opcional excepto el primero.
            </p>
          </div>
          <Link
            to="/admin/historicos/importar"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#10233f] text-white text-sm font-bold hover:bg-[#1a3560] transition-colors whitespace-nowrap shrink-0"
          >
            <Plus size={16} /> Nuevo lote
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {STEPS.map((step, idx) => (
            <Link
              key={step.n}
              to={`/admin/historicos/${step.path}`}
              className="relative flex flex-col items-center text-center p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-300 hover:shadow-sm transition-all group"
            >
              {idx < STEPS.length - 1 && (
                <ChevronRight
                  className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 text-slate-300 z-10"
                  size={16}
                />
              )}
              <div className="w-11 h-11 rounded-xl bg-[#10233f] text-amber-300 flex items-center justify-center mb-3 group-hover:bg-[#1a3560] transition-colors">
                {step.icon}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Paso {step.n}</span>
              <p className="text-sm font-bold text-slate-800 leading-snug">{step.label}</p>
              <p className="text-xs text-slate-400 mt-1 leading-snug">{step.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Tabla de lotes */}
      <div>
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Lotes existentes</h3>

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-[#10233f] rounded-full animate-spin" />
          </div>
        ) : lotes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-14 text-center">
            <UploadCloud size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="font-semibold text-slate-600">Aún no hay lotes creados</p>
            <p className="text-sm text-slate-400 mt-1">Comienza importando un archivo Excel con los beneficiarios históricos</p>
            <Link
              to="/admin/historicos/importar"
              className="inline-flex items-center gap-1.5 mt-4 text-sm font-bold text-[#10233f] hover:underline"
            >
              <Plus size={14} /> Crear primer lote
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-3 font-bold text-slate-500 uppercase text-xs tracking-wider">Lote</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-500 uppercase text-xs tracking-wider hidden md:table-cell">Fecha</th>
                    <th className="text-center px-4 py-3 font-bold text-slate-500 uppercase text-xs tracking-wider">Benef.</th>
                    <th className="text-center px-4 py-3 font-bold text-slate-500 uppercase text-xs tracking-wider hidden lg:table-cell">Docs</th>
                    <th className="text-center px-4 py-3 font-bold text-slate-500 uppercase text-xs tracking-wider">Estado</th>
                    <th className="text-right px-5 py-3 font-bold text-slate-500 uppercase text-xs tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {lotes.map(lote => {
                    const cfg     = ESTADO_CONFIG[lote.estado] ?? ESTADO_CONFIG.en_preparacion
                    const actions = getActions(lote)
                    const fecha   = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(lote.created_at))
                    return (
                      <tr key={lote.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-slate-800 leading-snug">{lote.titulo || 'Sin título'}</p>
                          {lote.descripcion && (
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1 max-w-xs">{lote.descripcion}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-slate-500 hidden md:table-cell whitespace-nowrap">{fecha}</td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="font-semibold text-slate-700">{lote.cantidad_registros ?? '—'}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center text-slate-500 hidden lg:table-cell">
                          {lote.cantidad_documentos ?? '—'}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            {actions.map((action, i) => (
                              <Link
                                key={i}
                                to={action.href}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                                  action.primary
                                    ? 'bg-[#10233f] text-white hover:bg-[#1a3560]'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                              >
                                {action.label}
                              </Link>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
