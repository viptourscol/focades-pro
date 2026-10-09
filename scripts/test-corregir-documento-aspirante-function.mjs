import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const ID = '8be70e51-bd29-4ee7-bd30-8e7bab8b4068';
const PERSONA = '22222222-2222-2222-2222-222222222222';
const OLD = 'expedientes/25991526/asp-2026-1769';
const NEW = 'expedientes/1025776356/asp-2026-1769';
const SOURCES = [
  `soportes/${OLD}/firma/1-firma.png`,
  `soportes/${OLD}/documento_identidad/2-id.pdf`,
  `soportes/${OLD}/certificado_bancario/3-cb.pdf`,
  `soportes/${OLD}/diploma/4-d.pdf`,
  `soportes/${OLD}/generados/formulario.pdf`,
];
const targetOf = (key) => key.replace(OLD, NEW);

let state;
const freshState = (overrides = {}) => ({
  inscripcion: {
    id: ID, persona_id: PERSONA, convocatoria_id: 'conv-1', email: 'a@b.co', radicado: 'ASP-2026-1769',
    tipo_documento: 'CC', n_documento: '25991526', promovido_a_beneficiario: false,
    firma_url: `${OLD}/firma/1-firma.png`,
    url_doc_identidad: `soportes/${OLD}/documento_identidad/2-id.pdf`,
    soportes: { certificado_bancario: `${OLD}/certificado_bancario/3-cb.pdf` },
    datos_formulario: { n_documento: '25991526', firma_storage_path: `${OLD}/firma/1-firma.png`, soportes: { diploma: `${OLD}/diploma/4-d.pdf` } },
  },
  tables: {
    inscripciones: [],
    personas: [],
    portal_beneficiarios: [],
    inscripciones_documentos: [
      { id: 1, inscripcion_id: ID, tipo_documento: 'formulario', storage_path: SOURCES[4], version: 1 },
      { id: 2, inscripcion_id: ID, tipo_documento: 'firma_digital', storage_path: `${OLD}/firma/1-firma.png`, version: 1 },
    ],
    portal_beneficiario_bitacora: [],
  },
  r2: new Map(SOURCES.map((key, index) => [key, 100 + index])),
  copyFailAt: null, copies: 0, deleteFail: new Set(), rpcError: null, rpcCalls: [], generateCalls: [], generateResponse: { ok: true, generated: 3 },
  ...overrides,
});
const reset = (overrides) => {
  state = freshState(overrides);
  state.tables.inscripciones = [state.inscripcion];
  state.tables.personas = [{ id: PERSONA, tipo_documento: 'CC', n_documento: '1025776356' }];
  return state;
};

class Query {
  constructor(table) { this.table = table; this.filters = []; }
  select(_columns, options) { this.options = options; return this; }
  eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
  neq(column, value) { this.filters.push((row) => row[column] !== value); return this; }
  ilike(column, value) { this.filters.push((row) => String(row[column] || '').toLowerCase() === String(value).toLowerCase()); return this; }
  order(column, { ascending } = {}) { this.sort = [column, ascending !== false]; return this; }
  limit(count) { this.max = count; return this; }
  maybeSingle() { this.single = true; return this; }
  insert(payload) { this.payload = payload; return this; }
  then(resolve, reject) { return Promise.resolve(this.run()).then(resolve, reject); }
  run() {
    if (this.payload) { state.tables[this.table].push(this.payload); return { data: null, error: null }; }
    let rows = state.tables[this.table].filter((row) => this.filters.every((filter) => filter(row)));
    if (this.sort) rows = [...rows].sort((a, b) => (a[this.sort[0]] - b[this.sort[0]]) * (this.sort[1] ? 1 : -1));
    if (this.max != null) rows = rows.slice(0, this.max);
    if (this.options?.head) return { count: rows.length, data: null, error: null };
    return { data: this.single ? rows[0] || null : rows, error: null };
  }
}

