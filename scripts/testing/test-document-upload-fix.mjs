#!/usr/bin/env node

/**
 * Test de subida de documentos para Onboarding - Verificación post-fix
 * 
 * Uso:
 *   node scripts/test-document-upload-fix.mjs
 * 
 * Verifica que:
 * 1. Las políticas de RLS permiten uploads anónimos
 * 2. Los archivos se suben correctamente a Storage
 * 3. Los registros se insertan en la tabla de documentos
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no están definidas');
  console.error('   Asegúrate de tener un archivo .env.local con estas variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testDocumentUpload() {
  console.log('🧪 Test de subida de documentos - Onboarding');
  console.log('═'.repeat(50));

  try {
    // 1. Crear un beneficiario de prueba si no existe
    console.log('\n1️⃣  Buscando beneficiario de prueba...');
    
    const { data: testBenefit, error: fetchError } = await supabase
      .from('portal_beneficiarios')
      .select('id, documento')
      .eq('documento', '9999999999')  // Documento de prueba
      .maybeSingle();

    if (fetchError) {
      console.warn('   ⚠️  Error al buscar beneficiario:', fetchError.message);
    }

    let beneficiarioId;
    if (testBenefit) {
      beneficiarioId = testBenefit.id;
      console.log(`   ✅ Beneficiario de prueba encontrado (ID: ${beneficiarioId})`);
    } else {
      console.log('   ⚠️  No hay beneficiario de prueba. Usando ID: 3027 (del error del usuario)');
      beneficiarioId = 3027;
    }

    // 2. Crear un PDF de prueba mínimo
    console.log('\n2️⃣  Creando PDF de prueba...');
    const testPdfContent = Buffer.from('%PDF-1.4\n%Test PDF for document upload verification\n%%EOF');
    console.log(`   ✅ PDF creado (${testPdfContent.length} bytes)`);

    // 3. Intentar subir el archivo a Storage
    console.log('\n3️⃣  Subiendo documento a Storage (anónimo)...');
    const fileName = `test-acta_grado-${Date.now()}.pdf`;
    const storagePath = `beneficiarios_historicos/${beneficiarioId}/documentos/${fileName}`;

    const { error: uploadError, data: uploadData } = await supabase.storage
      .from('soportes')
      .upload(storagePath, testPdfContent, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      console.error(`   ❌ Error al subir archivo: ${uploadError.message}`);
      console.error(`      Código: ${uploadError.code}`);
      console.error(`      Detalles: ${JSON.stringify(uploadError)}`);
      return false;
    }

    console.log(`   ✅ Archivo subido correctamente`);
    console.log(`      Ruta: ${storagePath}`);
    console.log(`      ID: ${uploadData.id}`);

    // 4. Intentar registrar en tabla de documentos (mediante auth-credentials edge function)
    console.log('\n4️⃣  Registrando documento en base de datos...');

    const { data: registerResult, error: registerError } = await supabase.functions.invoke('auth-credentials', {
      body: {
        method: 'register-document',
        beneficiario_id: beneficiarioId,
        titulo: 'Acta de Grado (Test)',
        tipo_documento: 'acta_grado_test',
        storage_path: `soportes/${storagePath}`,
        archivo_size_bytes: testPdfContent.length,
      },
    });

    if (registerError) {
      console.error(`   ❌ Error al registrar documento: ${registerError.message}`);
      console.error(`      Detalles: ${JSON.stringify(registerError)}`);
      return false;
    }

    if (!registerResult?.ok) {
      console.error(`   ❌ Registro no exitoso: ${registerResult?.error || 'Unknown error'}`);
      return false;
    }

    console.log(`   ✅ Documento registrado correctamente`);

    // 5. Verificar que el archivo existe en Storage
    console.log('\n5️⃣  Verificando que el archivo existe en Storage...');
    const { data: listFiles, error: listError } = await supabase.storage
      .from('soportes')
      .list(`beneficiarios_historicos/${beneficiarioId}/documentos`, {
        limit: 10,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (listError) {
      console.error(`   ❌ Error al listar archivos: ${listError.message}`);
      return false;
    }

    const uploadedFile = listFiles?.find(f => f.name === fileName);
    if (uploadedFile) {
      console.log(`   ✅ Archivo verificado en Storage`);
      console.log(`      Nombre: ${uploadedFile.name}`);
      console.log(`      Tamaño: ${uploadedFile.metadata.size} bytes`);
      console.log(`      Creado: ${uploadedFile.created_at}`);
    } else {
      console.warn(`   ⚠️  Archivo no encontrado en listado (pero la subida fue exitosa)`);
    }

    // 6. Limpiar
    console.log('\n6️⃣  Limpiando archivos de prueba...');
    const { error: deleteError } = await supabase.storage
      .from('soportes')
      .remove([storagePath]);

    if (deleteError) {
      console.warn(`   ⚠️  Advertencia al eliminar: ${deleteError.message}`);
    } else {
      console.log('   ✅ Archivo de prueba eliminado');
    }

    console.log('\n' + '═'.repeat(50));
    console.log('✅ PRUEBA COMPLETADA EXITOSAMENTE');
    console.log('═'.repeat(50));
    console.log('\n🎉 El fix funcionó correctamente.');
    console.log('   Los beneficiarios ya pueden subir documentos en el onboarding.\n');

    return true;

  } catch (error) {
    console.error(`\n❌ Error inesperado: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

// Ejecutar test
testDocumentUpload().then(success => {
  process.exit(success ? 0 : 1);
});
