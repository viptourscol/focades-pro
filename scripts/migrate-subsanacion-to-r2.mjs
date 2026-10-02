import { createClient } from '@supabase/supabase-js';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load environment variables
const envContent = readFileSync(resolve('.env.production.local'), 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value && !key.startsWith('#')) {
    env[key.trim()] = value.trim();
  }
});

const SUPABASE_URL = 'https://jwifxjzxdxjntbdqbyku.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_KEY no está en las variables de ambiente');
  console.error('Ejecuta: export SUPABASE_SERVICE_KEY=tu_clave_aqui');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// R2 Configuration
const R2_ACCESS_KEY_ID = env.VITE_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = env.VITE_R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = env.VITE_R2_ENDPOINT;
const R2_BUCKET = 'focades-pro';

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT) {
  console.error('❌ Error: Credenciales R2 no encontradas en .env.production.local');
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

async function migrateSubsanacionDocuments() {
  console.log('🔍 Buscando documentos de subsanación en Supabase Storage...\n');

  // Buscar documentos recientes que NO estén en R2
  const { data: documents, error: fetchError } = await supabase
    .from('portal_actualizacion_documentos')
    .select('id, actualizacion_id, tipo_documento, storage_path, nombre_original, size_bytes, mime_type')
    .order('created_at', { ascending: false })
    .limit(100);

  if (fetchError) {
    console.error('❌ Error fetching documents:', fetchError);
    process.exit(1);
  }

  if (!documents || documents.length === 0) {
    console.log('✅ No hay documentos para migrar');
    return;
  }

  // Identificar documentos en Supabase Storage (no empiezan con "soportes/")
  const supbaseDocuments = documents.filter(doc => {
    return doc.storage_path && !doc.storage_path.startsWith('soportes/');
  });

  if (supbaseDocuments.length === 0) {
    console.log('✅ Todos los documentos ya están en R2');
    return;
  }

  console.log(`📦 Encontrados ${supbaseDocuments.length} documentos en Supabase Storage\n`);

  let successCount = 0;
  let failureCount = 0;

  for (const doc of supbaseDocuments) {
    try {
      console.log(`📥 Descargando: ${doc.storage_path}...`);

      // Descargar de Supabase Storage
      const { data, error: downloadError } = await supabase.storage
        .from('soportes')
        .download(doc.storage_path);

      if (downloadError) {
        console.error(`  ❌ Error descargando: ${downloadError.message}`);
        failureCount++;
        continue;
      }

      // Generar nuevo path para R2
      const newPath = `soportes/${doc.storage_path}`;

      // Subir a R2
      console.log(`📤 Subiendo a R2: ${newPath}...`);
      const buffer = await data.arrayBuffer();
      const uploadParams = {
        Bucket: R2_BUCKET,
        Key: newPath,
        Body: buffer,
        ContentType: doc.mime_type || 'application/octet-stream',
      };

      await s3Client.send(new PutObjectCommand(uploadParams));
      console.log(`  ✅ Subido exitosamente`);

      // Actualizar storage_path en BD
      const { error: updateError } = await supabase
        .from('portal_actualizacion_documentos')
        .update({ storage_path: newPath })
        .eq('id', doc.id);

      if (updateError) {
        console.error(`  ⚠️  Error actualizando BD: ${updateError.message}`);
        failureCount++;
        continue;
      }

      console.log(`  ✅ BD actualizada\n`);
      successCount++;

      // Eliminar de Supabase Storage
      console.log(`🗑️  Eliminando de Supabase Storage...`);
      await supabase.storage.from('soportes').remove([doc.storage_path]);
      console.log(`  ✅ Eliminado de Supabase\n`);
    } catch (error) {
      console.error(`  ❌ Error procesando ${doc.storage_path}: ${error.message}\n`);
      failureCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ MIGRACION COMPLETADA`);
  console.log(`  Exitosos: ${successCount}/${supbaseDocuments.length}`);
  console.log(`  Fallidos: ${failureCount}/${supbaseDocuments.length}`);
  console.log('='.repeat(60));
}

migrateSubsanacionDocuments().catch(console.error);
