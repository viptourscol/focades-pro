import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const privateKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const projectUrl = Deno.env.get('SUPABASE_URL')

if (!privateKey || !projectUrl) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY y SUPABASE_URL requeridos')
}

const supabase = createClient(projectUrl, privateKey)

type EstadoPago = 'programado' | 'efectuado' | 'pendiente' | 'anulado'

interface PagoHistorico {
  n_documento: string
  concepto: string
  periodo?: string | null
  referencia?: string | null
  monto: number
  fecha_programada?: string | null
  fecha_efectiva?: string | null
  estado?: EstadoPago | null
  observacion?: string | null
}

interface ImportPagosRequest {
  lote_id?: string | null
  archivo_nombre?: string
  archivo_size_bytes?: number
  pagos: PagoHistorico[]
}

function sanitizeDate(input?: string | null): string | null {
  const raw = String(input || '').trim()
  if (!raw) return null

  const normalized = raw.replace(/\//g, '-')
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized
  }

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().split('T')[0]
}

function normalizeEstado(input?: string | null): EstadoPago {
  const value = String(input || '').trim().toLowerCase()
  if (value === 'programado' || value === 'efectuado' || value === 'pendiente' || value === 'anulado') {
    return value
  }
  return 'efectuado'
}

export async function handleImportHistoricosPagos(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const token = authHeader.substring(7)

  try {
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token invalido' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const { data: isAdmin, error: adminError } = await supabase
      .from('portal_admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (adminError || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Solo administradores pueden importar pagos' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const requestBody = (await req.json()) as ImportPagosRequest
    const { lote_id = null, pagos } = requestBody

    if (!Array.isArray(pagos) || pagos.length === 0) {
      return new Response(JSON.stringify({ error: 'Debe enviar al menos 1 pago' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (pagos.length > 20000) {
      return new Response(JSON.stringify({ error: 'Maximo 20,000 pagos por solicitud' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (lote_id) {
      const { data: lote, error: loteError } = await supabase
        .from('portal_migracion_lotes')
        .select('id')
        .eq('id', lote_id)
        .maybeSingle()

      if (loteError || !lote) {
        return new Response(JSON.stringify({ error: 'lote_id no existe o no es valido' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }

    const docs = [...new Set(pagos.map((p) => String(p.n_documento || '').trim().toUpperCase()).filter(Boolean))]

    if (docs.length === 0) {
      return new Response(JSON.stringify({ error: 'No hay documentos validos en la carga' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    let query = supabase
      .from('portal_beneficiarios')
      .select('id, n_documento')
      .in('n_documento', docs)
      .is('deleted_at', null)

    if (lote_id) {
      query = query.eq('pertenece_lote_id', lote_id)
    }

    const { data: beneficiarios, error: beneficiariosError } = await query

    if (beneficiariosError) {
      return new Response(
        JSON.stringify({ error: 'No se pudieron consultar beneficiarios', detalles: beneficiariosError }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const byDocumento = new Map<string, number>()
    for (const b of beneficiarios || []) {
      const doc = String(b.n_documento || '').trim().toUpperCase()
      if (doc && !byDocumento.has(doc)) {
        byDocumento.set(doc, b.id)
      }
    }

    const detalles: string[] = []
    const insertRows: {
      beneficiario_id: number
      concepto: string
      periodo: string | null
      referencia: string | null
      monto: number
      fecha_programada: string | null
      fecha_efectiva: string | null
      estado: EstadoPago
      observacion: string | null
      created_by_user_id: string
      updated_by_user_id: string
    }[] = []

    let noEncontrados = 0
    let rechazados = 0

    for (let i = 0; i < pagos.length; i++) {
      const pago = pagos[i]
      const linea = i + 1

      const documento = String(pago.n_documento || '').trim().toUpperCase()
      const concepto = String(pago.concepto || '').trim()
      const monto = Number(pago.monto)

      if (!documento || !concepto || !Number.isFinite(monto) || monto <= 0) {
        rechazados++
        detalles.push(`Fila ${linea}: datos obligatorios invalidos (n_documento/concepto/monto).`)
        continue
      }

      const beneficiarioId = byDocumento.get(documento)
      if (!beneficiarioId) {
        noEncontrados++
        detalles.push(`Fila ${linea}: no se encontro beneficiario para documento ${documento}.`)
        continue
      }

      insertRows.push({
        beneficiario_id: beneficiarioId,
        concepto,
        periodo: String(pago.periodo || '').trim() || null,
        referencia: String(pago.referencia || '').trim() || null,
        monto,
        fecha_programada: sanitizeDate(pago.fecha_programada),
        fecha_efectiva: sanitizeDate(pago.fecha_efectiva),
        estado: normalizeEstado(pago.estado),
        observacion: String(pago.observacion || '').trim() || null,
        created_by_user_id: user.id,
        updated_by_user_id: user.id
      })
    }

    let insertados = 0

    if (insertRows.length > 0) {
      const chunkSize = 500
      for (let i = 0; i < insertRows.length; i += chunkSize) {
        const chunk = insertRows.slice(i, i + chunkSize)

        const { error: insertError } = await supabase
          .from('portal_beneficiario_pagos')
          .insert(chunk)

        if (insertError) {
          return new Response(
            JSON.stringify({
              error: 'Error insertando pagos historicos',
              detalles: insertError,
              procesados_hasta: insertados,
              total_a_insertar: insertRows.length
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }

        insertados += chunk.length
      }
    }

    return new Response(
      JSON.stringify({
        exito: true,
        total_registros: pagos.length,
        insertados,
        rechazados,
        no_encontrados: noEncontrados,
        detalles
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Error en import-historicos-pagos:', err)
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor', detalles: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

Deno.serve(handleImportHistoricosPagos)
