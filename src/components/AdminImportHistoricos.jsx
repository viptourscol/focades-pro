import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getSafeSession } from '../lib/supabase'
import * as XLSX from 'xlsx'

const TIPO_DOCUMENTO_VALIDO = new Set(['CC', 'TI', 'CE', 'PAS'])
const MODALIDAD_MAP = [
  { test: /sue|suen|sueño/i, value: 'Sueño Educativo' },
  { test: /meri|méri/i, value: 'Mérito Educativo' }
]
const NIVEL_MAP = [
  { test: /tecnic/i, value: 'Técnico Profesional' },
  { test: /tecnol/i, value: 'Tecnológico' },
  { test: /univers|pregrado|profesional/i, value: 'Universitario (Pregrado)' }
]
const GRADO_MAP = [
  { test: /^bach/i, value: 'Bachiller' },
  { test: /^tecnic/i, value: 'Técnico' },
  { test: /^tecnol/i, value: 'Tecnólogo' },
  { test: /^prof/i, value: 'Profesional' },
  { test: /especial/i, value: 'Especialista' },
  { test: /magist|maestr/i, value: 'Magíster' },
  { test: /doctor/i, value: 'Doctorado' }
]

const normalizeText = (value) => {
  const text = String(value || '').trim()
  return text || null
}

const normalizeTipoDocumento = (value) => {
  const cleaned = String(value || '').trim().toUpperCase().replace(/\./g, '')
  if (!cleaned) return 'CC'
  if (TIPO_DOCUMENTO_VALIDO.has(cleaned)) return cleaned
  if (cleaned.includes('CED') || cleaned === 'C') return 'CC'
  if (cleaned.includes('TARJ')) return 'TI'
  if (cleaned.includes('EXTR')) return 'CE'
  if (cleaned.includes('PASS') || cleaned.includes('PASAP')) return 'PAS'
  return 'CC'
}

const normalizeByMap = (value, map) => {
  const text = String(value || '').trim()
  if (!text) return null
  const found = map.find((item) => item.test.test(text))
  return found ? found.value : text
}

const normalizeSemestre = (value) => {
  const n = Number.parseInt(String(value || '').trim(), 10)
  if (!Number.isFinite(n)) return null
  if (n < 1 || n > 20) return null
  return n
}

