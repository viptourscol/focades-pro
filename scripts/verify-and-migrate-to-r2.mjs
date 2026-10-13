#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import fs from 'fs';
import path from 'path';

// Load R2 credentials from .env.production.local
const envFile = resolve('.env.production.local');
if (!fs.existsSync(envFile)) {
  console.error('❌ .env.production.local not found');
  process.exit(1);
}

const envContent = readFileSync(envFile, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value && !key.startsWith('#')) {
    env[key.trim()] = value.trim();
  }
});

// Supabase config
const SUPABASE_URL = 'https://jwifxjzxdxjntbdqbyku.supabase.co';
const SUPABASE_SERVICE_KEY = process.argv[2];

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Uso: node scripts/migrate-subsanacion-to-r2.mjs <SUPABASE_SERVICE_KEY>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// R2 config
const R2_ACCESS_KEY_ID = env.VITE_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = env.VITE_R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = env.VITE_R2_ENDPOINT;
const R2_BUCKET = 'focades-pro';

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT) {
  console.error('❌ R2 credentials not found in .env.production.local');
  process.exit(1);
}

const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function migrateDocuments() {
  console.log('🔍 Buscando documentos en Supabase Storage (que no están en R2)...\n');

  // Obtener TODOS los documentos
  const { data: allDocuments, error: fetchError } = await supabase
    .from('portal_actualizacion_documentos')
    .select('id, actualizacion_id, tipo_documento, storage_path, nombre_original, size_bytes, mime_type, created_at')
    .order('created_at', { ascending: true });

  if (fetchError) {
    console.error('❌ Error fetching documents:', fetchError.message);
    process.exit(1);
  }

  // Filtrar documentos que NO están en R2 (no empiezan con "soportes/")
  const supabaseDocuments = (allDocuments || []).filter(doc => 
    doc.storage_path && !doc.storage_path.startsWith('soportes/')
  );

  console.log(`📊 Total documentos en BD: ${allDocuments?.length || 0}`);
  console.log(`📦 Documentos en Supabase Storage (sin migrar): ${supabaseDocuments.length}\n`);

  if (supabaseDocuments.length === 0) {
    console.log('✅ Todos los documentos ya están en R2. Nada que migrar.');
    return;
  }

  let successCount = 0;
  let failureCount = 0;
  const failures = [];

  for (let i = 0; i < supabaseDocuments.length; i++) {
    const doc = supabaseDocuments[i];
    const progress = `[${i + 1}/${supabaseDocuments.length}]`;

    try {
      console.log(`${progress} 📥 Descargando: ${doc.storage_path}`);

      // Descargar de Supabase Storage
      const { data, error: downloadError } = await supabase.storage
        .from('soportes')
        .download(doc.storage_path);

      if (downloadError) {
        throw new Error(`Download failed: ${downloadError.message}`);
      }

      // Convertir Blob a Uint8Array
      const arrayBuffer = await data.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      // Generar nuevo path para R2
      const newPath = `soportes/${doc.storage_path}`;

      // Subir a R2
      console.log(`${progress} 📤 Subiendo a R2...`);
      const uploadParams = {
        Bucket: R2_BUCKET,
        Key: newPath,
        Body: Buffer.from(buffer),
        ContentType: doc.mime_type || 'application/octet-stream',
      };

      await s3Client.send(new PutObjectCommand(uploadParams));

      // Actualizar storage_path en BD
      console.log(`${progress} 🔄 Actualizando BD...`);
      const { error: updateError } = await supabase
        .from('portal_actualizacion_documentos')
        .update({ storage_path: newPath })
        .eq('id', doc.id);

      if (updateError) {
        throw new Error(`DB update failed: ${updateError.message}`);
      }

      // Eliminar de Supabase Storage
      console.log(`${progress} 🗑️  Eliminando de Supabase...`);
      await supabase.storage.from('soportes').remove([doc.storage_path]);

      console.log(`${progress} ✅ Migrado exitosamente\n`);
      successCount++;
    } catch (error) {
      console.error(`${progress} ❌ Error: ${error.message}\n`);
      failures.push({ ...doc, error: error.message });
      failureCount++;
    }

    // Delay para evitar rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 RESULTADO DE LA MIGRACION');
  console.log('='.repeat(70));
  console.log(`✅ Documentos migrados exitosamente: ${successCount}`);
  console.log(`❌ Documentos con error: ${failureCount}`);
  console.log(`📈 Tasa de éxito: ${((successCount / supabaseDocuments.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(70));

  if (failures.length > 0) {
    console.log('\n⚠️  Documentos con errores:');
    failures.forEach(f => {
      console.log(`  - ${f.storage_path}: ${f.error}`);
    });
  }

  process.exit(failureCount > 0 ? 1 : 0);
}

migrateDocuments().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
