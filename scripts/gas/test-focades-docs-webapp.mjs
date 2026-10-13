import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const source = readFileSync(`${scriptDir}focades-docs-webapp.gs`, 'utf8');
const PDF = Buffer.from('%PDF-1.4 documento de prueba');
const API_KEY = 'api-key-de-prueba';
const SECRET = 'secreto-de-prueba';

const createEnvironment = () => {
  const state = {
    props: {}, templates: {}, docs: {}, folders: {}, copies: [], trashed: [], replaceCalls: 0, images: [], nextCopy: 1,
  };
  const textElement = (record, match) => ({
    deleteText: (start, end) => { record.text = record.text.slice(0, start) + record.text.slice(end + 1); },
    getParent: () => ({
      getType: () => 'PARAGRAPH',
      asParagraph: () => ({
        appendInlineImage: (blob) => {
          const image = { width: 100, height: 50, getWidth() { return this.width; }, getHeight() { return this.height; }, setWidth(value) { this.width = value; }, setHeight(value) { this.height = value; } };
          state.images.push({ blob, image });
          return image;
        },
      }),
    }),
    match,
  });
  const body = (record) => ({
    getText: () => record.text,
    replaceText: (pattern, replacement) => {
      state.replaceCalls += 1;
      record.text = record.text.replace(new RegExp(pattern, 'g'), replacement);
    },
    findText: (pattern) => {
      const match = new RegExp(pattern).exec(record.text);
      if (!match) return null;
      return { getElement: () => ({ asText: () => textElement(record, match) }), getStartOffset: () => match.index, getEndOffsetInclusive: () => match.index + match[0].length - 1 };
    },
  });
  const globals = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (name) => state.props[name] ?? null }) },
    DriveApp: {
      getRootFolder: () => ({ id: 'root', getName: () => 'Mi unidad' }),
      getFolderById: (id) => {
        if (!state.folders[id]) throw new Error(`No se encontro la carpeta ${id}`);
        return { id, getName: () => state.folders[id] };
      },
      getFileById: (id) => {
        if (state.templates[id]) {
          return {
            getName: () => state.templates[id].name,
            makeCopy: (name, folder) => {
              const copyId = `copia-${state.nextCopy++}`;
              state.docs[copyId] = { text: state.templates[id].text };
              state.copies.push({ copyId, name, folder: folder.id });
              return { getId: () => copyId };
            },
          };
        }
        if (state.docs[id]) {
          return { getAs: () => ({ getBytes: () => [...PDF] }), setTrashed: () => state.trashed.push(id) };
        }
        throw new Error(`No se encontro el archivo ${id}`);
      },
    },
    DocumentApp: {
      ElementType: { PARAGRAPH: 'PARAGRAPH' },
      openById: (id) => {
        const record = state.docs[id] || state.templates[id];
        if (!record) throw new Error(`No se pudo abrir ${id}`);
        return { getBody: () => body(record), saveAndClose: () => {} };
      },
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
    Utilities: {
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      base64Decode: (text) => [...Buffer.from(text, 'base64')],
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      formatDate: () => '20261009-120000',
    },
    MimeType: { PDF: 'application/pdf' },
    Session: { getScriptTimeZone: () => 'America/Bogota' },
    Logger: { log: () => {} },
  };
  const names = Object.keys(globals);
  const api = new Function(...names, `${source}\nreturn { doGet, doPost, validateTemplates, findPlaceholders, buildTokenMap, getVersion: function () { return SCRIPT_VERSION; } };`)(...names.map((name) => globals[name]));
  return { api, state };
};

const configure = (state, extra = {}) => {
  Object.assign(state.props, {
    DOCS_GAS_API_KEY: API_KEY, DOCS_GAS_SHARED_SECRET: SECRET,
    TEMPLATE_FORMULARIO_ID: 'tpl-formulario', TEMPLATE_TERMINOS_ID: 'tpl-terminos', TEMPLATE_DATOS_ID: 'tpl-datos', ...extra,
  });
  state.templates['tpl-formulario'] = { name: 'Formulario', text: 'Radicado {{radicado}} - {{nombre_completo}} CC {{n_documento}} {{marcador_desconocido}}\nFirma: {{firma_aspirante}}\nHash {{firma_hash_datos}} {{telefono_vacio}}' };
  state.templates['tpl-terminos'] = { name: 'Terminos', text: 'Acepto {{nombre_completo}} el {{firma_timestamp}} {{n_celular}}' };
  state.templates['tpl-datos'] = { name: 'Datos', text: 'Autorizo {{nombre_completo}} {{email}}' };
};

