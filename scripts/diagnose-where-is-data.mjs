#!/usr/bin/env node

/**
 * DIAGNÓSTICO DE SUPABASE STORAGE
 * 
 * Ayuda a determinar:
 * 1. Si los datos están realmente en Supabase
 * 2. Si fueron migrados a R2
 * 3. Qué pasó con los datos
 */

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fs from 'fs';
import { execSync } from 'child_process';

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║  🔍 DIAGNÓSTICO: ¿Dónde están los datos?              ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// 1. Verificar R2
console.log('1️⃣  Verificando Cloudflare R2...\n');

async function checkR2() {
  try {
    const r2Client = new S3Client({
      region: 'auto',
      credentials: {
        accessKeyId: process.env.VITE_R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.VITE_R2_SECRET_ACCESS_KEY,
      },
      endpoint: process.env.VITE_R2_ENDPOINT,
    });

    const cmd = new ListObjectsV2Command({
      Bucket: 'focades-pro',
    });

    const response = await r2Client.send(cmd);

    if (!response.Contents || response.Contents.length === 0) {
      console.log('   📭 R2 está VACÍO\n');
      return 0;
    }

    console.log(`   ✅ R2 tiene ${response.Contents.length} objetos:\n`);

    let totalSize = 0;
    response.Contents.forEach(obj => {
      const sizeKB = (obj.Size / 1024).toFixed(2);
      console.log(`      📄 ${obj.Key} (${sizeKB} KB)`);
      totalSize += obj.Size;
    });

    console.log(`\n   📊 Tamaño total en R2: ${(totalSize / (1024 * 1024)).toFixed(2)} MB\n`);
    return response.Contents.length;
  } catch (err) {
    console.log(`   ❌ Error accediendo R2: ${err.message}\n`);
    return -1;
  }
}

// 2. Revisar historial de git
console.log('2️⃣  Revisando historial de migraciones en git...\n');

function checkGitHistory() {
  try {
    const logs = execSync('git log --oneline --grep="migra" -10 2>/dev/null || echo ""')
      .toString()
      .split('\n')
      .filter(l => l.trim());

    if (logs.length === 0) {
      console.log('   📭 No hay commits de migración en git\n');
      return false;
    }

    console.log(`   ✅ Migraciones encontradas:\n`);
    logs.forEach(log => {
      console.log(`      ${log}`);
    });
    console.log();

    return true;
  } catch (err) {
    console.log(`   ⚠️  No se pudo revisar git\n`);
    return false;
  }
}

// 3. Revisar logs de migración
console.log('3️⃣  Revisando logs de migración...\n');

function checkMigrationLogs() {
  try {
    const logs = fs.readdirSync('.')
      .filter(f => f.startsWith('migration-log-') && f.endsWith('.json'));

    if (logs.length === 0) {
      console.log('   📭 No hay logs de migración\n');
      return null;
    }

    console.log(`   ✅ Logs encontrados: ${logs.length}\n`);

    const latestLog = logs.sort().pop();
    console.log(`   Última migración: ${latestLog}`);

    const log = JSON.parse(fs.readFileSync(latestLog, 'utf8'));
    
    console.log(`      - Fecha: ${log.startTime}`);
    console.log(`      - Exitosos: ${log.statistics.successfulMigrations}`);
    console.log(`      - Fallidos: ${log.statistics.failedMigrations}`);
    console.log(`      - Tamaño: ${(log.statistics.totalSizeMigrated / (1024 * 1024)).toFixed(2)} MB\n`);

    return log;
  } catch (err) {
    console.log(`   ⚠️  Error leyendo logs: ${err.message}\n`);
    return null;
  }
}

// 4. Revisar análisis de Supabase
console.log('4️⃣  Revisando análisis de Supabase...\n');

function checkAnalysisLog() {
  try {
    if (!fs.existsSync('analysis-supabase.json')) {
      console.log('   📭 No hay análisis de Supabase\n');
      return null;
    }

    const analysis = JSON.parse(fs.readFileSync('analysis-supabase.json', 'utf8'));
    
    console.log(`   ✅ Análisis encontrado (${analysis.timestamp})\n`);
    
    for (const [bucket, data] of Object.entries(analysis.buckets)) {
      console.log(`      Bucket: ${bucket}`);
      console.log(`         - Archivos: ${data.fileCount}`);
      console.log(`         - Tamaño: ${(data.totalSize / (1024 * 1024)).toFixed(2)} MB`);
      if (data.error) {
        console.log(`         - Error: ${data.error}`);
      }
    }
    console.log();

    return analysis;
  } catch (err) {
    console.log(`   ⚠️  Error leyendo análisis: ${err.message}\n`);
    return null;
  }
}

// Main
async function main() {
  const r2Files = await checkR2();
  const hasMigrationCommits = checkGitHistory();
  const migrationLog = checkMigrationLogs();
  const analysisLog = checkAnalysisLog();

  // Diagnóstico
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║ 📊 DIAGNÓSTICO FINAL                                   ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  if (r2Files === 0) {
    console.log('📭 R2 está vacío\n');

    if (analysisLog && analysisLog.totalFiles === 0) {
      console.log('✅ DIAGNÓSTICO: Supabase Storage ESTABA VACÍO\n');
      console.log('Conclusión:');
      console.log('  - No había datos en Supabase Storage');
      console.log('  - No hay nada que migrar');
      console.log('  - LA MIGRACIÓN FUE CORRECTA\n');
      console.log('Los datos de beneficiarios probablemente están en:');
      console.log('  1. Base de datos PostgreSQL (no en Storage)');
      console.log('  2. Fueron migrados MANUALMENTE antes');
      console.log('  3. Se almacenan en otra ubicación\n');
    } else {
      console.log('⚠️  POSIBLE PROBLEMA:\n');
      console.log('  - Supabase Storage tiene datos');
      console.log('  - Pero R2 está vacío');
      console.log('  - Los datos NO fueron migrados correctamente\n');
      console.log('ACCIÓN REQUERIDA: Ejecutar migración nuevamente\n');
    }
  } else {
    console.log(`✅ R2 tiene ${r2Files} archivos\n`);
    console.log('Conclusión: Los datos YA ESTÁN en R2\n');
  }

  console.log('📋 Recomendaciones:\n');
  console.log('1. Verifica en Supabase Dashboard qué buckets existen');
  console.log('2. Ve a: R2 Dashboard → focades-pro → Objects');
  console.log('3. Si hay datos en R2: migración completada ✅');
  console.log('4. Si R2 está vacío pero Supabase tiene datos:');
  console.log('   Ejecuta: VITE_R2_... node scripts/migrate-secure-final.mjs\n');
}

main();
