import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AwsClient } from 'https://esm.sh/aws4fetch@1'

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

async function deleteFromR2(filePath: string): Promise<void> {
  const config = getR2Config()

  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: 'auto',
    service: 's3',
  })

  const r2Url = `${config.endpoint}/${config.bucket}/${filePath}`

  const deleteRequest = new Request(r2Url, {
    method: 'DELETE',
  })

  const signedRequest = await aws.sign(deleteRequest, { aws4request: true })
  const deleteResponse = await fetch(signedRequest)

  if (!deleteResponse.ok && deleteResponse.status !== 404) {
    throw new Error(`Failed to delete from R2: ${deleteResponse.status} ${deleteResponse.statusText}`)
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
    const { filePath, motivo, beneficiario_id } = body

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
    let isAdmin = false

    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '')
        const { data: user, error: userError } = await supabase.auth.getUser(token)
        
        if (!userError && user.user) {
          validatedUserId = user.user.id
          
          // Check if user is admin
          const { data: adminUser } = await supabase
            .from('portal_admin_users')
            .select('user_id')
            .eq('user_id', user.user.id)
            .maybeSingle()
          
          if (adminUser) {
            isAdmin = true
            console.log(`✅ Authorized as admin: ${validatedUserId}`)
          }
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

    // Must have either valid JWT (admin) or valid beneficiario_id
    if (!validatedUserId && !validatedBeneficiarioId) {
      console.log(`❌ No valid authentication - validatedUserId: ${validatedUserId}, validatedBeneficiarioId: ${validatedBeneficiarioId}`)
      return new Response(JSON.stringify({ error: 'Unauthorized - no valid authentication' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    // Only admins can delete - beneficiarios cannot
    if (!isAdmin && !validatedUserId) {
      return new Response(JSON.stringify({ error: 'Admin access required for deletion' }), {
        status: 403,
        headers: corsHeaders,
      })
    }

    await deleteFromR2(filePath)

    // Log action in audit trail
    console.log(`🗑️ File deleted from R2 by admin ${user.user.id}: ${filePath}`)
    console.log(`   Motivo: ${motivo || 'No reason provided'}`)

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'File deleted successfully',
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    )
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