const users = { 'admin-jwt': 'admin-1', 'user-jwt': 'user-1' };
const supabaseClient = {
  auth: { getUser: async (jwt) => (users[jwt] ? { data: { user: { id: users[jwt] } }, error: null } : { data: { user: null }, error: { message: 'bad' } }) },
  from: (table) => new Query(table),
  rpc: async (name, args) => {
    if (name === 'is_portal_admin') return { data: args.p_user_id === 'admin-1', error: null };
    state.rpcCalls.push(args);
    if (state.rpcError) return { data: null, error: { message: state.rpcError } };
    state.inscripcion.n_documento = args.p_nuevo_documento;
    state.inscripcion.datos_formulario.n_documento = args.p_nuevo_documento;
    const swap = (value) => args.p_old_segments.reduce((text, segment) => text.replaceAll(
      `expedientes/${segment}/${args.p_radicado_segment}/`,
      `expedientes/${args.p_new_segment}/${args.p_radicado_segment}/`,
    ), JSON.stringify(value));
    Object.assign(state.inscripcion, JSON.parse(swap(state.inscripcion)));
    state.tables.inscripciones_documentos = JSON.parse(swap(state.tables.inscripciones_documentos));
    return { data: { ok: true }, error: null };
  },
};

class AwsClient { async sign(url, init) { return new Request(url, { method: init.method, headers: init.headers }); } }

globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  if (url.host === 'proj.supabase.co') {
    state.generateCalls.push({ url: request.url, authorization: request.headers.get('authorization'), body: JSON.parse(await request.text()) });
    return new Response(JSON.stringify(state.generateResponse), { status: state.generateResponse.ok === false ? 502 : 200 });
  }
  const key = decodeURIComponent(url.pathname.replace('/focades-pro/', '')).replace(/^\//, '');
  if (request.method === 'HEAD') {
    return state.r2.has(key) ? new Response(null, { status: 200, headers: { 'content-length': String(state.r2.get(key)) } }) : new Response(null, { status: 404 });
  }
  if (request.method === 'PUT') {
    const source = decodeURIComponent(request.headers.get('x-amz-copy-source')).replace('/focades-pro/', '');
    state.copies += 1;
    if (state.copyFailAt === state.copies) return new Response('<Error>boom</Error>', { status: 500 });
    if (!state.r2.has(source)) return new Response('<Error>NoSuchKey</Error>', { status: 404 });
    state.r2.set(key, state.r2.get(source));
    return new Response('<CopyObjectResult/>', { status: 200 });
  }
  if (request.method === 'DELETE') {
    if (state.deleteFail.has(key)) return new Response('x', { status: 500 });
    state.r2.delete(key);
    return new Response(null, { status: 204 });
  }
  throw new Error(`Unexpected request ${request.method} ${request.url}`);
};

const env = {
  SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key', R2_ACCESS_KEY_ID: 'a', R2_SECRET_ACCESS_KEY: 'b',
  R2_ENDPOINT: 'https://acct.r2.test/', R2_BUCKET: 'focades-pro',
};
let handler;
const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/admin-corregir-documento-aspirante/index.ts', import.meta.url), 'utf8')).replace(/^import .*$/gm, '');
new Function('Deno', 'createClient', 'AwsClient', source)(
  { env: { get: (name) => env[name] }, serve: (callback) => { handler = callback; } },
  () => supabaseClient,
  AwsClient,
);

