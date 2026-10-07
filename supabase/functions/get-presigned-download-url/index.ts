import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GetObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3@3.1143.0'
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.1143.0'

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

async function generatePresignedUrl(
  filePath: string,
  expiresIn: number = 86400
): Promise<string> {
  const config = getR2Config()
  const client = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
  try {
    return await getSignedUrl(client, new GetObjectCommand({
      Bucket: config.bucket,
      Key: filePath,
    }), { expiresIn })
  } finally {
    client.destroy()
  }
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
    const { filePath, expiresIn, beneficiario_id } = body

    // Validations
    if (typeof filePath !== 'string' || !filePath) {
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
      console.log(`🔍 Validating beneficiario_id: ${beneficiario_id} (type: ${typeof beneficiario_id})`)
      
      try {
        // Ensure beneficiario_id is a number for comparison with BD
        const beneficiarioIdNum = typeof beneficiario_id === 'string' ? parseInt(beneficiario_id, 10) : beneficiario_id
        console.log(`  Converted to: ${beneficiarioIdNum} (type: ${typeof beneficiarioIdNum})`)
        
        const query = supabase
          .from('portal_beneficiarios')
          .select('id')
          .eq('id', beneficiarioIdNum)
        
        console.log(`  Executing query with id=${beneficiarioIdNum}...`)
        const result = await query.maybeSingle()
        const { data: beneficiario, error: benefError } = result

        console.log(`  Query result:`, { 
          beneficiario: beneficiario ? `found: id=${beneficiario.id}` : 'null',
          error: benefError ? `${benefError.code}: ${benefError.message}` : 'null',
          status: result?.status 
        })
        
        if (!benefError && beneficiario) {
          validatedBeneficiarioId = beneficiario_id
          console.log(`✅ Authorized by beneficiario_id: ${beneficiario_id}`)
        } else if (benefError) {
          console.log(`❌ Query error:`, benefError.message || JSON.stringify(benefError))
        } else {
          console.log(`❌ Beneficiario ID ${beneficiarioIdNum} not found in database`)
        }
      } catch (queryError) {
        console.log(`❌ Exception during beneficiario lookup:`, queryError)
      }
    }

    // Must have either valid JWT or valid beneficiario_id
    if (!validatedUserId && !validatedBeneficiarioId) {
      console.log(`❌ No valid authentication - validatedUserId: ${validatedUserId}, validatedBeneficiarioId: ${validatedBeneficiarioId}`)
      
      const debugInfo = {
        hadAuthHeader: !!authHeader,
        receivedBeneficiarioId: beneficiario_id,
        validatedUserId,
        validatedBeneficiarioId,
      }
      
      return new Response(JSON.stringify({ 
        error: 'Unauthorized - no valid authentication',
        debug: debugInfo
      }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    const finalExpiresIn = expiresIn ?? 86400
    if (!Number.isInteger(finalExpiresIn) || finalExpiresIn < 1 || finalExpiresIn > 604800) {
      return new Response(JSON.stringify({ error: 'expiresIn must be an integer between 1 and 604800 seconds' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const presignedUrl = await generatePresignedUrl(filePath, finalExpiresIn)
    
    const expiresAt = new Date(Date.now() + finalExpiresIn * 1000).toISOString()

    // Log action
    const authInfo = validatedUserId ? `JWT user ${validatedUserId}` : `beneficiario ${validatedBeneficiarioId}`
    console.log(`🔑 Presigned download URL generated by ${authInfo} for ${filePath}`)

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
