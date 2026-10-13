import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const ID = '8be70e51-bd29-4ee7-bd30-8e7bab8b4068';
const OTHER = '11111111-1111-1111-1111-111111111111';
const PERSONA = '22222222-2222-2222-2222-222222222222';
const ACTOR = '00000000-0000-0000-0000-000000000001';

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table public.personas (id uuid primary key, tipo_documento text, n_documento text);
  create table public.inscripciones (
    id uuid primary key, persona_id uuid, radicado text, tipo_documento text, n_documento text,
    firma_url text, url_doc_identidad text, soportes jsonb, datos_formulario jsonb, urls_documentos jsonb,
    promovido_a_beneficiario boolean not null default false
  );
  create table public.inscripciones_documentos (id bigserial primary key, inscripcion_id uuid, storage_path text);
  create table public.portal_beneficiarios (id bigserial primary key, inscripcion_pk uuid);
  create table public.portal_beneficiario_bitacora (
    inscripcion_id uuid, actor_user_id uuid, tipo_evento text, categoria text, accion text,
    campo_cambio text, estado_anterior jsonb, estado_nuevo jsonb, nota text, metadata jsonb
  );
  create unique index on public.personas (upper(btrim(tipo_documento)), btrim(n_documento));
  create unique index on public.inscripciones (upper(btrim(tipo_documento)), btrim(n_documento));
