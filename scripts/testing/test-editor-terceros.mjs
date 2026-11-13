import assert from 'node:assert/strict'
import { test } from 'node:test'
import ExcelJS from 'exceljs'
import {
  CAMPOS_TERCEROS, FIJOS_TERCERO, codigoIdentificacionTercero, camposPendientesTercero,
  filaExportacionTercero, sugerirNombresTercero, terceroDesdeRegistro, validarTercero
} from '../../src/lib/tercerosCargue.js'
import { crearExcelTerceros } from '../../src/lib/exportarTerceros.js'

const completo = {
  id: 'fila', cc_nit: '00123456789', nombre_referencia: 'María José Pérez Muñoz',
  primer_nombre: 'María', segundo_nombre: 'José', primer_apellido: 'Pérez', segundo_apellido: 'Muñoz',
  tipo_identificacion: '13', email: 'maria@example.test', telefono: '3001234567',
  direccion: 'Carrera 10 # 15-30', banco: 'Banco de prueba',
  tipo_cuenta: 'AHORROS', numero_cuenta: '0001234500', nombres_confirmados: true, ...FIJOS_TERCERO
}

test('contrato de exportación contiene las 22 columnas en el orden exigido', () => {
  assert.deepEqual(CAMPOS_TERCEROS.map((c) => c.label), [
    'C.C/NIT', 'Nombre/Razón Social', 'Segundo Apellido', 'Primer Apellido', 'Segundo Nombre',
    'Primer Nombre', 'Tipo Identificación', 'Código Cargo', 'Código Dependencia', 'Email',
    'Teléfono', 'Dirección', 'Digito Verificador', 'Tipo Tercero', 'Naturaleza', 'Régimen',
    'País', 'Departamento', 'Ciudad', 'Banco', 'Tipo Cuenta', 'Numero cuenta'
  ])
})

test('mapea códigos reales; no inventa equivalencia para PPT ni sustituye tipos desconocidos por 13', () => {
  for (const [entrada, codigo] of Object.entries({ CC: '13', 'Cédula de ciudadanía': '13', TI: '12', CE: '22', NIT: '31', PAS: '41', RC: '11', 44: '44' })) {
    assert.equal(codigoIdentificacionTercero(entrada), codigo)
  }
  assert.equal(codigoIdentificacionTercero('PPT'), 'PPT')
  assert.ok(validarTercero({ ...completo, tipo_identificacion: 'PPT' }).tipo_identificacion)
})

test('sugiere nombres sin confirmarlos y conserva fuente, municipio y datos bancarios', () => {
  const fila = terceroDesdeRegistro({
    id: '1', identificacion: '00012', nombre_beneficiario: 'María José Pérez Muñoz',
    tipo_identificacion: 'TI', ciudad: 'Municipio original',
    datos_tercero: { numero_cuenta: '00034', banco: 'Banco original', tipo_cuenta: 'ahorro', primer_apellido: 'De la Cruz' }
  })
  assert.equal(fila.nombre_razon_social, '')
  assert.equal(fila.primer_nombre, 'María')
  assert.equal(fila.primer_apellido, 'De la Cruz')
  assert.equal(fila.nombres_confirmados, false)
  assert.equal(fila.ciudad_residencia, 'Municipio original')
  assert.equal(fila.ciudad_codigo, '466')
  assert.equal(fila.numero_cuenta, '00034')
  assert.equal(fila.tipo_cuenta, 'AHORROS')
  assert.deepEqual(sugerirNombresTercero('Ana Pérez'), { primer_nombre: 'Ana', segundo_nombre: '', primer_apellido: 'Pérez', segundo_apellido: '' })
})

test('guarda borradores incompletos pero envío exige campos y nombres confirmados', () => {
  assert.deepEqual(validarTercero({}), {})
  assert.deepEqual(validarTercero(completo, { completo: true }), {})
  assert.deepEqual(validarTercero({ ...completo, segundo_nombre: '' }, { completo: true }), {})
  assert.ok(validarTercero({ ...completo, segundo_apellido: '' }, { completo: true }).segundo_apellido)
  assert.ok(validarTercero({ ...completo, nombres_confirmados: false }, { completo: true }).nombres_confirmados)
  assert.equal(camposPendientesTercero(completo).length, 0)
  assert.ok(camposPendientesTercero({}).length > 0)
})

test('valida dígitos, tamaños exactos y email sin truncar contenido', () => {
  for (const campo of CAMPOS_TERCEROS.filter((c) => c.maxLength && !c.readonly && c.type !== 'select' && c.type !== 'email')) {
    const texto = (campo.numerico ? '1' : 'a').repeat(campo.maxLength)
    assert.equal(validarTercero({ ...completo, [campo.name]: texto })[campo.name], undefined)
    assert.ok(validarTercero({ ...completo, [campo.name]: `${texto}x` })[campo.name])
  }
  assert.ok(validarTercero({ ...completo, cc_nit: '12.345' }).cc_nit)
  assert.ok(validarTercero({ ...completo, numero_cuenta: '1e10' }).numero_cuenta)
  assert.ok(validarTercero({ ...completo, email: 'correo-invalido' }).email)
  assert.equal(validarTercero({ ...completo, email: ` ${'a'.repeat(87)}@example.test ` }).email, undefined)
})

test('XLSX real conserva 22 columnas, vacíos, ceros iniciales, constantes y textos que parecen fórmulas', async () => {
  const datos = { ...completo, banco: '=1+1', direccion: 'Dirección '.repeat(40), naturaleza: 'CAMBIADO' }
  const buffer = await crearExcelTerceros([datos, { ...completo, id: 'otra', cc_nit: '0099', segundo_nombre: '' }])
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(buffer)
  const hoja = libro.getWorksheet('Terceros')
  assert.equal(hoja.rowCount, 3)
  assert.equal(hoja.columnCount, 22)
  assert.deepEqual(hoja.getRow(1).values.slice(1), CAMPOS_TERCEROS.map((c) => c.label))
  assert.equal(hoja.getCell('A2').value, '00123456789')
  assert.equal(hoja.getCell('V2').value, '0001234500')
  assert.equal(hoja.getCell('T2').value, '=1+1')
  assert.equal(hoja.getCell('O2').value, '0')
  assert.equal(hoja.getCell('B2').value, '')
  assert.equal(hoja.getCell('L2').value, datos.direccion.trim())
  assert.deepEqual(filaExportacionTercero(datos), hoja.getRow(2).values.slice(1))
  await assert.rejects(() => crearExcelTerceros([]), /no tiene terceros/)
  await assert.rejects(() => crearExcelTerceros([{ ...completo, nombres_confirmados: false }]), /confirmar/)
  await assert.rejects(() => crearExcelTerceros([completo, completo]), /duplicada/)
})