const AdminImportHistoricos = () => {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [loading, setLoading] = useState(false)
  const [loteInfo, setLoteInfo] = useState(null)
  const [error, setError] = useState(null)
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [paso, setPaso] = useState('upload')
  const [validacionResult, setValidacionResult] = useState(null)

  const handleFileDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()

    const files = e.dataTransfer?.files || e.target?.files
    if (files && files[0]) {
      const newFile = files[0]
      if (newFile.type.includes('csv') || newFile.type.includes('spreadsheet')) {
        processFile(newFile)
      } else {
        setError('Por favor carga un archivo CSV o Excel')
      }
    }
  }, [])

  const processFile = async (file) => {
    setLoading(true)
    setError(null)
    setFile(file)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(firstSheet, {
        defval: '',
        raw: false
      })

      if (!rows || rows.length === 0) {
        setError('No se encontraron datos válidos en el archivo')
        return
      }

      const beneficiarios = rows
        .filter((row) => row.nombre && row.cedula && row.correo)
        .map((row) => ({
          nombre: String(row.nombre || '').trim(),
          cedula: String(row.cedula || '').trim().toUpperCase(),
          correo: String(row.correo || '').trim().toLowerCase(),
          tipo_documento: normalizeTipoDocumento(row.tipo_documento),
          telefono: normalizeText(row.telefono),
          direccion: normalizeText(row.direccion),
          semestre_actual: normalizeSemestre(row.semestre_actual),
          semestre_ingreso: normalizeSemestre(row.semestre_ingreso),
          nivel_formacion: normalizeByMap(row.nivel_formacion, NIVEL_MAP),
          modalidad: normalizeByMap(row.modalidad, MODALIDAD_MAP),
          convocatoria_id: normalizeText(row.convocatoria_id),
          convocatoria_nombre: normalizeText(row.convocatoria_nombre),
          programa_academico: normalizeText(row.programa_academico),
          institucion_superior: normalizeText(row.institucion_superior),
          grado_academico: normalizeByMap(row.grado_academico, GRADO_MAP),
          institucion_academica: normalizeText(row.institucion_academica),
          anio_graduacion: row.anio_graduacion ? parseInt(String(row.anio_graduacion), 10) : null,
          observaciones: normalizeText(row.observaciones)
        }))

      setPreview(beneficiarios.slice(0, 10))
      setLoteInfo({
        archivo_nombre: file.name,
        archivo_size_bytes: file.size,
        cantidad_registros: beneficiarios.length,
        beneficiarios
      })
      setPaso('preview')
    } catch (err) {
      setError(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const validateAndImport = async () => {
    if (!titulo.trim()) {
      setError('El título del lote es obligatorio')
      return
    }

    if (!loteInfo) {
      setError('No hay datos para importar')
      return
    }

    setLoading(true)
    setError(null)
    setPaso('validacion')

    try {
      const { session } = await getSafeSession()
      const accessToken = String(session?.access_token || '').trim()

      if (!accessToken) {
        setError('Tu sesión de administrador expiró. Inicia sesión nuevamente para importar.')
        setPaso('preview')
        return
      }

      const { data, error: invokeError } = await supabase.functions.invoke(
        'import-historicos-lote',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          },
          body: {
            titulo: titulo.trim(),
            descripcion: descripcion.trim() || null,
            beneficiarios: loteInfo.beneficiarios,
            archivo_nombre: loteInfo.archivo_nombre,
            archivo_size_bytes: loteInfo.archivo_size_bytes
          }
        }
      )

      if (invokeError) {
        setError(`Error: ${invokeError.message}`)
        setPaso('preview')
        return
      }

      if (!data.exito) {
        setValidacionResult({
          ...data.validacion,
          carga_error: data.error
        })
        setError(data.error || 'No se pudo completar la importación')
        setPaso('preview')
        return
      }

      setValidacionResult(data)
      setLoteInfo((prev) => ({
        ...prev,
        lote_id: data.lote_id,
        status: data.status
      }))
      setPaso('exito')
    } catch (err) {
      setError(`Error: ${err.message}`)
      setPaso('preview')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        {paso === 'upload' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Importar Beneficiarios Históricos</h3>
            <p className="text-gray-600 text-sm">
              Carga un archivo CSV/Excel con los datos de beneficiarios. Requerido: nombre, cédula, correo.
              Recomendado para comportamiento completo: modalidad, convocatoria, programa, nivel y semestres.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-blue-900">¿Necesitas una guía para el formato?</p>
                <p className="text-xs text-blue-700">
                  Descarga la plantilla oficial, diligencia tus registros y vuelve a cargar el archivo.
                </p>
              </div>
              <a
                href="/plantillas/plantilla-beneficiarios-historicos.xlsx"
                download
                className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
              >
                Descargar plantilla Excel (.xlsx)
              </a>
            </div>

            <div
              onDrop={handleFileDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-400 hover:bg-blue-50 transition cursor-pointer"
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <div className="text-gray-600">
                <p className="text-base font-medium">Arrastra tu archivo CSV aquí</p>
                <p className="text-sm text-gray-500 mt-1">o haz clic para seleccionar</p>
              </div>
              <input
                id="file-input"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => e.target.files && processFile(e.target.files[0])}
                className="hidden"
              />
            </div>

            {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded">{error}</div>}
          </div>
        )}

        {paso === 'preview' && loteInfo && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Previsualizacion de Importación</h3>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-gray-600 text-sm">Total de registros</p>
                <p className="text-2xl font-bold text-gray-900">{loteInfo.cantidad_registros}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-gray-600 text-sm">Tamaño del archivo</p>
                <p className="text-2xl font-bold text-gray-900">{(loteInfo.archivo_size_bytes / 1024).toFixed(1)} KB</p>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-gray-600 text-sm">Estado</p>
                <p className="text-2xl font-bold text-amber-600">En preparación</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título del lote *</label>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="ej: Beneficiarios migración 2024"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Notas sobre este lote"
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Primeros 10 registros</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border border-gray-200 rounded">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left">Nombre</th>
                      <th className="px-4 py-2 text-left">Cédula</th>
                      <th className="px-4 py-2 text-left">Correo</th>
                      <th className="px-4 py-2 text-left">Modalidad</th>
                      <th className="px-4 py-2 text-left">Convocatoria</th>
                      <th className="px-4 py-2 text-left">Programa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-2">{row.nombre}</td>
                        <td className="px-4 py-2 font-mono text-xs">{row.cedula}</td>
                        <td className="px-4 py-2 text-xs text-gray-600">{row.correo}</td>
                        <td className="px-4 py-2 text-xs">{row.modalidad || '-'}</td>
                        <td className="px-4 py-2 text-xs">{row.convocatoria_nombre || row.convocatoria_id || '-'}</td>
                        <td className="px-4 py-2 text-xs">{row.programa_academico || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded">{error}</div>}

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setPaso('upload')
                  setFile(null)
                  setPreview([])
                  setLoteInfo(null)
                  setTitulo('')
                  setDescripcion('')
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Volver
              </button>
              <button
                onClick={validateAndImport}
                disabled={loading || !titulo.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? 'Procesando...' : 'Importar'}
              </button>
            </div>
          </div>
        )}

        {paso === 'validacion' && (
          <div className="space-y-4 text-center py-12">
            <div className="text-3xl mb-4">⏳</div>
            <h3 className="text-lg font-semibold text-gray-900">Procesando importación...</h3>
            <p className="text-gray-600">Validando y cargando {loteInfo?.cantidad_registros} beneficiarios</p>
          </div>
        )}

        {paso === 'exito' && validacionResult && (
          <div className="space-y-4">
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-lg font-semibold text-gray-900">Importación completada</h3>
            </div>

            <div className="bg-green-50 border border-green-200 rounded p-4 space-y-2">
              <p className="text-green-900 font-medium">Resumen de carga:</p>
              <ul className="text-sm text-green-800 space-y-1">
                <li>✓ Beneficiarios insertados: {validacionResult.beneficiarios_insertados}</li>
                <li>✓ Documentos cargados: {validacionResult.documentos_insertados || 0}</li>
                <li>ID del lote: {validacionResult.lote_id}</li>
              </ul>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setPaso('upload')
                  setFile(null)
                  setPreview([])
                  setLoteInfo(null)
                  setTitulo('')
                  setDescripcion('')
                  setValidacionResult(null)
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Importar otra
              </button>
              <button
                onClick={() => {
                  window.location.href = '/admin/importar-pagos?lote=' + validacionResult.lote_id
                }}
                className="flex-1 px-4 py-2 border border-emerald-300 text-emerald-700 rounded-md hover:bg-emerald-50"
              >
                Cargar pagos
              </button>
              <button
                onClick={() => {
                  window.location.href = '/admin/activacion?lote=' + validacionResult.lote_id
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Activar ahora
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminImportHistoricos
