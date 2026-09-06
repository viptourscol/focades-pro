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
  document_type?: 'inscripcion' | 'historico' // 'inscripcion' por defecto
}

interface DeleteDocumentRequest {
  method: 'delete-document'
  beneficiario_id: string
  documento_id: string
  tipo_documento: string
  motivo: string
  admin_id: string
  document_type?: 'inscripcion' | 'historico' // 'inscripcion' por defecto
}

type DocumentActionRequest = ReplaceDocumentRequest | DeleteDocumentRequest

// Procesar acción de documento
async function handleDocumentAction(req: DocumentActionRequest) {
  const { method, beneficiario_id, documento_id, tipo_documento, motivo, admin_id } = req
  const documentType = req.document_type || 'inscripcion' // Por defecto busca en inscripcion
  const tableName = documentType === 'historico' ? 'portal_beneficiario_documentos_historicos' : 'inscripciones_documentos'

  console.log(`📋 [INICIO] Procesando ${method} en tabla: ${tableName}`);
  console.log(`   - beneficiario_id: ${beneficiario_id}`);
  console.log(`   - documento_id: ${documento_id}`);
  console.log(`   - tipo_documento: ${tipo_documento}`);
  console.log(`   - admin_id: ${admin_id}`);

  try {
    // 1. Validar que el usuario es admin
    console.log(`🔑 Validando admin: ${admin_id}`);
    const { data: adminUser, error: adminError } = await supabase
      .from('portal_admin_users')
      .select('user_id')
      .eq('user_id', admin_id)
      .single()

    if (adminError || !adminUser) {
      console.error(`❌ Admin no encontrado: ${admin_id}`, adminError);
      throw new Error('No autorizado: usuario no es admin')
    }
    console.log(`✓ Admin válido: ${adminUser.user_id}`);

    // 2. Obtener información del documento actual
    console.log(`📄 Buscando documento en ${tableName}: ${documento_id}`);
    console.log(`   Tipo de busqueda: ${documentType}`);
    
    // Seleccionar campos según la tabla
    const selectFields = documentType === 'historico'
      ? 'id, storage_path, titulo, beneficiario_id'
      : 'id, storage_path, nombre_original, beneficiario_id';
    
    // Primero intentar SIN .single() para ver todos los resultados
    const { data: docList, error: docListError } = await supabase
      .from(tableName)
      .select(selectFields)
      .eq('id', documento_id);
    
    console.log(`📊 Resultados de búsqueda sin .single():`, {
      count: docList?.length || 0,
      error: docListError?.message,
      data: docList
    });

    let docData = null;
    let docError = null;

    if (docList && docList.length > 0) {
      docData = docList[0];
      console.log(`✓ Documento encontrado en ${tableName}:`, docData);
    } else if (docListError) {
      docError = docListError;
      console.error(`❌ Error en búsqueda en ${tableName}:`, docError);
    }

    // FALLBACK: Si no se encuentra y estamos buscando en históricos, intentar en inscripciones
    if (!docData && documentType === 'historico') {
      console.log(`⚠️ No encontrado en ${tableName}, intentando en inscripciones_documentos...`);
      const { data: inscList, error: inscError } = await supabase
        .from('inscripciones_documentos')
        .select('id, storage_path, nombre_original');
      
      const fallbackDoc = inscList?.find(d => d.id === documento_id);
      if (fallbackDoc) {
        docData = fallbackDoc;
        docError = null;
        console.log(`✓ Documento encontrado en inscripciones_documentos (fallback)`, docData);
      } else if (inscError) {
        console.log(`⚠️ Error en búsqueda fallback:`, inscError);
      }
    }

    if (!docData) {
      console.error(`❌ Documento no encontrado en ${tableName} ni en fallbacks`);
      
      // DETALLADO: Listar documentos en AMBAS tablas para diagnosticar
      const { data: historicDocs } = await supabase
        .from('portal_beneficiario_documentos_historicos')
        .select('id, titulo, tipo_documento, created_at')
        .eq('beneficiario_id', beneficiario_id)
        .limit(20);
      
      console.error(`📋 HISTÓRICOS (${historicDocs?.length || 0} docs) para beneficiario ${beneficiario_id}:`, 
        historicDocs?.map(d => ({ id: d.id, titulo: d.titulo, tipo: d.tipo_documento, created: d.created_at })));
      
      // Obtener inscripción del beneficiario
      const { data: benef } = await supabase
        .from('portal_beneficiarios')
        .select('inscripcion_pk')
        .eq('id', beneficiario_id)
        .single();
      
      if (benef?.inscripcion_pk) {
        const { data: inscripcionDocs } = await supabase
          .from('inscripciones_documentos')
          .select('id, nombre_original, tipo_documento, uploaded_at')
          .eq('inscripcion_id', benef.inscripcion_pk)
          .limit(20);
        
        console.error(`📋 INSCRIPCIONES (${inscripcionDocs?.length || 0} docs) para inscripción ${benef.inscripcion_pk}:`,
          inscripcionDocs?.map(d => ({ id: d.id, nombre: d.nombre_original, tipo: d.tipo_documento, uploaded: d.uploaded_at })));
      }
      
      // Buscar el documento específico en AMBAS tablas
      console.error(`🔍 Buscando documento ${documento_id} en ambas tablas...`);
      
      let docInHistoricos = null;
      try {
        const result = await supabase
          .from('portal_beneficiario_documentos_historicos')
          .select('*')
          .eq('id', documento_id)
          .single();
        if (!result.error) {
          docInHistoricos = result.data;
        }
      } catch (e) {
        // Error silencioso
      }
      
      let docInInscripciones = null;
      try {
        const result = await supabase
          .from('inscripciones_documentos')
          .select('*')
          .eq('id', documento_id)
          .single();
        if (!result.error) {
          docInInscripciones = result.data;
        }
      } catch (e) {
        // Error silencioso
      }
      
      if (docInHistoricos) {
        console.error(`✗ ¡ENCONTRADO EN HISTÓRICOS! El documento SÍ existe en portal_beneficiario_documentos_historicos:`, docInHistoricos);
      } else if (docInInscripciones) {
        console.error(`⚠️ ENCONTRADO EN INSCRIPCIONES! El documento está en inscripciones_documentos, no en históricos:`, docInInscripciones);
      } else {
        console.error(`❌ Documento NO existe en NINGUNA tabla`);
      }
      
      throw new Error(`Documento no encontrado en ${tableName}`)
    }
    console.log(`✓ Documento encontrado:`, docData);

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
      // Usar ruta diferente según el tipo de documento
      const baseFolder = documentType === 'historico' ? 'beneficiarios_historicos' : 'inscripciones'
      const newStoragePath = `${baseFolder}/${beneficiario_id}/${newFileName}`

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
      const updatePayload = {
        storage_path: `soportes/${newStoragePath}`,
        titulo: typedReq.nuevo_archivo_nombre,
      };
      
      // Solo agregar uploaded_at si la tabla es inscripciones_documentos (no historicos)
      if (documentType !== 'historico') {
        updatePayload['uploaded_at'] = new Date().toISOString();
        updatePayload['nombre_original'] = typedReq.nuevo_archivo_nombre;
      }

      const { error: updateError } = await supabase
        .from(tableName)
        .update(updatePayload)
        .eq('id', documento_id)

      if (updateError) {
        throw new Error(`Error al actualizar documento: ${updateError.message}`)
      }

      // 4. Registrar en bitácora
      console.log(`📝 Intentando registrar en bitácora...`);
      const { error: bitacoraError, data: bitacoraData } = await supabase
        .from('portal_beneficiario_bitacora')
        .insert({
          beneficiario_id: Number(beneficiario_id), // ✅ Convertir a número
          actor_user_id: admin_id,
          tipo_evento: 'reemplazo_documento',
          accion: 'Reemplazó documento',
          categoria: 'documento',
          nota: `Tipo: ${tipo_documento} | Motivo: ${motivo}`,
          metadata: {
            tipo_documento,
            motivo,
            archivo_anterior: docData.nombre_original || docData.titulo,
            archivo_nuevo: typedReq.nuevo_archivo_nombre,
            documento_id,
          },
        })

      if (bitacoraError) {
        console.error(`❌ Error al registrar en bitácora: ${bitacoraError.message}`);
        console.error(`   Details:`, bitacoraError);
        // Continuar aunque falle
      } else {
        console.log(`✅ Bitácora registrada exitosamente`);
        console.log(`   Data:`, bitacoraData);
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

      // 4. Eliminar BD según tipo de documento
      let updateError = null;
      
      if (documentType === 'historico') {
        // Para documentos históricos: DELETE físico (ya que storage_path es NOT NULL)
        console.log(`🗑️ Eliminando documento histórico del DB`);
        const result = await supabase
          .from(tableName)
          .delete()
          .eq('id', documento_id);
        updateError = result.error;
      } else {
        // Para documentos de inscripción: UPDATE para marcar como eliminado
        console.log(`🗑️ Marcando documento de inscripción como eliminado`);
        const result = await supabase
          .from(tableName)
          .update({
            storage_path: null,
            nombre_original: null,
            uploaded_at: null,
          })
          .eq('id', documento_id);
        updateError = result.error;
      }

      if (updateError) {
        throw new Error(`Error al eliminar documento: ${updateError.message}`)
      }

      // 5. Registrar en bitácora
      console.log(`📝 Intentando registrar en bitácora...`);
      const { error: bitacoraError, data: bitacoraData } = await supabase
        .from('portal_beneficiario_bitacora')
        .insert({
          beneficiario_id: Number(beneficiario_id), // ✅ Convertir a número
          actor_user_id: admin_id,
          tipo_evento: 'eliminacion_documento',
          accion: 'Eliminó documento',
          categoria: 'documento',
          nota: `Tipo: ${tipo_documento} | Motivo: ${motivo}`,
          metadata: {
            tipo_documento,
            motivo,
            archivo_eliminado: docData.nombre_original || docData.titulo,
            documento_id,
          },
        })

      if (bitacoraError) {
        console.error(`❌ Error al registrar en bitácora: ${bitacoraError.message}`);
        console.error(`   Details:`, bitacoraError);
        // Continuar aunque falle
      } else {
        console.log(`✅ Bitácora registrada exitosamente`);
        console.log(`   Data:`, bitacoraData);
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

    console.log('🔄 Body recibido:', body);

    // Validar campos obligatorios (incluyendo strings vacíos)
    const requiredFields = ['method', 'beneficiario_id', 'documento_id', 'tipo_documento', 'admin_id']
    const missingFields = requiredFields.filter(field => !body[field] || (typeof body[field] === 'string' && !String(body[field]).trim()))
    
    if (missingFields.length > 0) {
      console.error('❌ Faltan campos:', missingFields);
      return new Response(
        JSON.stringify({
          error: `Faltan campos obligatorios: ${missingFields.join(', ')}`,
          required: requiredFields,
          received: Object.keys(body),
        }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Validar motivo específicamente (puede ser vacío en validación anterior si es null)
    if (!body.motivo || (typeof body.motivo === 'string' && !String(body.motivo).trim())) {
      console.error('❌ Motivo es requerido pero no fue proporcionado');
      return new Response(
        JSON.stringify({
          error: 'El motivo de la acción es obligatorio',
        }),
        { status: 400, headers: corsHeaders }
      )
    }

    // Validar método
    if (body.method !== 'replace-document' && body.method !== 'delete-document') {
      console.error('❌ Método inválido:', body.method);
      return new Response(JSON.stringify({ error: 'Método inválido', received: body.method }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    console.log('✓ Validación de campos pasó');
    const result = await handleDocumentAction(body)

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: corsHeaders,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    const stack = error instanceof Error ? error.stack : ''
    console.error('❌ Error en admin-document-action:', message)
    console.error('Stack:', stack)

    return new Response(JSON.stringify({ 
      error: message,
      ok: false,
      details: process.env.DENO_ENV === 'development' ? stack : undefined
    }), {
      status: 400,
      headers: corsHeaders,
    })
  }
})
