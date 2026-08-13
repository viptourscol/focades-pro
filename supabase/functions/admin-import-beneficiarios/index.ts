import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

/**
 * Supabase Edge Function: Importador de Beneficiarios
 * 
 * POST /functions/v1/admin-import-beneficiarios
 * 
 * Body:
 * {
 *   records: [
 *     { NOMBRE: "Juan", N_DOC: "1001409006", EMAIL: "juan@gmail.com", ... },
 *     ...
 *   ]
 * }
 * 
 * Realiza:
 * 1. Valida campos requeridos
 * 2. Detecta duplicados
 * 3. Inserta en lotes
 * 4. Retorna reporte
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-api-key',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

async function importBeneficiarios(req: Request) {
  // Manejar solicitudes OPTIONS (CORS preflight)
  if (req.method === 'OPTIONS') {
    return new Response('OK', {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Validar método
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { records } = await req.json();

    if (!Array.isArray(records) || records.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Records debe ser un array no vacío' }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`📂 Procesando ${records.length} registros...`);
    console.log(`🔍 Primer registro:`, JSON.stringify(records[0]));

    // 1. Validar registros
    const validRecords = [];
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const lineNum = i + 2;

      const recordErrors = [];
      if (!record.N_DOC || record.N_DOC === '#N/D' || record.N_DOC === '') recordErrors.push('Sin documento');
      if (!record.NOMBRE || record.NOMBRE === '#N/D' || record.NOMBRE === '') recordErrors.push('Sin nombre');
      if (!record.EMAIL || record.EMAIL === '#N/D' || record.EMAIL === '') recordErrors.push('Sin email');

      if (recordErrors.length > 0) {
        errors.push({
          linea: lineNum,
          documento: record.N_DOC || 'N/A',
          nombre: record.NOMBRE || 'N/A',
          razon: recordErrors.join(', '),
        });
        continue;
      }

      // Limpiar científica notation
      let numeroCuenta = record.CUENTA_BANCO || '';
      if (numeroCuenta.includes('E+') || numeroCuenta.includes('e+')) {
        numeroCuenta = Math.floor(Number(numeroCuenta)).toString();
      }

      validRecords.push({
        tipo_documento: record.TIPO_DOC || 'CC',
        n_documento: record.N_DOC.trim(),
        nombre_completo: record.NOMBRE.trim(),
        email: record.EMAIL.trim().toLowerCase(),
        telefono: record.TEL && record.TEL !== '#N/D' && record.TEL !== '' ? record.TEL.trim() : null,
        estado_beneficiario: record.ESTADO === 'ACTIVO' ? 'ACTIVO' : 'INACTIVO',
        genero: record.GENERO && record.GENERO !== '#N/D' && record.GENERO !== '' ? record.GENERO.trim() : null,
        nombre_colegio: record.COLEGIO && record.COLEGIO !== '#N/D' && record.COLEGIO !== '' ? record.COLEGIO.trim() : null,
        nombre_universidad:
          record.UNIVERSIDAD && record.UNIVERSIDAD !== '#N/D' && record.UNIVERSIDAD !== '' ? record.UNIVERSIDAD.trim() : null,
        programa_academico:
          record.PROGRAMA && record.PROGRAMA !== '#N/D' && record.PROGRAMA !== '' ? record.PROGRAMA.trim() : null,
        tipo_educacion: record.TIPO_EDUCACION && record.TIPO_EDUCACION !== '' ? record.TIPO_EDUCACION.trim() : null,
        modalidad_beca: record.MODALIDAD && record.MODALIDAD !== '' ? record.MODALIDAD.trim() : null,
        año_convocatoria:
          record.CONVOCATORIA && record.CONVOCATORIA !== '#N/D' && record.CONVOCATORIA !== ''
            ? parseInt(record.CONVOCATORIA)
            : null,
        nombre_banco: record.BANCO && record.BANCO !== '#N/D' && record.BANCO !== '' ? record.BANCO.trim() : null,
        numero_cuenta: numeroCuenta || null,
        tipo_cuenta_bancaria:
          record.TIPO_CUENTA && record.TIPO_CUENTA !== '#N/D' && record.TIPO_CUENTA !== '' ? record.TIPO_CUENTA.trim() : null,
      });
    }

    console.log(`✅ ${validRecords.length} registros válidos`);
    console.log(`⚠️  ${errors.length} registros con errores`);
    if (errors.length > 0) console.log(`🔍 Primeros errores:`, errors.slice(0, 3));

    // 2. Buscar duplicados
    const docNumbers = validRecords.map((r) => r.n_documento);
    const { data: existentes } = await supabase
      .from('portal_beneficiarios')
      .select('n_documento')
      .in('n_documento', docNumbers);

    const existentesSet = new Set(existentes?.map((e) => e.n_documento) || []);
    const nuevos = validRecords.filter((r) => !existentesSet.has(r.n_documento));
    const duplicados = validRecords.filter((r) => existentesSet.has(r.n_documento));

    console.log(`✅ ${nuevos.length} nuevos beneficiarios`);
    console.log(`⏭️  ${duplicados.length} ya existen`);

    // 3. Insertar en lotes
    let imported = 0;
    let failed = 0;
    const BATCH_SIZE = 100;

    for (let i = 0; i < nuevos.length; i += BATCH_SIZE) {
      const batch = nuevos.slice(i, i + BATCH_SIZE);
      const { error, data } = await supabase
        .from('portal_beneficiarios')
        .insert(batch)
        .select('id');

      if (error) {
        console.error(`Error en lote ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
        failed += batch.length;
      } else {
        imported += data?.length || batch.length;
      }
    }

    // 4. Generar reporte
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
      errores: errors.slice(0, 50),
      duplicados: duplicados.slice(0, 20).map((d) => ({
        documento: d.n_documento,
        nombre: d.nombre_completo,
      })),
    };

    return new Response(JSON.stringify(report), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error('Error fatal:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error interno' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

Deno.serve(importBeneficiarios);
