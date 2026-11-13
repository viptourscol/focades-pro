import { CAMPOS_TERCEROS, filaExportacionTercero, validacionesDocumentoTerceros } from './tercerosCargue.js'

export const crearExcelTerceros = async (filas) => {
  if (!filas.length) throw new Error('El documento no tiene terceros para exportar.')
  const errores = validacionesDocumentoTerceros(filas).map((error) => `Fila ${error.fila_numero}: ${error.mensaje_error}`)
  if (errores.length) throw new Error(errores.join('\n'))
  const { default: ExcelJS } = await import('exceljs')
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet('Terceros')
  hoja.addRow(CAMPOS_TERCEROS.map((campo) => campo.label))
  for (const fila of filas) hoja.addRow(filaExportacionTercero(fila))
  hoja.views = [{ state: 'frozen', ySplit: 1 }]
  hoja.columns.forEach((columna, indice) => {
    columna.width = ['email', 'direccion', 'banco'].includes(CAMPOS_TERCEROS[indice].name) ? 35 : 23
    columna.numFmt = '@'
  })
  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } }
  return libro.xlsx.writeBuffer()
}

export const descargarExcelTerceros = async (filas, nombreArchivo) => {
  const buffer = await crearExcelTerceros(filas)
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  enlace.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
