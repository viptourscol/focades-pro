import ExcelJS from 'exceljs'

export const COLUMNAS_CONTABILIZACION = [
  ['tipo', 'TIPO'],
  ['no_obligacion', 'NO. OBLIGACIÓN'],
  ['subconsecutivo', 'SUBCONSECUTIVO'],
  ['clase', 'CLASE'],
  ['codigo_entidad', 'CÓDIGO ENTIDAD'],
  ['rubro_presupuestal', 'RUBRO PRESUPUESTAL'],
  ['fuente_financiacion', 'FUENTE DE FINANCIACIÓN'],
  ['cuenta_debito', 'CUENTA DÉBITO'],
  ['cuenta_credito', 'CUENTA CRÉDITO'],
]

export const crearExcelContabilizacionObligaciones = async (filas, datos) => {
  if (!filas.length || datos.tipo !== 'OP' || !datos.cuenta_debito?.trim() || !datos.cuenta_credito?.trim()) {
    throw new Error('Selecciona el tipo OP, indica las cuentas débito y crédito y revisa las filas de origen.')
  }
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet('ContabilizacionObligaciones')
  hoja.addRow(COLUMNAS_CONTABILIZACION.map(([, titulo]) => titulo))
  for (const fila of filas) {
    if ((!/^[0-9]{1,10}$/.test(fila.no_obligacion)
        && !/^[A-Za-z0-9]+([.-][A-Za-z0-9]+)*[.-][0-9]{1,10}$/.test(fila.no_obligacion))
      || fila.no_obligacion.length > 30
      || !/^[0-9]{1,4}$/.test(fila.subconsecutivo)
      || !/^[0-9]{1,4}$/.test(fila.codigo_entidad)
      || !fila.rubro_presupuestal || fila.rubro_presupuestal.length > 60
      || !/^[0-9]{1,4}$/.test(fila.fuente_financiacion)) {
      throw new Error(`La fila de obligación ${fila.no_obligacion || '(sin número)'} contiene datos incompletos o inválidos.`)
    }
    hoja.addRow([
      datos.tipo,
      fila.no_obligacion,
      fila.subconsecutivo,
      fila.clase || '',
      fila.codigo_entidad,
      fila.rubro_presupuestal,
      fila.fuente_financiacion,
      datos.cuenta_debito.trim(),
      datos.cuenta_credito.trim(),
    ])
  }
  hoja.columns.forEach((columna, indice) => {
    columna.width = indice === 5 ? 34 : 24
    columna.numFmt = '@'
  })
  hoja.views = [{ state: 'frozen', ySplit: 1 }]
  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } }
  return libro.xlsx.writeBuffer()
}

export const descargarExcelContabilizacionObligaciones = async (filas, datos) => {
  const buffer = await crearExcelContabilizacionObligaciones(filas, datos)
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = 'CargueContabilizacionObligaciones.xlsx'
  enlace.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
