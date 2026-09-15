#!/usr/bin/env node

/**
 * Debug script para identificar por qué falla el upload anónimo
 * Uso: node scripts/debug-anon-upload.mjs
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Leer .env.local
const envPath = path.join(rootDir, '.env.local');
let SUPABASE_URL, SUPABASE_KEY;

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.+)/);
  const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
  
  if (urlMatch) SUPABASE_URL = urlMatch[1].trim();
  if (keyMatch) SUPABASE_KEY = keyMatch[1].trim();
} else {
  // Fallback a env variables
  SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: No se encontraron credenciales de Supabase');
  console.error(`   .env.local existe: ${fs.existsSync(envPath)}`);
  process.exit(1);
}

// Cliente ANÓNIMO (como el beneficiario)
const anonSupabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function debugAnonUpload() {
  console.log('🔍 Debug: Upload anónimo de beneficiarios_historicos');
  console.log('═'.repeat(60));
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Anon Key: ${SUPABASE_KEY.slice(0, 30)}...`);

  try {
    const beneficiarioId = 3027;
    const fileName = `acta_grado-${Date.now()}.pdf`;
    const bucketPath = `beneficiarios_historicos/${beneficiarioId}/documentos/${fileName}`;

    // Crear PDF mínimo válido
    const pdfContent = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
100 700 Td
(Test PDF) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000229 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
323
%%EOF`);

    console.log(`\n1️⃣  Intentando upload anónimo...`);
    console.log(`   Ruta: ${bucketPath}`);
    console.log(`   Tamaño: ${pdfContent.length} bytes`);

    const { data, error } = await anonSupabase.storage
      .from('soportes')
      .upload(bucketPath, pdfContent, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (error) {
      console.error(`\n❌ ERROR en upload anónimo:`);
      console.error(`   Mensaje: ${error.message}`);
      console.error(`   Status: ${error.status || 'N/A'}`);
      
      // Log completo del error
      if (error.message.includes('400')) {
        console.error(`\n   Error 400 - Bad Request (probablemente por RLS policy)`);
      }
      
      console.error(`\n   Error completo:`, error);
    } else {
      console.log(`\n✅ Upload anónimo exitoso!`);
      console.log(`   Archivo: ${data.path}`);

      // Limpiar
      await anonSupabase.storage
        .from('soportes')
        .remove([data.path]);
      console.log(`   Archivo de prueba eliminado.`);
    }

  } catch (error) {
    console.error(`\n❌ Error inesperado: ${error.message}`);
    console.error(error.stack);
  }

  console.log(`\n${'═'.repeat(60)}`);
}

debugAnonUpload();
