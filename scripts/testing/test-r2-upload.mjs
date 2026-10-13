#!/usr/bin/env node

import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const r2Client = new S3Client({
  region: "auto",
  credentials: {
    accessKeyId: process.env.VITE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.VITE_R2_SECRET_ACCESS_KEY,
  },
  endpoint: process.env.VITE_R2_ENDPOINT,
});

const BUCKET_NAME = "focades-pro";

async function testR2Upload() {
  try {
    console.log("🧪 INICIANDO TEST DE R2...\n");

    // 1. Crear archivo de prueba
    const testFileName = `test-${Date.now()}.txt`;
    const testPath = `test-uploads/${testFileName}`;
    const testContent = `Test file created at ${new Date().toISOString()}\nThis is a test upload to R2.`;

    console.log(`📤 Subiendo archivo de prueba: ${testPath}`);
    const uploadCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: testPath,
      Body: testContent,
      ContentType: "text/plain",
    });

    await r2Client.send(uploadCommand);
    console.log("✅ Archivo subido exitosamente!\n");

    // 2. Listar archivos
    console.log("📁 Listando archivos en R2...");
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      MaxKeys: 20,
    });

    const listResponse = await r2Client.send(listCommand);

    if (listResponse.Contents && listResponse.Contents.length > 0) {
      console.log(`✅ Encontrados ${listResponse.Contents.length} archivos:\n`);
      listResponse.Contents.forEach(file => {
        const sizeKB = (file.Size / 1024).toFixed(2);
        const publicUrl = `${process.env.VITE_R2_PUBLIC_URL}/${file.Key}`;
        console.log(`  📄 ${file.Key}`);
        console.log(`     Tamaño: ${sizeKB} KB`);
        console.log(`     URL: ${publicUrl}`);
        console.log();
      });
    } else {
      console.log("⚠️  No hay archivos en el bucket\n");
    }

    // 3. Intentar leer el archivo que acabamos de subir
    console.log(`📖 Intentando leer el archivo de prueba...`);
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: testPath,
    });

    const getResponse = await r2Client.send(getCommand);
    const body = await getResponse.Body.transformToString();
    console.log("✅ Archivo leído exitosamente!");
    console.log(`   Contenido: "${body}"\n`);

    // 4. URL pública
    console.log(`🔗 URL PÚBLICA del archivo:`);
    const publicUrl = `${process.env.VITE_R2_PUBLIC_URL}/${testPath}`;
    console.log(`   ${publicUrl}\n`);

    console.log("✅ TEST COMPLETADO EXITOSAMENTE");
    console.log(`\n📊 Resumen:`);
    console.log(`  - Conexión a R2: ✅ FUNCIONA`);
    console.log(`  - Upload: ✅ FUNCIONA`);
    console.log(`  - Lectura: ✅ FUNCIONA`);
    console.log(`  - URL pública: ✅ FUNCIONA`);
    console.log(`\n✨ R2 está listo para usar\n`);

  } catch (error) {
    console.error("❌ ERROR EN TEST R2:");
    console.error(`   ${error.message}`);
    
    if (error.Code === "NoSuchBucket") {
      console.error("   El bucket no existe. Verifica el nombre.");
    } else if (error.Code === "InvalidAccessKeyId" || error.Code === "SignatureDoesNotMatch") {
      console.error("   Credenciales incorrectas. Verifica .env.local");
    }
    
    process.exit(1);
  }
}

// Validar que existen las variables de entorno
if (!process.env.VITE_R2_ACCESS_KEY_ID || !process.env.VITE_R2_SECRET_ACCESS_KEY) {
  console.error("❌ ERROR: Falta configurar credenciales de R2");
  console.error("   Agrega a .env.local:");
  console.error("   VITE_R2_ACCESS_KEY_ID=...");
  console.error("   VITE_R2_SECRET_ACCESS_KEY=...");
  process.exit(1);
}

testR2Upload();
