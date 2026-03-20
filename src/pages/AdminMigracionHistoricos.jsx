import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const AdminMigracionHistoricos = () => {
  const [searchParams] = useSearchParams()
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
      setError('No se especificó lote')
      setLoading(false)
      return
    }
    loadLoteAndClassifications()
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
        setError('No se encontró el lote')
        setLoading(false)
        return
      }

      setLote(loteData)

      const { data: clasifData, error: clasifError } = await supabase.rpc(
        'beneficiarios_lote_clasificados',
        { p_lote_id: loteId }
      )

      if (clasifError) {
        setError(`Error al clasificar: ${clasifError.message}`)
        setLoading(false)
        return
      }

      const classMap = {}
      clasifData?.forEach(({ clasificacion, cantidad, beneficiarios }) => {
        classMap[clasificacion] = {
          cantidad,
          beneficiarios: beneficiarios || []
        }
      })

      setClasificaciones(classMap)
    } catch (err) {
      setError(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleSelect = (beneficiarioId, clasificacion) => {
    const key = `${clasificacion}-${beneficiarioId}`
    const newSelected = new Set(selected)
    if (newSelected.has(key)) {
      newSelected.delete(key)
    } else {
      newSelected.add(key)
    }
    setSelected(newSelected)
  }

  const handleSelectGroup = (clasificacion, beneficiarios, select = true) => {
    const newSelected = new Set(selected)
    beneficiarios.forEach(({ id }) => {
      const key = `${clasificacion}-${id}`
      if (select) {
        newSelected.add(key)
      } else {
        newSelected.delete(key)
      }
    })
    setSelected(newSelected)
  }

  const getSelectedBeneficiarioIds = () => {
    const ids = []
    selected.forEach((key) => {
      const [_, id] = key.split('-')
      ids.push(id)
    })
    return ids
  }

  const activateBeneficiarios = async () => {
    const beneficiarioIds = getSelectedBeneficiarioIds()
    if (beneficiarioIds.length === 0) {
      setError('Selecciona al menos 1 beneficiario')
      return
    }

    setPaso('procesando')
    setError(null)

    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'activate-beneficiarios-batch',
        {
          body: {
            lote_id: loteId,
            beneficiario_ids: beneficiarioIds,
            solo_confiables: true
          }
        }
      )

      if (invokeError) {
        setError(`Error: ${invokeError.message}`)
        setPaso('seleccion')
        return
      }

      if (!data.exito) {
        setError(data.error || 'No se pudo completar la activación')
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

  const renderClasificacionInfo = (clasificacion) => {
    const config = {
      activo_confiable: {
        icon: '✅',
        label: 'Activos y confiables',
        color: 'green',
        desc: 'Tienen correo válido y no están en portal'
      },
      correo_dudoso: {
        icon: '⚠️',
        label: 'Correo sospechoso',
        color: 'amber',
        desc: 'Formato de correo no estándar o incompleto'
      },
      sin_correo: {
        icon: '❌',
        label: 'Sin contacto',
        color: 'red',
        desc: 'No tienen correo registrado'
      },
      ya_portal: {
        icon: '👤',
        label: 'Ya en portal',
        color: 'blue',
        desc: 'Ya tienen cuenta activa en el sistema'
      }
    }
    return config[clasificacion] || { icon: '❓', label: clasificacion, color: 'gray' }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">⏳</div>
          <p className="text-gray-600">Cargando lote...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {lote?.titulo || 'Activación de beneficiarios'}
            </h2>
            {lote?.descripcion && <p className="text-gray-600 mt-1">{lote.descripcion}</p>}
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Estado</p>
            <p className="text-lg font-semibold text-blue-600">{lote?.estado || 'Desconocido'}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 text-sm font-medium">{error}</p>
        </div>
      )}

      {paso === 'clasificacion' && (
        <div className="space-y-4">
          {Object.entries(clasificaciones).map(([clasificacion, { cantidad }]) => {
            const info = renderClasificacionInfo(clasificacion)
            return (
              <div key={clasificacion} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 p-4 flex items-center justify-between border-l-4 border-blue-400">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{info.icon}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{info.label}</h3>
                      <p className="text-sm text-gray-600">{info.desc}</p>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-gray-900">{cantidad}</div>
                </div>

                <div className="p-4">
                  <button
                    onClick={() => setPaso('seleccion')}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Ver detalles →
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {paso === 'seleccion' && (
        <div className="space-y-4">
          {Object.entries(clasificaciones).map(([clasificacion, { beneficiarios }]) => {
            const info = renderClasificacionInfo(clasificacion)
            const groupSelected = beneficiarios.every(({ id }) => selected.has(`${clasificacion}-${id}`))
            const groupPartial =
              beneficiarios.some(({ id }) => selected.has(`${clasificacion}-${id}`)) && !groupSelected

            return (
              <div key={clasificacion} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 p-4 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={groupSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = groupPartial
                      }}
                      onChange={(e) => handleSelectGroup(clasificacion, beneficiarios, e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-lg">{info.icon}</span>
                    <span className="font-medium text-gray-900">{info.label}</span>
                  </div>
                  <span className="text-sm text-gray-600">{beneficiarios.length} registros</span>
                </div>

                <div className="divide-y divide-gray-200">
                  {beneficiarios.map(({ id, nombre, cedula, correo }) => (
                    <div key={id} className="p-4 hover:bg-gray-50 flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(`${clasificacion}-${id}`)}
                        onChange={() => handleToggleSelect(id, clasificacion)}
                        className="w-4 h-4 mt-1"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{nombre}</p>
                        <p className="text-sm text-gray-600">Cédula: {cedula}</p>
                        <p className="text-sm text-blue-600">{correo}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {paso === 'procesando' && (
        <div className="space-y-4 text-center py-16">
          <div className="text-5xl animate-spin">⏳</div>
          <h3 className="text-lg font-semibold text-gray-900">Enviando invitaciones...</h3>
          <p className="text-gray-600">Por favor espera mientras procesamos los datos</p>
        </div>
      )}

      {paso === 'exito' && activationResult && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h3 className="text-2xl font-bold text-green-900">Activación completada</h3>
            <p className="text-green-800 mt-2">Los beneficiarios han sido activados exitosamente</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-gray-600 text-sm">Invitaciones enviadas</p>
              <p className="text-3xl font-bold text-green-600">{activationResult.invitados}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-gray-600 text-sm">Fallidas</p>
              <p className="text-3xl font-bold text-red-600">{activationResult.fallidos}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-gray-600 text-sm">Omitidas</p>
              <p className="text-3xl font-bold text-amber-600">{activationResult.beneficiarios_skipped}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => (window.location.href = '/admin')} className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
              Volver a admin
            </button>
            <button onClick={() => (window.location.href = '/admin/importar')} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
              Importar otra
            </button>
          </div>
        </div>
      )}

      {paso === 'clasificacion' && (
        <div className="flex gap-3">
          <button onClick={() => (window.location.href = '/admin')} className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={() => setPaso('seleccion')} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            Continuar
          </button>
        </div>
      )}

      {paso === 'seleccion' && (
        <div className="flex gap-3">
          <button onClick={() => setPaso('clasificacion')} className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
            Volver
          </button>
          <button onClick={activateBeneficiarios} disabled={selected.size === 0} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
            Activar {selected.size} seleccionados
          </button>
        </div>
      )}
    </div>
  )
}

export default AdminMigracionHistoricos
