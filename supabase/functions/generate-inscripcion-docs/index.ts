// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { getRenderConfig } from './config.ts';
import type { RenderContext } from './document-model.ts';
import { TEMPLATES } from './templates.ts';
import { renderWithHtml } from './renderers/html-renderer.ts';
import { renderWithPdfLib } from './renderers/pdf-lib-renderer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

type Payload = {
  inscripcion_id: string;
  radicado: string;
  firma_path: string;
  documento_persona: string;
  form_data: Record<string, unknown>;
};

class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const parseBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
};

const sanitizePathSegment = (value: string) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');

const formatDate = () => {
  const now = new Date();
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'America/Bogota' }).format(now);
};

const formatUtcDateTime = () => new Date().toISOString();

const escapeHtml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const buildRegistrationConfirmationEmailHtml = ({
  nombreCompleto,
  modalidad,
  radicado,
}: {
  nombreCompleto: string;
  modalidad: string;
  radicado: string;
}) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Confirmación de Inscripción FOCADES</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', Arial, sans-serif; background-color: #f5f7fa;">
  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 20px 0; background-color: #ffffff; border-bottom: 1px solid #dee2e6;">
        <img src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logo_alcadia_focades_black.png" alt="Logo Focades" width="150">
      </td>
    </tr>
    <tr>
      <td style="padding: 40px 30px; background-color: #ffffff;">
        <h1 style="color: #0D2C54; font-size: 24px; margin: 0 0 20px 0;">¡Inscripción Recibida!</h1>
        <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #333333;">
          Hola, <strong>${escapeHtml(nombreCompleto)}</strong>,
        </p>
        <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333;">
          Te confirmamos que hemos recibido tu solicitud para el programa <strong>FOCADES</strong> en la modalidad: <strong>${escapeHtml(modalidad)}</strong>.
        </p>
        <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #333333;">
          Tu número de radicado es:
        </p>
        <table align="center" width="100%">
          <tr>
            <td align="center" style="background-color: #f5f7fa; border: 2px dashed #F9A03F; padding: 20px; border-radius: 8px;">
              <span style="font-size: 22px; font-weight: 700; color: #0D2C54; letter-spacing: 2px;">${escapeHtml(radicado)}</span>
            </td>
          </tr>
        </table>

        <div style="margin-top: 32px; padding: 20px; background-color: #f0f7ff; border-radius: 8px; text-align: center;">
          <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5; color: #0D2C54;">
            <strong>¿Deseas conocer el estado de tu admisión?</strong><br>
            Puedes realizar el seguimiento de tu postulación ingresando tu radicado en nuestro portal oficial.
          </p>
          <table align="center" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="border-radius: 50px;" bgcolor="#0D2C54">
                <a href="https://convocatoria.focades.info/" target="_blank" style="font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 50px; display: inline-block;">
                  Consultar mi Estado
                </a>
              </td>
            </tr>
          </table>
        </div>

        <p style="margin: 24px 0; font-size: 16px; line-height: 1.6; color: #333333;">
          Guarda este correo y tu número de radicado, ya que son indispensables para las siguientes etapas del proceso.
        </p>

        <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333;">
          Atentamente,<br>
          <strong>El equipo FOCADES</strong>
        </p>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 30px; background-color: #0D2C54;">
        <img src="https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logoalcaldiasecretariablanco.png" alt="Logos Institucionales" width="200" style="display: block; margin-bottom: 16px;">
        <p style="margin: 0; font-size: 12px; color: #ffffff; opacity: 0.7;">
          &copy; 2026 Alcaldía de Montelíbano - Secretaría de Educación.<br>
          Este es un correo automático, por favor no respondas a este mensaje.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

const sendRegistrationConfirmationEmail = async ({
  to,
  nombreCompleto,
  modalidad,
  radicado,
}: {
  to: string;
  nombreCompleto: string;
  modalidad: string;
  radicado: string;
}) => {
  const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';
  const from = Deno.env.get('DOCS_EMAIL_FROM') || 'FOCADES <no-reply@focades.info>';

  if (!resendApiKey) {
    return { sent: false, reason: 'Falta RESEND_API_KEY en la función.' };
  }

  if (!isValidEmail(to)) {
    return { sent: false, reason: 'Correo del aspirante inválido o ausente.' };
  }

  const html = buildRegistrationConfirmationEmailHtml({ nombreCompleto, modalidad, radicado });
  const subject = `Confirmación de inscripción FOCADES - ${radicado}`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  const responseJson = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = responseJson?.message || responseJson?.error || response.statusText || 'Error desconocido';
    return { sent: false, reason: `Resend HTTP ${response.status}: ${detail}` };
  }

  return {
    sent: true,
    providerId: responseJson?.id || '',
  };
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

