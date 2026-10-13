#!/usr/bin/env node

/**
 * Script para verificar que las variables de entorno están correctamente
 * configuradas en Supabase Functions (vía logs)
 * 
 * Uso: node scripts/verify-r2-env-vars.mjs
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jwifxjzxdxjntbdqbyku.supabase.co';
// Lee desde variable de entorno
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.log('⚠️  SUPABASE_SERVICE_ROLE_KEY no está en variables de entorno');
  console.log('   Usa: export SUPABASE_SERVICE_ROLE_KEY="tu_service_key"');
  console.log('\n   O ejecuta desde directorio del proyecto y carga desde .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FUNCTIONS = [
  'subsanar-actualizacion-beneficiario',
  'admin-document-action',
  'enviar-actualizacion-beneficiario',
  'generate-beneficiario-onboarding-docs',
  'generate-inscripcion-docs',
  'import-historicos-lote',
];

const REQUIRED_VARS = [
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_ENDPOINT',
  'R2_BUCKET',
];

async function testFunctionWithR2() {
  console.log('🧪 Probando subsanar-actualizacion-beneficiario...\n');

  try {
    // Test call para ver si las variables están disponibles
    const { data, error } = await supabase.functions.invoke(
      'subsanar-actualizacion-beneficiario',
      {
        body: {
          beneficiario_id: 0,
          actualizacion_id: 0,
          form_data: {},
          files_base64: {},
        },
      }
    );

    if (error) {
      console.log('Response error:', error);
    }

    console.log('Response data:', data);

    // Check if error mentions missing R2 variables
    if (data?.error?.includes('Missing R2')) {
      console.error('❌ Variables R2 NO están configuradas en Supabase Functions');
      return false;
    }

    if (data?.error?.includes('No se encontró la actualización')) {
      console.log('✅ Variables R2 ESTÁN configuradas correctamente');
      console.log('   (Error de datos es normal, variables fueron leídas)');
      return true;
    }

    return true;
  } catch (err) {
    console.error('Error al probar función:', err.message);
    return false;
  }
}

async function checkViaManagementAPI(accessToken) {
  if (!accessToken) {
    console.log('\n⚠️  Sin access token de Supabase, no puedo verificar via API');
    console.log('   Para obtenerlo: https://supabase.com/dashboard/account/tokens');
    return;
  }

  console.log('\n📊 Verificando via Supabase Management API...\n');

  const projectId = 'jwifxjzxdxjntbdqbyku';

  for (const funcName of FUNCTIONS) {
    try {
      const response = await fetch(
        `https://api.supabase.com/v1/projects/${projectId}/functions/${funcName}/secrets`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.log(`⚠️  ${funcName}: No se pudieron obtener variables (${response.status})`);
        continue;
      }

      const secrets = await response.json();
      const secretNames = secrets.map((s) => s.name);

      const hasAllVars = REQUIRED_VARS.every((v) => secretNames.includes(v));

      if (hasAllVars) {
        console.log(`✅ ${funcName}: TODAS las variables configuradas`);
      } else {
        const missing = REQUIRED_VARS.filter((v) => !secretNames.includes(v));
        console.log(`❌ ${funcName}: Faltan variables: ${missing.join(', ')}`);
      }
    } catch (err) {
      console.error(`❌ Error verificando ${funcName}:`, err.message);
    }
  }
}

async function main() {
  console.log('🔍 VERIFICANDO CONFIGURACIÓN DE VARIABLES R2\n');
  console.log('='.repeat(60) + '\n');

  // Test 1: Intentar invocar la función
  const hasR2 = await testFunctionWithR2();

  console.log('\n' + '='.repeat(60));
  console.log('\n📋 RESUMEN:\n');

  if (hasR2) {
    console.log('✅ Las variables de entorno R2 PARECEN estar configuradas');
    console.log('   Prueba ahora una subsanación real para confirmar');
  } else {
    console.log('❌ Las variables de entorno R2 NO están configuradas');
    console.log('   Sigue la guía: CONFIGURAR_VARIABLES_PASO_A_PASO.md');
  }

  console.log('\n📚 Funciones que necesitan configuración:');
  FUNCTIONS.forEach((fn) => {
    console.log(`   • ${fn}`);
  });

  console.log('\n📍 URL para configurar:');
  console.log('   https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions\n');
}

main();
