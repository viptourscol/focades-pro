import ExcelJS from 'exceljs'
import { fechaFilaDesdeISO } from './rpCargue.js'

export const COLUMNAS_OP = [
  ['no_op', 'No. OP'], ['subconsecutivo', 'SubConsecutivo'], ['fecha', 'Fecha'],
  ['descripcion', 'Descripción'], ['no_rp', 'No. RP'], ['subconsecutivo_rp', 'SubConsecutivo RP'],
  ['codigo_entidad', 'Código de Entidad'], ['rubro_presupuestal', 'Rubro Presupuestal'],
  ['fuente_financiacion', 'Fuente de Financiación'], ['valor', 'Valor'],
  ['estado', 'Estado'], ['clase', 'Clase'],
]

export const numeroOP = (inicio, indice) => {
  if (!/^[0-9]{1,10}$/.test(inicio) || Number(inicio) + indice > 9999999999) return ''
  return String(Number(inicio) + indice).padStart(inicio.length, '0')
}

export const crearExcelOP = async (origen, datos) => {
  const fecha = fechaFilaDesdeISO(datos.fecha)
  if (!fecha || !origen.length || !numeroOP(datos.no_op, origen.length - 1)) {
    throw new Error('Revisa la fecha y el rango de números de OP.')
  }
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet('CargueInformacionOP')
  hoja.addRow(COLUMNAS_OP.map(([, titulo]) => titulo))
  origen.forEach((rp, indice) => {
    const fila = {
      ...rp,
      no_op: numeroOP(datos.no_op, indice), subconsecutivo: datos.subconsecutivo, fecha,
      estado: datos.opcionales[rp.id]?.estado || '', clase: datos.opcionales[rp.id]?.clase || '',
    }
    const [entero, decimal = ''] = rp.valor.split('.')
    fila.valor = `${entero}.${decimal.padEnd(2, '0')}`
    hoja.addRow(COLUMNAS_OP.map(([campo]) => fila[campo]))
  })
  hoja.columns.forEach((columna, indice) => { columna.width = indice === 3 ? 55 : 24; columna.numFmt = '@' })
  hoja.views = [{ state: 'frozen', ySplit: 1 }]
  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } }
  return libro.xlsx.writeBuffer()
}

export const descargarExcelOP = async (origen, datos) => {
  const buffer = await crearExcelOP(origen, datos)
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = 'CargueInformacionOP.xlsx'
  enlace.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
