export type RenderEngine = 'pdf_lib' | 'html_pdf';

export type RenderConfig = {
  engine: RenderEngine;
  fallbackToPdfLib: boolean;
  htmlPdfEndpoint: string;
  htmlPdfApiKey: string;
  htmlPdfTimeoutMs: number;
};

const parseBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
};

const parseTimeout = (value: string | undefined, defaultValue: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
};

export const getRenderConfig = (): RenderConfig => {
  const engineRaw = (Deno.env.get('DOCS_RENDER_ENGINE') || 'pdf_lib').trim().toLowerCase();
  const engine: RenderEngine = engineRaw === 'html_pdf' ? 'html_pdf' : 'pdf_lib';

  return {
    engine,
    fallbackToPdfLib: parseBoolean(Deno.env.get('DOCS_RENDER_FALLBACK_TO_PDF_LIB'), true),
    htmlPdfEndpoint: Deno.env.get('DOCS_HTML_PDF_ENDPOINT') || '',
    htmlPdfApiKey: Deno.env.get('DOCS_HTML_PDF_API_KEY') || '',
    htmlPdfTimeoutMs: parseTimeout(Deno.env.get('DOCS_HTML_PDF_TIMEOUT_MS'), 12000),
  };
};
