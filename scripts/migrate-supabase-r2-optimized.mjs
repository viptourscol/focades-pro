#!/usr/bin/env node

/**
 * Script de Migración OPTIMIZADO: Supabase Storage → Cloudflare R2
 * Solo migra archivos reales, no directorios
 * Mucho más rápido y confiable
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const LOG_FILE = path.join(PROJECT_ROOT, 'migration-log-v2.json');

// Configuración
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const r2Client = new S3Client({
  region: 'auto',
  credentials: {
    accessKeyId: process.env.VITE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.VITE_R2_SECRET_ACCESS_KEY,
  },
  endpoint: process.env.VITE_R2_ENDPOINT,
});

const R2_BUCKET = 'focades-pro';

let migrationLog = {
  startTime: new Date().toISOString(),
  endTime: null,
  summary: {
    totalFiles: 0,
    totalMigrated: 0,
    totalFailed: 0,
    errors: [],
  },
  files: [],
};

/**
 * Descarga un archivo de Supabase
 */
async function downloadFromSupabase(bucketName, filePath) {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(filePath);

    if (error) throw error;
    if (!data) throw new Error('No data returned');

    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Sube a R2
 */
async function uploadToR2(fileData, filePath) {
  try {
    let buffer = fileData;
    if (fileData instanceof Blob) {
      buffer = Buffer.from(await fileData.arrayBuffer());
    }

    const params = {
      Bucket: R2_BUCKET,
      Key: filePath,
      Body: buffer,
      ContentType: 'application/octet-stream',
    };

    const command = new PutObjectCommand(params);
    await r2Client.send(command);
    return true;
  } catch (error) {
    throw error;
  }
}

/**
 * Obtiene archivos reales (no directorios) en Supabase
 */
async function getFilesInSupabase(bucketName, folderPath = '') {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(folderPath, { limit: 1000 });

    if (error) throw error;

    // Filtrar solo archivos (id !== null significa que es archivo)
    const files = data.filter(item => item.id !== null);
    
    // Si hay más carpetas, scan recursivamente pero SOLO 1 nivel
    const subfolders = data.filter(item => item.id === null);
    
    for (const folder of subfolders) {
      const subfolder = folderPath ? `${folderPath}/${folder.name}` : folder.name;
      const { data: subdata, error: suberror } = await supabase.storage
        .from(bucketName)
        .list(subfolder, { limit: 500 });
      
      if (!suberror && subdata) {
        const subfiles = subdata
          .filter(item => item.id !== null)
          .map(file => ({
            ...file,
            name: `${subfolder}/${file.name}`
          }));
        files.push(...subfiles);
      }
    }

    return files;
  } catch (error) {
    console.error(`Error listando ${bucketName}/${folderPath}:`, error.message);
    return [];
  }
}

/**
 * Migrar bucket específico
 */
async function migrateBucket(bucketName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Iniciando migración: ${bucketName}`);
  console.log(`${'='.repeat(60)}`);

  const files = await getFilesInSupabase(bucketName);
  
  if (files.length === 0) {
    console.log(`ℹ️  Bucket vacío o solo contiene carpetas`);
    return;
  }

  console.log(`📦 Archivos encontrados: ${files.length}\n`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const progress = `[${i + 1}/${files.length}]`;
    const filePath = file.name;

    process.stdout.write(`\r${progress} ${filePath.substring(0, 60)}`);

    try {
      const fileData = await downloadFromSupabase(bucketName, filePath);
      const success = await uploadToR2(fileData, filePath);

      if (success) {
        migrationLog.summary.totalMigrated++;
        migrationLog.files.push({
          path: filePath,
          status: 'SUCCESS',
          bucket: bucketName,
          timestamp: new Date().toISOString(),
        });
      } else {
        throw new Error('Upload returned false');
      }
    } catch (error) {
      migrationLog.summary.totalFailed++;
      migrationLog.summary.errors.push({
        file: filePath,
        error: error.message,
      });
      migrationLog.files.push({
        path: filePath,
        status: 'FAILED',
        bucket: bucketName,
        reason: error.message,
      });
    }
  }

  console.log(`\n✅ Migración completada`);
}

/**
 * Main
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  MIGRACIÓN OPTIMIZADA: Supabase Storage → Cloudflare R2   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (!process.env.VITE_R2_ACCESS_KEY_ID) {
    console.error('❌ Faltan variables R2 en .env.local');
    process.exit(1);
  }

  const bucketsToMigrate = ['soportes', 'beneficiario-documentos', 'public-assets'];

  try {
    for (const bucket of bucketsToMigrate) {
      await migrateBucket(bucket);
    }

    migrationLog.endTime = new Date().toISOString();
    migrationLog.summary.totalFiles = migrationLog.files.length;

    // Guardar log
    fs.writeFileSync(LOG_FILE, JSON.stringify(migrationLog, null, 2));

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    📊 RESUMEN FINAL                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`📦 Total de archivos: ${migrationLog.summary.totalFiles}`);
    console.log(`✅ Migrados: ${migrationLog.summary.totalMigrated}`);
    console.log(`❌ Fallidos: ${migrationLog.summary.totalFailed}`);
    console.log(`\n📋 Log completo: ${LOG_FILE}`);

    if (migrationLog.summary.totalFailed === 0 && migrationLog.summary.totalMigrated > 0) {
      console.log('\n🎉 ¡Migración exitosa sin errores!');
      process.exit(0);
    } else if (migrationLog.summary.totalMigrated > 0) {
      console.log(`\n⚠️  ${migrationLog.summary.totalFailed} archivos fallaron`);
      process.exit(1);
    } else {
      console.log('\nℹ️  No se encontraron archivos para migrar');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Error crítico:', error.message);
    migrationLog.summary.errors.push({ critical: error.message });
    fs.writeFileSync(LOG_FILE, JSON.stringify(migrationLog, null, 2));
    process.exit(1);
  }
}

main();
