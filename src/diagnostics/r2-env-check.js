// Diagnóstico: Verificar que credenciales está usando R2
// Ejecutar en consola del navegador cuando se carga la app

console.log('=== R2 Configuration Diagnostics ===');
console.log('VITE_R2_ACCESS_KEY_ID:', import.meta.env.VITE_R2_ACCESS_KEY_ID);
console.log('VITE_R2_SECRET_ACCESS_KEY:', import.meta.env.VITE_R2_SECRET_ACCESS_KEY?.substring(0, 10) + '***');
console.log('VITE_R2_ENDPOINT:', import.meta.env.VITE_R2_ENDPOINT);
console.log('VITE_R2_PUBLIC_URL:', import.meta.env.VITE_R2_PUBLIC_URL);

// Verificar que las credenciales NO son placeholders
const accessKey = import.meta.env.VITE_R2_ACCESS_KEY_ID;
const secretKey = import.meta.env.VITE_R2_SECRET_ACCESS_KEY;

const isValidAccessKey = accessKey && accessKey.length === 32 && !accessKey.includes('COLOCA');
const isValidSecretKey = secretKey && secretKey.length === 96 && !secretKey.includes('COLOCA');

console.log('✅ Access Key válida:', isValidAccessKey);
console.log('✅ Secret Key válida:', isValidSecretKey);

if (!isValidAccessKey || !isValidSecretKey) {
  console.error('❌ ERROR: Las credenciales NO son válidas');
  console.error('Posibles causas:');
  console.error('1. El build se hizo SIN .env.local presente');
  console.error('2. Las variables de entorno no se cargaron correctamente');
  console.error('3. Necesita un rebuild: npm run build');
}
