// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { encodeBytesToBase64, generatePdfDocumentsWithGas, resolveTemplateId } from '../_shared/gas-docs.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const sanitizeText = (value: unknown, maxLength = 500) =>
  String(value || '')
    .trim()
    .slice(0, maxLength);

const parseTimeout = (value: string | undefined, defaultValue: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const sha256 = async (value: string) => {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return toHex(new Uint8Array(digest));
};

const normalizeFirmaPath = (value: string) => {
  const raw = sanitizeText(value, 600);
  if (!raw) return '';
  if (raw.startsWith('soportes/')) {
    return raw.slice('soportes/'.length);
  }
  return raw;
};

const buildDbStoragePath = (bucket: string, path: string) => `${bucket}/${path}`;

const gasTimeoutMs = parseTimeout(Deno.env.get('DOCS_GAS_TIMEOUT_MS'), 20000);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new HttpError('Variables de entorno de Supabase incompletas en la función.', 500);
    }

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    const jwt = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    if (!jwt) {
      throw new HttpError('No se recibió token de autenticación.', 401);
    }

    const payload = await req.json().catch(() => ({}));
    const beneficiarioId = Number(payload?.beneficiario_id || 0);
    const firmaPath = normalizeFirmaPath(payload?.firma_path || '');
    const signatureFileName = sanitizeText(payload?.signature_file_name || 'firma-digital.png', 160);

    if (!Number.isFinite(beneficiarioId) || beneficiarioId <= 0) {
      throw new HttpError('beneficiario_id es obligatorio y debe ser numérico.', 400);
    }

    if (!firmaPath) {
      throw new HttpError('firma_path es obligatorio para generar documentos de onboarding.', 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(jwt);

    if (userError || !user) {
      throw new HttpError('Token inválido o sesión no vigente.', 401);
    }

    const { data: beneficiario, error: beneficiarioError } = await admin
      .from('portal_beneficiarios')
      .select('id,auth_user_id,nombre_completo,tipo_documento,n_documento,email')
      .eq('id', beneficiarioId)
      .maybeSingle();

    if (beneficiarioError || !beneficiario) {
      throw new HttpError('No se encontró el beneficiario para generar documentos.', 404);
    }

    if (!beneficiario.auth_user_id || beneficiario.auth_user_id !== user.id) {
      throw new HttpError('No tienes permiso para generar documentos de este beneficiario.', 403);
    }

    const { data: signatureData, error: signatureError } = await admin.storage
      .from('soportes')
      .download(firmaPath);

    if (signatureError || !signatureData) {
      throw new HttpError(`No se pudo descargar la firma desde Storage: ${signatureError?.message || 'sin archivo'}`, 400);
    }

    const signatureBytes = new Uint8Array(await signatureData.arrayBuffer());
    const signatureMimeType = String(signatureData.type || '').trim() || 'image/png';
    const nowIso = new Date().toISOString();
    const signatureHash = await sha256(
      JSON.stringify({
        beneficiario_id: beneficiario.id,
        nombre_completo: beneficiario.nombre_completo || '',
        tipo_documento: beneficiario.tipo_documento || '',
        n_documento: beneficiario.n_documento || '',
        email: beneficiario.email || '',
        firma_path: firmaPath,
        timestamp: nowIso,
      })
    );

    const { data: existingDocs, error: existingError } = await admin
      .from('portal_beneficiario_documentos_historicos')
      .select('id,tipo_documento,storage_path,titulo,archivo_mime_type,archivo_size_bytes')
      .eq('beneficiario_id', beneficiario.id)
      .in('tipo_documento', ['firma_digital', 'tratamiento_datos', 'aceptacion_terminos']);

    if (existingError) {
      throw new HttpError(`No se pudieron consultar documentos existentes: ${existingError.message}`, 400);
    }

    const existingByType = new Map<string, Record<string, unknown>>();
    for (const doc of existingDocs || []) {
      const tipo = sanitizeText(doc?.tipo_documento, 80);
      if (!tipo || existingByType.has(tipo)) continue;
      existingByType.set(tipo, doc);
    }

    const insertedDocs: Array<Record<string, unknown>> = [];
    const skippedDocs: Array<Record<string, unknown>> = [];

    if (!existingByType.has('firma_digital')) {
      const firmaDbPath = buildDbStoragePath('soportes', firmaPath);
      const { data: insertedFirma, error: firmaInsertError } = await admin
        .from('portal_beneficiario_documentos_historicos')
        .insert({
          beneficiario_id: beneficiario.id,
          titulo: 'Firma digital del beneficiario',
          tipo_documento: 'firma_digital',
          estado: 'cargado',
          storage_bucket: 'soportes',
          storage_path: firmaDbPath,
          archivo_mime_type: signatureMimeType,
          archivo_size_bytes: signatureBytes.byteLength,
          created_by_user_id: user.id,
        })
        .select('id,tipo_documento,storage_path,titulo,archivo_mime_type,archivo_size_bytes')
        .single();

      if (firmaInsertError) {
        throw new HttpError(`No se pudo registrar la firma digital: ${firmaInsertError.message}`, 400);
      }

      insertedDocs.push(insertedFirma || {});
    } else {
      skippedDocs.push(existingByType.get('firma_digital') || {});
    }

    const docsToGenerate = [
      {
        tipo: 'tratamiento_datos',
        titulo: 'Autorización tratamiento de datos personales',
        fileName: 'tratamiento-datos.pdf',
        templateId: resolveTemplateId('DOCS_GAS_TEMPLATE_DATOS_ID'),
      },
      {
        tipo: 'aceptacion_terminos',
        titulo: 'Aceptación de términos y condiciones',
        fileName: 'terminos-condiciones.pdf',
        templateId: resolveTemplateId('DOCS_GAS_TEMPLATE_TERMINOS_ID'),
      },
    ].filter((doc) => !existingByType.has(doc.tipo));

    if (docsToGenerate.length > 0) {
      const gasDocs = await generatePdfDocumentsWithGas({
        source: 'beneficiarios_onboarding',
        timeoutMs: gasTimeoutMs,
        documents: docsToGenerate,
        payload: {
          beneficiario_id: beneficiario.id,
          generated_at: nowIso,
          profile: {
            nombre_completo: beneficiario.nombre_completo || '',
            tipo_documento: beneficiario.tipo_documento || '',
            n_documento: beneficiario.n_documento || '',
            email: beneficiario.email || '',
          },
          signature: {
            file_name: signatureFileName,
            mime_type: signatureMimeType,
            base64: encodeBytesToBase64(signatureBytes),
          },
          tokens: {
            firma_timestamp: nowIso,
            firma_hash_datos: signatureHash,
          },
        },
      });

      const gasDocByType = new Map<string, Record<string, unknown>>();
      for (const gasDoc of gasDocs) {
        gasDocByType.set(gasDoc.tipo, gasDoc);
      }

      for (const expected of docsToGenerate) {
        const generatedDoc = gasDocByType.get(expected.tipo);
        if (!generatedDoc) {
          throw new HttpError(`GAS no devolvió el documento ${expected.tipo}.`, 400);
        }

        const outputFileName = sanitizeText(generatedDoc.fileName || expected.fileName || `${expected.tipo}.pdf`, 180);
        const mimeType = sanitizeText(generatedDoc.mimeType || 'application/pdf', 120) || 'application/pdf';
        const storageBucketPath = `beneficiarios_historicos/${beneficiario.id}/generados/${outputFileName}`;

        const { error: uploadError } = await admin.storage
          .from('soportes')
          .upload(storageBucketPath, new Blob([generatedDoc.pdfBytes], { type: mimeType }), {
            upsert: true,
            contentType: mimeType,
          });

        if (uploadError) {
          throw new HttpError(`Error subiendo ${expected.tipo}: ${uploadError.message}`, 400);
        }

        const { data: insertedDoc, error: insertDocError } = await admin
          .from('portal_beneficiario_documentos_historicos')
          .insert({
            beneficiario_id: beneficiario.id,
            titulo: expected.titulo,
            tipo_documento: expected.tipo,
            estado: 'cargado',
            storage_bucket: 'soportes',
            storage_path: buildDbStoragePath('soportes', storageBucketPath),
            archivo_mime_type: mimeType,
            archivo_size_bytes: generatedDoc.pdfBytes.byteLength,
            created_by_user_id: user.id,
          })
          .select('id,tipo_documento,storage_path,titulo,archivo_mime_type,archivo_size_bytes')
          .single();

        if (insertDocError) {
          throw new HttpError(`No se pudo registrar ${expected.tipo}: ${insertDocError.message}`, 400);
        }

        insertedDocs.push(insertedDoc || {});
      }
    }

    if (existingByType.has('tratamiento_datos')) {
      skippedDocs.push(existingByType.get('tratamiento_datos') || {});
    }
    if (existingByType.has('aceptacion_terminos')) {
      skippedDocs.push(existingByType.get('aceptacion_terminos') || {});
    }

    return new Response(
      JSON.stringify({
        ok: true,
        generated: insertedDocs.length,
        skipped: skippedDocs.length,
        documentos: [...insertedDocs, ...skippedDocs],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 400;
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
      }
    );
  }
});
