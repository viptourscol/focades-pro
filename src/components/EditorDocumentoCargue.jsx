import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { AlertCircle, CheckCircle, X, Plus, Trash2 } from 'lucide-react'

const EditorDocumentoCargue = ({ documentoId, tipoDocumento, userRole, onGuardado, onCancelado }) => {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(false)
  const [precargando, setPrecargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(null)
  // Estados para modal de filtros de precarga
  const [mostrarModalFiltros, setMostrarModalFiltros] = useState(false)
  const [convocatoriaFiltro, setConvocatoriaFiltro] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [convocatorias, setConvocatorias] = useState([])
  const [estadosDisponibles, setEstadosDisponibles] = useState(['admitido', 'rechazado', 'aspirante', 'pendiente'])

  const camposporTipo = {
    terceros: [
      { name: 'cc_nit', label: 'C.C/NIT', type: 'text', required: true },
      { name: 'nombre_razon_social', label: 'Nombre/Razón Social', type: 'text', required: true },
      { name: 'tipo_identificacion', label: 'Tipo Identificación', type: 'select', options: ['CC', 'NIT', 'CE', 'PAS'], required: false },
      { name: 'email', label: 'Email', type: 'email', required: false },
      { name: 'telefono', label: 'Teléfono', type: 'tel', required: false },
      { name: 'direccion', label: 'Dirección', type: 'text', required: false },
      { name: 'ciudad', label: 'Ciudad', type: 'text', required: false }
    ],
    rp: [
      { name: 'identificacion', label: 'Identificación', type: 'text', required: true },
      { name: 'nombre_beneficiario', label: 'Nombre', type: 'text', required: true },
      { name: 'tipo_identificacion', label: 'Tipo Identificación', type: 'text', required: false },
      { name: 'email', label: 'Email', type: 'email', required: false },
      { name: 'telefono', label: 'Teléfono', type: 'tel', required: false },
      { name: 'direccion', label: 'Dirección', type: 'text', required: false },
      { name: 'ciudad', label: 'Ciudad', type: 'text', required: false }
    ],
    op: [
      { name: 'no_op', label: 'No. OP', type: 'text', required: true, readonly: true },
      { name: 'rubro_presupuestal', label: 'Rubro', type: 'text', required: false, readonly: true },
      { name: 'fuente_financiamiento', label: 'Fuente', type: 'text', required: false, readonly: true },
      { name: 'valor', label: 'Valor', type: 'number', required: true, readonly: true }
    ],
    contabilidad: [
      { name: 'tipo', label: 'Tipo', type: 'text', required: false, readonly: true },
      { name: 'no_registro', label: 'No. Registro', type: 'text', required: false, readonly: true },
      { name: 'cuenta_debito', label: 'Cuenta Débito', type: 'text', required: true },
      { name: 'cuenta_credito', label: 'Cuenta Crédito', type: 'text', required: true },
      { name: 'concepto', label: 'Concepto', type: 'text', required: true },
      { name: 'valor', label: 'Valor', type: 'number', required: true }
    ],
    siafe: [
      { name: 'no_egreso', label: 'No. Egreso', type: 'text', required: true },
      { name: 'identificacion', label: 'Identificación', type: 'text', required: true },
      { name: 'nombre_beneficiario', label: 'Nombre Beneficiario', type: 'text', required: false },
      { name: 'valor_egreso', label: 'Valor Egreso', type: 'number', required: true },
      { name: 'fecha_pago', label: 'Fecha Pago', type: 'date', required: false },
      { name: 'referencia_banco', label: 'Referencia Banco', type: 'text', required: false }
    ]
  }

  const campos = camposporTipo[tipoDocumento] || []

  useEffect(() => {
    cargarDatos()
  }, [documentoId, tipoDocumento])

  const esDocumentoExistente = Boolean(documentoId) && !String(documentoId).startsWith('nuevo')

  const filaVacia = () => ({ id: `temp-${Date.now()}`, ...campos.reduce((acc, c) => ({ ...acc, [c.name]: '' }), {}) })

  const cargarDatos = async () => {
    if (!esDocumentoExistente) {
      setFilas([filaVacia()])
      return
    }

    try {
      setCargando(true)
      const { data, error: errorCarga } = await supabase
        .from('portal_valores_cargue')
        .select('id, identificacion, nombre_beneficiario, tipo_identificacion, email, telefono, direccion, ciudad')
        .eq('documento_id', documentoId)
        .order('nombre_beneficiario')
      if (errorCarga) throw errorCarga

      if (tipoDocumento === 'terceros' && data.length > 0) {
        setFilas(
          data.map((r) => ({
            ...filaVacia(),
            id: String(r.id),
            cc_nit: r.identificacion,
            nombre_razon_social: r.nombre_beneficiario,
            tipo_identificacion: r.tipo_identificacion || '',
            email: r.email || '',
            telefono: r.telefono || '',
            direccion: r.direccion || '',
            ciudad: r.ciudad || ''
          }))
        )
      } else if (tipoDocumento === 'rp' && data.length > 0) {
        setFilas(
          data.map((r) => ({
            ...filaVacia(),
            id: String(r.id),
            identificacion: r.identificacion,
            nombre_beneficiario: r.nombre_beneficiario,
            tipo_identificacion: r.tipo_identificacion || '',
            email: r.email || '',
            telefono: r.telefono || '',
            direccion: r.direccion || '',
            ciudad: r.ciudad || ''
          }))
        )
      } else {
        setFilas([filaVacia()])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  const puedePrecargar = (tipoDocumento === 'terceros' || tipoDocumento === 'rp') && userRole === 'admin_educacion' && esDocumentoExistente

  // Cargar convocatorias al montar el componente
  useEffect(() => {
    cargarConvocatorias()
  }, [])

  const cargarConvocatorias = async () => {
    try {
      // Obtener estados disponibles en inscripciones
      const { data: estadosData, error: estadosErr } = await supabase.rpc('debug_precargar_rp')
      if (!estadosErr && estadosData) {
        const estadosUnicos = new Set()
        estadosData
          .filter(row => row.info_tipo === 'ESTADO')
          .forEach(row => {
            if (row.valor && row.valor !== 'NULL') {
              estadosUnicos.add(row.valor.toLowerCase().trim())
            }
          })
        if (estadosUnicos.size > 0) {
          setEstadosDisponibles(Array.from(estadosUnicos))
          setEstadoFiltro(Array.from(estadosUnicos)[0])
        }
      }

      // Obtener convocatorias con inscritos por estado
      const { data, error: err } = await supabase.rpc('obtener_convocatorias_con_inscritos')
      if (err) {
        console.error('Error en RPC:', err)
        // Fallback a consulta directa si RPC falla
        const { data: convData, error: convErr } = await supabase
          .from('convocatorias')
          .select('id, nombre, anio')
          .order('anio', { ascending: false })
        if (convErr) throw convErr
        setConvocatorias(convData || [])
        if (convData?.[0]) setConvocatoriaFiltro(convData[0].id)
        return
      }
      
      // Procesar resultados: agrupar por convocatoria única
      const convocatoriasMap = new Map()
      data?.forEach(row => {
        if (!convocatoriasMap.has(row.convocatoria_id)) {
          convocatoriasMap.set(row.convocatoria_id, {
            id: row.convocatoria_id,
            nombre: row.convocatoria_nombre,
            anio: row.convocatoria_anio
          })
        }
      })
      
      const convocatoriasList = Array.from(convocatoriasMap.values())
      setConvocatorias(convocatoriasList)
      if (convocatoriasList?.[0]) setConvocatoriaFiltro(convocatoriasList[0].id)
    } catch (err) {
      console.error('Error cargando convocatorias:', err)
    }
  }

  const precargarDesdeAspirantes = async () => {
    // Mostrar modal de filtros para RP/Terceros
    if (tipoDocumento === 'rp' || tipoDocumento === 'terceros') {
      setMostrarModalFiltros(true)
      return
    }
  }

  const realizarPrecarga = async (convId, estado) => {
    try {
      setPrecargando(true)
      setError(null)
      
      let rpcName = 'precargar_rp_convocatoria'
      let params = {
        p_documento_id: documentoId,
        p_modalidad_beca: null
      }

      const { data, error: errorRpc } = await supabase.rpc(rpcName, params)
      
      if (errorRpc) throw errorRpc
      
      setExito(`Precarga completada: ${data?.[0]?.cantidad_precargada || 0} registro(s) precargado(s)`)
      setMostrarModalFiltros(false)
      setConvocatoriaFiltro('')
      setEstadoFiltro('admitido')
      await cargarDatos()
    } catch (err) {
      setError(err.message)
    } finally {
      setPrecargando(false)
    }
  }

  const agregarFila = () => {
    const nuevaFila = {
      id: `temp-${Date.now()}`,
      ...campos.reduce((acc, c) => ({ ...acc, [c.name]: '' }), {})
    }
    setFilas([...filas, nuevaFila])
  }

  const eliminarFila = (filaId) => {
    setFilas(filas.filter((f) => f.id !== filaId))
  }

  const actualizarFila = (filaId, campo, valor) => {
    setFilas(filas.map((f) => (f.id === filaId ? { ...f, [campo]: valor } : f)))
  }

  const validarFila = (fila) => {
    const errores = []
    campos.forEach((campo) => {
      if (campo.required && !fila[campo.name]) {
        errores.push(`${campo.label} es requerido`)
      }
      if (campo.type === 'email' && fila[campo.name] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fila[campo.name])) {
        errores.push(`${campo.label} no es válido`)
      }
      if (campo.type === 'number' && fila[campo.name] && isNaN(fila[campo.name])) {
        errores.push(`${campo.label} debe ser un número`)
      }
    })
    return errores
  }

  const guardar = async () => {
    try {
      setGuardando(true)
      setError(null)

      // Validar todas las filas
      const erroresValidacion = []
      filas.forEach((fila, idx) => {
        const errores = validarFila(fila)
        if (errores.length > 0) {
          erroresValidacion.push(`Fila ${idx + 1}: ${errores.join(', ')}`)
        }
      })

      if (erroresValidacion.length > 0) {
        setError(erroresValidacion.join('\n'))
        return
      }

      const {
        data: { session },
        error: authError
      } = await supabase.auth.getSession()
      if (authError || !session) {
        setError('No autorizado')
        return
      }

      // Llamar función de validación
      const { data, error: validationError } = await supabase.functions.invoke('validar-documento-cargue', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: {
          documento_id: documentoId,
          datos: filas
        }
      })

      if (validationError) {
        setError(validationError.message)
      } else if (data.es_valido) {
        setExito('Documento validado correctamente')
        if (onGuardado) onGuardado(data)
      } else {
        setError(`${data.errores_encontrados} errores de validación encontrados`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      {/* Alertas */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800 mb-1">Errores de validación</p>
            <p className="text-xs text-red-700 whitespace-pre-wrap">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
            <X size={18} />
          </button>
        </div>
      )}

      {exito && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex gap-3">
          <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">{exito}</p>
          </div>
          <button onClick={() => setExito(null)} className="text-green-600 hover:text-green-800">
            <X size={18} />
          </button>
        </div>
      )}

      {/* Tabla editable */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {campos.map((campo) => (
                  <th key={campo.name} className="px-4 py-3 text-left text-xs font-semibold text-gray-700">
                    {campo.label}
                    {campo.required && <span className="text-red-500 ml-1">*</span>}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, idx) => (
                <tr key={fila.id} className="border-b border-gray-200 hover:bg-gray-50">
                  {campos.map((campo) => (
                    <td key={`${fila.id}-${campo.name}`} className="px-4 py-3">
                      {campo.readonly ? (
                        <span className="text-sm text-gray-600">{fila[campo.name] || '-'}</span>
                      ) : campo.type === 'select' ? (
                        <select
                          value={fila[campo.name] || ''}
                          onChange={(e) => actualizarFila(fila.id, campo.name, e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Seleccionar...</option>
                          {campo.options?.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={campo.type}
                          value={fila[campo.name] || ''}
                          onChange={(e) => actualizarFila(fila.id, campo.name, e.target.value)}
                          placeholder={`${campo.label}...`}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => eliminarFila(fila.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                      title="Eliminar fila"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex gap-3">
          <button
            onClick={agregarFila}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition font-medium text-sm"
          >
            <Plus size={18} />
            Agregar Fila
          </button>
          {puedePrecargar && (
            <button
              onClick={precargarDesdeAspirantes}
              disabled={precargando}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-emerald-600 text-emerald-700 rounded-lg hover:bg-emerald-50 transition font-medium text-sm disabled:opacity-50"
            >
              {precargando ? 'Precargando...' : 'Precargar desde aspirantes'}
            </button>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancelado}
            className="flex-1 md:flex-none px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando || filas.length === 0}
            className="flex-1 md:flex-none px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {guardando ? 'Validando...' : 'Validar y Guardar'}
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <p className="text-xs font-medium text-blue-600 mb-1">Total Filas</p>
          <p className="text-2xl font-bold text-blue-900">{filas.length}</p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <p className="text-xs font-medium text-purple-600 mb-1">Campos Requeridos</p>
          <p className="text-2xl font-bold text-purple-900">{campos.filter((c) => c.required).length}</p>
        </div>
        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
          <p className="text-xs font-medium text-indigo-600 mb-1">Campos Totales</p>
          <p className="text-2xl font-bold text-indigo-900">{campos.length}</p>
        </div>
      </div>

      {/* Modal de filtros para precarga desde aspirantes */}
      {mostrarModalFiltros && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 pointer-events-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Seleccionar Filtros de Precarga</h2>
              <button
                onClick={() => setMostrarModalFiltros(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition"
                disabled={precargando}
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Convocatoria
                </label>
                <select
                  value={convocatoriaFiltro}
                  onChange={(e) => setConvocatoriaFiltro(e.target.value)}
                  disabled={precargando}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Seleccionar --</option>
                  {convocatorias.map((conv) => (
                    <option key={conv.id} value={conv.id}>
                      {conv.nombre} ({conv.anio})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estado del Aspirante
                </label>
                <select
                  value={estadoFiltro}
                  onChange={(e) => setEstadoFiltro(e.target.value)}
                  disabled={precargando}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Selecciona un estado --</option>
                  {estadosDisponibles.map(estado => (
                    <option key={estado} value={estado}>
                      {estado.charAt(0).toUpperCase() + estado.slice(1)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Selecciona el estado de los aspirantes a precargar ({estadosDisponibles.length} disponible{estadosDisponibles.length !== 1 ? 's' : ''})
                </p>
              </div>

              {error && (
                <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {error}
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end p-6 border-t border-gray-200">
              <button
                onClick={() => setMostrarModalFiltros(false)}
                disabled={precargando}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => realizarPrecarga(convocatoriaFiltro, estadoFiltro)}
                disabled={precargando || !convocatoriaFiltro}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
              >
                {precargando ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Precargando...
                  </>
                ) : (
                  'Precargar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EditorDocumentoCargue
