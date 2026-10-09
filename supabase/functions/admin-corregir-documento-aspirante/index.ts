// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCUMENT_PATTERN = /^[A-Za-z0-9-]{4,30}$/;
const MAX_FILES = 100;
const R2_TIMEOUT_MS = 20000;
const REGENERATION_TIMEOUT_MS = 110000;

class HttpError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status = 400, details: unknown = undefined) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: corsHeaders });

// Debe coincidir con sanitizePathSegment de Registro.jsx y generate-inscripcion-docs.
const sanitizePathSegment = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');

const sanitizeText = (value: unknown, maxLength = 3000) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);

const getR2 = () => {
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
  const endpoint = Deno.env.get('R2_ENDPOINT');
  const bucket = Deno.env.get('R2_BUCKET');
  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    throw new HttpError('Configuracion de R2 incompleta en el servidor.', 500);
  }
  const aws = new AwsClient({ accessKeyId, secretAccessKey, region: 'auto', service: 's3' });
  const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');
  const base = endpoint.replace(/\/+$/, '');

  const request = async (method: string, key: string, headers: Record<string, string> = {}) => {
    const signed = await aws.sign(`${base}/${bucket}/${encodeKey(key)}`, { method, headers });
    return await fetch(signed, { signal: AbortSignal.timeout(R2_TIMEOUT_MS) });
  };

  return {
    async head(key: string) {
      const response = await request('HEAD', key);
      if (response.status === 404) return { exists: false, size: 0 };
      if (!response.ok) throw new Error(`R2 HEAD ${response.status}`);
      return { exists: true, size: Number(response.headers.get('content-length') || 0) };
    },
    async copy(sourceKey: string, targetKey: string) {
      const response = await request('PUT', targetKey, {
        'x-amz-copy-source': `/${bucket}/${encodeKey(sourceKey)}`,
      });
      const body = await response.text().catch(() => '');
      if (!response.ok || /<Error>/i.test(body)) throw new Error(`R2 COPY ${response.status}`);
    },
    async remove(key: string) {
      const response = await request('DELETE', key);
      if (!response.ok && response.status !== 404) throw new Error(`R2 DELETE ${response.status}`);
    },
  };
};

const collectPaths = (inscripcion: unknown, documentos: unknown, radicadoSegment: string, newSegment: string) => {
  const pattern = new RegExp(`(?:soportes/)?expedientes/([a-z0-9_-]+)/${radicadoSegment}/[^"\\\\\\s]+`, 'g');
  const serialized = JSON.stringify([inscripcion, documentos]);
  const files = new Map<string, { origen: string; destino: string; segmento: string }>();
  const oldSegments = new Set<string>();
  const invalid: string[] = [];

  for (const match of serialized.matchAll(pattern)) {
    const [path, segment] = match;
    if (segment === newSegment) continue;
    const sourceKey = path.startsWith('soportes/') ? path : `soportes/${path}`;
    if (sourceKey.includes('..') || sourceKey.includes('//')) {
      invalid.push(path);
      continue;
    }
    const targetKey = sourceKey.replace(`expedientes/${segment}/${radicadoSegment}/`, `expedientes/${newSegment}/${radicadoSegment}/`);
    oldSegments.add(segment);
    files.set(sourceKey, { origen: sourceKey, destino: targetKey, segmento: segment });
  }

  return { files: [...files.values()], oldSegments: [...oldSegments], invalid };
};

const authenticateAdmin = async (admin, req: Request) => {
  const header = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const jwt = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!jwt) throw new HttpError('No se recibio token de autenticacion.', 401);

  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) throw new HttpError('Token invalido o sesion no vigente.', 401);

  const { data: isAdmin, error: adminError } = await admin.rpc('is_portal_admin', { p_user_id: data.user.id });
  if (adminError || isAdmin !== true) throw new HttpError('Solo administradores pueden corregir el documento.', 403);

  return { jwt, userId: data.user.id };
};

