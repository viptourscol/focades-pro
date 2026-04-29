import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'
import ImportStepper from './ImportStepper'
import LoteInfoBanner from './LoteInfoBanner'

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
  // Títulos específicos del formulario de convocatoria
  { test: /^bachiller acad[eé]mico$/i, value: 'Bachiller Académico' },
  { test: /^bachiller t[eé]cnico$/i, value: 'Bachiller Técnico' },
  { test: /^bachiller comercial$/i, value: 'Bachiller Comercial' },
  { test: /^bachiller pedag[oó]gico$/i, value: 'Bachiller Pedagógico' },
  { test: /^normalista superior$/i, value: 'Normalista Superior' },
  { test: /^bachiller rural$/i, value: 'Bachiller Rural' },
  { test: /^bachiller con profundizaci[oó]n$/i, value: 'Bachiller con Profundización' },
  // Patrones de compatibilidad
  { test: /normalista/i, value: 'Normalista Superior' },
  { test: /^bach/i, value: 'Bachiller Académico' },
  { test: /^tecnic/i, value: 'Bachiller Técnico' },
  { test: /^tecnol/i, value: 'Bachiller Técnico' },
  { test: /^prof/i, value: 'Bachiller Académico' },
  { test: /especial/i, value: 'Bachiller Académico' },
  { test: /magist|maestr/i, value: 'Bachiller Académico' },
  { test: /doctor/i, value: 'Bachiller Académico' }
]
const ESTADO_MAP = [
  { test: /^activ/i, value: 'activo' },
  { test: /^suspen/i, value: 'suspendido' },
  { test: /^retir/i, value: 'retirado' },
  { test: /^condon/i, value: 'condonado' },
  { test: /^egres/i, value: 'egresado' }
]
const TIPO_CUENTA_MAP = [
  { test: /ahorr/i, value: 'Ahorros' },
  { test: /corr/i, value: 'Corriente' }
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

const validateRows = (rows) => {
  const errors = []
  const warnings = []
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  rows.forEach((row, idx) => {
    const n = idx + 2
    if (!row.nombre) errors.push({ fila: n, campo: 'nombre', msg: 'Nombre obligatorio' })
    if (!row.cedula) errors.push({ fila: n, campo: 'cedula', msg: 'Cédula obligatoria' })
    if (!row.correo) {
      warnings.push({ fila: n, campo: 'correo', msg: 'Sin correo — no podrá activar portal hasta agregarlo' })
    } else if (!EMAIL_RE.test(row.correo)) {
      warnings.push({ fila: n, campo: 'correo', msg: `Correo con formato inválido: ${row.correo} — verificar antes de activar` })
    }
    if (!row.modalidad) warnings.push({ fila: n, campo: 'modalidad', msg: 'Sin modalidad' })
    if (!row.programa_academico) warnings.push({ fila: n, campo: 'programa_academico', msg: 'Sin programa académico' })
    if (!row.convocatoria_nombre && !row.convocatoria_id) warnings.push({ fila: n, campo: 'convocatoria', msg: 'Sin convocatoria' })
    if (!row.nivel_formacion) warnings.push({ fila: n, campo: 'nivel_formacion', msg: 'Sin nivel de formación' })
  })

  return { errors, warnings, valid: errors.length === 0 }
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
        .filter((row) => row.nombre && row.cedula)
        .map((row) => ({
          nombre: String(row.nombre || '').trim(),
          cedula: String(row.cedula || '').trim().toUpperCase(),
          correo: row.correo ? String(row.correo).trim().toLowerCase() : null,
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
          observaciones: normalizeText(row.observaciones),
          estado_beneficiario: normalizeByMap(row.estado_beneficiario, ESTADO_MAP) || 'activo',
          cuenta_bancaria: normalizeText(row.cuenta_bancaria),
          banco: normalizeText(row.banco),
          tipo_cuenta: normalizeByMap(row.tipo_cuenta, TIPO_CUENTA_MAP)
        }))

      const validacion = validateRows(rows.filter((row) => row.nombre && row.cedula))

      setPreview(beneficiarios.slice(0, 10))
      setValidacionResult(validacion)
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
      const { data, error: invokeError } = await supabase.functions.invoke(
        'import-historicos-lote',
        {
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
    <div className="space-y-4">
      <ImportStepper currentStep={1} loteId={loteInfo?.lote_id || (validacionResult?.lote_id)} />
      {loteInfo?.lote_id && <LoteInfoBanner loteId={loteInfo.lote_id} />}

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

              {validacionResult && (
                <div className="space-y-2">
                  {validacionResult.errors.length > 0 && (
                    <details open className="bg-red-50 border border-red-200 rounded p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-red-800">
                        🔴 {validacionResult.errors.length} error(es) — bloquean la importación
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {validacionResult.errors.slice(0, 20).map((e, idx) => (
                          <li key={idx} className="text-xs text-red-700">Fila {e.fila} · <span className="font-mono">{e.campo}</span>: {e.msg}</li>
                        ))}
                        {validacionResult.errors.length > 20 && (
                          <li className="text-xs text-red-500">... y {validacionResult.errors.length - 20} más</li>
                        )}
                      </ul>
                    </details>
                  )}
                  {validacionResult.warnings.length > 0 && (
                    <details className="bg-amber-50 border border-amber-200 rounded p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-amber-800">
                        🟡 {validacionResult.warnings.length} advertencia(s) — se puede importar igual
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {validacionResult.warnings.slice(0, 20).map((w, idx) => (
                          <li key={idx} className="text-xs text-amber-700">Fila {w.fila} · <span className="font-mono">{w.campo}</span>: {w.msg}</li>
                        ))}
                        {validacionResult.warnings.length > 20 && (
                          <li className="text-xs text-amber-500">... y {validacionResult.warnings.length - 20} más</li>
                        )}
                      </ul>
                    </details>
                  )}
                  {validacionResult.valid && validacionResult.warnings.length === 0 && (
                    <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
                      ✅ Sin errores ni advertencias — datos listos para importar
                    </div>
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border border-gray-200 rounded">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Nombre</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Cédula</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Correo</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Modalidad</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Convocatoria</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Programa</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Estado</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Banco</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Tipo Cuenta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t border-gray-200 hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap">{row.nombre}</td>
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{row.cedula}</td>
                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{row.correo}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{row.modalidad || '-'}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{row.convocatoria_nombre || row.convocatoria_id || '-'}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{row.programa_academico || '-'}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                            row.estado_beneficiario === 'activo' ? 'bg-green-100 text-green-800' :
                            row.estado_beneficiario === 'suspendido' ? 'bg-amber-100 text-amber-800' :
                            row.estado_beneficiario === 'condonado' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-700'
                          }`}>{row.estado_beneficiario || 'activo'}</span>
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{row.banco || '-'}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{row.tipo_cuenta || '-'}</td>
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
                disabled={loading || !titulo.trim() || (validacionResult && !validacionResult.valid)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? 'Procesando...' : validacionResult && !validacionResult.valid ? 'Corrige los errores primero' : 'Importar'}
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
                {validacionResult.omitidos?.length > 0 && (
                  <li className="text-amber-700">⚠ Omitidos (ya existían): {validacionResult.omitidos.length}</li>
                )}
                <li>✓ Documentos cargados: {validacionResult.documentos_insertados || 0}</li>
                <li>ID del lote: {validacionResult.lote_id}</li>
              </ul>
            </div>

            {validacionResult.omitidos?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h4 className="font-semibold text-amber-800 text-sm mb-3">
                  ⚠ {validacionResult.omitidos.length} beneficiario(s) no importados — ya existían en la base de datos
                </h4>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-amber-100">
                      <tr>
                        <th className="text-left px-3 py-1.5 text-amber-800 font-medium">Nombre</th>
                        <th className="text-left px-3 py-1.5 text-amber-800 font-medium">Cédula</th>
                        <th className="text-left px-3 py-1.5 text-amber-800 font-medium">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validacionResult.omitidos.map((o, i) => (
                        <tr key={i} className="border-t border-amber-100 hover:bg-amber-100/50">
                          <td className="px-3 py-1.5 text-amber-900">{o.nombre}</td>
                          <td className="px-3 py-1.5 font-mono text-amber-900">{o.cedula}</td>
                          <td className="px-3 py-1.5 text-amber-700">{o.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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
                  window.location.href = '/admin/historicos/documentos?lote=' + validacionResult.lote_id
                }}
                className="flex-1 px-4 py-2 border border-indigo-300 text-indigo-700 rounded-md hover:bg-indigo-50"
              >
                Subir documentos
              </button>
              <button
                onClick={() => {
                  window.location.href = '/admin/historicos/pagos?lote=' + validacionResult.lote_id
                }}
                className="flex-1 px-4 py-2 border border-emerald-300 text-emerald-700 rounded-md hover:bg-emerald-50"
              >
                Cargar pagos
              </button>
              <button
                onClick={() => {
                  window.location.href = '/admin/historicos/activacion?lote=' + validacionResult.lote_id
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