const loadHeaderLogoBytes = async (admin) => {
  const bucketCandidates = [
    Deno.env.get('DOCS_HEADER_LOGO_BUCKET') || '',
    'public-assets',
  ].filter(Boolean);

  const pathCandidates = [
    Deno.env.get('DOCS_HEADER_LOGO_PATH') || '',
    'logos/alcaldia-montelibano.png',
    'logo/alcaldia-montelibano.png',
  ].filter(Boolean);

  for (const bucket of bucketCandidates) {
    for (const path of pathCandidates) {
      try {
        const { data, error } = await admin.storage.from(bucket).download(path);
        if (!error && data) {
          return new Uint8Array(await data.arrayBuffer());
        }
      } catch {
        // keep trying candidates
      }
    }
  }

  const explicitUrl = Deno.env.get('DOCS_HEADER_LOGO_URL') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const urlCandidates = [
    explicitUrl,
    supabaseUrl
      ? `${supabaseUrl}/storage/v1/object/public/public-assets/logos/alcaldia-montelibano.png`
      : '',
  ].filter(Boolean);

  for (const logoUrl of urlCandidates) {
    try {
      const response = await fetch(logoUrl);
      if (response.ok) {
        return new Uint8Array(await response.arrayBuffer());
      }
    } catch {
      // try next URL candidate
    }
  }

  return null;
};


const buildSignatureTokens = async ({
  inscripcionId,
  radicado,
  formData,
}: {
  inscripcionId: string;
  radicado: string;
  formData: Record<string, unknown>;
}) => {
  const aspirante = String(formData.nombre_completo || '').trim();
  const documento = String(formData.n_documento || '').trim();
  const tipoDocumento = String(formData.tipo_documento || '').trim();
  const firmaTimestamp = formatUtcDateTime();
  const firmaHashDatos = await sha256(
    JSON.stringify({
      inscripcion_id: inscripcionId,
      radicado,
      nombre_completo: aspirante,
      tipo_documento: tipoDocumento,
      n_documento: documento,
      email: String(formData.email || ''),
      modalidad: String(formData.modalidad || ''),
    })
  );

  return {
    nombre_completo: aspirante || 'No informado',
    n_documento: documento || 'No informado',
    tipo_documento: tipoDocumento || 'No informado',
    firma_timestamp: firmaTimestamp,
    firma_hash_datos: firmaHashDatos,
  };
};

const renderConfig = getRenderConfig();
const requireJwt = parseBoolean(Deno.env.get('DOCS_REQUIRE_JWT'), false);