`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261009100000_admin_corregir_documento_aspirante.sql', import.meta.url), 'utf8'));

const seed = async () => {
  await db.exec(`truncate public.personas, public.inscripciones, public.inscripciones_documentos, public.portal_beneficiarios, public.portal_beneficiario_bitacora`);
  await db.exec(`insert into public.personas values ('${PERSONA}', 'CC', '1025776356')`);
  await db.exec(`
    insert into public.inscripciones values (
      '${ID}', '${PERSONA}', 'ASP-2026-1769', 'CC', '25991526',
      'expedientes/25991526/asp-2026-1769/firma/1-firma.png',
      'soportes/expedientes/25991526/asp-2026-1769/documento_identidad/2-id.pdf',
      '{"certificado_bancario":"expedientes/25991526/asp-2026-1769/certificado_bancario/3-cb.pdf","otro":"expedientes/999/asp-2026-1769/x.pdf"}',
      '{"n_documento":"25991526","email":"a@b.co","firma_storage_path":"expedientes/25991526/asp-2026-1769/firma/1-firma.png","soportes":{"diploma":"expedientes/25991526/asp-2026-1769/diploma/4-d.pdf"}}',
      '["soportes/expedientes/25991526/asp-2026-1769/diploma/4-d.pdf"]', false)`);
  await db.exec(`
    insert into public.inscripciones_documentos (inscripcion_id, storage_path) values
      ('${ID}', 'soportes/expedientes/25991526/asp-2026-1769/generados/formulario.pdf'),
      ('${ID}', 'expedientes/25991526/asp-2026-1769/firma/1-firma.png'),
      ('${ID}', 'soportes/expedientes/25991526/asp-2026-1770/generados/ajeno.pdf')`);
};
const apply = (overrides = {}) => {
  const args = {
    id: ID, doc: '1025776356', old: ['25991526'], seg: '1025776356', rad: 'asp-2026-1769', actor: ACTOR, motivo: 'Error de digitacion', ...overrides,
  };
  return db.query(
    `select public.admin_corregir_documento_aspirante_aplicar($1::uuid, $2, $3::text[], $4, $5, $6::uuid, $7, '[{"origen":"a","destino":"b"}]'::jsonb) as r`,
    [args.id, args.doc, args.old, args.seg, args.rad, args.actor, args.motivo],
  );
};
const snapshot = async () => JSON.stringify([
  (await db.query('select * from public.inscripciones')).rows,
  (await db.query('select * from public.inscripciones_documentos order by id')).rows,
  (await db.query('select * from public.personas')).rows,
  (await db.query('select count(*)::int c from public.portal_beneficiario_bitacora')).rows,
]);

await seed();
const { rows: [{ r }] } = await apply();
assert.equal(r.ok, true);
assert.equal(r.documento_anterior, '25991526');
const insc = (await db.query('select * from public.inscripciones')).rows[0];
assert.equal(insc.n_documento, '1025776356');
assert.equal(insc.firma_url, 'expedientes/1025776356/asp-2026-1769/firma/1-firma.png');
assert.equal(insc.url_doc_identidad, 'soportes/expedientes/1025776356/asp-2026-1769/documento_identidad/2-id.pdf');
assert.equal(insc.soportes.certificado_bancario, 'expedientes/1025776356/asp-2026-1769/certificado_bancario/3-cb.pdf');
assert.equal(insc.soportes.otro, 'expedientes/999/asp-2026-1769/x.pdf');
assert.equal(insc.datos_formulario.n_documento, '1025776356');
assert.equal(insc.datos_formulario.email, 'a@b.co');
assert.equal(insc.datos_formulario.firma_storage_path, 'expedientes/1025776356/asp-2026-1769/firma/1-firma.png');
assert.equal(insc.datos_formulario.soportes.diploma, 'expedientes/1025776356/asp-2026-1769/diploma/4-d.pdf');
assert.deepEqual(insc.urls_documentos, ['soportes/expedientes/1025776356/asp-2026-1769/diploma/4-d.pdf']);
const docs = (await db.query('select storage_path from public.inscripciones_documentos order by id')).rows.map((x) => x.storage_path);
assert.deepEqual(docs, [
  'soportes/expedientes/1025776356/asp-2026-1769/generados/formulario.pdf',
  'expedientes/1025776356/asp-2026-1769/firma/1-firma.png',
  'soportes/expedientes/25991526/asp-2026-1770/generados/ajeno.pdf',
]);
assert.equal((await db.query('select n_documento from public.personas')).rows[0].n_documento, '1025776356');
const log = (await db.query('select * from public.portal_beneficiario_bitacora')).rows;
assert.equal(log.length, 1);
assert.equal(log[0].tipo_evento, 'correccion_documento_aspirante');
assert.equal(log[0].nota, 'Error de digitacion');
assert.equal(log[0].actor_user_id, ACTOR);
assert.deepEqual(log[0].estado_anterior, { n_documento: '25991526' });
assert.deepEqual(log[0].estado_nuevo, { n_documento: '1025776356' });
assert.equal(log[0].metadata.documentos_actualizados, 2);
assert.ok(log[0].metadata.columnas_actualizadas.includes('soportes'));

// Segunda ejecucion: sin rutas antiguas, sin cambios de datos y con nueva constancia.
await apply({ old: [] });
assert.equal((await db.query('select count(*)::int c from public.portal_beneficiario_bitacora')).rows[0].c, 2);

// Rechazos: no deben modificar nada.
for (const [label, setup, overrides, pattern] of [
  ['motivo vacio', null, { motivo: '  ' }, /motivo/],
  ['documento vacio', null, { doc: ' ' }, /nuevo numero/],
  ['segmento invalido', null, { seg: '../x' }, /Segmento/],
  ['segmento anterior invalido', null, { old: ['a/b'] }, /anterior invalido/],
  ['inscripcion inexistente', null, { id: OTHER }, /no encontrada/],
  ['promovida', `update public.inscripciones set promovido_a_beneficiario = true`, {}, /promovida/],
  ['beneficiario vinculado', `insert into public.portal_beneficiarios (inscripcion_pk) values ('${ID}')`, {}, /promovida/],
  ['persona compartida', `insert into public.inscripciones (id, persona_id, radicado, tipo_documento, n_documento) values ('${OTHER}', '${PERSONA}', 'ASP-2', 'CC', '777')`, {}, /otras inscripciones/],
  ['documento de otra persona', `update public.personas set n_documento = '1' where id = '${PERSONA}'; insert into public.personas values ('${OTHER}', 'CC', '1025776356')`, {}, /otra persona/],
  ['documento duplicado en inscripciones', `insert into public.inscripciones (id, radicado, tipo_documento, n_documento) values ('${OTHER}', 'ASP-2', 'CC', '1025776356')`, {}, /misma convocatoria|Ya existe/],
]) {
  await seed();
  if (setup) await db.exec(setup);
  const before = await snapshot();
  await assert.rejects(apply(overrides), pattern, label);
  assert.equal(await snapshot(), before, `${label}: la transaccion no debio dejar cambios`);
}

// Permisos: solo service_role puede ejecutar la funcion.
await seed();
await db.exec('set role authenticated');
await assert.rejects(apply());
await db.exec('reset role; set role anon');
await assert.rejects(apply());
await db.exec('reset role; set role service_role');
assert.equal((await apply()).rows[0].r.ok, true);
await db.exec('reset role');

await db.close();
console.log('PASS: path/documento rewrite in text+json columns, audit, idempotency, rejections without side effects, service_role only');
