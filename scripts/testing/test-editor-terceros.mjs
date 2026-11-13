import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CAMPOS_TERCEROS, camposPendientesTercero, normalizarBusquedaTercero,
  terceroDesdeRegistro, validarTercero
} from '../../src/lib/tercerosCargue.js'

const completo = {
  id: 'fila', cc_nit: '123456789', nombre_razon_social: 'María Rodríguez',
  tipo_identificacion: 'TI', email: 'maria@example.test', telefono: '3001234567',
  direccion: 'Carrera 10 # 15-30', ciudad: 'Montelíbano'
}

test('mapea los siete campos sin recortar contenido ni sustituir tipos de documento', () => {
  const nombre = 'Nombre completo extenso '.repeat(7)
  const direccion = 'Dirección completa '.repeat(12)
  const fila = terceroDesdeRegistro({
    id: 'id-1', identificacion: '12345', nombre_beneficiario: nombre,
    tipo_identificacion: 'TI', email: 'maria@example.test', telefono: '3001234567',
    direccion, ciudad: 'Montelíbano'
  })
  assert.equal(fila.nombre_razon_social, nombre)
  assert.equal(fila.direccion, direccion)
  assert.equal(fila.tipo_identificacion, 'TI')
  assert.equal(Object.keys(fila).length, 8)
  assert.ok(CAMPOS_TERCEROS.find((campo) => campo.name === 'tipo_identificacion').options.includes('TI'))
})

test('datos de contacto opcionales no impiden guardar', () => {
  assert.deepEqual(validarTercero({ cc_nit: '123', nombre_razon_social: 'Tercero' }), {})
  assert.equal(camposPendientesTercero({ cc_nit: '123', nombre_razon_social: 'Tercero' }).length, 5)
  assert.deepEqual(camposPendientesTercero(completo), [])
})

test('los campos obligatorios rechazan cadenas de espacios', () => {
  const errores = validarTercero({ cc_nit: '  ', nombre_razon_social: '\t' })
  assert.deepEqual(Object.keys(errores), ['cc_nit', 'nombre_razon_social'])
})

test('valida el formato del correo sin rechazar espacios exteriores normalizables', () => {
  assert.ok(validarTercero({ ...completo, email: 'correo-invalido' }).email)
  assert.ok(validarTercero({ ...completo, email: 'dos correos@example.test' }).email)
  assert.equal(validarTercero({ ...completo, email: '  maria@example.test  ' }).email, undefined)
})

test('verifica los límites exactos del almacenamiento, sin truncar valores', () => {
  for (const campo of CAMPOS_TERCEROS.filter((item) => item.name !== 'email')) {
    assert.equal(validarTercero({ ...completo, [campo.name]: 'a'.repeat(campo.maxLength) })[campo.name], undefined)
    assert.ok(validarTercero({ ...completo, [campo.name]: 'a'.repeat(campo.maxLength + 1) })[campo.name])
  }
  const correo = `${'a'.repeat(87)}@example.test`
  assert.equal(correo.length, 100)
  assert.equal(validarTercero({ ...completo, email: correo }).email, undefined)
  assert.ok(validarTercero({ ...completo, email: `a${correo}` }).email)
})

test('búsqueda tolera acentos y mayúsculas y consulta todos los campos', () => {
  assert.equal(normalizarBusquedaTercero('MARÍA MUÑOZ'), 'maria munoz')
  assert.equal(normalizarBusquedaTercero(null), '')
  assert.ok(CAMPOS_TERCEROS.some((campo) => normalizarBusquedaTercero(completo[campo.name]).includes('montelibano')))
})
