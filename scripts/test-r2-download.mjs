import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const environment = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  R2_ENDPOINT: 'https://test.r2.cloudflarestorage.com',
  R2_BUCKET: 'focades-pro',
  R2_ACCESS_KEY_ID: 'test-access-key',
  R2_SECRET_ACCESS_KEY: 'test-secret-key',
};
let handler;
const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/get-presigned-download-url/index.ts', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '');
const sign = new Function('Deno', 'createClient', 'S3Client', 'GetObjectCommand', 'getSignedUrl', `${source}\nreturn generatePresignedUrl;`)(
  { env: { get: (key) => environment[key] }, serve: (callback) => { handler = callback; } },
  () => ({ auth: { getUser: async (token) => ({ data: { user: token === 'valid-jwt' ? { id: 'test-admin' } : null } }) } }),
  S3Client, GetObjectCommand, getSignedUrl,
);

const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const verifySignature = (url) => {
  const query = [...url.searchParams].filter(([key]) => key !== 'X-Amz-Signature')
    .map(([key, value]) => `${encode(key)}=${encode(value)}`).sort().join('&');
  const canonical = ['GET', url.pathname, query, `host:${url.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const scope = url.searchParams.get('X-Amz-Credential').split('/').slice(1).join('/');
  const datetime = url.searchParams.get('X-Amz-Date');
  const toSign = ['AWS4-HMAC-SHA256', datetime, scope, createHash('sha256').update(canonical).digest('hex')].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${environment.R2_SECRET_ACCESS_KEY}`, datetime.slice(0, 8)), 'auto'), 's3'), 'aws4_request');
  assert.equal(url.searchParams.get('X-Amz-Signature'), hmac(key, toSign).toString('hex'));
};

const prefix = 'soportes/beneficiarios/3288/condonacion-final/acta_grado/';
for (const filename of ['1791388314165-CERTIFICADO_ART.__383_E.T_-_junio_23.pdf', 'document with spaces.pdf', 'document%20literal+#?.pdf', 'documento-\u00e1.pdf']) {
  for (const endpoint of ['https://test.r2.cloudflarestorage.com', 'https://test.r2.cloudflarestorage.com/']) {
    environment.R2_ENDPOINT = endpoint;
    const url = new URL(await sign(prefix + filename, 3600));
    assert.equal(decodeURIComponent(url.pathname), `/focades-pro/${prefix}${filename}`);
    assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
    assert.equal(url.searchParams.get('X-Amz-Expires'), '3600');
    assert.equal(url.hash, '');
    verifySignature(url);
  }
}

const request = (body, token = 'valid-jwt', method = 'POST') => handler(new Request('https://test.local', {
  method,
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
}));
const filePath = prefix + 'test.pdf';
const response = await request({ filePath, contentType: 'application/pdf' });
assert.equal(response.status, 200);
const result = await response.json();
const url = new URL(result.presignedUrl);
assert.equal(url.searchParams.get('X-Amz-Expires'), '86400');
assert.ok(Date.parse(result.expiresAt) > Date.now());
verifySignature(url);
assert.equal((await request({ filePath, expiresIn: 604800 })).status, 200);
for (const expiresIn of [0, -1, 1.5, '3600', 604801]) {
  assert.equal((await request({ filePath, expiresIn })).status, 400);
}
for (const invalidPath of [null, 123, '', 'other/test.pdf', 'soportes/../test.pdf']) {
  assert.equal((await request({ filePath: invalidPath })).status, 400);
}
assert.equal((await request({ filePath }, 'invalid-jwt')).status, 401);
assert.equal((await request(null, '', 'OPTIONS')).status, 200);
assert.equal((await request(null, '', 'GET')).status, 405);
console.log('PASS: bucket, host-only GET, independent SigV4 verification, encoded paths, expiration, invalid input and JWT rejection');