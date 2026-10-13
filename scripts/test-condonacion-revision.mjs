import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const database = new PGlite();
await database.exec(`
  create role anon; create role authenticated;
  create table portal_condonacion_final (
    id bigint, beneficiario_id bigint, estado text, observacion_admin text,
    revisado_at timestamptz, revisado_por_user_id uuid, updated_at timestamptz
  );
  create table portal_condonacion_final_documentos (
    id bigint, beneficiario_id bigint, estado_validacion text, observacion_admin text,
    revisado_at timestamptz, revisado_por_user_id uuid, updated_at timestamptz,
    tipo_documento text, nombre_original text
  );
  create table portal_beneficiario_bitacora (
    beneficiario_id bigint, actor_user_id uuid, tipo_evento text, categoria text,
    accion text, campo_cambio text, estado_anterior jsonb, estado_nuevo jsonb,
    nota text, metadata jsonb
  );
  insert into portal_condonacion_final(id, beneficiario_id, estado) values (1, 3288, 'pendiente_documentos');
  insert into portal_condonacion_final_documentos(id, beneficiario_id, estado_validacion, tipo_documento)
    values (2, 3288, 'pendiente', 'diploma');
`);
await database.exec(readFileSync(new URL('../supabase/migrations/20261007170000_condonacion_revision_bitacora.sql', import.meta.url), 'utf8'));
for (const [table, field, rejected, approved] of [
  ['portal_condonacion_final_documentos', 'estado_validacion', 'rechazado', 'aprobado'],
  ['portal_condonacion_final', 'estado', 'rechazada_admin', 'aprobada_admin'],
]) {
  await assert.rejects(database.exec(`update ${table} set ${field} = '${rejected}', observacion_admin = '  ', revisado_at = now()`));
  await database.exec(`update ${table} set ${field} = '${rejected}', observacion_admin = 'Documento ilegible', revisado_at = now(), revisado_por_user_id = '00000000-0000-0000-0000-000000000001'`);
  const { rows } = await database.query(`select * from portal_beneficiario_bitacora where estado_nuevo ->> '${field}' = '${rejected}'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nota, 'Documento ilegible');
  assert.equal(rows[0].beneficiario_id, 3288);
  assert.equal(rows[0].actor_user_id, '00000000-0000-0000-0000-000000000001');
  await database.exec(`update ${table} set updated_at = now()`);
  await database.exec(`update ${table} set ${field} = '${approved}', observacion_admin = null, revisado_at = now()`);
}
assert.equal((await database.query('select count(*)::int as count from portal_beneficiario_bitacora')).rows[0].count, 4);
await database.exec(`alter table portal_beneficiario_bitacora add constraint test_failure check (nota is null) not valid`);
await assert.rejects(database.exec(`update portal_condonacion_final set estado = 'rechazada_admin', observacion_admin = 'Rechazo nuevo', revisado_at = now()`));
assert.equal((await database.query('select estado from portal_condonacion_final')).rows[0].estado, 'aprobada_admin');
await database.close();
console.log('PASS: document/final approval and rejection, mandatory reason, actor, no duplicate audit and rollback on audit failure');

let handler;
let queryFailed = false;
const document = { id: 2, estado_validacion: 'rechazado', observacion_admin: 'Documento ilegible', revisado_at: '2026-10-07T17:00:00Z' };
const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/get-condonacion-modulo/index.ts', import.meta.url), 'utf8')).replace(/^import .*$/gm, '');
new Function('Deno', 'createClient', source)(
  { env: { get: () => 'test' }, serve: (callback) => { handler = callback; } },
  () => ({ from(table) {
    const query = {
      select(fields) {
        if (table === 'portal_condonacion_final_documentos') {
          assert.ok(fields.includes('observacion_admin'));
          assert.ok(fields.includes('revisado_at'));
        }
        return this;
      },
      eq() { return this; }, order() { return this; }, maybeSingle() { return this; },
      then(resolve) {
        const data = table === 'portal_beneficiarios' ? { id: 3288 }
          : table === 'portal_condonacion_final' ? { estado: 'rechazada_admin', observacion_admin: 'Corregir soportes' }
            : table === 'portal_condonacion_final_documentos' ? [document] : [];
        return Promise.resolve({ data, error: queryFailed && table === 'portal_condonacion_final_documentos' ? new Error('query failed') : null }).then(resolve);
      },
    };
    return query;
  } }),
);
const load = () => handler(new Request('https://test.local', { method: 'POST', body: JSON.stringify({ beneficiario_id: 3288 }) }));
const response = await load();
assert.equal(response.status, 200);
const payload = await response.json();
assert.equal(payload.documentos_finales[0].observacion_admin, 'Documento ilegible');
assert.equal(payload.condonacion_final.observacion_admin, 'Corregir soportes');
queryFailed = true;
assert.equal((await load()).status, 500);
console.log('PASS: beneficiary receives rejection reasons and failed review queries do not return empty success');