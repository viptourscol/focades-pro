import { S3Client, PutObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3.1143.0'

const r2AccessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
const r2SecretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
const r2Endpoint = Deno.env.get('R2_ENDPOINT')

if (!r2AccessKeyId || !r2SecretAccessKey || !r2Endpoint) {
  throw new Error('Missing R2 environment variables')
}

const r2Client = new S3Client({
  region: 'auto',
  credentials: {
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
  },
  endpoint: r2Endpoint,
})

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS_HEADERS })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
      },
    })
  }

  try {
    const body = await req.json()
    const { file_base64, file_name, file_type, r2_path } = body

    if (!file_base64 || !r2_path) {
      return jsonResponse({ ok: false, error: 'Faltan file_base64 o r2_path' }, 400)
    }

    console.log(`📤 Recibido upload: ${file_name} → ${r2_path}`)

    // Decodificar base64 a Uint8Array
    const binaryString = atob(file_base64)
    const fileBuffer = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      fileBuffer[i] = binaryString.charCodeAt(i)
    }

    const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2)
    console.log(`📦 Tamaño del archivo: ${fileSizeMB} MB`)

    // Normalizar ruta
    let normalizedPath = r2_path
    if (!normalizedPath.startsWith('soportes/')) {
      normalizedPath = `soportes/${normalizedPath}`
    }

    // Subir a R2
    try {
      const uploadParams = {
        Bucket: 'focades-pro',
        Key: normalizedPath,
        Body: fileBuffer,
        ContentType: file_type || 'application/octet-stream',
      }

      const command = new PutObjectCommand(uploadParams)
      await r2Client.send(command)

      console.log(`✅ Archivo subido a R2: ${normalizedPath} (${fileSizeMB} MB)`)

      return jsonResponse({
        ok: true,
        storage_path: normalizedPath,
        size_bytes: fileBuffer.length,
      })
    } catch (r2Error) {
      console.error(`❌ Error subiendo a R2: ${r2Error.message}`)
      return jsonResponse({
        ok: false,
        error: `No se pudo subir a R2: ${r2Error.message}`,
      }, 500)
    }
  } catch (error) {
    console.error('❌ Error en upload-document-r2:', error)
    return jsonResponse({
      ok: false,
      error: error.message || 'Error interno del servidor',
    }, 500)
  }
})