const parse = (output) => JSON.parse(output.text);
const request = (api, body) => parse(api.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }));
const authed = (body) => ({ api_key: API_KEY, shared_secret: SECRET, ...body });
const payload = {
  radicado: 'ASP-2026-1769', inscripcion_id: 'uuid-1', generated_at_label: '9 de octubre de 2026',
  tokens: { firma_timestamp: '2026-10-09T12:00:00Z', firma_hash_datos: 'hash-123' },
  form_data: { nombre_completo: 'Manuela Prueba', n_documento: '1025776356', email: 'm@example.com', n_celular: '' },
  signature: { mime_type: 'image/png', base64: 'iVBORw0KGgo=' },
};
const docs = [
  { tipo: 'formulario_credito_educativo', fileName: 'formulario_credito_educativo.pdf' },
  { tipo: 'aceptacion_terminos_condiciones', fileName: 'aceptacion_terminos_condiciones.pdf' },
  { tipo: 'autorizacion_tratamiento_datos', fileName: 'autorizacion_tratamiento_datos.pdf' },
];

// doGet: version y estado de configuracion, sin secretos.
{
  const { api, state } = createEnvironment();
  let health = parse(api.doGet());
  assert.equal(health.service, 'focades-gas-pdf');
  assert.equal(health.version, api.getVersion());
  assert.equal(health.auth_configured, false);
  assert.equal(health.templates_configured, false);
  configure(state);
  health = parse(api.doGet());
  assert.equal(health.auth_configured, true);
  assert.equal(health.templates_configured, true);
  assert.equal(JSON.stringify(health).includes(API_KEY), false);
  assert.equal(JSON.stringify(health).includes(SECRET), false);
}

// Autenticacion: rechaza si falta configuracion y valida ambas claves.
{
  const { api, state } = createEnvironment();
  state.templates['tpl-formulario'] = { name: 'F', text: '{{nombre_completo}}' };
  state.props.TEMPLATE_FORMULARIO_ID = 'tpl-formulario';
  assert.match(request(api, { documents: docs.slice(0, 1), payload }).error, /Autenticacion no configurada/);
  state.props.DOCS_GAS_API_KEY = API_KEY;
  assert.match(request(api, authed({ documents: docs.slice(0, 1), payload })).error, /no configurada/);
  state.props.DOCS_GAS_SHARED_SECRET = SECRET;
  assert.match(request(api, { documents: docs.slice(0, 1), payload }).error, /API key invalida/);
  assert.match(request(api, { api_key: 'mal', shared_secret: SECRET, documents: docs.slice(0, 1), payload }).error, /API key invalida/);
  assert.match(request(api, { api_key: API_KEY, shared_secret: 'mal', documents: docs.slice(0, 1), payload }).error, /Shared secret invalido/);
  assert.match(request(api, { api_key: API_KEY, documents: docs.slice(0, 1), payload }).error, /Shared secret invalido/);
  assert.equal(request(api, authed({ documents: docs.slice(0, 1), payload })).ok, true);
  assert.equal(state.copies.length, 1);
}

// Peticiones invalidas.
{
  const { api, state } = createEnvironment();
  configure(state);
  assert.equal(parse(api.doPost({})).ok, false);
  assert.equal(parse(api.doPost({ postData: { contents: '' } })).ok, false);
  assert.equal(request(api, '{no es json').ok, false);
  assert.match(request(api, authed({ documents: [], payload })).error, /No se recibieron documentos/);
  assert.match(request(api, authed({ documents: [{ tipo: 'tipo_inexistente' }], payload })).error, /No se encontro templateId/);
  assert.match(request(api, authed({ documents: [{}], payload })).error, /requiere campo tipo/);
  assert.equal(state.copies.length, 0);
}

