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

// R2 Configuration inline
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

// Manually generate presigned URL with AWS Signature V4
async function generatePresignedUrl(
  filePath: string,
  method: string = 'GET',
  contentType: string = 'application/pdf',
  expiresIn: number = 3600
): Promise<string> {
  const config = getR2Config()
  
  // Parse URL components
  const url = new URL(`${config.endpoint}/${config.bucket}/${filePath}`)
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
    method,
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
    const { filePath, contentType, expiresIn, beneficiario_id } = body

    // Validations
    if (!filePath) {
      return new Response(JSON.stringify({ error: 'filePath is required' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // Security: Only allow soportes/ prefix
    if (!filePath.startsWith('soportes/')) {
      return new Response(JSON.stringify({ error: 'Invalid file path - must start with soportes/' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // Security: No path traversal
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
      console.log(`🔍 Validating beneficiario_id: ${beneficiario_id}`)
      const { data: beneficiario, error: benefError } = await supabase
        .from('portal_beneficiarios')
        .select('id')
        .eq('id', beneficiario_id)
        .maybeSingle()

      console.log(`  Query result:`, { beneficiario, benefError })
      
      if (!benefError && beneficiario) {
        validatedBeneficiarioId = beneficiario_id
        console.log(`✅ Authorized by beneficiario_id: ${beneficiario_id}`)
      } else {
        console.log(`❌ Beneficiario not found or error:`, benefError)
      }
    }

    // Must have either valid JWT or valid beneficiario_id
    if (!validatedUserId && !validatedBeneficiarioId) {
      console.log(`❌ No valid authentication - validatedUserId: ${validatedUserId}, validatedBeneficiarioId: ${validatedBeneficiarioId}`)
      return new Response(JSON.stringify({ error: 'Unauthorized - no valid authentication' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    const finalExpiresIn = expiresIn || 3600
    if (finalExpiresIn > 86400) {
      return new Response(JSON.stringify({ error: 'expiresIn cannot exceed 24 hours' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const finalContentType = contentType || 'application/pdf'
    const presignedUrl = await generatePresignedUrl(filePath, 'PUT', finalContentType, finalExpiresIn)
    
    const expiresAt = new Date(Date.now() + finalExpiresIn * 1000).toISOString()

    // Log action
    console.log(`🔑 Presigned upload URL generated by ${user.user.id} for ${filePath}`)

    return new Response(JSON.stringify({ presignedUrl, expiresAt }), {
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
