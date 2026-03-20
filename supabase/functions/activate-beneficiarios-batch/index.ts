import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const privateKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const projectUrl = Deno.env.get('SUPABASE_URL')

if (!privateKey || !projectUrl) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY y SUPABASE_URL requeridos')
}

const supabase = createClient(projectUrl, privateKey)

interface ActivationRequest {
  lote_id: string
  beneficiario_ids: string[]
  solo_confiables?: boolean // Si true, solo invita beneficiarios con correo v\u00e1lido
}

interface InviteResponse {
  beneficiario_id: number
  exito: boolean
  razon?: string
}

export async function handleActivateBeneficiariosBatch(req: Request) {
  // Verificar autorizaci\u00f3n
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'No autorizado' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const token = authHeader.substring(7)

  try {
    // Verificar token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token inv\u00e1lido' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Verificar que sea admin
    const { data: isAdmin, error: adminError } = await supabase
      .from('portal_admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (adminError || !isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Solo administradores pueden activar beneficiarios' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Parsear request
    const requestBody = (await req.json()) as ActivationRequest
    const { lote_id, beneficiario_ids, solo_confiables = true } = requestBody

    if (!lote_id || !beneficiario_ids || beneficiario_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'lote_id y al menos 1 beneficiario_id son obligatorios' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Limitar tama\u00f1o de carga (1000 invitaciones m\u00e1ximo por solicitud)
    if (beneficiario_ids.length > 1000) {
      return new Response(
        JSON.stringify({ error: 'M\u00e1ximo 1,000 beneficiarios por solicitud' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 1. Traer datos de los beneficiarios
    const { data: beneficiarios, error: fetchError } = await supabase
      .from('portal_beneficiarios')
      .select('id, nombre_completo, n_documento, email, auth_user_id')
      .in('id', beneficiario_ids)

    if (fetchError || !beneficiarios) {
      return new Response(
        JSON.stringify({ error: 'No se pudieron cargar beneficiarios', detalles: fetchError }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 2. Filtrar si solo_confiables est\u00e1 marcado
    let beneficiariosAInvitar = beneficiarios
    let beneficiariosSkippeados = []

    if (solo_confiables) {
      beneficiariosAInvitar = beneficiarios.filter((b) => {
        const emailValido = (b.email || '')
          .trim()
          .match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/) !== null
        return emailValido && !b.auth_user_id
      })

      beneficiariosSkippeados = beneficiarios.filter((b) => {
        const emailValido = (b.email || '')
          .trim()
          .match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/) !== null
        return !(emailValido && !b.auth_user_id)
      })
    }

    // 3. Invocar invite-beneficiario para cada beneficiario
    const resultados: InviteResponse[] = []
    const errores = []

    for (const beneficiario of beneficiariosAInvitar) {
      try {
        const { data: inviteResult, error: inviteError } = await supabase
          .functions.invoke('invite-beneficiario', {
            body: {
              email: beneficiario.email,
              nombre: beneficiario.nombre_completo || 'Beneficiario',
              redirect_url: `${new URL(req.url).origin}/portal/bienvenida`
            },
            headers: {
              Authorization: `Bearer ${token}`
            }
          })

        if (inviteError) {
          resultados.push({
            beneficiario_id: beneficiario.id,
            exito: false,
            razon: inviteError.message
          })
          errores.push({ beneficiario_id: beneficiario.id, error: inviteError.message })
        } else {
          resultados.push({
            beneficiario_id: beneficiario.id,
            exito: true
          })
        }
      } catch (err) {
        resultados.push({
          beneficiario_id: beneficiario.id,
          exito: false,
          razon: String(err)
        })
        errores.push({ beneficiario_id: beneficiario.id, error: String(err) })
      }
    }

    // 4. Calcular estad\u00edsticas
    const invitadosExitosos = resultados.filter((r) => r.exito).length
    const invitadosFallidos = resultados.filter((r) => !r.exito).length

    const resultadoActivacion = {
      beneficiarios_procesados: beneficiariosAInvitar.length,
      beneficiarios_skipped: beneficiariosSkippeados.length,
      beneficiarios_skipped_razonas: beneficiariosSkippeados.map((b) => ({
        id: b.id,
        nombre: b.nombre_completo,
        razon: b.auth_user_id
          ? 'Ya tiene cuenta de portal'
          : (b.email || '')
              .trim()
              .match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/)
            ? 'Desconocida'
            : 'Correo no v\u00e1lido o no registrado'
      })),
      invitados: invitadosExitosos,
      fallidos: invitadosFallidos,
      errores_detalle: errores,
      fecha_activacion: new Date().toISOString()
    }

    // 5. Actualizar lote con resultado
    const { error: updateError } = await supabase
      .from('portal_migracion_lotes')
      .update({
        estado: 'activado',
        activacion_timestamp: new Date().toISOString(),
        activacion_por_user_id: user.id,
        activacion_resultado: resultadoActivacion
      })
      .eq('id', lote_id)

    if (updateError) {
      console.error('Error actualizando lote:', updateError)
      // No fallar, devolver lo que tenemos
    }

    return new Response(
      JSON.stringify({
        exito: true,
        lote_id,
        resultado: resultadoActivacion,
        status: 'activado'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Error en activate-beneficiarios-batch:', err)
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor', detalles: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

Deno.serve(handleActivateBeneficiariosBatch)

