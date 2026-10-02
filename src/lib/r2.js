import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2Client = new S3Client({
  region: 'auto',
  credentials: {
    accessKeyId: import.meta.env.VITE_R2_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_R2_SECRET_ACCESS_KEY,
  },
  endpoint: import.meta.env.VITE_R2_ENDPOINT,
});

const BUCKET_NAME = 'focades-pro';

/**
 * Sube un archivo a Cloudflare R2
 * @param {File} file - Archivo a subir
 * @param {string} filePath - Ruta del archivo en R2 (ej: documents/archivo.pdf o soportes/documents/archivo.pdf)
 * @returns {Promise<string>} URL pública del archivo
 */
export const uploadToR2 = async (file, filePath) => {
  try {
    // Normalizar la ruta: asegurar que tenga el prefijo "soportes/"
    let normalizedPath = filePath;
    if (!normalizedPath.startsWith('soportes/')) {
      normalizedPath = `soportes/${normalizedPath}`;
    }

    // Convertir File a Uint8Array (AWS SDK v3 requiere esto en el navegador)
    const arrayBuffer = await file.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);

    const params = {
      Bucket: BUCKET_NAME,
      Key: normalizedPath,
      Body: body,
      ContentType: file.type || 'application/octet-stream',
    };

    const command = new PutObjectCommand(params);
    await r2Client.send(command);
    
    // Retorna URL pública
    return `${import.meta.env.VITE_R2_PUBLIC_URL}/${normalizedPath}`;
  } catch (error) {
    console.error('❌ Error subiendo a R2:', error);
    throw error;
  }
};

/**
 * Elimina un archivo de Cloudflare R2
 * @param {string} filePath - Ruta del archivo en R2
 */
export const deleteFromR2 = async (filePath) => {
  try {
    // Normalizar la ruta: asegurar que tenga el prefijo "soportes/"
    let normalizedPath = filePath;
    if (!normalizedPath.startsWith('soportes/')) {
      normalizedPath = `soportes/${normalizedPath}`;
    }

    const params = {
      Bucket: BUCKET_NAME,
      Key: normalizedPath,
    };
    const command = new DeleteObjectCommand(params);
    await r2Client.send(command);
    console.log(`✅ Archivo eliminado de R2: ${normalizedPath}`);
  } catch (error) {
    console.error('❌ Error eliminando de R2:', error);
    throw error;
  }
};

/**
 * Obtiene la URL pública de un archivo en R2
 * @param {string} filePath - Ruta del archivo en R2 (puede o no incluir prefijo "soportes/")
 * @returns {string} URL pública
 */
export const getPublicUrlR2 = (filePath) => {
  if (!filePath) return null;
  
  // Normalizar la ruta: asegurar que tenga el prefijo "soportes/"
  let normalizedPath = filePath;
  if (!normalizedPath.startsWith('soportes/')) {
    normalizedPath = `soportes/${normalizedPath}`;
  }
  
  return `${import.meta.env.VITE_R2_PUBLIC_URL}/${normalizedPath}`;
};

/**
 * Obtiene una URL presigned para descargar un archivo de R2
 * La URL expira automáticamente después del tiempo especificado
 * 
 * ✅ SEGURO: URL solo válida por tiempo limitado, imposible falsificar
 * 
 * @param {string} filePath - Ruta del archivo en R2 (puede o no incluir prefijo "soportes/")
 * @param {number} expiresIn - Tiempo de expiración en segundos (default: 3600 = 1 hora)
 *                             Opciones: 
 *                             - 3600 (1 hora) para visualización temporal
 *                             - 86400 (24 horas) para documentos regulares
 *                             - 604800 (7 días) para archivos importantes
 * @returns {Promise<string>} URL firmada con token de acceso temporal
 */
export const getPresignedUrlR2 = async (filePath, expiresIn = 3600) => {
  if (!filePath) return null;
  
  try {
    // Normalizar la ruta: asegurar que tenga el prefijo "soportes/"
    let normalizedPath = filePath;
    if (!normalizedPath.startsWith('soportes/')) {
      normalizedPath = `soportes/${normalizedPath}`;
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: normalizedPath,
    });

    // Generar URL firmada con expiración
    const presignedUrl = await getSignedUrl(r2Client, command, { 
      expiresIn // en segundos
    });

    console.log(`✅ Presigned URL generada para: ${normalizedPath} (expira en ${expiresIn}s)`);
    return presignedUrl;
  } catch (error) {
    console.error('❌ Error generando presigned URL:', error);
    throw error;
  }
};
