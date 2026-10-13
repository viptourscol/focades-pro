#!/usr/bin/env node

/**
 * MIGRACIÓN REAL: Todos los archivos de Supabase → R2
 * 
 * CRÍTICO: Migrar miles de documentos de beneficiarios
 * Estrategia: Usar anon key + acceso directo para obtener archivos
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';
import fs from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const r2AccessKeyId = process.env.VITE_R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.VITE_R2_SECRET_ACCESS_KEY;
const r2Endpoint = process.env.VITE_R2_ENDPOINT;

if (!supabaseUrl || !supabaseAnonKey || !r2AccessKeyId || !r2SecretAccessKey || !r2Endpoint) {
  console.error('❌ Faltan variables de entorno');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const r2Client = new S3Client({
  region: 'auto',
  credentials: {
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
  },
  endpoint: r2Endpoint,
});

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = `migration-real-${TIMESTAMP}.json`;

const migrationLog = {
  startTime: new Date().toISOString(),
  bucket: 'soportes',
  r2Bucket: 'focades-pro',
  statistics: {
    totalFiles: 0,
    successfulMigrations: 0,
    failedMigrations: 0,
    totalSizeBytes: 0,
    totalSizeMigrated: 0,
    duplicatesSkipped: 0,
  },
  errors: [],
  warnings: [],
  files: [],
  folderStructure: {},
};

// Rastrear archivos ya migrados en R2
const migratedPaths = new Set();

async function listAllFilesRecursive(bucketName, path = '') {
  const files = [];

  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(path, { limit: 1000 });

    if (error) {
      console.log(`⚠️  Error listando ${path || 'root'}: ${error.message}`);
      migrationLog.warnings.push(`Error listando ${path}: ${error.message}`);
      return files;
    }

    if (!data) return files;

    for (const item of data) {
      const fullPath = path ? `${path}/${item.name}` : item.name;

      // Si no tiene ID o metadata, es carpeta
      if (!item.id && !item.metadata) {
        console.log(`📁 Explorando: ${fullPath}/`);
        const subFiles = await listAllFilesRecursive(bucketName, fullPath);
        files.push(...subFiles);
      } else {
        // Es archivo
        files.push({
          name: item.name,
          path: fullPath,
          size: item.metadata?.size || 0,
          created: item.created_at,
          updated: item.updated_at,
        });
        migrationLog.statistics.totalFiles++;
      }
    }
  } catch (err) {
    console.error(`❌ Error explorador: ${err.message}`);
    migrationLog.errors.push({
      action: 'list_files',
      path: path || 'root',
      error: err.message,
    });
  }

  return files;
}

async function migrateFileToR2(bucketName, filePath, fileSize) {
  try {
    // Descargar
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucketName)
      .download(filePath);

    if (downloadError) {
      throw new Error(`Descarga: ${downloadError.message}`);
    }

    // Convertir a buffer
    const buffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    // Subir a R2
    const r2Path = `soportes/${filePath}`;
    
    const uploadCommand = new PutObjectCommand({
      Bucket: 'focades-pro',
      Key: r2Path,
      Body: uint8Array,
      ContentType: fileData.type || 'application/octet-stream',
      Metadata: {
        'original-path': filePath,
        'migrated-from': 'supabase',
        'migration-date': new Date().toISOString(),
        'original-size': fileSize.toString(),
      },
    });

    await r2Client.send(uploadCommand);

    // Hash para verificación
    const hash = crypto
      .createHash('sha256')
      .update(uint8Array)
      .digest('hex');

    migrationLog.statistics.successfulMigrations++;
    migrationLog.statistics.totalSizeMigrated += buffer.byteLength;

    return {
      status: 'success',
      r2Path,
      sizeBytes: buffer.byteLength,
      hash,
    };
  } catch (err) {
    migrationLog.statistics.failedMigrations++;
    throw err;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  🚀 MIGRACIÓN REAL: Supabase → R2                     ║');
  console.log('║     Migrando MILES de documentos de beneficiarios      ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    // Fase 1: Listar todos los archivos
    console.log('📂 FASE 1: Listando todos los archivos en Supabase...\n');
    const allFiles = await listAllFilesRecursive('soportes');

    console.log(`\n✅ Total de archivos encontrados: ${allFiles.length}`);
    console.log(`📊 Tamaño total: ${(allFiles.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(2)} MB\n`);

    if (allFiles.length === 0) {
      console.log('⚠️  No hay archivos para migrar');
      process.exit(0);
    }

    // Fase 2: Migrar archivos
    console.log('📤 FASE 2: Migrando archivos a R2...\n');

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      const progress = `[${i + 1}/${allFiles.length}]`;

      try {
        const result = await migrateFileToR2('soportes', file.path, file.size);
        const sizeKB = (file.size / 1024).toFixed(2);

        console.log(`${progress} ✅ ${file.path} (${sizeKB} KB)`);

        migrationLog.files.push({
          originalPath: file.path,
          r2Path: result.r2Path,
          sizeBytes: result.sizeBytes,
          hash: result.hash,
          status: 'success',
          migratedAt: new Date().toISOString(),
        });

        successCount++;

        // Mostrar progreso cada 100 archivos
        if ((i + 1) % 100 === 0) {
          console.log(`\n📊 Progreso: ${successCount} exitosos, ${failureCount} fallidos\n`);
        }
      } catch (err) {
        console.log(`${progress} ❌ ${file.path} - Error: ${err.message}`);

        migrationLog.files.push({
          originalPath: file.path,
          status: 'failed',
          error: err.message,
          attemptedAt: new Date().toISOString(),
        });

        failureCount++;
      }
    }

    // Resumen
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║ 📊 RESUMEN DE MIGRACIÓN                                ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log(`✅ Exitosos: ${migrationLog.statistics.successfulMigrations}`);
    console.log(`❌ Fallidos: ${migrationLog.statistics.failedMigrations}`);
    console.log(`📦 Tamaño migrado: ${(migrationLog.statistics.totalSizeMigrated / (1024 * 1024)).toFixed(2)} MB\n`);

    // Guardar log
    migrationLog.endTime = new Date().toISOString();
    fs.writeFileSync(LOG_FILE, JSON.stringify(migrationLog, null, 2));

    console.log(`📝 Log guardado en: ${LOG_FILE}\n`);

    if (migrationLog.statistics.failedMigrations === 0) {
      console.log('🎉 ¡MIGRACIÓN COMPLETADA SIN ERRORES!\n');
      console.log('✨ Todos los documentos están ahora en R2');
      process.exit(0);
    } else {
      console.log(`⚠️  Se encontraron ${migrationLog.statistics.failedMigrations} errores\n`);
      console.log('📋 Revisar log para detalles\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('💥 Error fatal:', err.message);
    migrationLog.errors.push({
      phase: 'main',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
    fs.writeFileSync(LOG_FILE, JSON.stringify(migrationLog, null, 2));
    process.exit(1);
  }
}

main();
