import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const database = new PGlite();
await database.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table portal_beneficiarios(id bigint primary key, auth_user_id uuid, deleted_at timestamptz);
  create table portal_auth_credentials(beneficiario_id bigint, password_hash text);
  create table portal_condonacion_final_documentos(
    beneficiario_id bigint, tipo_documento text, storage_path text, nombre_original text,
    mime_type text, size_bytes bigint, estado_validacion text
  );
  create table portal_condonacion_final(
    beneficiario_id bigint unique, estado text, preaprobado_at timestamptz, updated_at timestamptz
  );
  insert into portal_beneficiarios values (3288, '00000000-0000-0000-0000-000000000001', null), (3289, null, null);
  insert into portal_auth_credentials values (3288, 'old');
`);
await database.exec(readFileSync(new URL('../supabase/migrations/20261007160000_condonacion_document_sessions.sql', import.meta.url), 'utf8'));
const token = 'ab'.repeat(32);
const tokenHash = createHash('sha256').update(token).digest('hex');
await database.query(`insert into portal_document_sessions(token_hash, beneficiario_id, expires_at) values ($1, 3288, now() + interval '24 hours')`, [tokenHash]);
const upload = (credential, type = 'diploma', beneficiary = 3288, filename = 'test.pdf') => database.query(
  `select beneficiario_subir_documento_condonacion_por_sesion($1, $2, $3, 'test.pdf', 'application/pdf', 2630146) as result`,
  [credential, type, `beneficiarios/${beneficiary}/condonacion-final/${type}/${filename}`],
);
await database.exec('set role anon');
assert.equal((await database.query('select validar_sesion_documento_condonacion($1) as id', [token])).rows[0].id, 3288);
await assert.rejects(upload(null));
await assert.rejects(upload('ff'.repeat(32)));
await assert.rejects(upload(tokenHash));
await assert.rejects(upload(token, 'diploma', 3289));
await assert.rejects(upload(token, 'diploma', 3288, '../test.pdf'));
await assert.rejects(upload(token, 'invalid'));
await assert.rejects(database.query('select * from portal_document_sessions'));
await assert.rejects(database.query(`select _registrar_documento_condonacion(3288, 'diploma', 'x', 'x', 'x', 1)`));
await assert.rejects(database.query(`select beneficiario_subir_documento_condonacion_final('diploma', 'x', 'x', 'x', 1)`));
assert.equal((await upload(token)).rows[0].result.documentos_cargados, 1);
assert.equal((await upload(token)).rows[0].result.documentos_cargados, 1);
assert.equal((await upload(token, 'acta_grado')).rows[0].result.estado_final, 'pendiente_documentos');
assert.equal((await upload(token, 'historico_notas')).rows[0].result.estado_final, 'preaprobada_sistema');
await database.exec('reset role; set role authenticated');
await assert.rejects(database.query(`select beneficiario_subir_documento_condonacion_final('diploma', 'x', 'x', 'x', 1)`));
await database.query(`select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false)`);
assert.equal((await database.query(`select beneficiario_subir_documento_condonacion_final('diploma', 'beneficiarios/3288/condonacion-final/diploma/jwt.pdf', 'jwt.pdf', 'application/pdf', 100) as result`)).rows[0].result.ok, true);
await database.exec('reset role');
await database.exec(`update portal_beneficiarios set deleted_at = now() where id = 3288`);
await assert.rejects(upload(token));
await database.exec(`update portal_beneficiarios set deleted_at = null where id = 3288`);
await database.exec(`update portal_document_sessions set created_at = now() - interval '2 days', expires_at = now() - interval '1 day'`);
await assert.rejects(upload(token));
await database.exec(`update portal_document_sessions set expires_at = now() + interval '1 day'`);
await database.exec(`update portal_auth_credentials set password_hash = 'new' where beneficiario_id = 3288`);
await assert.rejects(upload(token));
await database.exec(`update portal_document_sessions set revoked_at = null`);
await database.exec('set role anon');
await database.query('select revocar_sesion_documento($1)', [token]);
await assert.rejects(upload(token));
await database.exec('reset role');
assert.equal((await database.query('select count(*)::int as count from portal_condonacion_final_documentos')).rows[0].count, 5);
await database.close();
console.log('PASS: migration, permissions, token validation, ownership, JWT, document states, expiration and revocation');

let handler;
let passwordValid = true;
let lockedUntil = null;
let insertFails = false;
let storedSession;
const backend = {
  from(table) {
    return {
      select() { return this; },
      eq() { return this; },
      update() { return Promise.resolve({ error: null }); },
      maybeSingle() {
        return Promise.resolve({ data: { id: 1, beneficiario_id: 3288, password_hash: 'hash', locked_until: lockedUntil } });
      },
      single() { return Promise.resolve({ data: { id: 3288, onboarding_completado: true } }); },
      insert(value) {
        assert.equal(table, 'portal_document_sessions');
        storedSession = value;
        return Promise.resolve({ error: insertFails ? new Error('unavailable') : null });
      },
    };
  },
};
backend.from = ((original) => (table) => {
  const query = original(table);
  query.update = () => query;
  query.then = (resolve) => resolve({ error: null });
  return query;
})(backend.from.bind(backend));
const authSource = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/auth-credentials/index.ts', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '');
new Function('Deno', 'createClient', 'bcrypt', authSource)(
  { env: { get: () => 'test' }, serve: (callback) => { handler = callback; } },
  () => backend,
  { compare: async () => passwordValid },
);
const login = () => handler(new Request('https://test.local', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ method: 'login', document_number: 'test', password: 'test-password' }),
}));
const loginResponse = await login();
assert.equal(loginResponse.status, 200);
const loginData = await loginResponse.json();
assert.match(loginData.session_token, /^[a-f0-9]{64}$/);
assert.equal(storedSession.token_hash, createHash('sha256').update(loginData.session_token).digest('hex'));
assert.equal(JSON.stringify(storedSession).includes(loginData.session_token), false);
assert.ok(new Date(loginData.expires_at).getTime() > Date.now());
storedSession = null;
passwordValid = false;
assert.equal((await login()).status, 401);
assert.equal(storedSession, null);
passwordValid = true;
lockedUntil = new Date(Date.now() + 60000).toISOString();
assert.equal((await login()).status, 429);
assert.equal(storedSession, null);
lockedUntil = null;
insertFails = true;
assert.equal((await login()).status, 503);
console.log('PASS: login token hashing, invalid password, account lock and failed persistence');

let browserSession = null;
let rpcFails = false;
let rpcCalls = 0;
const client = {
  rpc: async () => { rpcCalls++; return { data: 3288, error: rpcFails ? new Error('expired') : null }; },
  auth: { getUser: async () => ({ data: { user: { id: 'jwt-user' } } }) },
  from: () => ({
    select() { return this; }, eq() { return this; }, is() { return this; },
    maybeSingle: async () => ({ data: { id: 3288 } }),
  }),
};
const portalSource = readFileSync(new URL('../src/lib/portalAuth.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '').replaceAll('export const ', 'const ');
const { getIdentity, revoke } = new Function('supabase', 'localStorage', `${portalSource}\nreturn { getIdentity: getCondonacionUploadIdentity, revoke: revokeDocumentSession };`)(
  client, { getItem: () => JSON.stringify(browserSession) },
);
assert.equal((await getIdentity(3288)).rpc, 'beneficiario_subir_documento_condonacion_final');
await assert.rejects(getIdentity(3289));
browserSession = { beneficiario_id: 3288 };
await assert.rejects(getIdentity(3288));
assert.equal(rpcCalls, 0);
browserSession.session_token = token;
assert.equal((await getIdentity(3288)).params.p_session_token, token);
await assert.rejects(getIdentity(3289));
rpcFails = true;
await assert.rejects(getIdentity(3288));
rpcFails = false;
await revoke();
console.log('PASS: legacy session rejection, document/JWT identity matching, expired session and logout RPC');