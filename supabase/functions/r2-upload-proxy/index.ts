/**
 * Proxy para upload a R2 - el servidor hace el PUT, no el navegador
 * Esto evita completamente los problemas de CORS
 */

import { crypto } from 'https://deno.land/std/crypto/mod.ts'
import { encodeHex } from 'https://deno.land/std/encoding/hex.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
}

// R2 Configuration
function getR2Config() {
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
  const endpoint = Deno.env.get('R2_ENDPOINT')
  const bucket = Deno.env.get('R2_BUCKET')

  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    throw new Error('Missing R2 environment variables')
  }

  return { accessKeyId, secretAccessKey, endpoint, bucket }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    })
  }

  try {
    const body = await req.json()
    const { filePath, fileData, contentType } = body

    if (!filePath || !fileData || !contentType) {
      return new Response(JSON.stringify({ error: 'Missing required fields: filePath, fileData, contentType' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    if (!filePath.startsWith('soportes/')) {
      return new Response(JSON.stringify({ error: 'Invalid file path - must start with soportes/' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    if (filePath.includes('..')) {
      return new Response(JSON.stringify({ error: 'Invalid file path - no traversal allowed' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const config = getR2Config()
    const r2Url = `${config.endpoint}/${filePath}`

    // Decode base64 file data
    const binaryData = Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0))

    console.log(`📤 Proxy uploading ${filePath} (${binaryData.byteLength} bytes) to R2...`)

    // Upload directly from server (no CORS issues!)
    const uploadResponse = await fetch(r2Url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: binaryData,
    })

    if (!uploadResponse.ok) {
      const responseText = await uploadResponse.text()
      console.error(`❌ R2 upload failed: ${uploadResponse.status}`, responseText)
      
      return new Response(
        JSON.stringify({
          error: `R2 upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`,
          details: responseText,
        }),
        {
          status: uploadResponse.status,
          headers: corsHeaders,
        }
      )
    }

    console.log(`✅ Proxy upload successful for ${filePath}`)

    return new Response(JSON.stringify({ success: true, filePath }), {
      status: 200,
      headers: corsHeaders,
    })
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    )
  }
})
