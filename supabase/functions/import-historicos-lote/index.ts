import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const privateKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const projectUrl = Deno.env.get('SUPABASE_URL')!

// Cliente admin (service role) para operaciones de DB
const supabase = createClient(projectUrl, privateKey)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

interface BeneficiarioHistorico {
  nombre: string
  cedula: string
  correo?: string
  tipo_documento?: string
  telefono?: string
  direccion?: string
  semestre_actual?: number
  semestre_ingreso?: number
  nivel_formacion?: string
  modalidad?: string
  convocatoria_id?: string
  convocatoria_nombre?: string
  programa_academico?: string
  institucion_superior?: string
  grado_academico?: string
  institucion_academica?: string
  anio_graduacion?: number
  observaciones?: string
  estado_beneficiario?: string
  cuenta_bancaria?: string
  banco?: string
  tipo_cuenta?: string
  documentos?: {
    titulo: string
    tipo: string
    fecha?: string
    contenido_base64?: string // Si viene el documento en la carga
  }[]
}

interface ImportRequest {
  titulo: string
  descripcion?: string
  beneficiarios: BeneficiarioHistorico[]
  archivo_nombre?: string
  archivo_size_bytes?: number
  checksum_md5?: string
}

function normalizeText(value: unknown): string | null {
  const normalized = String(value || '').trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeTipoDocumento(value: unknown): string {
  const cleaned = String(value || '').trim().toUpperCase().replace(/\./g, '')
  if (!cleaned) return 'CC'
  if (['CC', 'TI', 'CE', 'PAS'].includes(cleaned)) return cleaned
  if (cleaned.includes('CED')) return 'CC'
  if (cleaned.includes('TARJ')) return 'TI'
  if (cleaned.includes('EXTR')) return 'CE'
  if (cleaned.includes('PASS') || cleaned.includes('PASAP')) return 'PAS'
  return 'CC'
}

function normalizeModalidad(value: unknown): string | null {
  const text = String(value || '').trim()
  if (!text) return null
  if (/sue|suen|sueño/i.test(text)) return 'Sueño Educativo'
  if (/meri|méri/i.test(text)) return 'Mérito Educativo'
  return text
}

function normalizeNivelFormacion(value: unknown): string | null {
  const text = String(value || '').trim()
  if (!text) return null
  if (/tecnic/i.test(text)) return 'Técnico Profesional'
  if (/tecnol/i.test(text)) return 'Tecnológico'
  if (/univers|pregrado|profesional/i.test(text)) return 'Universitario (Pregrado)'
  return text
}

function normalizeGradoAcademico(value: unknown): string | null {
  const text = String(value || '').trim()
  if (!text) return null

  const VALID_GRADOS = [
    'Bachiller Académico', 'Bachiller Técnico', 'Bachiller Comercial',
    'Bachiller Pedagógico', 'Normalista Superior', 'Bachiller Rural',
    'Bachiller con Profundización'
  ]
  if (VALID_GRADOS.includes(text)) return text

  if (/normalista/i.test(text)) return 'Normalista Superior'
  if (/^bach/i.test(text)) return 'Bachiller Académico'
  if (/^tecnic/i.test(text)) return 'Bachiller Técnico'
  if (/^tecnol/i.test(text)) return 'Bachiller Técnico'
  if (/^prof/i.test(text)) return 'Bachiller Académico'
  if (/especial/i.test(text)) return 'Bachiller Académico'
  if (/magist|maestr/i.test(text)) return 'Bachiller Académico'
  if (/doctor/i.test(text)) return 'Bachiller Académico'
  return text
}

function parseIntOrNull(value: unknown): number | null {
  const n = Number.parseInt(String(value || '').trim(), 10)
  return Number.isFinite(n) ? n : null
}

function parseSemestreOrNull(value: unknown): number | null {
  const n = parseIntOrNull(value)
  if (n === null) return null
  if (n < 1 || n > 20) return null
  return n
}

function parseUuidOrNull(value: unknown): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
    ? raw
    : null
}

