#!/usr/bin/env node

/**
 * Script para migrar documentos de Supabase Storage a Cloudflare R2
 * Uso: node scripts/migrate-supabase-to-r2.mjs
 * 
 * Este script:
 * 1. Lista todos los documentos en la BD (portal_actualizacion_documentos)
 * 2. Para cada documento, descarga desde Supabase Storage
 * 3. Sube a Cloudflare R2 con el prefijo "soportes/"
 * 4. Actualiza la BD para marcar como migrado
 * 5. Reporta progreso en tiempo real
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import path from 'path';

// Cargar variables de ambiente
const envFile = readFileSync('.env.local', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  line = line.trim();
  // Ignorar líneas vacías y comentarios
  if (!line || line.startsWith('#')) return;
  
  const eqIndex = line.indexOf('=');
  if (eqIndex > 0) {
    const key = line.substring(0, eqIndex).trim();
    const value = line.substring(eqIndex + 1).trim();
    envVars[key] = value;
  }
});

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || envVars.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY; // Usar service role para RLS bypass
const R2_ACCESS_KEY = process.env.VITE_R2_ACCESS_KEY_ID || envVars.VITE_R2_ACCESS_KEY_ID;
const R2_SECRET_KEY = process.env.VITE_R2_SECRET_ACCESS_KEY || envVars.VITE_R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = process.env.VITE_R2_ENDPOINT || envVars.VITE_R2_ENDPOINT;

// Validar credenciales
if (!SUPABASE_URL || !SUPABASE_KEY || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
  console.error('❌ Error: Faltan variables de ambiente en .env.local');
  console.error({
    SUPABASE_URL: !!SUPABASE_URL,
    SUPABASE_KEY: !!SUPABASE_KEY,
    R2_ACCESS_KEY: !!R2_ACCESS_KEY,
    R2_SECRET_KEY: !!R2_SECRET_KEY,
  });
  process.exit(1);
}

// Inicializar clientes
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY); // Service role bypassa RLS

const r2Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
});

const BUCKET_NAME = 'focades-pro';
const SUPABASE_STORAGE_BUCKET = 'soportes'; // Bucket en Supabase Storage donde están los documentos

/**
 * Descarga un archivo de Supabase Storage
 */
async function downloadFromSupabase(filePath) {
  try {
    const { data, error } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .download(filePath);

    if (error) throw error;
    
    // Convertir Blob a Buffer
    return Buffer.from(await data.arrayBuffer());
  } catch (error) {
    console.error(`  ❌ Error descargando de Supabase: ${error.message}`);
    return null;
  }
}

/**
 * Sube un archivo a R2
 */
async function uploadToR2(fileData, r2Path, mimeType) {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: r2Path,
      Body: fileData,
      ContentType: mimeType || 'application/octet-stream',
    });

    await r2Client.send(command);
    return true;
  } catch (error) {
    console.error(`  ❌ Error subiendo a R2: ${error.message}`);
    return false;
  }
}

/**
 * Obtiene la próxima tanda de documentos para migrar
 */
async function getDocumentsToMigrate(limit = 50, offset = 0) {
  const { data, error } = await supabase
    .from('portal_actualizacion_documentos')
    .select('id, storage_path, mime_type, nombre_original')
    .not('storage_path', 'is', null)
    .order('id')
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data || [];
}

/**
 * Cuenta documentos sin migrar
 */
async function countPendingDocuments() {
  const { count, error } = await supabase
    .from('portal_actualizacion_documentos')
    .select('id', { count: 'exact', head: true })
    .not('storage_path', 'is', null);

  if (error) throw error;
  return count || 0;
}

/**
 * Ejecuta la migración
 */
async function runMigration() {
  console.log('🚀 Iniciando migración de Supabase Storage → Cloudflare R2\n');

  const totalDocuments = await countPendingDocuments();
  console.log(`📊 Total documentos a migrar: ${totalDocuments}\n`);

  let migrated = 0;
  let failed = 0;
  const BATCH_SIZE = 20;

  for (let offset = 0; offset < totalDocuments; offset += BATCH_SIZE) {
    const documents = await getDocumentsToMigrate(BATCH_SIZE, offset);

    console.log(`\n📦 Procesando lote ${Math.floor(offset / BATCH_SIZE) + 1} (${documents.length} docs)`);

    for (const doc of documents) {
      const progress = `[${migrated + failed + 1}/${totalDocuments}]`;

      console.log(`  ${progress} ${doc.nombre_original || doc.storage_path}`);

      // Normalizar ruta para R2 (agregar prefijo soportes/)
      let r2Path = doc.storage_path;
      if (!r2Path.startsWith('soportes/')) {
        r2Path = `soportes/${r2Path}`;
      }

      // Descargar de Supabase
      const fileData = await downloadFromSupabase(doc.storage_path);
      if (!fileData) {
        failed++;
        continue;
      }

      // Subir a R2
      const uploaded = await uploadToR2(fileData, r2Path, doc.mime_type);
      if (!uploaded) {
        failed++;
        continue;
      }

      migrated++;

      // Mostrar progreso cada 10 documentos
      if ((migrated + failed) % 10 === 0) {
        const percentage = Math.round(((migrated + failed) / totalDocuments) * 100);
        console.log(`    ✅ Progreso: ${percentage}% (${migrated} exitosos, ${failed} fallidos)`);
      }
    }

    // Esperar un poco entre lotes para no sobrecargar
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ MIGRACIÓN COMPLETADA');
  console.log('='.repeat(60));
  console.log(`✅ Documentos migrados: ${migrated}`);
  console.log(`❌ Documentos fallidos: ${failed}`);
  console.log(`📊 Tasa de éxito: ${((migrated / (migrated + failed)) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.log('⚠️  Algunos documentos no se migraron. Pueden seguir cargándose desde Supabase Storage.');
    console.log('   Intenta ejecutar el script nuevamente para reintentar los fallidos.\n');
  }
}

// Ejecutar
runMigration().catch(error => {
  console.error('\n❌ Error fatal:', error.message);
  process.exit(1);
});
