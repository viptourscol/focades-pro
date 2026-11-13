import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { test } from 'node:test'
import ExcelJS from 'exceljs'
import { terceroDesdeRegistro, validacionesDocumentoTerceros } from '../../src/lib/tercerosCargue.js'
import { crearExcelTerceros } from '../../src/lib/exportarTerceros.js'
import { nuevaFilaRP, validacionesDocumentoRP } from '../../src/lib/rpCargue.js'
import { crearExcelRP } from '../../src/lib/exportarRP.js'

const leer = (nombre) => stripTypeScriptTypes(readFileSync(new URL(`../../supabase/functions/${nombre}`, import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '')
const preparar = (endpoint, { tipo = 'terceros', fallo = false } = {}) => {
  const llamadas = []
  let handler
  const fila = { id: 'fila', identificacion: '000123', nombre_beneficiario: 'Ana Perez Gomez',
    tipo_identificacion: '13', email: 'prueba@example.test', telefono: '3001234567', direccion: 'Direccion',
    datos_tercero: { primer_nombre: 'Ana', primer_apellido: 'Perez', segundo_apellido: 'Gomez',
      banco: 'Banco prueba', tipo_cuenta: 'AHORROS', numero_cuenta: '000456', nombres_confirmados: true } }
  const rp = { ...nuevaFilaRP({ origen: 'tercero:prueba', identificacion: '000123', nombre: 'Ana Perez Gomez' }),
    no_rp: '0001', subconsecutivo: '1', descripcion: 'Prueba', fecha: '13112026', no_cdp: '0002', subconsecutivo_cdp: '1',
    fuente_financiacion: '4', valor: '123.45', liquidacion: '123.45', valor_confirmado: true, tercero_confirmado: true }
  const createClient = (_url, _key, opciones) => ({
    auth: { getUser: async () => ({ data: { user: { id: 'usuario', user_metadata: { roles: ['admin_educacion'] } } } }) },
    rpc: async (nombre, parametros) => {
      llamadas.push({ nombre, parametros, authorization: opciones?.global?.headers?.Authorization })
      if (fallo) return { error: { message: 'Requisito o permiso no satisfecho' } }
      if (nombre === 'obtener_terceros_exportacion') return { data: [fila] }
      if (nombre === 'leer_terceros_cargue') return { data: { filas: [fila] } }
      if (nombre === 'obtener_rp_exportacion') return { data: [rp] }
      if (nombre === 'leer_rp_cargue') return { data: { filas: [rp], terceros_id: 'origen', estado: 'enviado_para_revision' } }
      if (nombre === 'fn_crear_documento_cargue') return { data: 'doc' }
      return { data: { success: true, nuevo_estado: 'aprobado' } }
    },
    from: () => {
      const consulta = { select: () => consulta, eq: () => consulta, single: async () => ({ data: { id: 'doc', tipo_documento: tipo, estado: 'enviado_para_revision' } }),
        update: () => { throw new Error('No debe actualizar con cliente de servicio') } }
      return consulta
    }
  })
  const compartido = new Function('createClient', `${leer('_shared/transicion-presupuesto.ts').replace(/^export /gm, '')}\nreturn {corsPresupuesto,transicionarPresupuesto};`)(createClient)
  new Function('serve', 'createClient', 'Deno', 'corsPresupuesto', 'transicionarPresupuesto', 'terceroDesdeRegistro', 'crearExcelTerceros', 'validacionesDocumentoTerceros', 'crearExcelRP', 'validacionesDocumentoRP', leer(`${endpoint}/index.ts`))(
    (callback) => { handler = callback }, createClient, { env: { get: () => 'configuracion-sintetica' } },
    compartido.corsPresupuesto, compartido.transicionarPresupuesto, terceroDesdeRegistro, crearExcelTerceros, validacionesDocumentoTerceros, crearExcelRP, validacionesDocumentoRP
  )
  return {
    llamadas,
    solicitar: (autorizado = true) => handler(new Request('https://example.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(autorizado ? { Authorization: 'Bearer sesion-sintetica' } : {}) },
      body: JSON.stringify({ documento_id: 'doc', convocatoria_id: 'convocatoria', tipo_documento: tipo, comentario: 'Prueba', motivo_rechazo: 'Corregir', datos: [] })
    }))
  }
}

for (const [endpoint, accion] of [['enviar-para-revision', 'enviar'], ['aprobar-documento', 'aprobar'], ['rechazar-documento', 'rechazar']]) {
  test(`${endpoint} transmite la sesión a la transición atómica; no usa mutación de servicio`, async () => {
    const { solicitar, llamadas } = preparar(endpoint)
    const respuesta = await solicitar()
    assert.equal(respuesta.status, 200)
    assert.equal(llamadas[0].nombre, 'transicionar_documento_presupuesto')
    assert.equal(llamadas[0].parametros.p_accion, accion)
    assert.equal(llamadas[0].authorization, 'Bearer sesion-sintetica')
    assert.equal(respuesta.headers.get('Access-Control-Allow-Origin'), '*')
    assert.equal((await solicitar(false)).status, 401)
    const rechazado = await preparar(endpoint, { fallo: true }).solicitar()
    assert.equal(rechazado.status, 400)
    assert.match((await rechazado.json()).error, /no satisfecho/)
  })
}

test('generar-terceros devuelve XLSX autorizado, privado y con ceros iniciales, no un CSV público', async () => {
  const { solicitar, llamadas } = preparar('generar-terceros')
  const respuesta = await solicitar()
  assert.equal(respuesta.status, 200)
  assert.equal(respuesta.headers.get('Content-Type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  assert.equal(respuesta.headers.get('Cache-Control'), 'no-store')
  assert.equal(llamadas[0].nombre, 'obtener_terceros_exportacion')
  assert.equal(llamadas[0].authorization, 'Bearer sesion-sintetica')
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(await respuesta.arrayBuffer())
  assert.equal(libro.worksheets[0].columnCount, 22)
  assert.equal(libro.worksheets[0].getCell('A2').value, '000123')
  assert.equal(libro.worksheets[0].getCell('V2').value, '000456')
  assert.equal((await solicitar(false)).status, 401)
  assert.equal((await preparar('generar-terceros', { fallo: true }).solicitar()).status, 400)
})

test('el endpoint antiguo de creación usa la RPC con la sesión y respeta el rechazo del requisito RP', async () => {
  const { solicitar, llamadas } = preparar('crear-documento-cargue')
  assert.equal((await solicitar()).status, 201)
  assert.equal(llamadas[0].nombre, 'fn_crear_documento_cargue')
  assert.equal(llamadas[0].authorization, 'Bearer sesion-sintetica')
  assert.equal((await preparar('crear-documento-cargue', { tipo: 'rp', fallo: true }).solicitar()).status, 400)
})

test('generar-rp comprueba contrato completo con sesión antes de generar archivos', async () => {
  const { solicitar, llamadas } = preparar('generar-rp', { tipo: 'rp', fallo: true })
  assert.equal((await solicitar()).status, 400)
  assert.equal(llamadas[0].nombre, 'obtener_rp_exportacion')
  assert.equal(llamadas[0].authorization, 'Bearer sesion-sintetica')
})

test('generar-rp devuelve XLSX privado de 16 columnas, sin publicar archivos en Storage', async () => {
  const { solicitar } = preparar('generar-rp', { tipo: 'rp' })
  const respuesta = await solicitar()
  assert.equal(respuesta.status, 200)
  assert.equal(respuesta.headers.get('Cache-Control'), 'no-store')
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(await respuesta.arrayBuffer())
  assert.equal(libro.worksheets[0].columnCount, 16)
  assert.equal(libro.worksheets[0].getCell('A2').value, '0001')
  assert.equal(libro.worksheets[0].getCell('M2').value, '123.45')
  assert.equal((await solicitar(false)).status, 401)
})

test('validar-documento-cargue usa RP guardado autorizado, no las filas enviadas por el cliente', async () => {
  const { solicitar, llamadas } = preparar('validar-documento-cargue', { tipo: 'rp' })
  const respuesta = await solicitar()
  assert.equal(respuesta.status, 200)
  assert.equal((await respuesta.json()).es_valido, true)
  assert.equal(llamadas[0].nombre, 'leer_rp_cargue')
})

test('validar-documento-cargue valida el contenido guardado autorizado y admite razon social vacia', async () => {
  const { solicitar, llamadas } = preparar('validar-documento-cargue')
  const respuesta = await solicitar()
  assert.equal(respuesta.status, 200)
  const datos = await respuesta.json()
  assert.equal(datos.es_valido, true)
  assert.equal(datos.filas_validadas, 1)
  assert.deepEqual(datos.errores, [])
  assert.equal(llamadas[0].nombre, 'leer_terceros_cargue')
  assert.equal(llamadas[0].authorization, 'Bearer sesion-sintetica')
  assert.equal((await preparar('validar-documento-cargue', { fallo: true }).solicitar()).status, 403)
})
