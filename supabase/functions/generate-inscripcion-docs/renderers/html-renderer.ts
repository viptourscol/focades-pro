// @ts-nocheck
import type { RenderConfig } from '../config.ts';
import type { RenderContext } from '../document-model.ts';
import { FOOTER_LINE_1, FOOTER_LINE_2, LEGAL_DOC_TYPES } from '../templates.ts';
import { renderHtmlToPdf } from './html-pdf-provider.ts';

const replaceTemplateTokens = (text: string, tokens: Record<string, string>) => {
  let result = text;
  Object.entries(tokens).forEach(([key, value]) => {
    result = result.replaceAll(`{{${key}}}`, value || '');
  });
  return result;
};

const escapeHtml = (value: string) =>
  String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
};

const renderParagraphs = (paragraphs: string[], tokens: Record<string, string>) =>
  paragraphs
    .map((paragraph) => `<p>${escapeHtml(replaceTemplateTokens(paragraph, tokens))}</p>`)
    .join('');

export const renderWithHtml = async (context: RenderContext, config: RenderConfig) => {
  const { template, formData, radicado, signatureBytes, logoBytes, generatedAtLabel, tokens } = context;

  const aspirante = String(formData.nombre_completo || '').trim() || 'No informado';
  const documento = String(formData.n_documento || '').trim() || 'No informado';
  const tipoDocumento = String(formData.tipo_documento || '').trim();
  const shouldDecoratePages = LEGAL_DOC_TYPES.has(template.tipo);

  const signatureBase64 = bytesToBase64(signatureBytes);
  const logoBase64 = logoBytes ? bytesToBase64(logoBytes) : '';

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 28mm 16mm 24mm 16mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 11pt; line-height: 1.5; }
    h1 { font-size: 15pt; margin: 0 0 16px; color: #0f2b54; }
    .meta { margin: 0 0 14px; font-size: 10pt; }
    .meta div { margin-bottom: 4px; }
    p { margin: 0 0 10px; text-align: justify; }
    .header { ${shouldDecoratePages ? 'display:flex;' : 'display:none;'} align-items: center; margin-bottom: 10px; }
    .header img { height: 52px; width: auto; }
    .signature { margin-top: 20px; }
    .signature img { width: 220px; height: auto; display: block; }
    .signature-line { border-bottom: 1px solid #9ca3af; width: 250px; margin-top: 4px; }
    .signature-text { font-size: 10pt; color: #374151; margin-top: 6px; }
    .footer { ${shouldDecoratePages ? 'display:block;' : 'display:none;'} position: fixed; left: 0; right: 0; bottom: -14mm; font-size: 8.5pt; color: #4b5563; text-align: center; border-top: 1px solid #d1d5db; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="header">
    ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" alt="Logo" />` : ''}
  </div>
  <h1>${escapeHtml(template.titulo)}</h1>
  <div class="meta">
    <div><strong>Radicado:</strong> ${escapeHtml(radicado)}</div>
    <div><strong>Fecha de generación:</strong> ${escapeHtml(generatedAtLabel)}</div>
    <div><strong>Aspirante:</strong> ${escapeHtml(aspirante)}</div>
    <div><strong>Documento:</strong> ${escapeHtml(`${tipoDocumento} ${documento}`.trim())}</div>
    <div><strong>Correo:</strong> ${escapeHtml(String(formData.email || ''))}</div>
  </div>
  ${renderParagraphs(template.cuerpo, tokens)}
  <div class="signature">
    <img src="data:image/png;base64,${signatureBase64}" alt="Firma" />
    <div class="signature-line"></div>
    <div class="signature-text">Firma del aspirante</div>
    <div class="signature-text">${escapeHtml(`${aspirante} - ${tipoDocumento} ${documento}`.trim())}</div>
  </div>
  <div class="footer">
    <div>${escapeHtml(FOOTER_LINE_1)}</div>
    <div>${escapeHtml(FOOTER_LINE_2)}</div>
  </div>
</body>
</html>`;

  return await renderHtmlToPdf({
    endpoint: config.htmlPdfEndpoint,
    apiKey: config.htmlPdfApiKey,
    timeoutMs: config.htmlPdfTimeoutMs,
    html,
    title: template.titulo,
  });
};
