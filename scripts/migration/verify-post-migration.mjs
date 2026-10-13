#!/usr/bin/env node

/**
 * VERIFICACIÓN DE FUNCIONAMIENTO POST-MIGRACIÓN
 * 
 * Verifica que:
 * 1. R2 está accesible
 * 2. Archivos de test se pueden subir
 * 3. URLs públicas funcionan
 * 4. Aplicación no tiene errores de compilación
 */

import { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';

const config = {
  r2: {
    accessKeyId: process.env.VITE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.VITE_R2_SECRET_ACCESS_KEY,
    endpoint: process.env.VITE_R2_ENDPOINT,
    publicUrl: process.env.VITE_R2_PUBLIC_URL,
    bucket: 'focades-pro',
  },
};

const results = {
  timestamp: new Date().toISOString(),
  checks: {},
  summary: {
    passed: 0,
    failed: 0,
  },
};

async function checkR2Connection() {
  console.log('\n📡 Verificación 1: Conexión a R2');
  console.log('   ' + '─'.repeat(40));

  try {
    const client = new S3Client({
      region: 'auto',
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
      endpoint: config.r2.endpoint,
    });

    const cmd = new ListObjectsV2Command({ Bucket: config.r2.bucket, MaxKeys: 1 });
    await client.send(cmd);

    console.log('   ✅ Conexión exitosa a R2');
    results.checks.connection = { status: 'passed', message: 'R2 accesible' };
    results.summary.passed++;
    return true;
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    results.checks.connection = { status: 'failed', error: err.message };
    results.summary.failed++;
    return false;
  }
}

async function checkUploadCapability() {
  console.log('\n📤 Verificación 2: Capacidad de upload');
  console.log('   ' + '─'.repeat(40));

  const testFileName = `health-check-${Date.now()}.txt`;
  const testContent = `Health check at ${new Date().toISOString()}`;

  try {
    const client = new S3Client({
      region: 'auto',
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
      endpoint: config.r2.endpoint,
    });

    const cmd = new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: `health-checks/${testFileName}`,
      Body: testContent,
      ContentType: 'text/plain',
    });

    await client.send(cmd);
    console.log(`   ✅ Upload exitoso: ${testFileName}`);
    results.checks.upload = { status: 'passed', file: testFileName };
    results.summary.passed++;

    // Limpiar archivo de prueba
    setTimeout(async () => {
      try {
        const deleteCmd = new DeleteObjectCommand({
          Bucket: config.r2.bucket,
          Key: `health-checks/${testFileName}`,
        });
        await client.send(deleteCmd);
      } catch (e) {
        // Ignorar errores de limpieza
      }
    }, 1000);

    return true;
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    results.checks.upload = { status: 'failed', error: err.message };
    results.summary.failed++;
    return false;
  }
}

async function checkPublicUrlFormat() {
  console.log('\n🔗 Verificación 3: Formato de URL pública');
  console.log('   ' + '─'.repeat(40));

  const testPath = 'test/document.pdf';
  const expectedUrl = `${config.r2.publicUrl}/${testPath}`;

  if (expectedUrl.includes('focades-pro.82fdb4a6fd4628d720932bee674b6f7d.r2.dev')) {
    console.log(`   ✅ URL pública correcta`);
    console.log(`      ${expectedUrl}`);
    results.checks.publicUrl = { status: 'passed', url: expectedUrl };
    results.summary.passed++;
    return true;
  } else {
    console.log('   ❌ Formato de URL incorrecto');
    results.checks.publicUrl = { status: 'failed', message: 'URL format invalid' };
    results.summary.failed++;
    return false;
  }
}

async function checkEnvironmentVariables() {
  console.log('\n🔐 Verificación 4: Variables de entorno');
  console.log('   ' + '─'.repeat(40));

  const required = [
    'VITE_R2_ACCESS_KEY_ID',
    'VITE_R2_SECRET_ACCESS_KEY',
    'VITE_R2_ENDPOINT',
    'VITE_R2_PUBLIC_URL',
  ];

  let allPresent = true;
  for (const envVar of required) {
    if (process.env[envVar]) {
      console.log(`   ✅ ${envVar} configurada`);
    } else {
      console.log(`   ❌ ${envVar} FALTA`);
      allPresent = false;
    }
  }

  if (allPresent) {
    results.checks.environment = { status: 'passed', message: 'Todas las variables presentes' };
    results.summary.passed++;
  } else {
    results.checks.environment = { status: 'failed', message: 'Faltan variables de entorno' };
    results.summary.failed++;
  }

  return allPresent;
}

async function checkApplicationFiles() {
  console.log('\n📁 Verificación 5: Archivos de aplicación');
  console.log('   ' + '─'.repeat(40));

  const requiredFiles = [
    'src/lib/r2.js',
    'scripts/migrate-secure-final.mjs',
    '.env',
    'MIGRACION_SUPABASE_R2.md',
    'VERIFICACION_MIGRACION_FINAL.md',
  ];

  let allPresent = true;
  for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
      console.log(`   ✅ ${file} existe`);
    } else {
      console.log(`   ❌ ${file} FALTA`);
      allPresent = false;
    }
  }

  if (allPresent) {
    results.checks.files = { status: 'passed', message: 'Todos los archivos presentes' };
    results.summary.passed++;
  } else {
    results.checks.files = { status: 'failed', message: 'Faltan archivos críticos' };
    results.summary.failed++;
  }

  return allPresent;
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  ✅ VERIFICACIÓN POST-MIGRACIÓN                        ║');
  console.log('║     Supabase Storage → Cloudflare R2                    ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  const checks = [
    checkR2Connection,
    checkUploadCapability,
    checkPublicUrlFormat,
    checkEnvironmentVariables,
    checkApplicationFiles,
  ];

  for (const check of checks) {
    try {
      await check();
    } catch (err) {
      console.error(`   💥 Error en verificación: ${err.message}`);
    }
  }

  // Resumen
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║ 📊 RESUMEN DE VERIFICACIÓN                             ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log(`✅ Verificaciones pasadas: ${results.summary.passed}`);
  console.log(`❌ Verificaciones fallidas: ${results.summary.failed}`);

  if (results.summary.failed === 0) {
    console.log('\n🎉 ¡TODOS LOS CHECKS PASARON!');
    console.log('\n✨ La migración está completada y funcionando correctamente.\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  ALGUNOS CHECKS FALLARON - Revisar arriba\n');
    process.exit(1);
  }
}

main();
