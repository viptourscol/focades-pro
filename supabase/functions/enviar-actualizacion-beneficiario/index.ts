import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

Deno.serve(async (req) => {
  // CORS headers
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
    const {
      beneficiario_id,
      ventana_id,
      form_data,
      files_base64, // { certificado_bancario: {data: base64, name: string}, ... }
    } = body

    console.log('📝 Procesando actualización para beneficiario:', beneficiario_id)

    // Validaciones básicas
    if (!beneficiario_id || !ventana_id || !form_data) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Faltan datos requeridos' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    if (!files_base64?.certificado_bancario || !files_base64?.certificado_notas || !files_base64?.certificado_matricula) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Faltan documentos requeridos' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    // Validar que no exista actualización duplicada en la misma ventana
    try {
      // Consultar sin filtro de estado primero, luego filtrar en código
      const { data: existingUpdates, error: checkError } = await supabase
        .from('portal_actualizaciones')
        .select('id, estado, created_at')
        .eq('beneficiario_id', beneficiario_id)
        .eq('ventana_id', ventana_id)
        .order('created_at', { ascending: false })
        .limit(1)

      if (checkError) {
        console.error('❌ Error verificando actualizaciones previas:', checkError)
        throw checkError
      }

      // Verificar si existe actualización activa
      const existingUpdate = existingUpdates?.[0]
      if (existingUpdate && ['en_revision', 'aprobada'].includes(existingUpdate.estado)) {
        const statusMessage = existingUpdate.estado === 'aprobada'
          ? 'Tu actualización ya fue aprobada. No se permite reenvío.'
          : 'Ya enviaste una actualización para esta ventana. Espera la revisión (5-7 días hábiles).'
        
        console.log(`⚠️  Intento de envío duplicado para beneficiario ${beneficiario_id} en ventana ${ventana_id}`)
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Actualización duplicada',
            message: statusMessage,
            code: 'DUPLICATE_SUBMISSION',
            existing_update_id: existingUpdate.id,
            existing_status: existingUpdate.estado,
            created_at: existingUpdate.created_at,
          }),
          {
            status: 409,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        )
      }
    } catch (err) {
      console.error('❌ Error inesperado en validación de duplicados:', err)
      return new Response(
        JSON.stringify({ ok: false, error: 'Error al verificar estado' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    // 1. Insertar actualización
    const promedio = Number(String(form_data.promedio_semestre_anterior || '').replace(',', '.'))
    const semestre = Number(form_data.semestre_actual)

    if (!Number.isInteger(semestre) || semestre < 1 || semestre > 10) {
      return new Response(
        JSON.stringify({ ok: false, error: 'El semestre que actualiza debe ser un número entre 1 y 10.' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    if (!Number.isFinite(promedio) || promedio < 0 || promedio > 5) {
      return new Response(
        JSON.stringify({ ok: false, error: 'El promedio debe ser un número entre 0 y 5.' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    if (
      !String(form_data.email || '').trim() ||
      !String(form_data.telefono || '').trim() ||
      !String(form_data.direccion || '').trim() ||
      !String(form_data.banco || '').trim() ||
      !String(form_data.tipo_cuenta || '').trim() ||
      !String(form_data.cuenta_bancaria || '').trim()
    ) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Todos los campos del formulario son obligatorios.' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    const payload = {
      beneficiario_id,
      ventana_id,
      estado: 'en_revision',
      email: String(form_data.email || '').trim().toLowerCase(),
      telefono: String(form_data.telefono || '').trim(),
      direccion: String(form_data.direccion || '').trim(),
      semestre_actual: semestre,
      promedio_semestre_anterior: promedio,
      fecha_expedicion_cert_bancario: form_data.fecha_expedicion_cert_bancario || null,
      payload_formulario: form_data,
    }

    const { data: insertData, error: insertError } = await supabase
      .from('portal_actualizaciones')
      .insert(payload)
      .select('id')
      .single()

    if (insertError) {
      console.error('❌ Error insertando actualización:', insertError)
      return new Response(
        JSON.stringify({ ok: false, error: insertError.message }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    const updateId = insertData.id
    console.log('✅ Actualización creada con ID:', updateId)

    // 2. Subir archivos y registrar documentos
    const uploadDocument = async (key: string, fileData: any) => {
      const base64Data = fileData.data.split(',')[1] || fileData.data
      const buffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))
      const storagePath = `beneficiarios/${beneficiario_id}/${updateId}/${key}-${Date.now()}.pdf`

      const { error: uploadError } = await supabase.storage
        .from('soportes')
        .upload(storagePath, buffer, {
          contentType: 'application/pdf',
          upsert: false,
        })

      if (uploadError) {
        console.error(`❌ Error subiendo ${key}:`, uploadError)
        throw new Error(`No se pudo subir ${key}: ${uploadError.message}`)
      }

      const { error: docError } = await supabase
        .from('portal_actualizacion_documentos')
        .insert({
          actualizacion_id: updateId,
          tipo_documento: key,
          storage_path: storagePath,
          nombre_original: fileData.name || `${key}.pdf`,
          mime_type: 'application/pdf',
          size_bytes: buffer.length,
        })

      if (docError) {
        console.error(`❌ Error registrando ${key}:`, docError)
        throw new Error(`No se pudo registrar ${key}: ${docError.message}`)
      }

      console.log(`✅ Documento ${key} subido y registrado`)
    }

    await uploadDocument('certificado_bancario', files_base64.certificado_bancario)
    await uploadDocument('certificado_notas', files_base64.certificado_notas)
    await uploadDocument('certificado_matricula', files_base64.certificado_matricula)

    // 3. Actualizar perfil del beneficiario
    const accountNumber = String(form_data.cuenta_bancaria || '').replace(/\D/g, '')
    const { error: profileError } = await supabase
      .from('portal_beneficiarios')
      .update({
        email: payload.email,
        telefono: payload.telefono,
        direccion_residencia: payload.direccion,
        semestre_actual: payload.semestre_actual,
        nombre_banco: String(form_data.banco || '').trim() || null,
        tipo_cuenta_bancaria: String(form_data.tipo_cuenta || '').trim() || null,
        numero_cuenta: accountNumber || null,
      })
      .eq('id', beneficiario_id)

    if (profileError) {
      console.error('❌ Error actualizando perfil:', profileError)
      // No lanzamos error aquí, la actualización ya se guardó
    } else {
      console.log('✅ Perfil del beneficiario actualizado')
    }

    console.log('🎉 Enviando respuesta exitosa al cliente')

    return new Response(
      JSON.stringify({
        ok: true,
        actualizacion_id: updateId,
        message: 'Actualización enviada exitosamente',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error) {
    console.error('❌ Error en enviar-actualizacion-beneficiario:', error)
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Error interno del servidor',
        details: error.message,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
})
