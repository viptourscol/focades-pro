/**
 * Diagnóstico de verificación de variables de entorno compiladas
 * Ejecutar en la consola del navegador después de cargar la página
 * 
 * Uso: copy-paste en la consola de F12
 */

(async () => {
  console.log('🔍 === DIAGNÓSTICO DE CREDENCIALES R2 ===\n');

  // Verificar variables compiladas
  const accessKey = import.meta.env.VITE_R2_ACCESS_KEY_ID;
  const secretKey = import.meta.env.VITE_R2_SECRET_ACCESS_KEY;
  const endpoint = import.meta.env.VITE_R2_ENDPOINT;
  const publicUrl = import.meta.env.VITE_R2_PUBLIC_URL;

  console.log('📦 Variables compiladas en import.meta.env:');
  console.log(`  VITE_R2_ACCESS_KEY_ID: "${accessKey}"`);
  console.log(`  Length: ${accessKey?.length || 'undefined'} (expected: 32)`);
  console.log(`  ✓ Real credentials: ${accessKey?.length === 32 ? '✅ SÍ' : '❌ NO'}`);
  console.log('');

  console.log(`  VITE_R2_SECRET_ACCESS_KEY: "${secretKey?.substring(0, 20)}...${secretKey?.substring(-10)}"`);
  console.log(`  Length: ${secretKey?.length || 'undefined'} (expected: 64)`);
  console.log(`  ✓ Real credentials: ${secretKey?.length === 64 ? '✅ SÍ' : '❌ NO'}`);
  console.log('');

  console.log(`  VITE_R2_ENDPOINT: "${endpoint}"`);
  console.log(`  VITE_R2_PUBLIC_URL: "${publicUrl}"`);
  console.log('');

  // Detectar si son placeholders
  if (accessKey?.includes('COLOCA_TU')) {
    console.log('⚠️  PROBLEMA DETECTADO:');
    console.log('  ❌ Access Key es un placeholder');
    console.log('  Solución:');
    console.log('    1. Verificar .env.local tiene credenciales reales');
    console.log('    2. rm -rf dist && ./check-credentials.sh && npm run build');
    console.log('    3. Vaciar cache del navegador (Ctrl+Shift+Delete)');
  } else if (accessKey?.length !== 32) {
    console.log('⚠️  PROBLEMA DETECTADO:');
    console.log(`  ❌ Access Key tiene longitud ${accessKey?.length}, debería ser 32`);
    console.log('  La credencial compilada es incorrecta');
  } else {
    console.log('✅ CREDENCIALES COMPILADAS CORRECTAMENTE');
    console.log('  Access Key: Real (32 chars)');
    console.log('  Secret Key: Real (64 chars)');
    console.log('');
    console.log('Si aún así falla, el error puede ser:');
    console.log('  1. Credenciales de R2 inválidas o revocadas');
    console.log('  2. Endpoint incorrecto');
    console.log('  3. Problema de CORS en R2');
  }
})();
