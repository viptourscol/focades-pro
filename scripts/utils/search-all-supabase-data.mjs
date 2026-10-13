#!/usr/bin/env node

/**
 * BÚSQUEDA COMPLETA DE DATOS EN SUPABASE
 * 
 * Verifica TODOS los buckets y carpetas para encontrar dónde están los archivos
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Falta VITE_SUPABASE_URL o SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getAllBuckets() {
  console.log('🔍 BUSCANDO TODOS LOS BUCKETS EN SUPABASE...\n');

  try {
    // Intentar obtener lista de buckets
    const { data: buckets, error } = await supabase.storage.listBuckets();

    if (error) {
      console.error(`❌ Error listando buckets: ${error.message}\n`);
      return [];
    }

    if (!buckets || buckets.length === 0) {
      console.log('📭 No hay buckets encontrados\n');
      return [];
    }

    console.log(`✅ Buckets encontrados: ${buckets.length}\n`);
    buckets.forEach(b => {
      console.log(`   📦 ${b.name}`);
      console.log(`      ID: ${b.id}`);
      console.log(`      Creado: ${b.created_at}`);
      console.log();
    });

    return buckets.map(b => b.name);
  } catch (err) {
    console.error(`❌ Error: ${err.message}\n`);
    return [];
  }
}

async function searchFilesInBucket(bucketName) {
  console.log(`\n📂 BUSCANDO EN BUCKET: ${bucketName}`);
  console.log('─'.repeat(50));

  const files = [];

  try {
    // Búsqueda recursiva
    async function listRecursive(path = '') {
      try {
        const { data, error } = await supabase.storage
          .from(bucketName)
          .list(path, { limit: 1000 });

        if (error) {
          console.log(`   ⚠️  Error en ruta '${path}': ${error.message}`);
          return;
        }

        if (!data || data.length === 0) {
          if (path === '') {
            console.log('   📭 Bucket vacío\n');
          }
          return;
        }

        for (const item of data) {
          const fullPath = path ? `${path}/${item.name}` : item.name;

          // Revisar si es carpeta o archivo
          if (item.id === null || item.metadata === undefined) {
            // Es una carpeta
            console.log(`   📁 ${fullPath}/`);
            await listRecursive(fullPath);
          } else {
            // Es un archivo
            const sizeKB = (item.metadata?.size / 1024).toFixed(2);
            console.log(`   📄 ${fullPath} (${sizeKB} KB)`);
            files.push({
              path: fullPath,
              size: item.metadata?.size || 0,
              created: item.created_at,
              updated: item.updated_at,
            });
          }
        }
      } catch (err) {
        console.log(`   ❌ Error en ruta '${path}': ${err.message}`);
      }
    }

    await listRecursive();
    return files;
  } catch (err) {
    console.error(`   ❌ Error grave: ${err.message}`);
    return [];
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  🔍 BÚSQUEDA COMPLETA DE DATOS EN SUPABASE            ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Primero: listar todos los buckets
  const buckets = await getAllBuckets();

  if (buckets.length === 0) {
    console.log('⚠️  No hay buckets. Esto es anómalo.\n');
    process.exit(1);
  }

  // Segundo: buscar en cada bucket
  let totalFiles = 0;
  let totalSize = 0;

  for (const bucketName of buckets) {
    const filesInBucket = await searchFilesInBucket(bucketName);
    totalFiles += filesInBucket.length;
    totalSize += filesInBucket.reduce((sum, f) => sum + f.size, 0);

    if (filesInBucket.length === 0 && !buckets.includes(bucketName)) {
      // Intentar acceso directo con anon key
      console.log(`   💡 Intentando con anon key...`);
      try {
        const anonSupabase = createClient(
          process.env.VITE_SUPABASE_URL,
          process.env.VITE_SUPABASE_ANON_KEY
        );
        const { data, error } = await anonSupabase.storage
          .from(bucketName)
          .list('', { limit: 10 });

        if (!error && data && data.length > 0) {
          console.log(`   ✅ Con anon key encontré ${data.length} items`);
          data.forEach(d => {
            console.log(`      - ${d.name}`);
          });
        }
      } catch (e) {
        // Ignorar
      }
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║ 📊 RESUMEN FINAL                                       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log(`Total de buckets: ${buckets.length}`);
  console.log(`Total de archivos: ${totalFiles}`);
  console.log(`Tamaño total: ${(totalSize / (1024 * 1024)).toFixed(2)} MB\n`);

  if (totalFiles === 0) {
    console.log('⚠️  RESULTADO: Supabase Storage está COMPLETAMENTE VACÍO\n');
    console.log('Posibles causas:');
    console.log('  1. Los datos fueron migrados a R2 manualmente antes');
    console.log('  2. Los datos fueron eliminados');
    console.log('  3. Los datos están en otra cuenta de Supabase');
    console.log('  4. Los permisos no permiten acceso\n');
  } else {
    console.log('✅ ENCONTRADOS ARCHIVOS EN SUPABASE\n');
    console.log('ACCIÓN REQUERIDA: Migrar estos archivos a R2 inmediatamente\n');
  }
}

main();
