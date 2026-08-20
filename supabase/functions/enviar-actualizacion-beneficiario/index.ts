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

    // 1. Insertar actualización
    const promedio = Number(String(form_data.promedio_semestre_anterior || '').replace(',', '.'))
    const payload = {
      beneficiario_id,
      ventana_id,
      estado: 'en_revision',
      email: String(form_data.email || '').trim().toLowerCase(),
      telefono: String(form_data.telefono || '').trim(),
      direccion: String(form_data.direccion || '').trim(),
      semestre_actual: Number(form_data.semestre_actual || 0),
      promedio_semestre_anterior: promedio,
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
