import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

async function migrateAllDocuments() {
  console.log('🔍 Buscando todos los documentos en Supabase Storage...\n');

  // Obtener todos los documentos que NO empiezan con "soportes/"
  const { data: documents, error: fetchError } = await supabase
    .from('portal_actualizacion_documentos')
    .select('id, actualizacion_id, tipo_documento, storage_path, nombre_original, size_bytes, mime_type')
    .not('storage_path', 'ilike', 'soportes/%')
    .order('created_at', { ascending: false });

  if (fetchError) {
    console.error('❌ Error fetching documents:', fetchError);
    process.exit(1);
  }

  if (!documents || documents.length === 0) {
    console.log('✅ Todos los documentos ya están en R2');
    return;
  }

  console.log(`📦 Encontrados ${documents.length} documentos en Supabase Storage\n`);

  let successCount = 0;
  let failureCount = 0;
  const failedDocs = [];

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const progress = `[${i + 1}/${documents.length}]`;

    try {
      console.log(`${progress} 📥 Descargando: ${doc.storage_path}...`);

      // Descargar de Supabase Storage
      const { data, error: downloadError } = await supabase.storage
        .from('soportes')
        .download(doc.storage_path);

      if (downloadError) {
        console.error(`  ❌ Error descargando: ${downloadError.message}`);
        failureCount++;
        failedDocs.push({ path: doc.storage_path, error: downloadError.message });
        continue;
      }

      // Generar nuevo path para R2 (agregando prefijo "soportes/" si no lo tiene)
      let newPath = doc.storage_path;
      if (!newPath.startsWith('soportes/')) {
        newPath = `soportes/${newPath}`;
      }

      // Subir a R2
      console.log(`  📤 Subiendo a R2: ${newPath}...`);
      const buffer = await data.arrayBuffer();
      const uploadParams = {
        Bucket: R2_BUCKET,
        Key: newPath,
        Body: buffer,
        ContentType: doc.mime_type || 'application/octet-stream',
      };

      await s3Client.send(new PutObjectCommand(uploadParams));
      console.log(`  ✅ Subido exitosamente`);

      // Actualizar storage_path en BD si cambió
      if (newPath !== doc.storage_path) {
        const { error: updateError } = await supabase
          .from('portal_actualizacion_documentos')
          .update({ storage_path: newPath })
          .eq('id', doc.id);

        if (updateError) {
          console.error(`  ⚠️  Error actualizando BD: ${updateError.message}`);
          failureCount++;
          failedDocs.push({ path: doc.storage_path, error: updateError.message });
          continue;
        }
        console.log(`  ✅ BD actualizada`);
      } else {
        console.log(`  ✅ Path ya correcto en BD`);
      }

      // Eliminar de Supabase Storage
      console.log(`  🗑️  Eliminando de Supabase Storage...`);
      await supabase.storage.from('soportes').remove([doc.storage_path]);
      console.log(`  ✅ Eliminado de Supabase\n`);
      successCount++;
    } catch (error) {
      console.error(`  ❌ Error procesando ${doc.storage_path}: ${error.message}\n`);
      failureCount++;
      failedDocs.push({ path: doc.storage_path, error: error.message });
    }

    // Pequeña pausa cada 10 documentos para no sobrecargar
    if ((i + 1) % 10 === 0) {
      console.log(`⏸️  Pausa de 2s para evitar rate limiting...\n`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ MIGRACION COMPLETADA`);
  console.log(`  Exitosos: ${successCount}/${documents.length}`);
  console.log(`  Fallidos: ${failureCount}/${documents.length}`);
  if (failedDocs.length > 0) {
    console.log('\n❌ Documentos que fallaron:');
    failedDocs.forEach(doc => {
      console.log(`  - ${doc.path}: ${doc.error}`);
    });
  }
  console.log('='.repeat(60));
}

migrateAllDocuments().catch(console.error);