const renderDocument = async (context: RenderContext) => {
  if (renderConfig.engine === 'html_pdf') {
    try {
      return await renderWithHtml(context, renderConfig);
    } catch (error) {
      if (!renderConfig.fallbackToPdfLib) {
        throw new Error(
          `No se pudo generar con motor HTML->PDF: ${error instanceof Error ? error.message : 'error desconocido'}`
        );
      }
      console.error('Fallback a pdf-lib por error de HTML->PDF:', error);
    }
  }

  return await renderWithPdfLib(context);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Variables de entorno de Supabase incompletas en la función.');
    }

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    const jwt = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

    const payload = (await req.json()) as Payload;
    const { inscripcion_id, radicado, firma_path, documento_persona, form_data } = payload;

    if (!inscripcion_id || !radicado || !firma_path) {
      throw new Error('Parámetros obligatorios faltantes para generar documentos.');
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    if (requireJwt) {
      if (!jwt) {
        throw new HttpError('No se recibió token de autenticación.', 401);
      }

      const {
        data: { user },
        error: userError,
      } = await admin.auth.getUser(jwt);

      if (userError || !user) {
        throw new HttpError('Token inválido o sesión no vigente.', 401);
      }
    }

    const { data: signatureData, error: signatureError } = await admin.storage
      .from('soportes')
      .download(firma_path);

    if (signatureError || !signatureData) {
      throw new Error(`No se pudo descargar la firma desde Storage: ${signatureError?.message || 'sin archivo'}`);
    }

    const signatureBytes = new Uint8Array(await signatureData.arrayBuffer());
    const logoBytes = await loadHeaderLogoBytes(admin);
    if (!logoBytes) {
      console.warn('No se pudo cargar logo para encabezado (logoBytes=null).');
    } else {
      console.log(`Logo cargado correctamente. Bytes: ${logoBytes.byteLength}`);
    }
    const cleanDocumento = sanitizePathSegment(documento_persona) || 'sin-documento';
    const cleanRadicado = sanitizePathSegment(radicado) || 'sin-radicado';
    const generatedAtLabel = formatDate();
    const aspiranteEmail = String(form_data?.email || '').trim().toLowerCase();
    const aspiranteNombre = String(form_data?.nombre_completo || '').trim() || 'Aspirante';
    const aspiranteModalidad = String(form_data?.modalidad || '').trim() || 'No definida';
    const tokens = await buildSignatureTokens({
      inscripcionId: inscripcion_id,
      radicado,
      formData: form_data || {},
    });

    const createdDocs: Array<{
      tipo_documento: string;
      storage_path: string;
      nombre_original: string;
      mime_type: string;
      size_bytes: number;
    }> = [];

    const skippedDocs: Array<{
      tipo_documento: string;
      storage_path: string;
      nombre_original: string;
      mime_type: string;
      size_bytes: number;
    }> = [];

    for (const template of TEMPLATES) {
      const { data: existingDoc, error: existingDocError } = await admin
        .from('inscripciones_documentos')
        .select('tipo_documento,storage_path,nombre_original,mime_type,size_bytes')
        .eq('inscripcion_id', inscripcion_id)
        .eq('tipo_documento', template.tipo)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingDocError) {
        throw new Error(`No se pudo consultar documentos existentes (${template.tipo}): ${existingDocError.message}`);
      }

      if (existingDoc) {
        skippedDocs.push({
          tipo_documento: existingDoc.tipo_documento,
          storage_path: existingDoc.storage_path,
          nombre_original: existingDoc.nombre_original || `${template.tipo}.pdf`,
          mime_type: existingDoc.mime_type || 'application/pdf',
          size_bytes: Number(existingDoc.size_bytes || 0),
        });
        continue;
      }

      const pdfBytes = await renderDocument({
        template,
        formData: form_data || {},
        radicado,
        signatureBytes,
        inscripcionId: inscripcion_id,
        logoBytes,
        generatedAtLabel,
        tokens,
      });

      const fileName = `${template.tipo}.pdf`;
      const path = `expedientes/${cleanDocumento}/${cleanRadicado}/generados/${fileName}`;

      const { error: uploadError } = await admin.storage
        .from('soportes')
        .upload(path, new Blob([pdfBytes], { type: 'application/pdf' }), {
          upsert: true,
          contentType: 'application/pdf',
        });

      if (uploadError) {
        throw new Error(`Error subiendo ${template.tipo}: ${uploadError.message}`);
      }

      createdDocs.push({
        tipo_documento: template.tipo,
        storage_path: path,
        nombre_original: fileName,
        mime_type: 'application/pdf',
        size_bytes: pdfBytes.byteLength,
      });

      const { error: insertDocError } = await admin.from('inscripciones_documentos').insert({
        inscripcion_id,
        tipo_documento: template.tipo,
        storage_path: path,
        nombre_original: fileName,
        mime_type: 'application/pdf',
        size_bytes: pdfBytes.byteLength,
        version: 1,
      });

      if (insertDocError) {
        throw new Error(`No se pudo registrar historial de ${template.tipo}: ${insertDocError.message}`);
      }
    }

    const emailResult = await sendRegistrationConfirmationEmail({
      to: aspiranteEmail,
      nombreCompleto: aspiranteNombre,
      modalidad: aspiranteModalidad,
      radicado,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        generated: createdDocs.length,
        skipped: skippedDocs.length,
        documentos: [...createdDocs, ...skippedDocs],
        email: emailResult,
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
