import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { AlertCircle, CheckCircle, X, Plus, Trash2 } from 'lucide-react'

const EditorDocumentoCargue = ({ documentoId, tipoDocumento, onGuardado, onCancelado }) => {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(null)

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
      { name: 'tercero_presupuestal', label: 'Tercero Presupuestal', type: 'text', required: true },
      { name: 'rubro_presupuestal', label: 'Rubro Presupuestal', type: 'text', required: true },
      { name: 'fuente_financiamiento', label: 'Fuente Financiamiento', type: 'text', required: false },
      { name: 'valor_bruto', label: 'Valor Bruto', type: 'number', required: true },
      { name: 'valor_deducciones', label: 'Deducciones', type: 'number', required: false },
      { name: 'valor_neto', label: 'Valor Neto', type: 'number', required: true }
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

  const cargarDatos = async () => {
    if (documentoId === 'nuevo') {
      setFilas([{ id: `temp-${Date.now()}`, ...campos.reduce((acc, c) => ({ ...acc, [c.name]: '' }), {}) }])
      return
    }

    try {
      setCargando(true)
      // Aquí iría la carga de datos desde la BD
      // Por ahora, inicializamos con una fila vacía
      setFilas([{ id: `temp-${Date.now()}`, ...campos.reduce((acc, c) => ({ ...acc, [c.name]: '' }), {}) }])
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
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
        <button
          onClick={agregarFila}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition font-medium text-sm"
        >
          <Plus size={18} />
          Agregar Fila
        </button>

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
    </div>
  )
}

export default EditorDocumentoCargue
