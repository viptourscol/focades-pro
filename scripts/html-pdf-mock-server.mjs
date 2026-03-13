import http from 'node:http';
import { URL } from 'node:url';

const port = Number(process.env.MOCK_HTML_PDF_PORT || 8789);

const json = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
};

const pdfResponse = (res, buffer) => {
  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': String(buffer.length),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(buffer);
};

const escapePdfText = (text) =>
  String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?');

const stripHtml = (html) =>
  String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const chunk = (text, maxChars = 88) => {
  const words = text.split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);
  return lines;
};

const createSimplePdfBuffer = ({ title, html }) => {
  const cleanTitle = escapePdfText(title || 'Documento');
  const text = stripHtml(html);
  const lines = chunk(text || 'Sin contenido recibido.');

  let y = 800;
  const lineHeight = 14;
  const commands = [];
  commands.push('BT /F1 16 Tf 50 820 Td (' + cleanTitle + ') Tj ET');
  for (const rawLine of lines.slice(0, 50)) {
    commands.push(`BT /F1 11 Tf 50 ${y} Td (${escapePdfText(rawLine)}) Tj ET`);
    y -= lineHeight;
    if (y < 70) break;
  }

  const stream = commands.join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
};

const parseBody = async (req) => {
  const chunks = [];
  for await (const chunkItem of req) {
    chunks.push(chunkItem);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type, authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${port}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { ok: true, service: 'html-pdf-mock', port });
    return;
  }

  if (req.method !== 'POST' || !['/', '/render'].includes(url.pathname)) {
    json(res, 404, { ok: false, error: 'Ruta no encontrada.' });
    return;
  }

  const body = await parseBody(req);
  if (!body) {
    json(res, 400, { ok: false, error: 'JSON inválido.' });
    return;
  }

  const html = typeof body.html === 'string' ? body.html : '';
  const title = typeof body.title === 'string' ? body.title : 'Documento';
  if (!html.trim()) {
    json(res, 400, { ok: false, error: 'El campo html es obligatorio.' });
    return;
  }

  const pdf = createSimplePdfBuffer({ title, html });
  const wantsJson =
    String(url.searchParams.get('format') || '').toLowerCase() === 'json' ||
    String(body.response_format || '').toLowerCase() === 'json';

  if (wantsJson) {
    json(res, 200, {
      ok: true,
      title,
      size_bytes: pdf.length,
      pdf_base64: pdf.toString('base64'),
    });
    return;
  }

  pdfResponse(res, pdf);
});

server.listen(port, () => {
  console.log(`[mock-html-pdf] listening on http://localhost:${port}`);
  console.log('[mock-html-pdf] endpoints: POST /render, GET /health');
});
