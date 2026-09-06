import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Headers CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-api-key',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
}

interface ReplaceDocumentRequest {
  method: 'replace-document'
  beneficiario_id: string
  documento_id: string
  tipo_documento: string
  motivo: string
  nuevo_archivo_base64: string
  nuevo_archivo_nombre: string
  admin_id: string
}

interface DeleteDocumentRequest {
  method: 'delete-document'
  beneficiario_id: string
  documento_id: string
  tipo_documento: string
  motivo: string
  admin_id: string
}

type DocumentActionRequest = ReplaceDocumentRequest | DeleteDocumentRequest

// Procesar acción de documento
async function handleDocumentAction(req: DocumentActionRequest) {
  const { method, beneficiario_id, documento_id, tipo_documento, motivo, admin_id } = req

  try {
    // 1. Validar que el usuario es admin
    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('id, nombre')
      .eq('id', admin_id)
      .single()

    if (adminError || !adminUser) {
      throw new Error('No autorizado: usuario no es admin')
    }

    // 2. Obtener información del documento actual
    const { data: docData, error: docError } = await supabase
      .from('inscripciones_documentos')
      .select('id, storage_path, nombre_original')
      .eq('id', documento_id)
      .single()

    if (docError || !docData) {
      throw new Error('Documento no encontrado')
    }

    const oldStoragePath = docData.storage_path?.replace('soportes/', '')

    if (method === 'replace-document') {
      const typedReq = req as ReplaceDocumentRequest
      
      // 3a. Eliminar archivo anterior
      if (oldStoragePath) {
        const { error: deleteError } = await supabase.storage
          .from('soportes')
          .remove([oldStoragePath])

        if (deleteError) {
          console.warn(`⚠️ No se pudo eliminar archivo anterior: ${deleteError.message}`)
          // Continuar aunque falle (no bloquea)
        }
      }

      // 3b. Subir nuevo archivo
      const fileBuffer = Uint8Array.from(
        atob(typedReq.nuevo_archivo_base64),
        (c) => c.charCodeAt(0)
      )

      const newFileName = `${tipo_documento}-${Date.now()}.pdf`
      const newStoragePath = `inscripciones/${beneficiario_id}/${newFileName}`

      const { error: uploadError } = await supabase.storage
        .from('soportes')
        .upload(newStoragePath, fileBuffer, {
          contentType: 'application/pdf',
          upsert: false,
        })

      if (uploadError) {
        throw new Error(`Error al subir nuevo archivo: ${uploadError.message}`)
      }

      // 3c. Actualizar BD
      const { error: updateError } = await supabase
        .from('inscripciones_documentos')
        .update({
          storage_path: `soportes/${newStoragePath}`,
          nombre_original: typedReq.nuevo_archivo_nombre,
          uploaded_at: new Date().toISOString(),
        })
        .eq('id', documento_id)

      if (updateError) {
        throw new Error(`Error al actualizar documento: ${updateError.message}`)
      }

      // 4. Registrar en bitácora
      const { error: bitacoraError } = await supabase
        .from('portal_beneficiario_bitacora')
        .insert({
          beneficiario_id,
          actor_id: admin_id,
          actor: adminUser.nombre,
          accion: 'Reemplazó documento',
          categoria: 'documento',
          nota: `Tipo: ${tipo_documento} | Motivo: ${motivo}`,
          metadata_json: {
            tipo_documento,
            motivo,
            archivo_anterior: docData.nombre_original,
            archivo_nuevo: typedReq.nuevo_archivo_nombre,
            documento_id,
          },
        })

      if (bitacoraError) {
        console.error(`⚠️ Error al registrar en bitácora: ${bitacoraError.message}`)
        // Continuar aunque falle
      }

      return {
        ok: true,
        message: 'Documento reemplazado correctamente',
        accion: 'reemplazado',
      }
    } else if (method === 'delete-document') {
      // 3. Eliminar archivo del storage
      if (oldStoragePath) {
        const { error: deleteError } = await supabase.storage
          .from('soportes')
          .remove([oldStoragePath])

        if (deleteError) {
          console.warn(`⚠️ No se pudo eliminar archivo: ${deleteError.message}`)
          // Continuar aunque falle
        }
      }

      // 4. Actualizar BD (marcar como eliminado)
      const { error: updateError } = await supabase
        .from('inscripciones_documentos')
        .update({
          storage_path: null,
          nombre_original: null,
          uploaded_at: null,
        })
        .eq('id', documento_id)

      if (updateError) {
        throw new Error(`Error al eliminar documento: ${updateError.message}`)
      }

      // 5. Registrar en bitácora
      const { error: bitacoraError } = await supabase
        .from('portal_beneficiario_bitacora')
        .insert({
          beneficiario_id,
          actor_id: admin_id,
          actor: adminUser.nombre,
          accion: 'Eliminó documento',
          categoria: 'documento',
          nota: `Tipo: ${tipo_documento} | Motivo: ${motivo}`,
          metadata_json: {
            tipo_documento,
            motivo,
            archivo_eliminado: docData.nombre_original,
            documento_id,
          },
        })

      if (bitacoraError) {
        console.error(`⚠️ Error al registrar en bitácora: ${bitacoraError.message}`)
        // Continuar aunque falle
      }

      return {
        ok: true,
        message: 'Documento eliminado correctamente',
        accion: 'eliminado',
      }
    }

    throw new Error('Método no soportado')
  } catch (error) {
    console.error('❌ Error en document action:', error)
    throw error
  }
}

// Manejador principal
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: corsHeaders,
    })
  }

  try {
    const body = await req.json() as DocumentActionRequest

    // Validar campos obligatorios
    if (!body.method || !body.beneficiario_id || !body.documento_id || !body.tipo_documento || !body.motivo || !body.admin_id) {
      return new Response(
        JSON.stringify({
          error: 'Faltan campos obligatorios',
          required: ['method', 'beneficiario_id', 'documento_id', 'tipo_documento', 'motivo', 'admin_id'],
        }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Validar método
    if (body.method !== 'replace-document' && body.method !== 'delete-document') {
      return new Response(JSON.stringify({ error: 'Método inválido' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const result = await handleDocumentAction(body)

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: corsHeaders,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    console.error('❌ Unhandled error:', message)

    return new Response(JSON.stringify({ error: message, ok: false }), {
      status: 400,
      headers: corsHeaders,
    })
  }
})
