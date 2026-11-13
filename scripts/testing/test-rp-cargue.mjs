import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { CAMPOS_RP, nuevaFilaRP, validarFilaRP, validacionesDocumentoRP, vistaPreviaNumeracionRP, fechaValidaRP, centavosRP } from '../../src/lib/rpCargue.js'
import { crearExcelRP, descargarExcelRP } from '../../src/lib/exportarRP.js'

const completa = () => ({
  ...nuevaFilaRP({ origen: 'tercero:prueba', identificacion: '000123456', nombre: 'Persona de prueba', modalidad: 'SUEÑOS' }),
  id: 'fila-1', no_rp: '000010', subconsecutivo: '0001', descripcion: 'Registro de prueba',
  fecha: '13112026', no_cdp: '000020', subconsecutivo_cdp: '0001', fuente_financiacion: '0004',
  valor: '9999999999999.99', liquidacion: '9999999999999.99', valor_confirmado: true, tercero_confirmado: true
})

test('RP tiene exactamente las 16 columnas en el orden solicitado', () => {
  assert.deepEqual(CAMPOS_RP.map((c) => c.label), ['No. RP', 'SubConsecutivo', 'Descripción', 'Fecha', 'No. CDP', 'SubConsecutivo CDP',
    'Tercero Presupuestal', 'Origen Legal Apropiación', 'Proyecto', 'Entidad', 'Rubro Presupuestal', 'Fuente de Financiación', 'Valor', 'Liquidación', 'Contrato', 'Firma Mecánica'])
  assert.deepEqual(validarFilaRP(completa()), {})
})

test('Educación confirma importes, no requiere campos pendientes de Presupuesto para enviar', () => {
  const fila = { ...nuevaFilaRP({ origen: 'persona:prueba', identificacion: '123', nombre: 'Prueba' }), valor: '1500000', liquidacion: '1500000', valor_confirmado: true }
  assert.deepEqual(validarFilaRP(fila, 'educacion'), {})
  assert.ok(validarFilaRP(fila).no_rp)
  assert.ok(validarFilaRP(fila).tercero_confirmado)
  assert.ok(validarFilaRP({ ...fila, valor_confirmado: false }, 'educacion').valor_confirmado)
  assert.ok(validacionesDocumentoRP([]).length)
  assert.ok(validacionesDocumentoRP([completa(), completa()]).some((e) => e.tipo_error === 'duplicado'))
})

test('Formatos, máximos exactos y fechas reales DDMMYYYY', () => {
  const fila = completa()
  for (const [campo, longitud] of [['no_rp', 10], ['no_cdp', 10], ['subconsecutivo', 4], ['subconsecutivo_cdp', 4], ['fuente_financiacion', 4], ['tercero_presupuestal', 15]]) {
    assert.equal(validarFilaRP({ ...fila, [campo]: '9'.repeat(longitud) })[campo], undefined)
    assert.ok(validarFilaRP({ ...fila, [campo]: '9'.repeat(longitud + 1) })[campo])
    assert.ok(validarFilaRP({ ...fila, [campo]: '1e3' })[campo])
  }
  assert.equal(validarFilaRP({ ...fila, descripcion: 'á'.repeat(500) }).descripcion, undefined)
  assert.ok(validarFilaRP({ ...fila, descripcion: 'a'.repeat(501) }).descripcion)
  assert.ok(fechaValidaRP('29022024'))
  for (const fecha of ['29022025', '31042026', '00012026', '01002026', '01010000', '20261113', '131126']) assert.equal(fechaValidaRP(fecha), false, fecha)
  assert.ok(validarFilaRP({ ...fila, proyecto: '842' }).proyecto)
})

