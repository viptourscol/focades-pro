#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Falta VITE_SUPABASE_URL o SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyzeSupabase() {
  console.log('🔍 ANALIZANDO SUPABASE STORAGE...\n');

  const buckets = ['soportes', 'beneficiario-documentos', 'public-assets'];
  const analysis = {
    timestamp: new Date().toISOString(),
    buckets: {},
    totalFiles: 0,
    totalSize: 0,
  };

  for (const bucketName of buckets) {
    console.log(`📦 Bucket: ${bucketName}`);
    analysis.buckets[bucketName] = {
      files: [],
      fileCount: 0,
      totalSize: 0,
    };

    try {
      const { data, error } = await supabase.storage.from(bucketName).list('', {
        limit: 1000,
        offset: 0,
      });

      if (error) {
        console.error(`   ❌ Error: ${error.message}`);
        analysis.buckets[bucketName].error = error.message;
        continue;
      }

      if (!data || data.length === 0) {
        console.log('   📭 Vacío\n');
        continue;
      }

      // Procesar archivos recursivamente
      async function listFilesRecursive(path = '') {
        const { data: contents, error } = await supabase.storage
          .from(bucketName)
          .list(path, { limit: 1000 });

        if (error || !contents) return;

        for (const item of contents) {
          const fullPath = path ? `${path}/${item.name}` : item.name;

          if (item.id) {
            // Es un archivo
            const sizeKB = (item.metadata?.size / 1024).toFixed(2);
            analysis.buckets[bucketName].files.push({
              path: fullPath,
              size: item.metadata?.size || 0,
              created: item.created_at,
              updated: item.updated_at,
            });
            analysis.buckets[bucketName].totalSize += item.metadata?.size || 0;
            analysis.totalSize += item.metadata?.size || 0;
            console.log(`   📄 ${fullPath} (${sizeKB} KB)`);
          } else {
            // Es una carpeta
            await listFilesRecursive(fullPath);
          }
        }
      }

      await listFilesRecursive();

      analysis.buckets[bucketName].fileCount = analysis.buckets[bucketName].files.length;
      analysis.totalFiles += analysis.buckets[bucketName].fileCount;
      const totalSizeMB = (analysis.buckets[bucketName].totalSize / (1024 * 1024)).toFixed(2);
      console.log(`   📊 Total: ${analysis.buckets[bucketName].fileCount} archivos (${totalSizeMB} MB)\n`);
    } catch (err) {
      console.error(`   ❌ Error procesando bucket: ${err.message}\n`);
      analysis.buckets[bucketName].error = err.message;
    }
  }

  // Guardar análisis
  fs.writeFileSync('analysis-supabase.json', JSON.stringify(analysis, null, 2));
  
  console.log('📊 RESUMEN:');
  console.log(`   Total de archivos: ${analysis.totalFiles}`);
  console.log(`   Tamaño total: ${(analysis.totalSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`\n✅ Análisis guardado en: analysis-supabase.json\n`);

  return analysis;
}

analyzeSupabase();
