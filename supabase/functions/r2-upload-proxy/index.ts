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

// Generate presigned URL with AWS Signature V4 (copied from get-presigned-upload-url)
async function generatePresignedUrl(
  filePath: string,
  contentType: string = 'application/pdf',
  expiresIn: number = 3600
): Promise<string> {
  const config = getR2Config()
  
  // Parse URL components
  const url = new URL(`${config.endpoint}/${filePath}`)
  const host = url.hostname
  const pathname = url.pathname
  
  // AWS Signature V4 parameters
  const algorithm = 'AWS4-HMAC-SHA256'
  const amzDatetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  const amzDate = amzDatetime.slice(0, 8)
  const region = 'auto'
  const service = 's3'
  const credentialScope = `${amzDate}/${region}/${service}/aws4_request`
  
  // Build canonical request
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`
  const signedHeaders = 'content-type;host'
  const payloadHash = 'UNSIGNED-PAYLOAD'
  
  const canonicalRequest = [
    'PUT',
    pathname,
    `X-Amz-Algorithm=${algorithm}&X-Amz-Credential=${encodeURIComponent(`${config.accessKeyId}/${credentialScope}`)}&X-Amz-Date=${amzDatetime}&X-Amz-Expires=${expiresIn}&X-Amz-SignedHeaders=${signedHeaders}`,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  
  // Hash canonical request
  const canonicalRequestHash = encodeHex(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest))
  )
  
  // Create string to sign
  const stringToSign = [algorithm, amzDatetime, credentialScope, canonicalRequestHash].join('\n')
  
  // Calculate signature
  const kDate = await crypto.subtle.sign(
    'HMAC',
    await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(`AWS4${config.secretAccessKey}`),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    ),
    new TextEncoder().encode(amzDate)
  )
  
  const kRegion = await crypto.subtle.sign(
    'HMAC',
    await crypto.subtle.importKey('raw', kDate, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    new TextEncoder().encode(region)
  )
  
  const kService = await crypto.subtle.sign(
    'HMAC',
    await crypto.subtle.importKey('raw', kRegion, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    new TextEncoder().encode(service)
  )
  
  const kSigning = await crypto.subtle.sign(
    'HMAC',
    await crypto.subtle.importKey('raw', kService, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    new TextEncoder().encode('aws4_request')
  )
  
  const signature = encodeHex(
    await crypto.subtle.sign(
      'HMAC',
      await crypto.subtle.importKey('raw', kSigning, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
      new TextEncoder().encode(stringToSign)
    )
  )
  
  // Build final presigned URL
  return `${url.toString()}?X-Amz-Algorithm=${algorithm}&X-Amz-Credential=${encodeURIComponent(`${config.accessKeyId}/${credentialScope}`)}&X-Amz-Date=${amzDatetime}&X-Amz-Expires=${expiresIn}&X-Amz-SignedHeaders=${signedHeaders}&X-Amz-Signature=${signature}`
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

    console.log(`📨 Proxy received:`, {
      hasAuthHeader: !!authHeader,
      receivedBeneficiarioId: beneficiario_id,
      filePath,
      fileDataLength: fileData?.length,
      contentType,
    })

    if (!filePath || !fileData || !contentType) {
      const missingFields = []
      if (!filePath) missingFields.push('filePath')
      if (!fileData) missingFields.push('fileData')
      if (!contentType) missingFields.push('contentType')
      
      return new Response(JSON.stringify({ 
        error: `Missing required fields: ${missingFields.join(', ')}` 
      }), {
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
      console.log(`🔍 Proxy validating beneficiario_id: ${beneficiario_id}`)
      
      try {
        // Ensure beneficiario_id is a number for comparison with BD
        const beneficiarioIdNum = typeof beneficiario_id === 'string' ? parseInt(beneficiario_id, 10) : beneficiario_id
        
        if (isNaN(beneficiarioIdNum)) {
          console.log(`❌ Invalid beneficiario_id (not a number): ${beneficiario_id}`)
        } else {
          console.log(`  Query: SELECT id FROM portal_beneficiarios WHERE id = ${beneficiarioIdNum}`)
          
          const result = await supabase
            .from('portal_beneficiarios')
            .select('id')
            .eq('id', beneficiarioIdNum)
            .maybeSingle()

          console.log(`  Result:`, {
            data: result.data ? `id=${result.data.id}` : null,
            error: result.error ? `${result.error.code}: ${result.error.message}` : null,
            count: result.data ? 1 : 0,
          })
          
          if (!result.error && result.data) {
            validatedBeneficiarioId = beneficiario_id
            console.log(`✅ Proxy: Authorized by beneficiario_id: ${beneficiario_id}`)
          } else if (result.error) {
            console.log(`❌ Proxy: Query error:`, result.error.message)
          } else {
            console.log(`❌ Proxy: Beneficiario ID ${beneficiarioIdNum} not found in database`)
          }
        }
      } catch (queryError) {
        console.log(`❌ Proxy: Exception during beneficiario lookup:`, queryError)
      }
    }

    // Must have either valid JWT or valid beneficiario_id
    if (!validatedUserId && !validatedBeneficiarioId) {
      console.log(`❌ Proxy auth failed - no valid authentication`)
      console.log(`   hadAuthHeader: ${!!authHeader}`)
      console.log(`   receivedBeneficiarioId: ${beneficiario_id}`)
      console.log(`   validatedUserId: ${validatedUserId}`)
      console.log(`   validatedBeneficiarioId: ${validatedBeneficiarioId}`)
      
      return new Response(JSON.stringify({ 
        error: 'Unauthorized - no valid authentication',
        debug: {
          hadAuthHeader: !!authHeader,
          receivedBeneficiarioId: beneficiario_id,
          validatedUserId,
          validatedBeneficiarioId,
        }
      }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    // Generate presigned URL for the PUT request
    console.log(`🔑 Generating presigned URL for ${filePath}...`)
    const presignedUrl = await generatePresignedUrl(filePath, contentType, 3600)
    console.log(`✅ Presigned URL generated, making PUT request to R2...`)

    // Decode base64 file data
    const binaryData = Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0))

    console.log(`📤 Proxy uploading ${filePath} (${binaryData.byteLength} bytes) to R2 via presigned URL...`)

    // Upload to R2 using presigned URL (includes AWS Signature V4)
    const uploadResponse = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: binaryData,
    })

    if (!uploadResponse.ok) {
      const responseText = await uploadResponse.text()
      console.error(`❌ R2 upload failed: ${uploadResponse.status}`, responseText.substring(0, 500))
      
      return new Response(
        JSON.stringify({
          error: `R2 upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`,
          details: responseText.substring(0, 500),
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

    console.log(`📨 Proxy received:`, {
      hasAuthHeader: !!authHeader,
      receivedBeneficiarioId: beneficiario_id,
      filePath,
      fileDataLength: fileData?.length,
      contentType,
    })

    if (!filePath || !fileData || !contentType) {
      const missingFields = []
      if (!filePath) missingFields.push('filePath')
      if (!fileData) missingFields.push('fileData')
      if (!contentType) missingFields.push('contentType')
      
      return new Response(JSON.stringify({ 
        error: `Missing required fields: ${missingFields.join(', ')}` 
      }), {
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
      console.log(`🔍 Proxy validating beneficiario_id: ${beneficiario_id}`)
      
      try {
        // Ensure beneficiario_id is a number for comparison with BD
        const beneficiarioIdNum = typeof beneficiario_id === 'string' ? parseInt(beneficiario_id, 10) : beneficiario_id
        
        if (isNaN(beneficiarioIdNum)) {
          console.log(`❌ Invalid beneficiario_id (not a number): ${beneficiario_id}`)
        } else {
          console.log(`  Query: SELECT id FROM portal_beneficiarios WHERE id = ${beneficiarioIdNum}`)
          
          const result = await supabase
            .from('portal_beneficiarios')
            .select('id')
            .eq('id', beneficiarioIdNum)
            .maybeSingle()

          console.log(`  Result:`, {
            data: result.data ? `id=${result.data.id}` : null,
            error: result.error ? `${result.error.code}: ${result.error.message}` : null,
            count: result.data ? 1 : 0,
          })
          
          if (!result.error && result.data) {
            validatedBeneficiarioId = beneficiario_id
            console.log(`✅ Proxy: Authorized by beneficiario_id: ${beneficiario_id}`)
          } else if (result.error) {
            console.log(`❌ Proxy: Query error:`, result.error.message)
          } else {
            console.log(`❌ Proxy: Beneficiario ID ${beneficiarioIdNum} not found in database`)
          }
        }
      } catch (queryError) {
        console.log(`❌ Proxy: Exception during beneficiario lookup:`, queryError)
      }
    }

    // Must have either valid JWT or valid beneficiario_id
    if (!validatedUserId && !validatedBeneficiarioId) {
      console.log(`❌ Proxy auth failed - no valid authentication`)
      console.log(`   hadAuthHeader: ${!!authHeader}`)
      console.log(`   receivedBeneficiarioId: ${beneficiario_id}`)
      console.log(`   validatedUserId: ${validatedUserId}`)
      console.log(`   validatedBeneficiarioId: ${validatedBeneficiarioId}`)
      
      return new Response(JSON.stringify({ 
        error: 'Unauthorized - no valid authentication',
        debug: {
          hadAuthHeader: !!authHeader,
          receivedBeneficiarioId: beneficiario_id,
          validatedUserId,
          validatedBeneficiarioId,
        }
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