const loadInscripcion = async (admin, inscripcionId: string) => {
  if (!UUID_PATTERN.test(inscripcionId)) throw new HttpError('Identificador de inscripcion invalido.', 400);
  const { data, error } = await admin.from('inscripciones').select('*').eq('id', inscripcionId).maybeSingle();
  if (error) throw new HttpError(`No se pudo consultar la inscripcion: ${error.message}`, 500);
  if (!data) throw new HttpError('Inscripcion no encontrada.', 404);
  return data;
};

const buildPlan = async (admin, r2, inscripcion, newDocument: string) => {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (inscripcion.promovido_a_beneficiario === true) {
    blockers.push('La inscripcion ya fue promovida a beneficiario; este cambio solo aplica a aspirantes.');
  } else {
    const { count, error } = await admin
      .from('portal_beneficiarios')
      .select('id', { count: 'exact', head: true })
      .eq('inscripcion_pk', inscripcion.id);
    if (error) throw new HttpError(`No se pudo verificar la promocion: ${error.message}`, 500);
    if ((count || 0) > 0) blockers.push('La inscripcion ya esta vinculada a un beneficiario; este cambio solo aplica a aspirantes.');
  }

  if (inscripcion.persona_id) {
    const { count: otherInscriptions, error: otherError } = await admin
      .from('inscripciones')
      .select('id', { count: 'exact', head: true })
      .eq('persona_id', inscripcion.persona_id)
      .neq('id', inscripcion.id);
    if (otherError) throw new HttpError(`No se pudo verificar la persona: ${otherError.message}`, 500);
    if ((otherInscriptions || 0) > 0) {
      blockers.push('La persona tiene otras inscripciones asociadas; el documento no se puede cambiar automaticamente.');
    }

    const { data: duplicatedPersona, error: personaError } = await admin
      .from('personas')
      .select('id')
      .eq('n_documento', newDocument)
      .ilike('tipo_documento', String(inscripcion.tipo_documento || ''))
      .neq('id', inscripcion.persona_id)
      .limit(1);
    if (personaError) throw new HttpError(`No se pudo verificar duplicados: ${personaError.message}`, 500);
    if (duplicatedPersona?.length) blockers.push('Ya existe otra persona con ese tipo y numero de documento.');
  }

  if (inscripcion.convocatoria_id && inscripcion.email) {
    const { data: duplicatedInscription, error: duplicateError } = await admin
      .from('inscripciones')
      .select('id')
      .eq('convocatoria_id', inscripcion.convocatoria_id)
      .eq('n_documento', newDocument)
      .eq('email', inscripcion.email)
      .neq('id', inscripcion.id)
      .limit(1);
    if (duplicateError) throw new HttpError(`No se pudo verificar duplicados: ${duplicateError.message}`, 500);
    if (duplicatedInscription?.length) blockers.push('Ya existe una inscripcion en esta convocatoria con ese documento y correo.');
  }

  const radicadoSegment = sanitizePathSegment(inscripcion.radicado);
  const newSegment = sanitizePathSegment(newDocument);
  if (!radicadoSegment || !newSegment) throw new HttpError('No se pudo construir la ruta de archivos.', 400);

  const { data: documentos, error: documentosError } = await admin
    .from('inscripciones_documentos')
    .select('id,tipo_documento,storage_path')
    .eq('inscripcion_id', inscripcion.id);
  if (documentosError) throw new HttpError(`No se pudieron consultar los documentos: ${documentosError.message}`, 500);

  const { files, oldSegments, invalid } = collectPaths(inscripcion, documentos || [], radicadoSegment, newSegment);
  if (invalid.length) blockers.push(`Hay rutas de archivo no validas (${invalid.length}); revisalas manualmente.`);
  if (files.length > MAX_FILES) blockers.push(`La inscripcion tiene demasiados archivos para mover automaticamente (${files.length}).`);

  const inventory = [];
  if (files.length <= MAX_FILES) {
    for (const file of files) {
      let source;
      let target;
      try {
        source = await r2.head(file.origen);
        target = await r2.head(file.destino);
      } catch (error) {
        throw new HttpError(`No se pudo consultar R2: ${error instanceof Error ? error.message : 'error desconocido'}`, 502);
      }

      let estado = 'mover';
      if (!source.exists && target.exists) {
        estado = 'ya_movido';
      } else if (!source.exists && !target.exists) {
        estado = 'faltante';
        warnings.push(`No se encontro el archivo en R2: ${file.origen}`);
      } else if (source.exists && target.exists) {
        if (source.size === target.size) {
          estado = 'destino_igual';
        } else {
          estado = 'conflicto';
          blockers.push(`Ya existe un archivo distinto en la ruta nueva: ${file.destino}`);
        }
      }

      inventory.push({ ...file, estado, size: source.size });
    }
  }

  return { blockers, warnings, radicadoSegment, newSegment, oldSegments, inventory };
};