const call = async (body, jwt = 'admin-jwt') => {
  const response = await handler(new Request('https://local.test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() };
};
const base = { inscripcion_id: ID, nuevo_n_documento: '1025776356', motivo: 'Error de digitacion' };
const r2Snapshot = () => JSON.stringify([...state.r2].sort());

// Autorizacion.
reset();
assert.equal((await call({ ...base, mode: 'preview' }, null)).status, 401);
assert.equal((await call({ ...base, mode: 'preview' }, 'invalid')).status, 401);
assert.equal((await call({ ...base, mode: 'preview' }, 'user-jwt')).status, 403);
assert.equal((await handler(new Request('https://local.test', { method: 'GET' }))).status, 405);
assert.equal(state.rpcCalls.length, 0);

// Validaciones de entrada.
reset();
for (const [label, body] of [
  ['modo', { ...base, mode: 'otro' }],
  ['documento corto', { ...base, mode: 'preview', nuevo_n_documento: '12' }],
  ['documento con puntos', { ...base, mode: 'preview', nuevo_n_documento: '1.025.776.356' }],
  ['documento con ruta', { ...base, mode: 'preview', nuevo_n_documento: '../1234' }],
  ['uuid invalido', { ...base, mode: 'preview', inscripcion_id: 'x' }],
  ['motivo obligatorio', { ...base, mode: 'apply', motivo: '  ' }],
]) {
  assert.equal((await call(body)).status, 400, label);
}
assert.equal((await call({ ...base, mode: 'preview', inscripcion_id: '33333333-3333-3333-3333-333333333333' })).status, 404);

// Vista previa: no cambia nada.
reset();
let before = r2Snapshot();
let { status, body } = await call({ ...base, mode: 'preview' });
assert.equal(status, 200);
assert.equal(body.archivos.length, 5);
assert.ok(body.archivos.every((file) => file.estado === 'mover' && file.destino === targetOf(file.origen)));
assert.deepEqual(body.bloqueos, []);
assert.equal(r2Snapshot(), before);
assert.equal(state.rpcCalls.length, 0);
assert.equal(state.copies, 0);

// Aplicacion correcta.
reset();
({ status, body } = await call({ ...base, mode: 'apply' }));
assert.equal(status, 200, JSON.stringify(body));
assert.equal(body.resultado.movidos, 5);
assert.equal(body.resultado.eliminados_origen, 5);
assert.deepEqual(body.resultado.pendientes_limpieza, []);
assert.deepEqual([...state.r2.keys()].sort(), SOURCES.map(targetOf).sort());
assert.deepEqual([...state.r2.values()].sort(), [100, 101, 102, 103, 104]);
assert.equal(state.rpcCalls.length, 1);
assert.deepEqual(
  { ...state.rpcCalls[0], p_rutas: undefined },
  {
    p_inscripcion_id: ID, p_nuevo_documento: '1025776356', p_old_segments: ['25991526'], p_new_segment: '1025776356',
    p_radicado_segment: 'asp-2026-1769', p_actor_user_id: 'admin-1', p_motivo: 'Error de digitacion', p_rutas: undefined,
  },
);
assert.equal(state.generateCalls.length, 1);
assert.equal(state.generateCalls[0].authorization, 'Bearer admin-jwt');
assert.equal(state.generateCalls[0].body.regenerar, true);
assert.equal(state.generateCalls[0].body.documento_persona, '1025776356');
assert.equal(state.generateCalls[0].body.form_data.n_documento, '1025776356');
assert.equal(state.generateCalls[0].body.firma_path, `${NEW}/firma/1-firma.png`);
assert.deepEqual(body.regeneracion, { ok: true, generated: 3 });
assert.equal(state.tables.portal_beneficiario_bitacora.at(-1).tipo_evento, 'regeneracion_documentos_inscripcion');

// Reejecucion idempotente: ya no hay nada que mover.
({ status, body } = await call({ ...base, mode: 'apply' }));
assert.equal(status, 200);
assert.equal(body.sin_cambios, true);
assert.equal(state.rpcCalls.length, 1);

// Sin regenerar PDFs.
reset();
({ body } = await call({ ...base, mode: 'apply', regenerar_pdfs: false }));
assert.equal(body.regeneracion.omitido, true);
assert.equal(state.generateCalls.length, 0);

// Fallo de regeneracion: el cambio se conserva y se informa.
reset({ generateResponse: { ok: false, error: 'GAS no disponible' } });
({ status, body } = await call({ ...base, mode: 'apply' }));
assert.equal(status, 200);
assert.equal(body.regeneracion.ok, false);
assert.match(body.regeneracion.error, /GAS/);
assert.equal(state.rpcCalls.length, 1);
({ status, body } = await call({ mode: 'regenerar', inscripcion_id: ID }));
assert.equal(status, 502);
assert.equal(state.generateCalls.at(-1).body.documento_persona, '1025776356');
state.generateResponse = { ok: true, generated: 3 };
({ status, body } = await call({ mode: 'regenerar', inscripcion_id: ID }));
assert.equal(status, 200);
assert.equal((await call({ mode: 'regenerar', inscripcion_id: ID }, 'user-jwt')).status, 403);

// Fallo de copia a mitad: se limpian las copias y no se toca la BD ni los originales.
reset({ copyFailAt: 3 });
({ status, body } = await call({ ...base, mode: 'apply' }));
assert.equal(status, 502);
assert.deepEqual([...state.r2.keys()].sort(), [...SOURCES].sort());
assert.equal(state.rpcCalls.length, 0);
assert.equal(state.generateCalls.length, 0);

// Fallo de BD: se eliminan las copias nuevas y se conservan los originales.
reset({ rpcError: 'Ya existe otra persona con ese tipo y numero de documento.' });
({ status, body } = await call({ ...base, mode: 'apply' }));
assert.equal(status, 409);
assert.match(body.error, /otra persona/);
assert.deepEqual([...state.r2.keys()].sort(), [...SOURCES].sort());
assert.equal(state.generateCalls.length, 0);

// Fallo al borrar originales: queda registrado para limpieza y no revierte.
reset();
state.deleteFail.add(SOURCES[1]);
({ status, body } = await call({ ...base, mode: 'apply' }));
assert.equal(status, 200);
assert.deepEqual(body.resultado.pendientes_limpieza, [SOURCES[1]]);
assert.equal(state.tables.portal_beneficiario_bitacora.some((row) => row.tipo_evento === 'correccion_documento_aspirante_pendiente_limpieza'), true);
assert.equal(state.rpcCalls.length, 1);

// Archivo faltante: se informa y el resto se mueve.
reset();
state.r2.delete(SOURCES[3]);
({ status, body } = await call({ ...base, mode: 'apply' }));
assert.equal(status, 200);
assert.equal(body.resultado.faltantes, 1);
assert.equal(body.resultado.movidos, 4);
assert.ok(body.advertencias.some((text) => text.includes(SOURCES[3])));

// Destino existente distinto: bloquea sin sobrescribir.
reset();
state.r2.set(targetOf(SOURCES[0]), 999);
before = r2Snapshot();
({ status, body } = await call({ ...base, mode: 'apply' }));
assert.equal(status, 409);
assert.match(body.error, /archivo distinto/);
assert.equal(r2Snapshot(), before);
assert.equal(state.copies, 0);
assert.equal(state.rpcCalls.length, 0);

// Destino identico ya presente: se reutiliza y se limpia el original.
reset();
state.r2.set(targetOf(SOURCES[0]), state.r2.get(SOURCES[0]));
({ status, body } = await call({ ...base, mode: 'apply' }));
assert.equal(status, 200);
assert.equal(body.resultado.movidos, 4);
assert.equal(body.resultado.eliminados_origen, 5);
assert.deepEqual([...state.r2.keys()].sort(), SOURCES.map(targetOf).sort());

// Bloqueos de negocio.
for (const [label, mutate, pattern] of [
  ['promovida', (s) => { s.inscripcion.promovido_a_beneficiario = true; }, /promovida/],
  ['beneficiario vinculado', (s) => s.tables.portal_beneficiarios.push({ id: 1, inscripcion_pk: ID }), /beneficiario/],
  ['persona con otras inscripciones', (s) => s.tables.inscripciones.push({ id: 'otra', persona_id: PERSONA }), /otras inscripciones/],
  ['documento de otra persona', (s) => s.tables.personas.push({ id: 'otra', tipo_documento: 'cc', n_documento: '1025776356' }), /otra persona/],
  ['inscripcion duplicada', (s) => s.tables.inscripciones.push({ id: 'dup', convocatoria_id: 'conv-1', n_documento: '1025776356', email: 'a@b.co' }), /convocatoria/],
]) {
  reset();
  mutate(state);
  before = r2Snapshot();
  ({ status, body } = await call({ ...base, mode: 'apply' }));
  assert.equal(status, 409, label);
  assert.match(body.error, pattern, label);
  assert.equal(r2Snapshot(), before, label);
  assert.equal(state.rpcCalls.length, 0, label);
  assert.equal(state.copies, 0, label);
}

// Rutas peligrosas en la inscripcion: se bloquean.
reset();
state.inscripcion.soportes = { x: `${OLD}/../otro/archivo.pdf` };
({ status, body } = await call({ ...base, mode: 'apply' }));
assert.equal(status, 409);
assert.match(body.error, /no validas/);
assert.equal(state.rpcCalls.length, 0);

console.log('PASS: auth, input validation, preview, copy/verify/db/delete order, rollback, idempotency, conflicts, regeneration');