// Generacion: solo reemplaza marcadores presentes, conserva desconocidos e inserta firma.
{
  const { api, state } = createEnvironment();
  configure(state, { OUTPUT_FOLDER_ID: 'carpeta-1' });
  state.folders['carpeta-1'] = 'Salida FOCADES';
  const result = request(api, authed({ documents: docs, payload }));
  assert.equal(result.ok, true);
  assert.equal(result.generated, 3);
  assert.deepEqual(result.documents.map((doc) => doc.tipo), docs.map((doc) => doc.tipo));
  for (const doc of result.documents) {
    assert.equal(doc.mime_type, 'application/pdf');
    assert.deepEqual([...Buffer.from(doc.pdf_base64, 'base64')], [...PDF]);
    assert.ok(doc.provider_id.startsWith('copia-'));
  }
  assert.equal(state.copies.every((copy) => copy.folder === 'carpeta-1'), true);
  assert.match(state.copies[0].name, /^ASP-2026-1769-formulario_credito_educativo-20261009-120000$/);
  assert.equal(state.trashed.length, 3);

  // Formulario: 4 conocidos (la firma se inserta aparte; los desconocidos se dejan) + terminos: 3 + datos: 2.
  assert.equal(state.replaceCalls, 4 + 3 + 2);
  const [formulario, terminos, datos] = ['copia-1', 'copia-2', 'copia-3'].map((id) => state.docs[id].text);
  assert.match(formulario, /^Radicado ASP-2026-1769 - Manuela Prueba CC 1025776356 \{\{marcador_desconocido\}\}\nFirma: /);
  assert.match(formulario, /Hash hash-123 \{\{telefono_vacio\}\}$/);
  assert.equal(formulario.includes('{{firma_aspirante}}'), false);
  assert.equal(terminos, 'Acepto Manuela Prueba el 2026-10-09T12:00:00Z ');
  assert.equal(datos, 'Autorizo Manuela Prueba m@example.com');
  // Solo la plantilla del formulario tiene {{firma_aspirante}}: las demas no reciben imagen.
  assert.equal(state.images.length, 1);
  assert.equal(state.images.every(({ image }) => image.width === 180), true);
}

// KEEP_DOC_COPY, limpieza de marcadores y plantilla indicada por el request.
{
  const { api, state } = createEnvironment();
  configure(state, { KEEP_DOC_COPY: 'true', CLEANUP_UNUSED_PLACEHOLDERS: 'true' });
  assert.equal(request(api, authed({ documents: docs.slice(0, 1), payload })).ok, true);
  assert.equal(state.trashed.length, 0);
  assert.equal(state.docs['copia-1'].text.includes('{{'), false);

  state.templates['tpl-externa'] = { name: 'Externa', text: 'Solo {{nombre_completo}}' };
  const result = request(api, authed({ documents: [{ tipo: 'tipo_inexistente', templateId: 'tpl-externa' }], payload }));
  assert.equal(result.ok, true);
  assert.equal(state.docs['copia-2'].text, 'Solo Manuela Prueba');
}

// Una plantilla inaccesible no devuelve resultados parciales como exito.
{
  const { api, state } = createEnvironment();
  configure(state, { TEMPLATE_TERMINOS_ID: 'no-existe' });
  const result = request(api, authed({ documents: docs, payload }));
  assert.equal(result.ok, false);
  assert.match(result.error, /No se encontro el archivo no-existe/);
}

// Contrato del payload: llaves que envian las Edge Functions.
{
  const { api } = createEnvironment();
  const map = api.buildTokenMap('aspirantes', payload);
  assert.equal(map.nombre_completo, 'Manuela Prueba');
  assert.equal(map.n_documento, '1025776356');
  assert.equal(map.firma_hash_datos, 'hash-123');
  assert.equal(map.radicado, 'ASP-2026-1769');
  const onboarding = api.buildTokenMap('historicos', { profile: { nombre_completo: 'Beneficiaria', n_documento: '99' }, form_data: {} });
  assert.equal(onboarding.nombre_completo, 'Beneficiaria');
  assert.deepEqual(api.findPlaceholders('{{a}} {{b-c}} {{a}} {x} {{d.e}}'), ['a', 'b-c', 'd.e']);
}

