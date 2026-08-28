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

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS_HEADERS })

const DOC_TIPOS = ['certificado_bancario', 'certificado_notas', 'certificado_matricula']

Deno.serve(async (req) => {
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
    const { beneficiario_id, actualizacion_id, form_data, files_base64 } = body

    if (!beneficiario_id || !actualizacion_id) {
      return jsonResponse({ ok: false, error: 'Faltan datos requeridos.' }, 400)
    }

    // 1. Cargar la actualización y validar que pertenece al beneficiario y está en subsanación
    const { data: actualizacion, error: fetchError } = await supabase
      .from('portal_actualizaciones')
      .select('id, beneficiario_id, estado, campos_a_corregir, documentos_a_corregir, payload_formulario')
      .eq('id', actualizacion_id)
      .maybeSingle()

    if (fetchError || !actualizacion) {
      return jsonResponse({ ok: false, error: 'No se encontró la actualización.' }, 404)
    }

    if (String(actualizacion.beneficiario_id) !== String(beneficiario_id)) {
      return jsonResponse({ ok: false, error: 'Esta actualización no pertenece al beneficiario indicado.' }, 403)
    }

    if (actualizacion.estado !== 'subsanacion') {
      return jsonResponse({ ok: false, error: 'Esta actualización no está en estado de subsanación.' }, 409)
    }

    const camposACorregir = Array.isArray(actualizacion.campos_a_corregir) ? actualizacion.campos_a_corregir : []
    const documentosACorregir = Array.isArray(actualizacion.documentos_a_corregir) ? actualizacion.documentos_a_corregir : []

    // 2. Validar que solo se intenten corregir documentos solicitados
    const documentosEnviados = Object.keys(files_base64 || {}).filter((k) => DOC_TIPOS.includes(k) && files_base64[k]?.data)
    const documentosNoSolicitados = documentosEnviados.filter((tipo) => !documentosACorregir.includes(tipo))
    if (documentosNoSolicitados.length > 0) {
      return jsonResponse({
        ok: false,
        error: `Los siguientes documentos no fueron solicitados para corrección: ${documentosNoSolicitados.join(', ')}.`,
      }, 400)
    }

    const documentosFaltantes = documentosACorregir.filter((tipo) => !documentosEnviados.includes(tipo))
    if (documentosFaltantes.length > 0) {
      return jsonResponse({
        ok: false,
        error: `Debes adjuntar los documentos solicitados: ${documentosFaltantes.join(', ')}.`,
      }, 400)
    }

    // 3. Construir el update solo con los campos habilitados, validando cada uno
    const updatePayload = {}
    const payloadFormularioUpdates = {}
    const datosFormulario = form_data || {}

    if (camposACorregir.includes('email')) {
      const email = String(datosFormulario.email || '').trim().toLowerCase()
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ ok: false, error: 'Ingresa un correo electrónico válido.' }, 400)
      }
      updatePayload.email = email
      payloadFormularioUpdates.email = email
    }

    if (camposACorregir.includes('telefono')) {
      const telefono = String(datosFormulario.telefono || '').trim()
      if (!telefono) {
        return jsonResponse({ ok: false, error: 'El teléfono es obligatorio.' }, 400)
      }
      updatePayload.telefono = telefono
      payloadFormularioUpdates.telefono = telefono
    }

    if (camposACorregir.includes('direccion')) {
      const direccion = String(datosFormulario.direccion || '').trim()
      if (!direccion) {
        return jsonResponse({ ok: false, error: 'La dirección es obligatoria.' }, 400)
      }
      updatePayload.direccion = direccion
      payloadFormularioUpdates.direccion = direccion
    }

    if (camposACorregir.includes('semestre_actual')) {
      const semestre = Number(datosFormulario.semestre_actual)
      if (!Number.isInteger(semestre) || semestre < 1 || semestre > 10) {
        return jsonResponse({ ok: false, error: 'El semestre debe ser un número entre 1 y 10.' }, 400)
      }
      updatePayload.semestre_actual = semestre
      payloadFormularioUpdates.semestre_actual = semestre
    }

    if (camposACorregir.includes('promedio_semestre_anterior')) {
      const promedio = Number(String(datosFormulario.promedio_semestre_anterior || '').replace(',', '.'))
      if (!Number.isFinite(promedio) || promedio < 0 || promedio > 5) {
        return jsonResponse({ ok: false, error: 'El promedio debe ser un número entre 0 y 5.' }, 400)
      }
      updatePayload.promedio_semestre_anterior = promedio
      payloadFormularioUpdates.promedio_semestre_anterior = promedio
    }

    if (camposACorregir.includes('datos_bancarios')) {
      const banco = String(datosFormulario.banco || '').trim()
      const tipoCuenta = String(datosFormulario.tipo_cuenta || '').trim()
      const cuentaBancaria = String(datosFormulario.cuenta_bancaria || '').replace(/\D/g, '')
      const fechaExpedicion = datosFormulario.fecha_expedicion_cert_bancario

      if (!banco || !tipoCuenta || !cuentaBancaria) {
        return jsonResponse({ ok: false, error: 'Banco, tipo de cuenta y número de cuenta son obligatorios.' }, 400)
      }
      if (cuentaBancaria.length < 6 || cuentaBancaria.length > 20) {
        return jsonResponse({ ok: false, error: 'El número de cuenta debe tener entre 6 y 20 dígitos.' }, 400)
      }
      if (!fechaExpedicion) {
        return jsonResponse({ ok: false, error: 'Debes indicar la fecha de expedición del certificado bancario.' }, 400)
      }

      payloadFormularioUpdates.banco = banco
      payloadFormularioUpdates.tipo_cuenta = tipoCuenta
      payloadFormularioUpdates.cuenta_bancaria = cuentaBancaria
      payloadFormularioUpdates.fecha_expedicion_cert_bancario = fechaExpedicion

      // Sincronizar perfil bancario del beneficiario para que el próximo periodo lo traiga precargado.
      await supabase
        .from('portal_beneficiarios')
        .update({
          nombre_banco: banco,
          tipo_cuenta_bancaria: tipoCuenta,
          numero_cuenta: cuentaBancaria,
        })
        .eq('id', beneficiario_id)
    }

    // 4. Reemplazar documentos solicitados: borrar el archivo anterior del storage y registrar el nuevo
    for (const tipo of documentosACorregir) {
      const fileData = files_base64[tipo]
      const base64Data = fileData.data.split(',')[1] || fileData.data
      const buffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))

      const { data: docAnterior } = await supabase
        .from('portal_actualizacion_documentos')
        .select('id, storage_path')
        .eq('actualizacion_id', actualizacion_id)
        .eq('tipo_documento', tipo)
        .maybeSingle()

      const nuevoPath = `beneficiarios/${beneficiario_id}/${actualizacion_id}/${tipo}-${Date.now()}.pdf`

      const { error: uploadError } = await supabase.storage
        .from('soportes')
        .upload(nuevoPath, buffer, { contentType: 'application/pdf', upsert: false })

      if (uploadError) {
        return jsonResponse({ ok: false, error: `No se pudo subir ${tipo}: ${uploadError.message}` }, 500)
      }

      if (docAnterior?.storage_path) {
        await supabase.storage.from('soportes').remove([docAnterior.storage_path])
      }

      if (docAnterior?.id) {
        await supabase
          .from('portal_actualizacion_documentos')
          .update({
            storage_path: nuevoPath,
            nombre_original: fileData.name || `${tipo}.pdf`,
            mime_type: 'application/pdf',
            size_bytes: buffer.length,
            updated_at: new Date().toISOString(),
          })
          .eq('id', docAnterior.id)
      } else {
        await supabase
          .from('portal_actualizacion_documentos')
          .insert({
            actualizacion_id,
            tipo_documento: tipo,
            storage_path: nuevoPath,
            nombre_original: fileData.name || `${tipo}.pdf`,
            mime_type: 'application/pdf',
            size_bytes: buffer.length,
          })
      }
    }

    // 5. Actualizar la fila: vuelve a en_revision, se limpian los marcadores de subsanación
    const mergedPayloadFormulario = {
      ...(actualizacion.payload_formulario || {}),
      ...payloadFormularioUpdates,
    }

    const { error: updateError } = await supabase
      .from('portal_actualizaciones')
      .update({
        ...updatePayload,
        estado: 'en_revision',
        payload_formulario: mergedPayloadFormulario,
        campos_a_corregir: [],
        documentos_a_corregir: [],
        subsanado_at: new Date().toISOString(),
        observacion_admin: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', actualizacion_id)

    if (updateError) {
      return jsonResponse({ ok: false, error: updateError.message }, 500)
    }

    // 6. Registrar el evento en la bitácora del beneficiario
    await supabase.rpc('registrar_evento_bitacora', {
      p_beneficiario_id: beneficiario_id,
      p_actualizacion_id: actualizacion_id,
      p_tipo_evento: 'actualizacion_subsanada',
      p_categoria: 'actualizacion',
      p_accion: 'update',
      p_nota: 'El beneficiario corrigió los campos/documentos solicitados y reenvió la actualización a revisión.',
      p_metadata: {
        campos_corregidos: camposACorregir,
        documentos_corregidos: documentosACorregir,
      },
    })

    return jsonResponse({ ok: true, message: 'Actualización corregida y reenviada a revisión.' })
  } catch (error) {
    console.error('❌ Error en subsanar-actualizacion-beneficiario:', error)
    return jsonResponse({ ok: false, error: 'Error interno del servidor', details: error.message }, 500)
  }
})
