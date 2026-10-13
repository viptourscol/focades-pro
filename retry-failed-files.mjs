import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import * as fs from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const r2Endpoint = process.env.VITE_R2_ENDPOINT;
const r2AccessKeyId = process.env.VITE_R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.VITE_R2_SECRET_ACCESS_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const s3Client = new S3Client({
  region: 'auto',
  endpoint: r2Endpoint,
  credentials: {
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
  },
});

const FAILED_FILES = [
  'beneficiarios_historicos/2911/documentos/diploma-1788039220417.pdf',
  'beneficiarios_historicos/2928/documentos/pruebas_saber-1787687067819.pdf',
  'beneficiarios_historicos/2937/documentos/documento_identidad-1788040676799.pdf',
  'beneficiarios_historicos/2937/documentos/ficha_sisben-1788040728476.pdf',
  'beneficiarios_historicos/2940/documentos/documento_identidad-1788137824785.pdf',
  'beneficiarios_historicos/2975/documentos/cert_enfoque-1788135620581.pdf',
];

const MAX_RETRIES = 3;

async function retryFailedFile(filePath, attempt = 1) {
  try {
    console.log(`\n[Intento ${attempt}/${MAX_RETRIES}] 📥 Descargando: ${filePath}`);

    // Descargar de Supabase
    const { data, error } = await supabase.storage
      .from('soportes')
      .download(filePath);

    if (error) {
      throw new Error(`Descarga fallida: ${error.message}`);
    }

    const fileBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(fileBuffer);

    // Calcular hash
    const hash = createHash('sha256').update(buffer).digest('hex');

    // Subir a R2
    const r2Path = `soportes/${filePath}`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: 'focades-pro',
        Key: r2Path,
        Body: buffer,
        ContentType: 'application/pdf',
        Metadata: {
          'original-path': filePath,
          'migration-date': new Date().toISOString(),
          'sha256': hash,
        },
      })
    );

    console.log(`✅ ${filePath}`);
    console.log(`   📦 Tamaño: ${(buffer.length / 1024).toFixed(2)} KB`);
    console.log(`   #️⃣ Hash: ${hash}`);

    return { status: 'success', path: filePath, size: buffer.length, hash };
  } catch (error) {
    if (attempt < MAX_RETRIES) {
      console.log(`⚠️ Error: ${error.message}`);
      console.log(`🔄 Reintentando en 2 segundos...`);
      await new Promise(r => setTimeout(r, 2000));
      return retryFailedFile(filePath, attempt + 1);
    } else {
      console.error(`❌ FALLO FINAL: ${filePath}`);
      console.error(`   Error: ${error.message}`);
      return { status: 'failed', path: filePath, error: error.message };
    }
  }
}

async function migrateFailedFiles() {
  console.log('🔄 REINTENTANDO MIGRACIÓN DE 6 ARCHIVOS FALLIDOS\n');
  console.log(`📋 Archivos a reintentar: ${FAILED_FILES.length}\n`);

  const results = [];
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < FAILED_FILES.length; i++) {
    const file = FAILED_FILES[i];
    console.log(`\n[${i + 1}/${FAILED_FILES.length}] Processing...`);

    const result = await retryFailedFile(file);
    results.push(result);

    if (result.status === 'success') {
      successful++;
    } else {
      failed++;
    }

    // Pequeña pausa entre descargas para evitar rate limiting
    if (i < FAILED_FILES.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Resumen final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN DE REINTENTOS');
  console.log('='.repeat(60));
  console.log(`✅ Exitosos: ${successful}/${FAILED_FILES.length}`);
  console.log(`❌ Fallidos: ${failed}/${FAILED_FILES.length}`);

  if (failed > 0) {
    console.log('\n❌ Archivos que aún fallan:');
    results.filter(r => r.status === 'failed').forEach(r => {
      console.log(`   - ${r.path}`);
      console.log(`     Error: ${r.error}`);
    });
  } else {
    console.log('\n🎉 ¡TODOS LOS 6 ARCHIVOS SE MIGRARON EXITOSAMENTE!');
  }

  // Guardar resultados
  fs.writeFileSync(
    `retry-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    JSON.stringify({ timestamp: new Date().toISOString(), results, successful, failed }, null, 2)
  );
}

migrateFailedFiles();
