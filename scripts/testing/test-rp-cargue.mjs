import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { CAMPOS_RP, contratoRP, descripcionAutomaticaRP, fechaFilaDesdeISO, fechaISODesdeFilaRP, formatearNumeroRP, modalidadesRP, nuevaFilaRP, validarDatosGeneralesRP, validarFilaRP, validacionesDocumentoRP, vistaPreviaNumeracionRP, fechaValidaRP, centavosRP } from '../../src/lib/rpCargue.js'
import { crearExcelRP, descargarExcelRP } from '../../src/lib/exportarRP.js'

const completa = () => ({
  ...nuevaFilaRP({ origen: 'tercero:prueba', identificacion: '000123456', nombre: 'Persona de prueba', modalidad: 'SUEÑOS' }),
  id: 'fila-1', no_rp: '2026.ALC.01.000010', subconsecutivo: '0001', descripcion: 'Registro de prueba',
  fecha: '13112026', no_cdp: '2026.ALC.01.000020', subconsecutivo_cdp: '0001', fuente_financiacion: '0004',
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

test('Datos generales componen descripción y contrato una sola vez; los subconsecutivos son opcionales', () => {
  const datos = {
    numero_resolucion: '1589', fecha_resolucion: '2026-11-04', fecha_rp: '2026-11-17', semestre_pago: '2', anio_pago: '2026',
    modalidades: 'SUEÑOS Y MÉRITOS EDUCATIVOS', fuente_financiacion: '0004'
  }
  assert.equal(descripcionAutomaticaRP(datos, '2022'),
    'RESOLUCION 1589 DEL 4 DE NOVIEMBRE DE 2026 POR LA CUAL EL FONDO EDUCATIVO PARA EDUCACION SUPERIOR FOCADES, ORDENA PAGAR CREDITOS CONDONABLES CORRESPONDIENTES A LOS BENEFICIARIOS QUE FUERON SELECCIONADOS EN LA CONVOCATORIA 2022, EN EL SEGUNDO SEMESTRE DEL 2026 EN LAS MODALIDADES DE SUEÑOS Y MÉRITOS EDUCATIVOS')
  assert.equal(contratoRP(datos.numero_resolucion, datos.fecha_resolucion), 'RESOLUCION 1589 20261104')
  assert.equal(fechaFilaDesdeISO(datos.fecha_rp), '17112026')
  assert.equal(fechaISODesdeFilaRP('17112026'), datos.fecha_rp)
  assert.equal(fechaFilaDesdeISO('2026-02-30'), '')
  assert.deepEqual(validarDatosGeneralesRP({ ...datos, descripcion: descripcionAutomaticaRP(datos, '2022') }, { requerido: true }), {})
  assert.equal(modalidadesRP([{ modalidad: 'SUEÑOS' }, { modalidad: 'MERITO' }, { modalidad: 'MÉRITO' }]), 'MÉRITOS EDUCATIVOS Y SUEÑOS')
  const fila = { ...completa(), subconsecutivo: '', subconsecutivo_cdp: '' }
  assert.deepEqual(validarFilaRP(fila), {})
  assert.ok(validarFilaRP({ ...fila, subconsecutivo: '12345' }).subconsecutivo)
  assert.ok(validarFilaRP({ ...fila, subconsecutivo_cdp: '12345' }).subconsecutivo_cdp)
  assert.ok(validarDatosGeneralesRP({ ...datos, fecha_resolucion: '2026-02-30' }).fecha_resolucion)
})

test('Formatos, máximos exactos y fechas reales DDMMYYYY', () => {
  const fila = completa()
  for (const [campo, longitud] of [['subconsecutivo', 4], ['subconsecutivo_cdp', 4], ['fuente_financiacion', 4], ['tercero_presupuestal', 15]]) {
    assert.equal(validarFilaRP({ ...fila, [campo]: '9'.repeat(longitud) })[campo], undefined)
    assert.ok(validarFilaRP({ ...fila, [campo]: '9'.repeat(longitud + 1) })[campo])
    assert.ok(validarFilaRP({ ...fila, [campo]: '1e3' })[campo])
  }
  assert.equal(validarFilaRP({ ...fila, descripcion: 'á'.repeat(500) }).descripcion, undefined)
  assert.ok(validarFilaRP({ ...fila, descripcion: 'a'.repeat(501) }).descripcion)
  assert.ok(fechaValidaRP('29022024'))
  for (const fecha of ['29022025', '31042026', '00012026', '01002026', '01010000', '20261113', '131126']) assert.equal(fechaValidaRP(fecha), false, fecha)
  assert.ok(validarFilaRP({ ...fila, proyecto: '842' }).proyecto)
  for (const valor of ['2026..01.001407', '2026.ALC.01.00140X', '2026.ALC.01.0014070-too-long-code-value']) {
    assert.ok(validarFilaRP({ ...fila, no_rp: valor }).no_rp)
  }
  assert.equal(validarFilaRP({ ...fila, no_rp: '2026.ALC.01.001407' }).no_rp, undefined)
  assert.equal(validarFilaRP({ ...fila, no_rp: '2025.ALC.01.001407' }).no_rp, undefined)
  assert.equal(validarFilaRP({ ...fila, no_rp: '2027.RP-BC.001407' }).no_rp, undefined)
  assert.equal(formatearNumeroRP('001407', '2026'), '2026.ALC.01.001407')
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
  assert.deepEqual(vistaPreviaNumeracionRP(filas, ids, 'no_rp', 'consecutivo', '2027.RP-BC.001407').map((p) => p.nuevo), ['2027.RP-BC.001407', '2027.RP-BC.001408'])
  assert.deepEqual(vistaPreviaNumeracionRP(filas, ids, 'no_cdp', 'comun', 'CDP.26-A.001233').map((p) => p.nuevo), ['CDP.26-A.001233', 'CDP.26-A.001233'])
  assert.equal(filas[1].no_cdp, '777')
  assert.throws(() => vistaPreviaNumeracionRP(filas, ids, 'no_rp', 'consecutivo', '2027.RP-BC.9999'), /longitud/)
  assert.throws(() => vistaPreviaNumeracionRP(filas, [], 'no_rp', 'comun', '2027.RP-BC.0001'), /Selecciona/)
  assert.throws(() => vistaPreviaNumeracionRP(filas, ids, 'valor', 'comun', '2027.RP-BC.0001'), /inválida/)
  assert.throws(() => vistaPreviaNumeracionRP(filas, ids, 'no_rp', 'comun', '1e5'), /número inicial/)
  assert.throws(() => vistaPreviaNumeracionRP(filas, ids, 'no_rp', 'comun', 'RP-ABC'), /consecutivo numérico/)
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
  assert.equal(hoja.getCell('A2').value, '2026.ALC.01.000010')
  assert.equal(hoja.getCell('D2').value, '13112026')
  assert.equal(hoja.getCell('E2').value, '2026.ALC.01.000020')
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
