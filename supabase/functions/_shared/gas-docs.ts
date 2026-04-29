// @ts-nocheck

type GasDocumentRequest = {
  tipo: string;
  titulo?: string;
  fileName?: string;
  templateId?: string;
};

type GenerateGasDocsParams = {
  source: string;
  payload: Record<string, unknown>;
  documents: GasDocumentRequest[];
  timeoutMs?: number;
};

type GeneratedGasDocument = {
  tipo: string;
  fileName: string;
  mimeType: string;
  pdfBytes: Uint8Array;
  providerId: string;
};

const normalizeBase64 = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) {
    const commaIndex = raw.indexOf(',');
    return commaIndex >= 0 ? raw.slice(commaIndex + 1) : '';
  }
  return raw;
};

const base64ToBytes = (value: string) => {
  const normalized = normalizeBase64(value);
  if (!normalized) return new Uint8Array();
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
};

const pickString = (obj: Record<string, unknown>, keys: string[], fallback = '') => {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
};

const toRecordArray = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[];
};

const fetchPdfFromUrl = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type') || 'application/pdf';
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      mimeType: contentType,
      pdfBytes: bytes,
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const normalizeResponseDocuments = (json: Record<string, unknown>) => {
  const docs = [
    ...toRecordArray(json.documents),
    ...toRecordArray(json.docs),
    ...toRecordArray(json.files),
    ...toRecordArray(json.result),
  ];

  return docs;
};

export const resolveTemplateId = (envVarName: string) => {
  const value = String(Deno.env.get(envVarName) || '').trim();
  return value || undefined;
};

export const generatePdfDocumentsWithGas = async ({
  source,
  payload,
  documents,
  timeoutMs = 20000,
}: GenerateGasDocsParams): Promise<GeneratedGasDocument[]> => {
  const webhookUrl = String(Deno.env.get('DOCS_GAS_WEBHOOK_URL') || '').trim();
  const apiKey = String(Deno.env.get('DOCS_GAS_API_KEY') || '').trim();
  const sharedSecret = String(Deno.env.get('DOCS_GAS_SHARED_SECRET') || '').trim();

  if (!webhookUrl) {
    throw new Error('Falta configurar DOCS_GAS_WEBHOOK_URL para generar PDFs con Google Apps Script.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
        ...(sharedSecret ? { 'x-gas-secret': sharedSecret } : {}),
      },
      body: JSON.stringify({
        source,
        documents,
        payload,
        ...(apiKey ? { api_key: apiKey } : {}),
        ...(sharedSecret ? { shared_secret: sharedSecret } : {}),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error desconocido';
    throw new Error(`No se pudo conectar con GAS (${source}): ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = await response.text();
  let responseJson: Record<string, unknown> = {};
  try {
    responseJson = responseText ? JSON.parse(responseText) : {};
  } catch {
    if (!response.ok) {
      throw new Error(`GAS respondió HTTP ${response.status} con cuerpo no JSON: ${responseText.slice(0, 220)}`);
    }
  }

  if (!response.ok || responseJson?.ok === false) {
    const detail =
      pickString(responseJson, ['error', 'message', 'detail'], responseText?.slice(0, 220) || response.statusText) ||
      `HTTP ${response.status}`;
    throw new Error(`Error de GAS al generar documentos: ${detail}`);
  }

  const rawDocs = normalizeResponseDocuments(responseJson);
  if (rawDocs.length === 0) {
    throw new Error('GAS no devolvió documentos en la respuesta (documents/docs/files vacíos).');
  }

  const generated: GeneratedGasDocument[] = [];

  for (const rawDoc of rawDocs) {
    const tipo = pickString(rawDoc, ['tipo', 'type', 'document_type']);
    if (!tipo) continue;

    const providerId = pickString(rawDoc, ['provider_id', 'providerId', 'file_id', 'fileId', 'document_id'], '');
    const fileName = pickString(rawDoc, ['file_name', 'fileName', 'name'], `${tipo}.pdf`);
    const mimeType = pickString(rawDoc, ['mime_type', 'mimeType', 'content_type'], 'application/pdf');
    const base64 = pickString(rawDoc, ['pdf_base64', 'pdfBase64', 'base64', 'content_base64']);
    const pdfUrl = pickString(rawDoc, ['pdf_url', 'pdfUrl', 'url', 'download_url']);

    if (base64) {
      const bytes = base64ToBytes(base64);
      if (bytes.byteLength === 0) {
        throw new Error(`El documento ${tipo} llegó con base64 vacío o inválido.`);
      }

      generated.push({
        tipo,
        fileName,
        mimeType,
        pdfBytes: bytes,
        providerId,
      });
      continue;
    }

    if (pdfUrl) {
      const fetched = await fetchPdfFromUrl(pdfUrl, timeoutMs);
      generated.push({
        tipo,
        fileName,
        mimeType: fetched.mimeType || mimeType,
        pdfBytes: fetched.pdfBytes,
        providerId,
      });
      continue;
    }

    throw new Error(`El documento ${tipo} no incluye pdf_base64 ni pdf_url en la respuesta de GAS.`);
  }

  if (generated.length === 0) {
    throw new Error('No fue posible normalizar la respuesta de GAS a documentos PDF válidos.');
  }

  return generated;
};

export const encodeBytesToBase64 = (bytes: Uint8Array) => bytesToBase64(bytes);
