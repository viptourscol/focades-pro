/**
 * Proxy para upload a R2 - el servidor hace el PUT, no el navegador
 * Esto evita completamente los problemas de CORS
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std/crypto/mod.ts'
import { encodeHex } from 'https://deno.land/std/encoding/hex.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

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
    const authHeader = req.headers.get('authorization')
    const body = await req.json()
    const { filePath, fileData, contentType, beneficiario_id } = body

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

    // Validate user identity - try JWT first, then beneficiario_id
    let validatedUserId = null
    let validatedBeneficiarioId = null

    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '')
        const { data: user, error: userError } = await supabase.auth.getUser(token)
        
        if (!userError && user.user) {
          validatedUserId = user.user.id
          console.log(`✅ Authorized by JWT: ${validatedUserId}`)
        }
      } catch (e) {
        console.log('JWT validation failed, trying beneficiario_id...')
      }
    }

    // If no valid JWT, try beneficiario_id
    if (!validatedUserId && beneficiario_id) {
      console.log(`🔍 Validating beneficiario_id: ${beneficiario_id} (type: ${typeof beneficiario_id})`)
      
      try {
        // Ensure beneficiario_id is a number for comparison with BD
        const beneficiarioIdNum = typeof beneficiario_id === 'string' ? parseInt(beneficiario_id, 10) : beneficiario_id
        console.log(`  Converted to: ${beneficiarioIdNum} (type: ${typeof beneficiarioIdNum})`)
        
        const result = await supabase
          .from('portal_beneficiarios')
          .select('id')
          .eq('id', beneficiarioIdNum)
          .maybeSingle()

        console.log(`  Query result:`, { 
          found: result.data ? `id=${result.data.id}` : 'null',
          error: result.error ? `${result.error.code}: ${result.error.message}` : 'null'
        })
        
        if (!result.error && result.data) {
          validatedBeneficiarioId = beneficiario_id
          console.log(`✅ Authorized by beneficiario_id: ${beneficiario_id}`)
        }
      } catch (queryError) {
        console.log(`❌ Exception during beneficiario lookup:`, queryError)
      }
    }

    // Must have either valid JWT or valid beneficiario_id
    if (!validatedUserId && !validatedBeneficiarioId) {
      console.log(`❌ No valid authentication`)
      return new Response(JSON.stringify({ 
        error: 'Unauthorized - no valid authentication',
        hadAuthHeader: !!authHeader,
        receivedBeneficiarioId: beneficiario_id,
      }), {
        status: 401,
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
