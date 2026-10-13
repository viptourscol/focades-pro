import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.VITE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.VITE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.VITE_R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = 'focades-pro';
const PREFIX = 'soportes/';

async function countFilesInR2() {
  let totalFiles = 0;
  let totalSize = 0;
  let continuationToken = null;

  console.log('📊 Contando archivos en R2...\n');

  try {
    do {
      const command = new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: PREFIX,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      });

      const response = await s3Client.send(command);

      if (response.Contents) {
        for (const object of response.Contents) {
          totalFiles++;
          totalSize += object.Size || 0;
        }
      }

      continuationToken = response.NextContinuationToken;

      console.log(`✅ Procesados: ${totalFiles} archivos | Tamaño: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);

      if (continuationToken) {
        await new Promise(r => setTimeout(r, 500)); // Evitar rate limiting
      }
    } while (continuationToken);

    console.log('\n✅ VERIFICACIÓN COMPLETA');
    console.log(`📦 Total de archivos en R2: ${totalFiles}`);
    console.log(`💾 Tamaño total: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
    console.log(`📄 Tamaño en bytes: ${totalSize.toLocaleString()} bytes`);
    console.log(`\n✨ Esperados: 3,870 archivos`);
    console.log(`✨ Encontrados: ${totalFiles}`);
    
    if (totalFiles === 3870) {
      console.log('\n🎉 ¡MIGRACIÓN COMPLETADA EXITOSAMENTE! Todos los archivos están en R2.');
    } else {
      console.log(`\n⚠️ Diferencia: ${Math.abs(totalFiles - 3870)} archivos`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

countFilesInR2();
