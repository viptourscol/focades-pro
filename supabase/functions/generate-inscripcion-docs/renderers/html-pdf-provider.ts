// @ts-nocheck

type HtmlPdfProviderOptions = {
  endpoint: string;
  apiKey?: string;
  timeoutMs: number;
  html: string;
  title: string;
};

const base64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const renderHtmlToPdf = async ({ endpoint, apiKey, timeoutMs, html, title }: HtmlPdfProviderOptions) => {
  if (!endpoint) {
    throw new Error('DOCS_HTML_PDF_ENDPOINT no está configurado.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ html, title }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      throw new Error(`Proveedor HTML->PDF respondió ${response.status}: ${responseText || response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/pdf')) {
      return new Uint8Array(await response.arrayBuffer());
    }

    const payload = await response.json().catch(() => null);
    const base64 = payload?.pdf_base64 || payload?.data?.pdf_base64;

    if (!base64) {
      throw new Error('El proveedor HTML->PDF no devolvió PDF válido.');
    }

    return base64ToBytes(base64);
  } finally {
    clearTimeout(timeout);
  }
};
