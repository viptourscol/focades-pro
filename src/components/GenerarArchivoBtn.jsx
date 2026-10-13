import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Download, Upload, Loader, AlertCircle, CheckCircle } from 'lucide-react'

const GenerarArchivoBtn = ({ documentoId, tipoDocumento, userRole, onGenerado }) => {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(null)
  const [archivoUrl, setArchivoUrl] = useState(null)
  const [mostrarUpload, setMostrarUpload] = useState(false)

  // Validar permisos por tipo
  const puedGenerar = {
    terceros: ['admin_educacion'],
    rp: ['admin_educacion', 'admin_presupuesto'],
    op: ['admin_contabilidad'],
    contabilidad: ['admin_contabilidad'],
    siafe: ['admin_pagos']
  }

  const tienePermiso = puedGenerar[tipoDocumento]?.includes(userRole) || false

  const generarArchivo = async (accion) => {
    if (!tienePermiso && accion !== 'importar-siafe') {
      setError(`No tienes permiso para ${accion}`)
      return
    }

    try {
      setCargando(true)
      setError(null)
      setExito(null)

      const {
        data: { session },
        error: authError
      } = await supabase.auth.getSession()
      if (authError || !session) {
        setError('No autorizado')
        return
      }

      let endpoint = ''
      let body = { documento_id: documentoId }

      if (accion === 'generar-terceros') {
        endpoint = 'generar-terceros'
      } else if (accion === 'generar-rp') {
        endpoint = 'generar-rp'
      } else if (accion === 'generar-op') {
        endpoint = 'generar-op'
      } else if (accion === 'generar-contabilidad') {
        endpoint = 'generar-contabilidad'
      }

      const { data, error: funcError } = await supabase.functions.invoke(endpoint, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body
      })

      if (funcError) {
        setError(funcError.message)
      } else if (data.success && data.archivo_url) {
        setArchivoUrl(data.archivo_url)
        setExito(`Archivo generado exitosamente. Filas: ${data.filas_generadas}`)
        if (onGenerado) onGenerado(data)
      } else if (data.success) {
        setExito(`Generación completada. Filas: ${data.filas_generadas}`)
        if (onGenerado) onGenerado(data)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  const manejarSubidaArchivo = async (event) => {
    const archivo = event.target.files?.[0]
    if (!archivo) return

    try {
      setCargando(true)
      setError(null)
      setExito(null)

      const contenido = await archivo.text()

      const {
        data: { session },
        error: authError
      } = await supabase.auth.getSession()
      if (authError || !session) {
        setError('No autorizado')
        return
      }

      const { data, error: importError } = await supabase.functions.invoke('importar-siafe', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          documento_id: documentoId,
          contenido_archivo: contenido
        }
      })

      if (importError) {
        setError(importError.message)
      } else if (data.success) {
        setExito(`Importación completada. Registros: ${data.registros_insertados}/${data.registros_encontrados}`)
        if (onGenerado) onGenerado(data)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
      setMostrarUpload(false)
    }
  }

  const botones = {
    terceros: {
      accion: 'generar-terceros',
      label: 'Generar TERCEROS',
      icon: Download,
      descripcion: 'Exportar beneficiarios a CSV'
    },
    rp: {
      accion: 'generar-rp',
      label: 'Generar RP',
      icon: Download,
      descripcion: 'Exportar presupuestos a CSV'
    },
    op: {
      accion: 'generar-op',
      label: 'Generar OP',
      icon: Download,
      descripcion: 'Auto-generar órdenes de pago'
    },
    contabilidad: {
      accion: 'generar-contabilidad',
      label: 'Generar CONTABILIDAD',
      icon: Download,
      descripcion: 'Auto-generar asientos contables'
    },
    siafe: {
      accion: 'importar-siafe',
      label: 'Importar SIAFE',
      icon: Upload,
      descripcion: 'Importar datos del banco'
    }
  }

  const config = botones[tipoDocumento]
  if (!config) return null

  const IconComponent = config.icon

  if (tipoDocumento === 'siafe') {
    return (
      <div className="space-y-3">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
            <AlertCircle size={18} className="text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {exito && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex gap-2">
            <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-700">{exito}</p>
          </div>
        )}

        <button
          onClick={() => setMostrarUpload(!mostrarUpload)}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium text-sm disabled:opacity-50"
          disabled={cargando}
        >
          {cargando ? <Loader size={18} className="animate-spin" /> : <IconComponent size={18} />}
          {cargando ? 'Importando...' : config.label}
        </button>

        {mostrarUpload && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <label className="flex flex-col gap-2 cursor-pointer">
              <span className="text-sm font-medium text-gray-900">Selecciona archivo CSV</span>
              <input
                type="file"
                accept=".csv"
                onChange={manejarSubidaArchivo}
                disabled={cargando}
                className="text-sm text-gray-600 file:mr-2 file:px-3 file:py-1 file:bg-blue-100 file:text-blue-700 file:rounded file:border-0 file:cursor-pointer hover:file:bg-blue-200"
              />
              <span className="text-xs text-gray-600">CSV con columnas: NO_EGRESO, IDENTIFICACION, VALOR_EGRESO, etc.</span>
            </label>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
          <AlertCircle size={18} className="text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {exito && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex gap-2">
          <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-700">{exito}</p>
        </div>
      )}

      <button
        onClick={() => generarArchivo(config.accion)}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-medium text-sm disabled:opacity-50"
        disabled={cargando || !tienePermiso}
      >
        {cargando ? <Loader size={18} className="animate-spin" /> : <IconComponent size={18} />}
        {cargando ? 'Generando...' : config.label}
      </button>

      <p className="text-xs text-gray-600 text-center">{config.descripcion}</p>

      {archivoUrl && (
        <a
          href={archivoUrl}
          download
          className="w-full block text-center px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition font-medium text-sm"
        >
          Descargar CSV
        </a>
      )}

      {!tienePermiso && tipoDocumento !== 'siafe' && (
        <p className="text-xs text-red-600">No tienes permiso para generar este documento</p>
      )}
    </div>
  )
}

export default GenerarArchivoBtn