const regenerateDocuments = async (admin, jwt: string, inscripcionId: string, actorId: string) => {
  const inscripcion = await loadInscripcion(admin, inscripcionId);
  const formData = inscripcion.datos_formulario && typeof inscripcion.datos_formulario === 'object'
    ? inscripcion.datos_formulario
    : {};

  let firmaPath = String(formData.firma_storage_path || inscripcion.firma_url || '').trim();
  if (!firmaPath) {
    const { data: firmaDoc } = await admin
      .from('inscripciones_documentos')
      .select('storage_path')
      .eq('inscripcion_id', inscripcionId)
      .eq('tipo_documento', 'firma_digital')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    firmaPath = String(firmaDoc?.storage_path || '').trim();
  }
  if (!firmaPath) return { ok: false, error: 'No se encontro la firma digital del aspirante.' };

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-inscripcion-docs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inscripcion_id: inscripcionId,
        radicado: inscripcion.radicado,
        firma_path: firmaPath,
        documento_persona: inscripcion.n_documento,
        form_data: { ...formData, n_documento: inscripcion.n_documento },
        regenerar: true,
      }),
      signal: AbortSignal.timeout(REGENERATION_TIMEOUT_MS),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) {
      return { ok: false, error: result?.error || `La generacion respondio ${response.status}.` };
    }

    await admin.from('portal_beneficiario_bitacora').insert({
      inscripcion_id: inscripcionId,
      actor_user_id: actorId,
      tipo_evento: 'regeneracion_documentos_inscripcion',
      categoria: 'documento',
      accion: 'Regenero documentos automaticos de la inscripcion',
      nota: 'Regeneracion tras correccion del numero de documento.',
      metadata: { generated: result.generated ?? null, radicado: inscripcion.radicado },
    });
    return { ok: true, generated: result.generated ?? 0 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo regenerar.' };
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Metodo no permitido.' });

  const createdTargets: string[] = [];
  let r2: ReturnType<typeof getR2> | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new HttpError('Variables de entorno de Supabase incompletas.', 500);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { jwt, userId } = await authenticateAdmin(admin, req);

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || '');
    if (!['preview', 'apply', 'regenerar'].includes(mode)) throw new HttpError('Modo invalido.', 400);
    const inscripcionId = String(body?.inscripcion_id || '').trim();

    if (mode === 'regenerar') {
      const regeneration = await regenerateDocuments(admin, jwt, inscripcionId, userId);
      return json(regeneration.ok ? 200 : 502, {
        ok: regeneration.ok,
        mode,
        error: regeneration.ok ? undefined : regeneration.error,
        regeneracion: regeneration,
      });
    }

    const newDocument = sanitizeText(body?.nuevo_n_documento, 40);
    if (!DOCUMENT_PATTERN.test(newDocument)) {
      throw new HttpError('El documento debe tener entre 4 y 30 caracteres alfanumericos, sin espacios ni puntos.', 400);
    }
    const reason = sanitizeText(body?.motivo, 2000);
    if (mode === 'apply' && !reason) throw new HttpError('Debes indicar el motivo del cambio.', 400);

    r2 = getR2();
    const inscripcion = await loadInscripcion(admin, inscripcionId);
    const plan = await buildPlan(admin, r2, inscripcion, newDocument);
    const summary = {
      documento_actual: inscripcion.n_documento,
      documento_nuevo: newDocument,
      radicado: inscripcion.radicado,
      archivos: plan.inventory.map((item) => ({ origen: item.origen, destino: item.destino, estado: item.estado })),
      advertencias: plan.warnings,
      bloqueos: plan.blockers,
    };

    if (mode === 'preview') return json(200, { ok: true, mode, ...summary });
    if (plan.blockers.length) return json(409, { ok: false, mode, error: plan.blockers[0], ...summary });

    if (String(inscripcion.n_documento || '').trim() === newDocument && plan.inventory.length === 0) {
      return json(200, { ok: true, mode, sin_cambios: true, ...summary });
    }

    const toCopy = plan.inventory.filter((item) => item.estado === 'mover');
    try {
      for (const item of toCopy) {
        await r2.copy(item.origen, item.destino);
        createdTargets.push(item.destino);
        const verification = await r2.head(item.destino);
        if (!verification.exists || verification.size !== item.size) {
          throw new Error(`La copia no coincide con el original: ${item.destino}`);
        }
      }
    } catch (copyError) {
      await Promise.allSettled(createdTargets.map((key) => r2.remove(key)));
      throw new HttpError(
        `No se pudieron copiar los archivos; no se realizaron cambios. ${copyError instanceof Error ? copyError.message : ''}`.trim(),
        502,
      );
    }

    const { data: applied, error: applyError } = await admin.rpc('admin_corregir_documento_aspirante_aplicar', {
      p_inscripcion_id: inscripcionId,
      p_nuevo_documento: newDocument,
      p_old_segments: plan.oldSegments,
      p_new_segment: plan.newSegment,
      p_radicado_segment: plan.radicadoSegment,
      p_actor_user_id: userId,
      p_motivo: reason,
      p_rutas: plan.inventory.map((item) => ({ origen: item.origen, destino: item.destino, estado: item.estado })),
    });

    if (applyError || applied?.ok !== true) {
      await Promise.allSettled(createdTargets.map((key) => r2.remove(key)));
      throw new HttpError(applyError?.message || 'No se pudo actualizar la base de datos; no se realizaron cambios.', 409);
    }

    const deleted: string[] = [];
    const deleteFailures: string[] = [];
    for (const item of plan.inventory.filter((entry) => entry.estado === 'mover' || entry.estado === 'destino_igual')) {
      try {
        await r2.remove(item.origen);
        deleted.push(item.origen);
      } catch {
        deleteFailures.push(item.origen);
      }
    }
    if (deleteFailures.length) {
      await admin.from('portal_beneficiario_bitacora').insert({
        inscripcion_id: inscripcionId,
        actor_user_id: userId,
        tipo_evento: 'correccion_documento_aspirante_pendiente_limpieza',
        categoria: 'datos_personales',
        accion: 'Archivos antiguos pendientes de eliminar en R2',
        nota: 'No se pudieron eliminar algunos archivos de la ruta anterior.',
        metadata: { archivos: deleteFailures },
      });
    }

    const regeneration = body?.regenerar_pdfs === false
      ? { ok: true, omitido: true }
      : await regenerateDocuments(admin, jwt, inscripcionId, userId);

    return json(200, {
      ok: true,
      mode,
      ...summary,
      resultado: {
        movidos: toCopy.length,
        ya_movidos: plan.inventory.filter((item) => item.estado === 'ya_movido').length,
        faltantes: plan.inventory.filter((item) => item.estado === 'faltante').length,
        eliminados_origen: deleted.length,
        pendientes_limpieza: deleteFailures,
      },
      regeneracion: regeneration,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return json(error.status, { ok: false, error: error.message, details: error.details });
    }
    console.error('admin-corregir-documento-aspirante:', error instanceof Error ? error.message : 'error desconocido');
    return json(500, { ok: false, error: 'Error interno al corregir el documento.' });
  }
});
