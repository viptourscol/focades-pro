import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const supabaseUrl = process.env.SUPABASE_URL || 'https://ojnobfvwdpjcmdahgyjv.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY no está definida');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Script: Importar beneficiarios desde CSV a Supabase
 * 
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node import-beneficiarios.mjs path/to/file.csv
 * 
 * Realiza:
 *   1. Lee CSV con datos de beneficiarios
 *   2. Valida campos requeridos (documento, nombre, email)
 *   3. Detecta duplicados
 *   4. Inserta en portal_beneficiarios
 *   5. Genera reporte de importación
 */

async function importBeneficiarios(csvPath) {
  console.log('📂 Iniciando importación de beneficiarios...\n');

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Archivo no encontrado: ${csvPath}`);
    process.exit(1);
  }

  try {
    // 1. Leer CSV
    console.log('📖 Leyendo archivo CSV...');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true, // headers como keys
      skip_empty_lines: true,
      trim: true,
    });

    console.log(`✅ Leídos ${records.length} registros\n`);

    // 2. Validar y transformar datos
    console.log('🔍 Validando registros...');
    const validRecords = [];
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const lineNum = i + 2; // +2 por header y base-1

      // Validar campos requeridos
      const errors_record = [];
      if (!record.N_DOC || record.N_DOC === '#N/D') errors_record.push('Sin documento');
      if (!record.NOMBRE || record.NOMBRE === '#N/D') errors_record.push('Sin nombre');
      if (!record.EMAIL || record.EMAIL === '#N/D') errors_record.push('Sin email');

      if (errors_record.length > 0) {
        errors.push({
          linea: lineNum,
          documento: record.N_DOC || 'N/A',
          nombre: record.NOMBRE || 'N/A',
          razon: errors_record.join(', '),
        });
        continue;
      }

      // Limpiar valores numéricos en formato científico
      let numeroCuenta = record.CUENTA_BANCO || '';
      if (numeroCuenta.includes('E+')) {
        // Intenta convertir de notación científica
        numeroCuenta = Math.floor(Number(numeroCuenta)).toString();
      }

      validRecords.push({
        tipo_documento: record.TIPO_DOC || 'CC',
        n_documento: record.N_DOC.trim(),
        nombre_completo: record.NOMBRE.trim(),
        email: record.EMAIL.trim().toLowerCase(),
        telefono: record.TEL && record.TEL !== '#N/D' ? record.TEL.trim() : null,
        estado_beneficiario: record.ESTADO === 'ACTIVO' ? 'ACTIVO' : 'INACTIVO',
        // Campos nuevos
        genero: record.GENERO && record.GENERO !== '#N/D' ? record.GENERO.trim() : null,
        nombre_colegio: record.COLEGIO && record.COLEGIO !== '#N/D' ? record.COLEGIO.trim() : null,
        nombre_universidad: record.UNIVERSIDAD && record.UNIVERSIDAD !== '#N/D' ? record.UNIVERSIDAD.trim() : null,
        programa_academico: record.PROGRAMA && record.PROGRAMA !== '#N/D' ? record.PROGRAMA.trim() : null,
        tipo_educacion: record.TIPO_EDUCACION || null,
        modalidad_beca: record.MODALIDAD || null,
        año_convocatoria: record.CONVOCATORIA && record.CONVOCATORIA !== '#N/D' ? parseInt(record.CONVOCATORIA) : null,
        nombre_banco: record.BANCO && record.BANCO !== '#N/D' ? record.BANCO.trim() : null,
        numero_cuenta: numeroCuenta || null,
        tipo_cuenta_bancaria: record.TIPO_CUENTA && record.TIPO_CUENTA !== '#N/D' ? record.TIPO_CUENTA.trim() : null,
      });
    }

    console.log(`✅ ${validRecords.length} registros válidos`);
    console.log(`⚠️  ${errors.length} registros con errores\n`);

    if (errors.length > 0) {
      console.log('📋 Errores encontrados:');
      errors.slice(0, 10).forEach(e => {
        console.log(`   Línea ${e.linea}: ${e.documento} - ${e.razon}`);
      });
      if (errors.length > 10) {
        console.log(`   ... y ${errors.length - 10} más\n`);
      } else {
        console.log();
      }
    }

    // 3. Verificar duplicados en BD
    console.log('🔎 Buscando duplicados en BD...');
    const docNumbers = validRecords.map(r => r.n_documento);
    const { data: existentes } = await supabase
      .from('portal_beneficiarios')
      .select('n_documento')
      .in('n_documento', docNumbers);

    const existentesSet = new Set(existentes?.map(e => e.n_documento) || []);
    const nuevos = validRecords.filter(r => !existentesSet.has(r.n_documento));
    const duplicados = validRecords.filter(r => existentesSet.has(r.n_documento));

    console.log(`✅ ${nuevos.length} nuevos beneficiarios`);
    console.log(`⏭️  ${duplicados.length} ya existen (se saltan)\n`);

    if (nuevos.length === 0) {
      console.log('✨ Nada que importar');
      return;
    }

    // 4. Insertar en lotes de 100
    console.log(`📤 Importando ${nuevos.length} registros...`);
    const BATCH_SIZE = 100;
    let imported = 0;
    let failed = 0;

    for (let i = 0; i < nuevos.length; i += BATCH_SIZE) {
      const batch = nuevos.slice(i, i + BATCH_SIZE);
      const { error, data } = await supabase
        .from('portal_beneficiarios')
        .insert(batch)
        .select('id');

      if (error) {
        console.error(`❌ Error en lote ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
        failed += batch.length;
      } else {
        imported += data?.length || batch.length;
        const pct = Math.floor((i + batch.length) / nuevos.length * 100);
        console.log(`   [${pct}%] Importados ${imported}/${nuevos.length}`);
      }
    }

    // 5. Generar reporte
    console.log('\n' + '═'.repeat(60));
    console.log('✨ IMPORTACIÓN COMPLETADA');
    console.log('═'.repeat(60));
    console.log(`Total leídos:       ${records.length}`);
    console.log(`Válidos:            ${validRecords.length}`);
    console.log(`Con errores:        ${errors.length}`);
    console.log(`Duplicados BD:      ${duplicados.length}`);
    console.log(`Nuevos importados:  ${imported}`);
    console.log(`Fallos:             ${failed}`);

    // 6. Generar archivo de reporte
    const reportPath = path.join(process.cwd(), 'beneficiarios-import-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      stats: {
        total_leidos: records.length,
        validos: validRecords.length,
        con_errores: errors.length,
        duplicados: duplicados.length,
        nuevos_importados: imported,
        fallos: failed,
      },
      errores: errors.slice(0, 50), // Primeros 50
      duplicados: duplicados.slice(0, 20).map(d => ({
        documento: d.n_documento,
        nombre: d.nombre_completo,
      })),
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Reporte guardado: ${reportPath}`);

  } catch (error) {
    console.error('❌ Error fatal:', error.message);
    process.exit(1);
  }
}

// Ejecutar
const csvPath = process.argv[2];
if (!csvPath) {
  console.error('❌ Uso: node import-beneficiarios.mjs <archivo.csv>');
  process.exit(1);
}

importBeneficiarios(csvPath);
