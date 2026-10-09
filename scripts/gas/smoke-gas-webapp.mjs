// Prueba de humo del Web App de GAS ya desplegado: node scripts/gas/smoke-gas-webapp.mjs
// Variables: GAS_WEBHOOK_URL, GAS_API_KEY, GAS_SHARED_SECRET (opcionales: GAS_SMOKE_MAX_MS, GAS_SMOKE_TIMEOUT_MS,
// GAS_TEMPLATE_FORMULARIO_ID, GAS_TEMPLATE_TERMINOS_ID, GAS_TEMPLATE_DATOS_ID). Nunca se imprimen URL ni claves.
import { performance } from 'node:perf_hooks';

const required = ['GAS_WEBHOOK_URL', 'GAS_API_KEY', 'GAS_SHARED_SECRET'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Faltan variables de entorno: ${missing.join(', ')}`);
  process.exit(2);
}

const url = process.env.GAS_WEBHOOK_URL;
const apiKey = process.env.GAS_API_KEY;
const sharedSecret = process.env.GAS_SHARED_SECRET;
const maxMs = Number(process.env.GAS_SMOKE_MAX_MS || 15000);
const timeoutMs = Number(process.env.GAS_SMOKE_TIMEOUT_MS || 60000);

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DOCUMENTS = [
  { tipo: 'formulario_credito_educativo', titulo: 'Formulario de solicitud', env: 'GAS_TEMPLATE_FORMULARIO_ID' },
  { tipo: 'aceptacion_terminos_condiciones', titulo: 'Terminos y condiciones', env: 'GAS_TEMPLATE_TERMINOS_ID' },
  { tipo: 'autorizacion_tratamiento_datos', titulo: 'Tratamiento de datos', env: 'GAS_TEMPLATE_DATOS_ID' },
].map(({ tipo, titulo, env }) => ({
  tipo,
  titulo,
  fileName: `${tipo}.pdf`,
  ...(process.env[env] ? { templateId: process.env[env] } : {}),
}));

const failures = [];
const fail = (message) => failures.push(message);

const request = async (init) => {
  const started = performance.now();
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // se informa abajo con el estado HTTP
  }
  return { status: response.status, json, elapsedMs: Math.round(performance.now() - started) };
};

const buildBody = (withCredentials) => ({
  source: 'smoke',
  documents: DOCUMENTS,
  payload: {
    radicado: 'SMOKE-TEST',
    inscripcion_id: '00000000-0000-0000-0000-000000000000',
    documento_persona: '0000000000',
    generated_at_label: new Date().toISOString(),
    tokens: {
      nombre_completo: 'Prueba Smoke',
      n_documento: '0000000000',
      tipo_documento: 'CC',
      firma_timestamp: new Date().toISOString(),
      firma_hash_datos: 'smoke-hash',
    },
    form_data: { nombre_completo: 'Prueba Smoke', n_documento: '0000000000', tipo_documento: 'CC', email: 'smoke@example.com', modalidad: 'Prueba' },
    signature: { mime_type: 'image/png', base64: PNG_1X1 },
  },
  ...(withCredentials ? { api_key: apiKey, shared_secret: sharedSecret } : {}),
});

const post = (withCredentials) =>
  request({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(withCredentials ? { 'x-api-key': apiKey, 'x-gas-secret': sharedSecret } : {}),
    },
    body: JSON.stringify(buildBody(withCredentials)),
  });

try {
  const health = await request({ method: 'GET' });
  console.log(`GET  estado=${health.status} servicio=${health.json?.service} version=${health.json?.version} (${health.elapsedMs} ms)`);
  if (health.json?.service !== 'focades-gas-pdf') fail('El GET no devolvio service=focades-gas-pdf: la URL no parece ser este Web App.');
  if (health.json?.auth_configured !== true) fail('El script no tiene configuradas DOCS_GAS_API_KEY y DOCS_GAS_SHARED_SECRET.');
  if (!process.env.GAS_TEMPLATE_FORMULARIO_ID && health.json?.templates_configured !== true) {
    fail('Faltan propiedades TEMPLATE_* en el script y no se enviaron IDs de plantilla.');
  }

  const anonymous = await post(false);
  console.log(`POST sin credenciales -> ok=${anonymous.json?.ok} (${anonymous.elapsedMs} ms)`);
  if (anonymous.json?.ok !== false) fail('Una peticion SIN credenciales no fue rechazada.');

  const generation = await post(true);
  console.log(`POST con credenciales -> ok=${generation.json?.ok} documentos=${generation.json?.documents?.length ?? 0} (${generation.elapsedMs} ms)`);
  if (generation.json?.ok !== true) {
    fail(`La generacion fallo: ${generation.json?.error || `HTTP ${generation.status} sin JSON`}`);
  } else {
    const documents = generation.json.documents || [];
    if (documents.length !== DOCUMENTS.length) fail(`Se esperaban ${DOCUMENTS.length} documentos y llegaron ${documents.length}.`);
    for (const document of documents) {
      const bytes = Buffer.from(String(document.pdf_base64 || ''), 'base64');
      const valid = bytes.subarray(0, 5).toString('latin1') === '%PDF-' && bytes.length > 1024;
      console.log(`  ${document.tipo}: ${bytes.length} bytes ${valid ? 'PDF valido' : 'INVALIDO'}`);
      if (!valid) fail(`El documento ${document.tipo} no es un PDF valido.`);
    }
    if (generation.elapsedMs > maxMs) fail(`La generacion tardo ${generation.elapsedMs} ms (maximo aceptado ${maxMs} ms).`);
  }
} catch (error) {
  fail(`No se pudo completar la prueba: ${error instanceof Error ? error.message : 'error desconocido'}`);
}

if (failures.length) {
  console.error('\nFALLO:');
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}
console.log('\nOK: Web App de GAS responde, rechaza peticiones sin credenciales y genera PDFs validos.');
