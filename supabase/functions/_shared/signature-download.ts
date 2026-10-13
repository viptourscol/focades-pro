import { AwsClient } from 'https://esm.sh/aws4fetch@1'

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: Blob | null; error: { message?: string } | null }>
    }
  }
}

export interface DownloadedSignature {
  bytes: Uint8Array
  mimeType: string
}

const R2_PREFIX = 'soportes/'

// La firma se sube a R2 con prefijo soportes/; las firmas antiguas pueden seguir en Supabase Storage.
export const downloadSignature = async (admin: StorageClient, rawPath: string): Promise<DownloadedSignature> => {
  const cleanPath = String(rawPath || '').trim().replace(/^\/+/, '');
  if (!cleanPath || cleanPath.includes('..')) {
    throw new Error('Ruta de firma inválida.');
  }

  const bucketPath = cleanPath.startsWith(R2_PREFIX) ? cleanPath.slice(R2_PREFIX.length) : cleanPath;
  const r2Key = `${R2_PREFIX}${bucketPath}`;
  let r2Detail = 'R2 no configurado';

  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
  const endpoint = Deno.env.get('R2_ENDPOINT');
  const bucket = Deno.env.get('R2_BUCKET');

  if (accessKeyId && secretAccessKey && endpoint && bucket) {
    try {
      const aws = new AwsClient({ accessKeyId, secretAccessKey, region: 'auto', service: 's3' });
      const signedRequest = await aws.sign(`${endpoint.replace(/\/+$/, '')}/${bucket}/${r2Key}`, {
        method: 'GET',
      });
      const response = await fetch(signedRequest, { signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        return {
          bytes: new Uint8Array(await response.arrayBuffer()),
          mimeType: (response.headers.get('content-type') || '').split(';')[0].trim() || 'image/png',
        };
      }
      r2Detail = `R2 respondió ${response.status}`;
    } catch (error) {
      r2Detail = `R2 no disponible: ${error instanceof Error ? error.message : 'error desconocido'}`;
    }
  }

  const { data, error } = await admin.storage.from('soportes').download(bucketPath);
  if (error || !data) {
    throw new Error(`No se pudo descargar la firma (${r2Detail}; Storage: ${error?.message || 'sin archivo'})`);
  }

  return {
    bytes: new Uint8Array(await data.arrayBuffer()),
    mimeType: String(data.type || '').trim() || 'image/png',
  };
};
