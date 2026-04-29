// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

class HttpError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = 'BAD_REQUEST') {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

const sanitizeText = (value: unknown, maxLength = 3000) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);

const normalizeEmail = (value: unknown) => sanitizeText(value, 150).toLowerCase();
const normalizeDocumentType = (value: unknown) => sanitizeText(value, 20).toUpperCase();
const normalizeDocumentNumber = (value: unknown) => sanitizeText(value, 40);
const normalizeRadicado = (value: unknown) => sanitizeText(value, 50).toUpperCase();

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const extractMissingColumn = (message = '') => {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i,
    /record\s+"?new"?\s+has no field\s+"?([a-zA-Z0-9_]+)"?/i,
  ];

  for (const pattern of patterns) {
    const match = String(message).match(pattern);
    if (match?.[1]) return match[1];
  }

  return '';
};

const withSchemaFallbackInsert = async ({ admin, table, payload, select }) => {
  const workingPayload = { ...payload };
  const workingSelect = String(select || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  for (let attempts = 0; attempts < 40; attempts += 1) {
    const query = admin.from(table).insert(workingPayload);
    const result = workingSelect.length > 0 ? await query.select(workingSelect.join(',')).single() : await query.select('*').single();

    if (!result.error) {
      return result;
    }

    const message = String(result.error?.message || '');
    const missingColumn = extractMissingColumn(message);

    if (!missingColumn) {
      return result;
    }

    let handled = false;

    if (missingColumn in workingPayload) {
      delete workingPayload[missingColumn];
      handled = true;
    }

    const selectIndex = workingSelect.indexOf(missingColumn);
    if (selectIndex >= 0) {
      workingSelect.splice(selectIndex, 1);
      handled = true;
    }

    if (!handled) {
      return result;
    }
  }

  return {
    data: null,
    error: {
      message: `No se pudo insertar en ${table} por incompatibilidad de columnas del esquema.`,
    },
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new HttpError('Variables de entorno de Supabase incompletas en la función.', 500, 'CONFIG_ERROR');
    }

    const body = await req.json().catch(() => ({}));
    const tokenFromBody = sanitizeText(body?.access_token, 4000);

    const authorizationHeader = String(req.headers.get('authorization') || '').trim();
    const authorization = authorizationHeader || (tokenFromBody ? `Bearer ${tokenFromBody}` : '');
    if (!authorization.toLowerCase().startsWith('bearer ')) {
      throw new HttpError('Debes validar tu correo para completar la inscripción.', 401, 'AUTH_REQUIRED');
    }

    const accessToken = sanitizeText(authorization.replace(/^Bearer\s+/i, ''), 4000);
    if (!accessToken) {
      throw new HttpError('Debes validar tu correo para completar la inscripción.', 401, 'AUTH_REQUIRED');
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      throw new HttpError('No se pudo validar tu sesión. Inicia sesión nuevamente con OTP.', 401, 'AUTH_INVALID');
    }

    if (!userData.user.email_confirmed_at) {
      throw new HttpError('Tu correo aún no está verificado. Completa la validación OTP.', 401, 'OTP_REQUIRED');
    }

    const convocatoriaId = sanitizeText(body?.convocatoria_id, 80);
    const radicado = normalizeRadicado(body?.radicado);
    const puntajeTotal = Number(body?.puntaje_total || 0);
    const personaPayloadRaw = body?.persona && typeof body.persona === 'object' ? body.persona : {};
    const inscripcionFieldsRaw =
      body?.inscripcion_fields && typeof body.inscripcion_fields === 'object' ? body.inscripcion_fields : {};
    const soportes = body?.soportes && typeof body.soportes === 'object' ? body.soportes : {};
    const firmaUrl = sanitizeText(body?.firma_url, 500);
    const datosFormulario =
      body?.datos_formulario && typeof body.datos_formulario === 'object' ? body.datos_formulario : {};

    const email = normalizeEmail(inscripcionFieldsRaw?.email || personaPayloadRaw?.email);
    const userEmail = normalizeEmail(userData.user.email || '');

    if (!email || !isValidEmail(email)) {
      throw new HttpError('El correo de inscripción es inválido.', 400, 'INVALID_EMAIL');
    }

    if (!userEmail || email !== userEmail) {
      throw new HttpError(
        'El correo validado con OTP no coincide con el correo de la inscripción.',
        403,
        'EMAIL_MISMATCH'
      );
    }

    const tipoDocumento = normalizeDocumentType(inscripcionFieldsRaw?.tipo_documento || personaPayloadRaw?.tipo_documento);
    const numeroDocumento = normalizeDocumentNumber(inscripcionFieldsRaw?.n_documento || personaPayloadRaw?.n_documento);

    if (!convocatoriaId) {
      throw new HttpError('No hay convocatoria activa para registrar la inscripción.', 400, 'CONVOCATORIA_REQUIRED');
    }

    if (!radicado) {
      throw new HttpError('No se pudo generar el radicado de inscripción.', 400, 'RADICADO_REQUIRED');
    }

    if (!tipoDocumento || !numeroDocumento) {
      throw new HttpError('Debes indicar tipo y número de documento.', 400, 'DOCUMENT_REQUIRED');
    }

    const duplicateCandidate = await admin
      .from('inscripciones')
      .select('id,radicado,estado')
      .eq('convocatoria_id', convocatoriaId)
      .eq('tipo_documento', tipoDocumento)
      .eq('n_documento', numeroDocumento)
      .ilike('email', email)
      .limit(1)
      .maybeSingle();

    if (!duplicateCandidate.error && duplicateCandidate.data?.id) {
      throw new HttpError(
        `Ya existe una inscripción para esta convocatoria con este documento y correo. Radicado: ${duplicateCandidate.data.radicado || 'No disponible'}.`,
        409,
        'DUPLICATE_INSCRIPCION'
      );
    }

    const personaPayload = {
      ...personaPayloadRaw,
      email,
      tipo_documento: tipoDocumento,
      n_documento: numeroDocumento,
    };

    let personaId = null;

    // 1) Buscar por documento exacto (tipo + número)
    const existingPersona = await admin
      .from('personas')
      .select('id')
      .eq('tipo_documento', tipoDocumento)
      .eq('n_documento', numeroDocumento)
      .maybeSingle();

    if (!existingPersona.error && existingPersona.data?.id) {
      personaId = existingPersona.data.id;
    }

    // 2) Si no se encontró, buscar solo por n_documento (la unique constraint real es 'personas_n_documento_key')
    if (!personaId) {
      const existingByDocumentOnly = await admin
        .from('personas')
        .select('id,tipo_documento,n_documento,email')
        .eq('n_documento', numeroDocumento)
        .maybeSingle();

      if (!existingByDocumentOnly.error && existingByDocumentOnly.data?.id) {
        const existingEmail = normalizeEmail(existingByDocumentOnly.data.email || '');
        if (existingEmail && existingEmail !== email) {
          throw new HttpError(
            'Este número de documento ya está registrado con otro correo. Usa el correo registrado previamente o contacta soporte para actualización de datos.',
            409,
            'EMAIL_DOCUMENT_MISMATCH'
          );
        }
        personaId = existingByDocumentOnly.data.id;
      }
    }

    const existingPersonaByEmail = await admin
      .from('personas')
      .select('id,tipo_documento,n_documento')
      .ilike('email', email)
      .maybeSingle();

    if (!existingPersonaByEmail.error && existingPersonaByEmail.data?.id) {
      const sameIdentityByEmail =
        normalizeDocumentType(existingPersonaByEmail.data.tipo_documento) === tipoDocumento &&
        normalizeDocumentNumber(existingPersonaByEmail.data.n_documento) === numeroDocumento;

      if (!sameIdentityByEmail) {
        throw new HttpError(
          'El correo ya está asociado a otro documento de identidad. Usa el correo registrado previamente o contacta soporte para actualización de datos.',
          409,
          'EMAIL_DOCUMENT_MISMATCH'
        );
      }

      if (!personaId) {
        personaId = existingPersonaByEmail.data.id;
      }
    }

    if (!personaId) {
      const createPersona = await withSchemaFallbackInsert({
        admin,
        table: 'personas',
        payload: personaPayload,
        select: 'id',
      });

      if (createPersona.error) {
        const errorMessage = String(createPersona.error.message || '');
        const errorCode = String(createPersona.error.code || '');
        const isUniqueViolation =
          errorCode === '23505' || /duplicate key|unique constraint/i.test(errorMessage);

        if (isUniqueViolation) {
          // a) Reintentar por n_documento solo (constraint personas_n_documento_key)
          const retryByDocumentOnly = await admin
            .from('personas')
            .select('id,tipo_documento,n_documento,email')
            .eq('n_documento', numeroDocumento)
            .maybeSingle();

          if (!retryByDocumentOnly.error && retryByDocumentOnly.data?.id) {
            const existingEmail = normalizeEmail(retryByDocumentOnly.data.email || '');
            if (existingEmail && existingEmail !== email) {
              throw new HttpError(
                'Este número de documento ya está registrado con otro correo. Usa el correo registrado previamente o contacta soporte para actualización de datos.',
                409,
                'EMAIL_DOCUMENT_MISMATCH'
              );
            }
            personaId = retryByDocumentOnly.data.id;
          }

          // b) Reintentar por email
          if (!personaId) {
            const retryPersonaByEmail = await admin
              .from('personas')
              .select('id,tipo_documento,n_documento')
              .ilike('email', email)
              .maybeSingle();

            if (!retryPersonaByEmail.error && retryPersonaByEmail.data?.id) {
              const sameIdentityByEmail =
                normalizeDocumentNumber(retryPersonaByEmail.data.n_documento) === numeroDocumento;

              if (!sameIdentityByEmail) {
                throw new HttpError(
                  'El correo ya está asociado a otro documento de identidad. Usa el correo registrado previamente o contacta soporte para actualización de datos.',
                  409,
                  'EMAIL_DOCUMENT_MISMATCH'
                );
              }
              personaId = retryPersonaByEmail.data.id;
            }
          }
        }

        if (!personaId) {
          throw new HttpError(
            createPersona.error.message || 'No se pudo registrar la persona.',
            400,
            'PERSONA_INSERT_ERROR'
          );
        }
      } else {
        personaId = createPersona.data?.id || null;
      }
    }

    if (!personaId) {
      throw new HttpError('No se pudo identificar la persona para la inscripción.', 400, 'PERSONA_NOT_FOUND');
    }

    const inscripcionFields = {
      ...inscripcionFieldsRaw,
      email,
      tipo_documento: tipoDocumento,
      n_documento: numeroDocumento,
    };

    const inscripcionPayload = {
      radicado,
      estado: 'Radicado',
      convocatoria_id: convocatoriaId,
      persona_id: personaId,
      puntaje_total: Number.isFinite(puntajeTotal) ? puntajeTotal : 0,
      ...inscripcionFields,
      soportes,
      firma_url: firmaUrl || null,
      datos_formulario: datosFormulario,
    };

    const createInscripcion = await withSchemaFallbackInsert({
      admin,
      table: 'inscripciones',
      payload: inscripcionPayload,
      select: 'id,radicado,estado',
    });

    if (createInscripcion.error) {
      const errorCode = String(createInscripcion.error.code || '');
      if (errorCode === '23505') {
        const existing = await admin
          .from('inscripciones')
          .select('id,radicado,estado')
          .eq('convocatoria_id', convocatoriaId)
          .eq('tipo_documento', tipoDocumento)
          .eq('n_documento', numeroDocumento)
          .ilike('email', email)
          .limit(1)
          .maybeSingle();

        if (!existing.error && existing.data?.id) {
          throw new HttpError(
            `Ya existe una inscripción para esta convocatoria con este documento y correo. Radicado: ${existing.data.radicado || 'No disponible'}.`,
            409,
            'DUPLICATE_INSCRIPCION'
          );
        }

        throw new HttpError(
          'No se pudo completar la inscripción por conflicto de unicidad. Verifica si ya existe un registro previo.',
          409,
          'UNIQUE_CONFLICT'
        );
      }

      throw new HttpError(
        createInscripcion.error.message || 'No se pudo registrar la inscripción.',
        400,
        'INSCRIPCION_INSERT_ERROR'
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        inscripcion: createInscripcion.data,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 400;
    const code = error instanceof HttpError ? error.code : 'UNKNOWN_ERROR';

    return new Response(
      JSON.stringify({
        ok: false,
        code,
        error: error instanceof Error ? error.message : 'Error desconocido',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
      }
    );
  }
});
