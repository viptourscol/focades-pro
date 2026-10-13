import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    // Obtener usuario autenticado
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return new Response(
        JSON.stringify({ error: "No authorization token" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const roles = user.user_metadata?.roles || [];
    const rol = Array.isArray(roles) && roles.length > 0 ? roles[0] : null;

    // Obtener parámetros
    const { documento_id, comentario } = await req.json();

    if (!documento_id) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: documento_id" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Obtener documento actual
    const { data: documento, error: errorDoc } = await supabaseAdmin
      .from("portal_documentos_cargue")
      .select("*")
      .eq("id", documento_id)
      .single();

    if (errorDoc || !documento) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Validar permisos según tipo de documento y rol
    let puede_enviar = false;
    if (rol === "admin_educacion") {
      puede_enviar = true; // Super admin
    } else if (
      rol === "admin_presupuesto" &&
      ["terceros", "rp"].includes(documento.tipo_documento)
    ) {
      puede_enviar = true;
    } else if (
      rol === "admin_contabilidad" &&
      ["op", "contabilidad"].includes(documento.tipo_documento)
    ) {
      puede_enviar = true;
    } else if (
      rol === "admin_pagos" &&
      documento.tipo_documento === "siafe"
    ) {
      puede_enviar = true;
    }

    if (!puede_enviar) {
      return new Response(
        JSON.stringify({
          error: `Role ${rol} cannot send ${documento.tipo_documento} for review`,
        }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validar estado actual
    if (
      !["borrador", "rechazado"].includes(documento.estado)
    ) {
      return new Response(
        JSON.stringify({
          error: `Document must be in 'borrador' or 'rechazado' state, current: ${documento.estado}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Cambiar estado a "enviado_para_revision"
    const { error: errorUpdate } = await supabaseAdmin
      .from("portal_documentos_cargue")
      .update({
        estado: "enviado_para_revision",
        editado_por: user.id,
        editado_en: new Date().toISOString(),
      })
      .eq("id", documento_id);

    if (errorUpdate) {
      console.error("Error updating document:", errorUpdate);
      return new Response(JSON.stringify({ error: errorUpdate.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Registrar transición
    const { error: errorTransicion } = await supabaseAdmin
      .from("portal_transiciones_documento")
      .insert({
        documento_id,
        estado_anterior: documento.estado,
        estado_nuevo: "enviado_para_revision",
        rol_quien_transiciona: rol,
        usuario_id: user.id,
        comentario: comentario || "Enviado para revisión",
        datos_cambio: {
          cantidad_registros: documento.cantidad_registros,
        },
      });

    if (errorTransicion) {
      console.error("Error registering transition:", errorTransicion);
    }

    return new Response(
      JSON.stringify({
        success: true,
        documento_id,
        nuevo_estado: "enviado_para_revision",
        mensaje: "Documento enviado para revisión",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