function normalizeEstadoBeneficiario(value: unknown): string {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return 'activo'
  if (/^activ/i.test(text)) return 'activo'
  if (/^suspen/i.test(text)) return 'suspendido'
  if (/^retir/i.test(text)) return 'retirado'
  if (/^condon/i.test(text)) return 'condonado'
  if (/^egres/i.test(text)) return 'egresado'
  return 'activo'
}

export async function handleImportHistoricosLote(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metodo no permitido' }, 405)
  }

  // Verificar autorización
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'No autorizado' }, 401)
  }

  try {
    // Crear cliente con el token del usuario para validar la sesión
    const userClient = createClient(projectUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return jsonResponse({ error: 'Token inválido', detalle: authError?.message }, 401)
    }

    // Verificar que sea admin
    const { data: isAdmin, error: adminError } = await supabase
      .from('portal_admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (adminError || !isAdmin) {
      return jsonResponse({ error: 'Solo administradores pueden importar datos' }, 403)
    }

    // Parsear request
    const requestBody = (await req.json()) as ImportRequest
    const { titulo, descripcion, beneficiarios, archivo_nombre, archivo_size_bytes, checksum_md5 } = requestBody

    if (!titulo || !beneficiarios || beneficiarios.length === 0) {
      return jsonResponse({ error: 'T\u00edtulo y al menos 1 beneficiario son obligatorios' }, 400)
    }

    // Limitar tama\u00f1o de carga (10,000 beneficiarios m\u00e1ximo por lote)
    if (beneficiarios.length > 10000) {
      return jsonResponse({ error: 'M\u00e1ximo 10,000 beneficiarios por lote' }, 400)
    }

    // 1. Validar datos
    const { data: validacionResult, error: validacionError } = await supabase
      .rpc('validate_historicos_batch', {
        p_lote_data: beneficiarios
      })

    if (validacionError) {
      return jsonResponse({ error: 'Error en validaci\u00f3n', detalles: validacionError }, 500)
    }

    // Correo es advertencia, no error bloqueante. Filtramos errores de correo y los
    // movemos a advertencias para permitir importar beneficiarios sin correo conocido.
    if (!validacionResult.valido) {
      const erroresCorrectos = (validacionResult.errores || []).filter(
        (e: string) => !e.toLowerCase().includes('correo')
      )
      const advertenciasDeCorreo = (validacionResult.errores || []).filter(
        (e: string) => e.toLowerCase().includes('correo')
      )
      if (erroresCorrectos.length > 0) {
        // Hay errores reales (nombre/cédula faltantes) — bloquear
        return jsonResponse({
          error: 'Datos inv\u00e1lidos',
          validacion: {
            ...validacionResult,
            errores: erroresCorrectos,
            advertencias: [...(validacionResult.advertencias || []), ...advertenciasDeCorreo],
          },
          status: 'error'
        }, 400)
      }
      // Solo eran errores de correo — continuar con las advertencias
      validacionResult.valido = true
      validacionResult.errores = []
      validacionResult.advertencias = [
        ...(validacionResult.advertencias || []),
        ...advertenciasDeCorreo,
      ]
    }

    // 2. Crear lote directamente.
    // Nota: esta función corre con service role, por lo que auth.uid() dentro de RPC puede ser nulo.
    const { data: loteData, error: loteError } = await supabase
      .from('portal_migracion_lotes')
      .insert({
        titulo: titulo,
        descripcion: descripcion || null,
        cantidad_registros: beneficiarios.length,
        archivo_nombre: archivo_nombre || null,
        archivo_size_bytes: archivo_size_bytes || null,
        checksum_md5: checksum_md5 || null,
        created_by_user_id: user.id,
        estado: 'en_preparacion'
      })
      .select('id')
      .single()

    if (loteError || !loteData?.id) {
      return jsonResponse({ error: 'No se pudo crear el lote', detalles: loteError }, 500)
    }

    const loteId = loteData.id

    // 3. Resolver convocatorias por nombre cuando no viene convocatoria_id
    const nombresConvocatoria = [
      ...new Set(
        beneficiarios
          .map((b) => normalizeText(b.convocatoria_nombre)?.toLowerCase())
          .filter((name): name is string => !!name)
      )
    ]

    const convocatoriaByNombre = new Map<string, { id: string, nombre: string }>()
    if (nombresConvocatoria.length > 0) {
      const { data: convocatoriasData } = await supabase
        .from('convocatorias')
        .select('id, nombre')

      for (const c of convocatoriasData || []) {
        const key = String(c.nombre || '').trim().toLowerCase()
        if (key) {
          convocatoriaByNombre.set(key, {
            id: String(c.id),
            nombre: String(c.nombre)
          })
        }
      }
    }

    // 4. Insertar beneficiarios
    const beneficiariosMappering = beneficiarios.map((b) => ({
      nombre_completo: b.nombre.trim() || null,
      tipo_documento: normalizeTipoDocumento(b.tipo_documento),
      n_documento: b.cedula.trim().toUpperCase() || null,
      email: b.correo ? b.correo.trim().toLowerCase() : null,
      telefono: normalizeText(b.telefono),
      direccion: normalizeText(b.direccion),
      semestre_actual: parseSemestreOrNull(b.semestre_actual),
      semestre_ingreso: parseSemestreOrNull(b.semestre_ingreso),
      nivel_formacion: normalizeNivelFormacion(b.nivel_formacion),
      modalidad: normalizeModalidad(b.modalidad),
      convocatoria_id:
        parseUuidOrNull(b.convocatoria_id) ||
        convocatoriaByNombre.get(String(b.convocatoria_nombre || '').trim().toLowerCase())?.id ||
        null,
      convocatoria_nombre:
        normalizeText(b.convocatoria_nombre) ||
        convocatoriaByNombre.get(String(b.convocatoria_nombre || '').trim().toLowerCase())?.nombre ||
        null,
      programa_academico: normalizeText(b.programa_academico),
      institucion_superior: normalizeText(b.institucion_superior),
      estado_beneficiario: normalizeEstadoBeneficiario(b.estado_beneficiario),
      origen_registro: 'historico',
      grado_academico: normalizeGradoAcademico(b.grado_academico),
      institucion_academica: b.institucion_academica || null,
      anio_graduacion: b.anio_graduacion || null,
      observaciones_historicas: b.observaciones || null,
      pertenece_lote_id: loteId,
      cuenta_bancaria: normalizeText(b.cuenta_bancaria),
      banco: normalizeText(b.banco),
      tipo_cuenta: normalizeText(b.tipo_cuenta)
    }))

    // 4a. Detectar duplicados — buscar cédulas ya existentes en DB (chunking para evitar límite de URL)
    const todasLasCedulas = beneficiariosMappering
      .map((b) => b.n_documento)
      .filter((c): c is string => !!c)

    const cedulasExistentes: string[] = []
    const CHUNK_SIZE = 500
    for (let i = 0; i < todasLasCedulas.length; i += CHUNK_SIZE) {
      const chunk = todasLasCedulas.slice(i, i + CHUNK_SIZE)
      const { data: chunk_data } = await supabase
        .from('portal_beneficiarios')
        .select('n_documento')
        .in('n_documento', chunk)
      if (chunk_data) {
        cedulasExistentes.push(...chunk_data.map((e) => String(e.n_documento)))
      }
    }

    const existentesSet = new Set(cedulasExistentes)
    const omitidos = beneficiariosMappering
      .filter((b) => b.n_documento && existentesSet.has(b.n_documento))
      .map((b) => ({
        nombre: b.nombre_completo ?? '',
        cedula: b.n_documento ?? '',
        motivo: 'Ya existe en la base de datos'
      }))

    const aInsertar = beneficiariosMappering.filter(
      (b) => !b.n_documento || !existentesSet.has(b.n_documento)
    )

    // Si todos eran duplicados, retornar éxito sin intentar INSERT vacío
    if (aInsertar.length === 0) {
      await supabase
        .from('portal_migracion_lotes')
        .update({
          estado: 'cargado',
          carga_timestamp: new Date().toISOString(),
          carga_resultado: { insertados: 0, omitidos_duplicados: omitidos.length },
          carga_por_user_id: user.id
        })
        .eq('id', loteId)

      return jsonResponse({
        exito: true,
        lote_id: loteId,
        beneficiarios_insertados: 0,
        omitidos,
        documentos_insertados: 0,
        validacion: validacionResult,
        status: 'cargado'
      }, 200)
    }

    const { data: insertedBeneficiarios, error: insertError, count } = await supabase
      .from('portal_beneficiarios')
      .insert(aInsertar, { count: 'exact' })
      .select('id, n_documento')

    if (insertError) {
      // Marcar lote como con error
      await supabase
        .from('portal_migracion_lotes')
        .update({
          estado: 'error',
          carga_resultado: { error: insertError.message, intentados: aInsertar.length, omitidos: omitidos.length }
        })
        .eq('id', loteId)

      return new Response(
        JSON.stringify({
          error: 'Error al insertar beneficiarios',
          detalles: insertError,
          lote_id: loteId
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      )
    }

    // 5. Procesar documentos si se incluyen
    let documentosInsertados = 0
    const documentosConError = []

    for (const beneficiario of beneficiarios) {
      const beneficiarioInsertado = insertedBeneficiarios?.find(
        (b) => b.n_documento === beneficiario.cedula
      )
      if (!beneficiarioInsertado || !beneficiario.documentos) continue

      for (const doc of beneficiario.documentos) {
        try {
          // Si viene documento en base64, guardarlo en storage
          if (doc.contenido_base64) {
            const fileName = `${doc.tipo}-${Date.now()}`
            const storageDir = `beneficiarios_historicos/${beneficiarioInsertado.id}`

            const { error: storageError } = await supabase.storage
              .from('soportes')
              .upload(`${storageDir}/${fileName}`, decodeBase64ToUint8Array(doc.contenido_base64))

            if (storageError) {
              documentosConError.push({
                beneficiario_cedula: beneficiario.cedula,
                documento_titulo: doc.titulo,
                error: storageError.message
              })
              continue
            }
          } else {
            // Solo registrar metadata si no hay contenido
            const storagePath = `soportes/beneficiarios_historicos/${beneficiarioInsertado.id}/${doc.tipo}-${Date.now()}`

            const { error: docInsertError } = await supabase
              .from('portal_beneficiario_documentos_historicos')
              .insert({
                beneficiario_id: beneficiarioInsertado.id,
                lote_id: loteId,
                titulo: doc.titulo,
                tipo_documento: doc.tipo || 'otro',
                fecha_documento: doc.fecha ? new Date(doc.fecha).toISOString().split('T')[0] : null,
                storage_path: storagePath,
                created_by_user_id: user.id
              })

            if (!docInsertError) {
              documentosInsertados++
            }
          }
        } catch (err) {
          documentosConError.push({
            beneficiario_cedula: beneficiario.cedula,
            documento_titulo: doc.titulo,
            error: String(err)
          })
        }
      }
    }

    // 6. Actualizar lote con resultado de carga
    const resultadoCarga = {
      insertados: count || insertedBeneficiarios?.length || 0,
      omitidos_duplicados: omitidos.length,
      documentos_insertados: documentosInsertados,
      documentos_con_error: documentosConError.length,
      errores: documentosConError
    }

    await supabase
      .from('portal_migracion_lotes')
      .update({
        estado: 'cargado',
        carga_timestamp: new Date().toISOString(),
        carga_resultado: resultadoCarga,
        carga_por_user_id: user.id,
        cantidad_documentos: documentosInsertados
      })
      .eq('id', loteId)

    return jsonResponse({
      exito: true,
      lote_id: loteId,
      beneficiarios_insertados: count || insertedBeneficiarios?.length || 0,
      omitidos,
      documentos_insertados: documentosInsertados,
      validacion: validacionResult,
      status: 'cargado'
    }, 200)
  } catch (err) {
    console.error('Error en import-historicos-lote:', err)
    return jsonResponse({ error: 'Error interno del servidor', detalles: String(err) }, 500)
  }
}

Deno.serve(handleImportHistoricosLote)

