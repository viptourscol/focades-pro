import ExcelJS from 'exceljs'
import { CAMPOS_RP, validacionesDocumentoRP } from './rpCargue.js'

export const crearExcelRP = async (filas) => {
  const errores = validacionesDocumentoRP(filas)
  if (errores.length) throw new Error(errores.map((e) => `${e.fila_numero ? `Fila ${e.fila_numero}: ` : ''}${e.mensaje_error}`).join('\n'))
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet('RP')
  hoja.addRow(CAMPOS_RP.map((c) => c.label))
  for (const fila of filas) hoja.addRow(CAMPOS_RP.map((c) => {
    if (!c.importe) return fila[c.name]
    const [entero, decimal = ''] = fila[c.name].split('.')
    return `${entero}.${decimal.padEnd(2, '0')}`
  }))
  hoja.columns.forEach((c, i) => { c.width = i === 2 ? 55 : 24; c.numFmt = '@' })
  hoja.views = [{ state: 'frozen', ySplit: 1 }]
  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } }
  return libro.xlsx.writeBuffer()
}

export const descargarExcelRP = async (filas, nombreArchivo) => {
  const buffer = await crearExcelRP(filas)
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  enlace.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