// validateTemplates.
{
  const { api, state } = createEnvironment();
  configure(state, { OUTPUT_FOLDER_ID: 'carpeta-1' });
  state.folders['carpeta-1'] = 'Salida FOCADES';
  let report = api.validateTemplates();
  assert.equal(report.ok, true);
  assert.equal(report.timezone, 'America/Bogota');
  const formulario = report.items.find((item) => item.check === 'TEMPLATE_FORMULARIO_ID');
  assert.deepEqual(formulario.unknown_placeholders, ['marcador_desconocido', 'telefono_vacio']);
  assert.equal(formulario.has_signature_placeholder, true);
  assert.equal(report.items.find((item) => item.check === 'TEMPLATE_TERMINOS_ID').has_signature_placeholder, false);

  delete state.props.TEMPLATE_DATOS_ID;
  state.props.TEMPLATE_TERMINOS_ID = 'borrada';
  delete state.props.DOCS_GAS_API_KEY;
  delete state.folders['carpeta-1'];
  report = api.validateTemplates();
  assert.equal(report.ok, false);
  assert.deepEqual(report.items.filter((item) => !item.ok).map((item) => item.check).sort(), ['TEMPLATE_DATOS_ID', 'TEMPLATE_TERMINOS_ID', 'autenticacion', 'carpeta_salida']);
}
console.log('PASS: script GAS (version, auth cerrada, marcadores presentes, firma, plantillas, validateTemplates)');

// ----- Prueba de humo contra un servidor local que imita al Web App -----
const startServer = (mode) => new Promise((resolve) => {
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2048, 0x20)]).toString('base64');
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const reply = (json) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(json)); };
      if (req.method === 'GET') {
        return reply({ ok: true, service: 'focades-gas-pdf', version: 'test', auth_configured: mode !== 'sin_auth_configurada', templates_configured: mode !== 'sin_plantillas' });
      }
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const authorized = body.api_key === API_KEY && body.shared_secret === SECRET;
      if (!authorized && mode !== 'abierto') return reply({ ok: false, error: 'API key invalida.' });
      if (mode === 'lento') await new Promise((done) => setTimeout(done, 400));
      return reply({
        ok: true,
        documents: body.documents.map((doc) => ({ tipo: doc.tipo, pdf_base64: mode === 'pdf_invalido' ? Buffer.from('no es pdf').toString('base64') : pdf })),
      });
    });
  });
  server.listen(0, '127.0.0.1', () => resolve(server));
});
const runSmoke = (server, env = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, [`${scriptDir}smoke-gas-webapp.mjs`], {
    env: { ...process.env, GAS_WEBHOOK_URL: `http://127.0.0.1:${server.address().port}/exec`, GAS_API_KEY: API_KEY, GAS_SHARED_SECRET: SECRET, ...env },
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  child.on('close', (code) => resolve({ code, output }));
});

for (const [mode, expectedCode, pattern, env] of [
  ['ok', 0, /OK: Web App/, {}],
  ['abierto', 1, /SIN credenciales no fue rechazada/, {}],
  ['pdf_invalido', 1, /no es un PDF valido/, {}],
  ['sin_auth_configurada', 1, /no tiene configuradas/, {}],
  ['sin_plantillas', 1, /Faltan propiedades TEMPLATE/, {}],
  ['lento', 1, /tardo \d+ ms/, { GAS_SMOKE_MAX_MS: '100' }],
]) {
  const server = await startServer(mode);
  const { code, output } = await runSmoke(server, env);
  server.close();
  assert.equal(code, expectedCode, `${mode}: ${output}`);
  assert.match(output, pattern, mode);
  assert.equal(output.includes(API_KEY) || output.includes(SECRET) || output.includes('127.0.0.1'), false, `${mode}: no debe imprimir secretos ni la URL`);
}
assert.equal((await runSmoke({ address: () => ({ port: 1 }) }, { GAS_API_KEY: '' })).code, 2);
console.log('PASS: smoke test (exito, sin autenticacion, PDF invalido, configuracion incompleta, lentitud, sin secretos en la salida)');
