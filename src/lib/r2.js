import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

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
 * @param {string} filePath - Ruta del archivo en R2 (ej: documents/archivo.pdf)
 * @returns {Promise<string>} URL pública del archivo
 */
export const uploadToR2 = async (file, filePath) => {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: filePath,
      Body: file,
      ContentType: file.type || 'application/octet-stream',
    };

    const command = new PutObjectCommand(params);
    await r2Client.send(command);
    
    // Retorna URL pública
    return `${import.meta.env.VITE_R2_PUBLIC_URL}/${filePath}`;
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
    const params = {
      Bucket: BUCKET_NAME,
      Key: filePath,
    };
    const command = new DeleteObjectCommand(params);
    await r2Client.send(command);
    console.log(`✅ Archivo eliminado de R2: ${filePath}`);
  } catch (error) {
    console.error('❌ Error eliminando de R2:', error);
    throw error;
  }
};

/**
 * Obtiene la URL pública de un archivo en R2
 * @param {string} filePath - Ruta del archivo en R2
 * @returns {string} URL pública
 */
export const getPublicUrlR2 = (filePath) => {
  return `${import.meta.env.VITE_R2_PUBLIC_URL}/${filePath}`;
};
