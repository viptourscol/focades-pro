import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { getSafeSession } from '../lib/supabase'
import ImportStepper from '../components/ImportStepper'
import LoteInfoBanner from '../components/LoteInfoBanner'

const ESTADOS_VALIDOS = new Set(['programado', 'efectuado', 'pendiente', 'anulado'])

const parseDate = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return null

  const normalized = raw.replace(/\//g, '-')
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().split('T')[0]
}

const AdminImportPagosHistoricos = () => {
  const [searchParams] = useSearchParams()
  const loteFromUrl = String(searchParams.get('lote') || '').trim()

  const [preview, setPreview] = useState([])
  const [loading, setLoading] = useState(false)
  const [loteId, setLoteId] = useState(loteFromUrl)
  const [error, setError] = useState(null)
  const [paso, setPaso] = useState('upload')
  const [cargueInfo, setCargueInfo] = useState(null)
  const [resultado, setResultado] = useState(null)

  const processFile = async (newFile) => {
    setLoading(true)
    setError(null)

    try {
      const buffer = await newFile.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(firstSheet, {
        defval: '',
        raw: false
      })

      if (!rows || rows.length === 0) {
        setError('No se encontraron filas en la plantilla.')
        return
      }

      const pagos = rows
        .filter((row) => row.n_documento && row.concepto && row.monto)
        .map((row) => {
          const estadoNormalizado = String(row.estado || 'efectuado').trim().toLowerCase()
          const estado = ESTADOS_VALIDOS.has(estadoNormalizado) ? estadoNormalizado : 'efectuado'

          return {
            n_documento: String(row.n_documento || '').trim().toUpperCase(),
            concepto: String(row.concepto || '').trim(),
            periodo: String(row.periodo || '').trim() || null,
            referencia: String(row.referencia || '').trim() || null,
            monto: Number(String(row.monto || '0').replace(',', '.')) || 0,
            fecha_programada: parseDate(row.fecha_programada),
            fecha_efectiva: parseDate(row.fecha_efectiva),
            estado,
            observacion: String(row.observacion || '').trim() || null
          }
        })
        .filter((p) => p.n_documento && p.concepto && p.monto > 0)

      if (pagos.length === 0) {
        setError('No se encontraron pagos válidos. Revisa columnas obligatorias: n_documento, concepto, monto.')
        return
      }

      setPreview(pagos.slice(0, 12))
      setCargueInfo({
        archivo_nombre: newFile.name,
        archivo_size_bytes: newFile.size,
        cantidad_registros: pagos.length,
        pagos
      })
      setPaso('preview')
    } catch (err) {
      setError(`Error procesando archivo: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleFileDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()

    const files = e.dataTransfer?.files || e.target?.files
    if (files && files[0]) {
      processFile(files[0])
    }
  }, [])

  const importarPagos = async () => {
    if (!cargueInfo?.pagos?.length) {
      setError('No hay pagos para importar.')
      return
    }

    setLoading(true)
    setError(null)
    setPaso('procesando')

    try {
      const { session } = await getSafeSession()
      const accessToken = String(session?.access_token || '').trim()

      if (!accessToken) {
        setError('Tu sesión de administrador expiró. Inicia sesión nuevamente para importar pagos.')
        setPaso('preview')
        return
      }

      const payload = {
        lote_id: loteId.trim() || null,
        archivo_nombre: cargueInfo.archivo_nombre,
        archivo_size_bytes: cargueInfo.archivo_size_bytes,
        pagos: cargueInfo.pagos
      }

      const { data, error: invokeError } = await supabase.functions.invoke('import-historicos-pagos', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: payload
      })

      if (invokeError) {
        setError(invokeError.message || 'No se pudo ejecutar la importación de pagos.')
        setPaso('preview')
        return
      }

      if (!data?.exito) {
        setError(data?.error || 'La carga de pagos no pudo completarse.')
        setPaso('preview')
        return
      }

      setResultado(data)
      setPaso('exito')
    } catch (err) {
      setError(err.message || 'Error inesperado durante la carga de pagos.')
      setPaso('preview')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <ImportStepper currentStep={3} loteId={loteId || undefined} />
      {loteId && <LoteInfoBanner loteId={loteId} />}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        {paso === 'upload' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Importar Pagos Históricos</h3>
            <p className="text-sm text-gray-600">
              Carga pagos en lote para beneficiarios históricos. Campos obligatorios: n_documento, concepto, monto.
            </p>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-900">Plantilla de pagos históricos</p>
                <p className="text-xs text-emerald-700">Descarga y diligencia el formato en Excel antes de cargar.</p>
              </div>
              <a
                href="/plantillas/plantilla-pagos-historicos.xls"
                download
                className="inline-flex items-center justify-center px-4 py-2 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700"
              >
                Descargar plantilla Excel (.xls)
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lote (opcional)</label>
                <input
                  type="text"
                  value={loteId}
                  onChange={(e) => setLoteId(e.target.value)}
                  placeholder="UUID del lote de beneficiarios"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-xs text-gray-500 mt-1">Si lo defines, solo se cargarán pagos para beneficiarios de ese lote.</p>
              </div>
            </div>

            <div
              onDrop={handleFileDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-emerald-400 hover:bg-emerald-50 transition cursor-pointer"
              onClick={() => document.getElementById('file-input-pagos')?.click()}
            >
              <div className="text-gray-600">
                <p className="text-base font-medium">Arrastra tu archivo de pagos aquí</p>
                <p className="text-sm text-gray-500 mt-1">o haz clic para seleccionar</p>
              </div>
              <input
                id="file-input-pagos"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => e.target.files && processFile(e.target.files[0])}
                className="hidden"
              />
            </div>

            {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded">{error}</div>}
          </div>
        )}

        {paso === 'preview' && cargueInfo && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Previsualización de pagos</h3>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-gray-600 text-sm">Registros válidos</p>
                <p className="text-2xl font-bold text-gray-900">{cargueInfo.cantidad_registros}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-gray-600 text-sm">Archivo</p>
                <p className="text-sm font-medium text-gray-900 truncate">{cargueInfo.archivo_nombre}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-gray-600 text-sm">Lote filtro</p>
                <p className="text-sm font-medium text-gray-900 truncate">{loteId || 'Sin filtro'}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-gray-200 rounded">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Documento</th>
                    <th className="px-3 py-2 text-left">Concepto</th>
                    <th className="px-3 py-2 text-left">Periodo</th>
                    <th className="px-3 py-2 text-left">Monto</th>
                    <th className="px-3 py-2 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, idx) => (
                    <tr key={idx} className="border-t border-gray-200 hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs">{row.n_documento}</td>
                      <td className="px-3 py-2">{row.concepto}</td>
                      <td className="px-3 py-2">{row.periodo || '-'}</td>
                      <td className="px-3 py-2">{new Intl.NumberFormat('es-CO').format(row.monto)}</td>
                      <td className="px-3 py-2">{row.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded">{error}</div>}

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setPaso('upload')
                  setPreview([])
                  setCargueInfo(null)
                  setResultado(null)
                  setError(null)
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Volver
              </button>
              <button
                onClick={importarPagos}
                disabled={loading}
                className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? 'Importando...' : 'Importar pagos'}
              </button>
            </div>
          </div>
        )}

        {paso === 'procesando' && (
          <div className="space-y-4 text-center py-12">
            <div className="text-3xl mb-4">⏳</div>
            <h3 className="text-lg font-semibold text-gray-900">Procesando pagos...</h3>
            <p className="text-gray-600">Registrando pagos históricos en el sistema.</p>
          </div>
        )}

        {paso === 'exito' && resultado && (
          <div className="space-y-4">
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-lg font-semibold text-gray-900">Importación de pagos completada</h3>
            </div>

            <div className="bg-green-50 border border-green-200 rounded p-4 space-y-2">
              <p className="text-green-900 font-medium">Resumen:</p>
              <ul className="text-sm text-green-800 space-y-1">
                <li>✓ Registros recibidos: {resultado.total_registros}</li>
                <li>✓ Pagos insertados: {resultado.insertados}</li>
                <li>⚠️ Rechazados: {resultado.rechazados}</li>
                <li>⚠️ Beneficiarios no encontrados: {resultado.no_encontrados}</li>
              </ul>
            </div>

            {!!resultado.detalles?.length && (
              <details className="bg-amber-50 border border-amber-200 rounded p-3">
                <summary className="cursor-pointer text-sm font-medium text-amber-900">Ver detalles de rechazados</summary>
                <ul className="mt-2 text-xs text-amber-800 space-y-1">
                  {resultado.detalles.slice(0, 20).map((item, idx) => (
                    <li key={idx}>• {item}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setPaso('upload')
                  setPreview([])
                  setCargueInfo(null)
                  setResultado(null)
                  setError(null)
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cargar otro archivo
              </button>
              <a
                href="/admin/beneficiarios"
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-center"
              >
                Ver beneficiarios
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminImportPagosHistoricos
