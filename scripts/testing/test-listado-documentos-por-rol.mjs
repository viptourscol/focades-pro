import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { test } from 'node:test'

// Ejecuta el codigo real de la Edge Function con auth y transporte SQL simulados.
// No requiere credenciales ni modifica usuarios/documentos.
const archivo = new URL('../../supabase/functions/obtener-documentos-por-rol/index.ts', import.meta.url)
const clientes = []
let handler
let falloConsulta = false
const usuarios = {
  presupuesto: { user_metadata: { roles: ['otro_rol', 'admin_presupuesto'] } },
  educacion: { user_metadata: { roles: ['admin_educacion'] } },
  contabilidad: { user_metadata: { roles: ['admin_contabilidad'] } },
  sin_rol: { user_metadata: {} }
}
const documentos = [
  { id: 'tercero-enviado', convocatoria_id: '2026', tipo_documento: 'terceros', estado: 'enviado_para_revision' },
  { id: 'rp-2026', convocatoria_id: '2026', tipo_documento: 'rp', estado: 'borrador' },
  { id: 'op-2026', convocatoria_id: '2026', tipo_documento: 'op', estado: 'borrador' },
  { id: 'tercero-2025', convocatoria_id: '2025', tipo_documento: 'terceros', estado: 'aprobado' }
]

const createClient = (_url, _key, opciones) => {
  const cabecera = opciones?.global?.headers?.Authorization
  const token = cabecera?.replace('Bearer ', '')
  const usuario = usuarios[token]
  clientes.push({ cabecera, opciones })
  return {
    auth: { getUser: async (solicitado) => ({
      data: { user: solicitado === token ? usuario : null },
      error: usuario && solicitado === token ? null : { message: 'Token no valido' }
    }) },
    from: (tabla) => {
      assert.equal(tabla, 'portal_documentos_cargue')
      let filas = documentos.slice()
      // Reproduce el comportamiento observado de RLS si no se propaga la sesion.
      if (!usuario) filas = []
      if (token === 'presupuesto') filas = filas.filter((fila) => ['terceros', 'rp'].includes(fila.tipo_documento))
      if (token === 'contabilidad') filas = filas.filter((fila) => ['op', 'contabilidad'].includes(fila.tipo_documento))
      const consulta = {
        select: () => consulta,
        eq: (campo, valor) => { filas = filas.filter((fila) => fila[campo] === valor); return consulta },
        in: (campo, valores) => { filas = filas.filter((fila) => valores.includes(fila[campo])); return consulta },
        order: () => consulta,
        then: (resolve, reject) => Promise.resolve(falloConsulta
          ? { data: null, error: { message: 'Error de consulta de prueba', code: 'TEST' } }
          : { data: filas, error: null }).then(resolve, reject)
      }
      return consulta
    }
  }
}
const fuente = stripTypeScriptTypes(readFileSync(archivo, 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
const ejecutar = new Function('serve', 'createClient', 'Deno', fuente)
ejecutar((callback) => { handler = callback }, createClient, { env: { get: () => 'valor-de-prueba' } })
const solicitar = (token, parametros = { convocatoria_id: '2026' }) => handler(new Request('https://example.test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(parametros)
}))

test('Presupuesto recibe TERCEROS en revision y RP usando su sesion, aunque su rol no sea el primero', async () => {
  const respuesta = await solicitar('presupuesto')
  assert.equal(respuesta.status, 200)
  const datos = await respuesta.json()
  assert.equal(datos.rol, 'admin_presupuesto')
  assert.deepEqual(datos.documentos.map((fila) => fila.id), ['tercero-enviado', 'rp-2026'])
  assert.equal(clientes.at(-1).cabecera, 'Bearer presupuesto')
  assert.equal(clientes.at(-1).opciones.auth.persistSession, false)
})

test('cada peticion tiene cliente independiente: no mezcla sesiones ni convocatorias', async () => {
  const [presupuesto, contabilidad] = await Promise.all([solicitar('presupuesto'), solicitar('contabilidad')])
  assert.deepEqual((await presupuesto.json()).documentos.map((fila) => fila.id), ['tercero-enviado', 'rp-2026'])
  assert.deepEqual((await contabilidad.json()).documentos.map((fila) => fila.id), ['op-2026'])
  const anterior = await solicitar('presupuesto', { convocatoria_id: '2025' })
  assert.deepEqual((await anterior.json()).documentos.map((fila) => fila.id), ['tercero-2025'])
})

test('conserva filtros opcionales sin ampliar tipos permitidos', async () => {
  const filtrado = await solicitar('presupuesto', { convocatoria_id: '2026', tipo_filtro: 'terceros' })
  assert.deepEqual((await filtrado.json()).documentos.map((fila) => fila.id), ['tercero-enviado'])
  const prohibido = await solicitar('presupuesto', { convocatoria_id: '2026', tipo_filtro: 'op' })
  assert.deepEqual((await prohibido.json()).documentos, [])
})

test('sin sesion, token invalido, rol ausente y convocatoria ausente son errores explicitos', async () => {
  assert.equal((await solicitar()).status, 401)
  assert.equal((await solicitar('invalido')).status, 401)
  assert.equal((await solicitar('sin_rol')).status, 403)
  assert.equal((await solicitar('presupuesto', {})).status, 400)
})

test('un fallo de base de datos no se presenta como una lista vacia exitosa', async () => {
  falloConsulta = true
  try {
    const respuesta = await solicitar('presupuesto')
    assert.equal(respuesta.status, 500)
    assert.equal((await respuesta.json()).error, 'Database query failed')
  } finally {
    falloConsulta = false
  }
})