test('Importes exactos sin flotantes, sin negativos, sin exceso ni notación científica', () => {
  assert.equal(centavosRP('9999999999999.99'), 999999999999999n)
  for (const valor of ['10000000000000.00', '0', '-1', '1e6', '123,45', '1.001', 'NaN']) {
    assert.ok(validarFilaRP({ ...completa(), valor, liquidacion: valor }).valor, valor)
  }
  assert.ok(validarFilaRP({ ...completa(), liquidacion: '1' }).liquidacion)
  assert.equal(validarFilaRP({ ...completa(), valor: '1.0', liquidacion: '1.00' }).liquidacion, undefined)
  assert.ok(validarFilaRP({ ...completa(), valor: 10, liquidacion: 10 }).valor)
})

test('Numeración común o consecutiva independiente, orden estable, conserva ceros y valida desbordes', () => {
  const filas = [completa(), { ...completa(), id: 'fila-2', nombre: 'Otra', no_cdp: '777' }]
  const ids = ['fila-2', 'fila-1']
  assert.deepEqual(vistaPreviaNumeracionRP(filas, ids, 'no_rp', 'consecutivo', '0099').map((p) => p.nuevo), ['0099', '0100'])
  assert.deepEqual(vistaPreviaNumeracionRP(filas, ids, 'no_cdp', 'comun', '0077').map((p) => p.nuevo), ['0077', '0077'])
  assert.equal(filas[1].no_cdp, '777')
  assert.throws(() => vistaPreviaNumeracionRP(filas, ids, 'no_rp', 'consecutivo', '9999999999'), /10 dígitos/)
  assert.throws(() => vistaPreviaNumeracionRP(filas, [], 'no_rp', 'comun', '1'), /Selecciona/)
  assert.throws(() => vistaPreviaNumeracionRP(filas, ids, 'valor', 'comun', '1'), /inválida/)
  assert.throws(() => vistaPreviaNumeracionRP(filas, ids, 'no_rp', 'comun', '1e5'), /10 dígitos/)
})

test('Excel real con 16 columnas, ceros iniciales, fecha, precisión monetaria y texto sin fórmulas', async () => {
  const fila = { ...completa(), descripcion: '=HYPERLINK("https://example.test")' }
  const buffer = await crearExcelRP([fila])
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(buffer)
  const hoja = libro.getWorksheet('RP')
  assert.equal(hoja.columnCount, 16)
  assert.equal(hoja.rowCount, 2)
  assert.deepEqual(hoja.getRow(1).values.slice(1), CAMPOS_RP.map((c) => c.label))
  assert.equal(hoja.getCell('A2').value, '000010')
  assert.equal(hoja.getCell('D2').value, '13112026')
  assert.equal(hoja.getCell('G2').value, '000123456')
  assert.equal(hoja.getCell('M2').value, '9999999999999.99')
  assert.equal(hoja.getCell('C2').type, ExcelJS.ValueType.String)
  const enteros = new ExcelJS.Workbook()
  await enteros.xlsx.load(await crearExcelRP([{ ...fila, valor: '10', liquidacion: '10' }]))
  assert.equal(enteros.getWorksheet('RP').getCell('M2').value, '10.00')
  await assert.rejects(crearExcelRP([{ ...fila, tercero_confirmado: false }]), /sistema externo/)
})

test('Descarga XLSX usa Blob y libera el recurso', async (t) => {
  const previo = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const llamadas = []
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ click() { llamadas.push([this.href, this.download]) } }) } })
  t.after(() => { if (previo) Object.defineProperty(globalThis, 'document', previo); else delete globalThis.document })
  t.mock.method(URL, 'createObjectURL', (blob) => { assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); return 'blob:rp' })
  t.mock.method(URL, 'revokeObjectURL', (url) => llamadas.push(url))
  t.mock.method(globalThis, 'setTimeout', (fn) => { fn(); return 0 })
  await descargarExcelRP([completa()], 'rp-prueba.xlsx')
  assert.deepEqual(llamadas, [['blob:rp', 'rp-prueba.xlsx'], 'blob:rp'])
})
