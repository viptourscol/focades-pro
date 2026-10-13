#!/usr/bin/env node

/**
 * Script de Migración Segura: Supabase Storage → Cloudflare R2
 * 
 * PRECAUCIÓN:
 * - Este script descarga y sube archivos reales
 * - Crea un log de todas las operaciones en migration-log.json
 * - Es reversible: puedes ver qué se migró
 * - No borra de Supabase, solo copia a R2
 * 
 * Uso: node scripts/migrate-supabase-r2-safe.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const LOG_FILE = path.join(PROJECT_ROOT, 'migration-log.json');

// Configuración Supabase
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuración R2
const r2Client = new S3Client({
  region: 'auto',
  credentials: {
    accessKeyId: process.env.VITE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.VITE_R2_SECRET_ACCESS_KEY,
  },
  endpoint: process.env.VITE_R2_ENDPOINT,
});

const R2_BUCKET = 'focades-pro';

// Log de migración
let migrationLog = {
  startTime: new Date().toISOString(),
  endTime: null,
  buckets: {
    soportes: { total: 0, migrated: 0, failed: 0, files: [] },
    'beneficiario-documentos': { total: 0, migrated: 0, failed: 0, files: [] },
    'public-assets': { total: 0, migrated: 0, failed: 0, files: [] },
  },
  summary: {
    totalFiles: 0,
    totalMigrated: 0,
    totalFailed: 0,
    errors: [],
  },
};

// Función para listar archivos en un bucket de Supabase (recursivo)
async function listSupabaseFilesRecursive(bucketName, path = '', maxDepth = 3, currentDepth = 0) {
  if (currentDepth >= maxDepth) return [];
  
  console.log(`\n📋 Escaneando: ${bucketName}/${path}`);
  let allFiles = [];
  
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(path, { limit: 1000, offset: 0 });

    if (error) throw error;

    for (const item of data) {
      const itemPath = path ? `${path}/${item.name}` : item.name;
      
      // Si es un directorio, explorar recursivamente
      if (item.id === null) {
        const subFiles = await listSupabaseFilesRecursive(bucketName, itemPath, maxDepth, currentDepth + 1);
        allFiles = allFiles.concat(subFiles);
      } else {
        // Es un archivo
        allFiles.push({ name: itemPath, size: item.metadata?.size || 0 });
      }
    }
  } catch (error) {
    console.error(`❌ Error escaneando ${path}:`, error.message);
  }

  return allFiles;
}

// Función anterior renombrada
async function listSupabaseFiles(bucketName) {
  console.log(`\n📋 Listando archivos de bucket '${bucketName}'...`);
  try {
    const files = await listSupabaseFilesRecursive(bucketName);
    console.log(`✅ Encontrados ${files.length} archivos en '${bucketName}'`);
    return files;
  } catch (error) {
    console.error(`❌ Error listando '${bucketName}':`, error.message);
    return [];
  }
}

// Función para descargar archivo de Supabase
async function downloadFromSupabase(bucketName, filePath) {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(filePath);

    if (error) throw error;
    if (!data) throw new Error('No data returned');

    return data;
  } catch (error) {
    console.error(`  ❌ Error descargando ${filePath}: ${error.message}`);
    return null;
  }
}

// Función para subir archivo a R2
async function uploadToR2(fileData, filePath) {
  try {
    // Convertir Blob a Buffer si es necesario
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
    console.error(`  ❌ Error subiendo a R2: ${error.message}`);
    return false;
  }
}

// Función para migrar un bucket completo
async function migrateBucket(bucketName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Iniciando migración del bucket: ${bucketName}`);
  console.log(`${'='.repeat(60)}`);

  const files = await listSupabaseFiles(bucketName);
  migrationLog.buckets[bucketName].total = files.length;
  migrationLog.summary.totalFiles += files.length;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = file.name;
    const progress = `[${i + 1}/${files.length}]`;

    process.stdout.write(`\r${progress} Procesando: ${filePath.substring(0, 50)}...`);

    // Descargar
    const fileData = await downloadFromSupabase(bucketName, filePath);
    if (!fileData) {
      migrationLog.buckets[bucketName].failed++;
      migrationLog.buckets[bucketName].files.push({
        path: filePath,
        status: 'FAILED',
        reason: 'Download failed',
      });
      continue;
    }

    // Subir a R2 (mantener la misma ruta)
    const success = await uploadToR2(fileData, filePath);
    if (!success) {
      migrationLog.buckets[bucketName].failed++;
      migrationLog.buckets[bucketName].files.push({
        path: filePath,
        status: 'FAILED',
        reason: 'Upload to R2 failed',
      });
      continue;
    }

    migrationLog.buckets[bucketName].migrated++;
    migrationLog.buckets[bucketName].files.push({
      path: filePath,
      status: 'SUCCESS',
      size: fileData.size,
      timestamp: new Date().toISOString(),
    });
  }

  console.log(`\n✅ Migración de '${bucketName}' completada`);
}

// Función principal
async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║    MIGRACIÓN SEGURA: Supabase Storage → Cloudflare R2      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`Inicio: ${new Date().toLocaleString()}`);

  // Validar credenciales
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Error: Variables Supabase no configuradas');
    process.exit(1);
  }

  if (!process.env.VITE_R2_ACCESS_KEY_ID || !process.env.VITE_R2_SECRET_ACCESS_KEY) {
    console.error('❌ Error: Variables R2 no configuradas');
    process.exit(1);
  }

  try {
    // Migrar cada bucket
    const bucketsToMigrate = ['soportes', 'beneficiario-documentos', 'public-assets'];

    for (const bucketName of bucketsToMigrate) {
      await migrateBucket(bucketName);
    }

    // Calcular resumen
    migrationLog.endTime = new Date().toISOString();
    for (const bucket of Object.values(migrationLog.buckets)) {
      migrationLog.summary.totalMigrated += bucket.migrated;
      migrationLog.summary.totalFailed += bucket.failed;
    }

    // Guardar log
    fs.writeFileSync(LOG_FILE, JSON.stringify(migrationLog, null, 2));
    console.log(`\n✅ Log guardado en: ${LOG_FILE}`);

    // Mostrar resumen
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                      📊 RESUMEN FINAL                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`Total de archivos: ${migrationLog.summary.totalFiles}`);
    console.log(`✅ Migrados exitosamente: ${migrationLog.summary.totalMigrated}`);
    console.log(`❌ Fallidos: ${migrationLog.summary.totalFailed}`);

    // Detalles por bucket
    Object.entries(migrationLog.buckets).forEach(([bucket, stats]) => {
      if (stats.total > 0) {
        console.log(`\n  ${bucket}:`);
        console.log(`    - Total: ${stats.total}`);
        console.log(`    - Éxito: ${stats.migrated}`);
        console.log(`    - Fallidos: ${stats.failed}`);
      }
    });

    const successRate = migrationLog.summary.totalFiles > 0
      ? ((migrationLog.summary.totalMigrated / migrationLog.summary.totalFiles) * 100).toFixed(2)
      : 0;

    console.log(`\n📈 Tasa de éxito: ${successRate}%`);
    console.log(`\nFin: ${new Date().toLocaleString()}`);

    if (migrationLog.summary.totalFailed === 0) {
      console.log('\n🎉 ¡Migración completada sin errores!');
      process.exit(0);
    } else {
      console.log(`\n⚠️  Se presentaron ${migrationLog.summary.totalFailed} errores.`);
      console.log('   Revisa migration-log.json para detalles.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error crítico durante la migración:', error);
    migrationLog.summary.errors.push({
      timestamp: new Date().toISOString(),
      message: error.message,
    });
    fs.writeFileSync(LOG_FILE, JSON.stringify(migrationLog, null, 2));
    process.exit(1);
  }
}

main();
