import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return new Response(
        JSON.stringify({ error: "No authorization token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const roles = user.user_metadata?.roles || [];
    const rol = Array.isArray(roles) && roles.length > 0 ? roles[0] : null;
    const { documento_id, comentario } = await req.json();

    if (!documento_id) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: documento_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Obtener documento
    const { data: documento, error: errorDoc } = await supabaseAdmin
      .from("portal_documentos_cargue")
      .select("*")
      .eq("id", documento_id)
      .single();

    if (errorDoc || !documento) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validar permisos según rol y tipo de documento
    let puede_aprobar = false;
    if (rol === "admin_educacion") {
      puede_aprobar = true; // Super admin
    } else if (
      rol === "admin_presupuesto" &&
      ["terceros", "rp"].includes(documento.tipo_documento)
    ) {
      puede_aprobar = true;
    } else if (
      rol === "admin_contabilidad" &&
      ["op", "contabilidad"].includes(documento.tipo_documento)
    ) {
      puede_aprobar = true;
    } else if (
      rol === "admin_pagos" &&
      documento.tipo_documento === "siafe"
    ) {
      puede_aprobar = true;
    }

    if (!puede_aprobar) {
      return new Response(
        JSON.stringify({
          error: `Role ${rol} cannot approve ${documento.tipo_documento}`,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validar estado
    if (documento.estado !== "enviado_para_revision") {
      return new Response(
        JSON.stringify({
          error: `Document must be in 'enviado_para_revision' state, current: ${documento.estado}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Actualizar documento
    const { error: errorUpdate } = await supabaseAdmin
      .from("portal_documentos_cargue")
      .update({
        estado: "aprobado",
        aprobado_por: user.id,
        aprobado_en: new Date().toISOString(),
        editado_por: user.id,
        editado_en: new Date().toISOString(),
      })
      .eq("id", documento_id);

    if (errorUpdate) {
      return new Response(JSON.stringify({ error: errorUpdate.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Registrar transición
    await supabaseAdmin
      .from("portal_transiciones_documento")
      .insert({
        documento_id,
        estado_anterior: documento.estado,
        estado_nuevo: "aprobado",
        rol_quien_transiciona: rol,
        usuario_id: user.id,
        comentario: comentario || "Documento aprobado",
      });

    return new Response(
      JSON.stringify({
        success: true,
        documento_id,
        nuevo_estado: "aprobado",
        mensaje: "Documento aprobado exitosamente",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
