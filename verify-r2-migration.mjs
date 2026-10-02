import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { readFileSync } from 'fs';

const envFile = readFileSync('.env.local', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  line = line.trim();
  if (!line || line.startsWith('#')) return;
  const eqIndex = line.indexOf('=');
  if (eqIndex > 0) {
    const key = line.substring(0, eqIndex).trim();
    const value = line.substring(eqIndex + 1).trim();
    envVars[key] = value;
  }
});

const r2Client = new S3Client({
  region: "auto",
  endpoint: envVars.VITE_R2_ENDPOINT,
  credentials: {
    accessKeyId: envVars.VITE_R2_ACCESS_KEY_ID,
    secretAccessKey: envVars.VITE_R2_SECRET_ACCESS_KEY,
  },
});

const command = new ListObjectsV2Command({
  Bucket: "focades-pro",
});

const response = await r2Client.send(command);
console.log(`📊 Total archivos en R2: ${response.KeyCount || 0}`);
console.log(`📊 Total que se migraron: 741`);

if (response.KeyCount >= 741) {
  console.log('\n✅ MIGRACIÓN VERIFICADA: Todos los archivos están en R2');
} else {
  console.log(`\n⚠️  Archivos faltantes: ${741 - (response.KeyCount || 0)}`);
}
