import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
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

    // Verificar usuario
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      console.error("User auth error:", userError);
      return new Response(JSON.stringify({ error: "Unauthorized", details: userError?.message }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const roles = user.user_metadata?.roles || [];
    const rol = Array.isArray(roles) && roles.length > 0 ? roles[0] : "admin_visualizacion";

    console.log("✅ User authenticated:", { email: user.email, roles, selected_rol: rol });

    // Obtener parámetros
    let params: any = {};
    if (req.headers.get("content-type")?.includes("application/json")) {
      try {
        params = await req.json();
      } catch (e) {
        console.error("Error parsing JSON:", e);
        return new Response(
          JSON.stringify({ error: "Invalid JSON body", details: e.message }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    const { convocatoria_id, tipo_documento, tipo_filtro } = params;

    console.log("📋 Params received:", { convocatoria_id, tipo_documento, tipo_filtro });

    // Validar inputs - solo convocatoria_id es requerido
    if (!convocatoria_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required parameter: convocatoria_id",
          received: params
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Determinar tipos de documentos según rol
    let tipos_permitidos: string[] = [];
    switch (rol) {
      case "admin_educacion":
        tipos_permitidos = ["terceros", "rp", "op", "contabilidad", "siafe"];
        break;
      case "admin_presupuesto":
        tipos_permitidos = ["terceros", "rp"];
        break;
      case "admin_contabilidad":
        tipos_permitidos = ["op", "contabilidad"];
        break;
      case "admin_pagos":
        tipos_permitidos = ["terceros", "rp", "op", "contabilidad", "siafe"];
        break;
      case "admin_visualizacion":
        tipos_permitidos = ["terceros", "rp", "op", "contabilidad", "siafe"];
        break;
      default:
        console.error("❌ Invalid role:", rol);
        return new Response(JSON.stringify({ error: "Invalid role", rol }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
    }

    console.log("📂 Tipos permitidos para rol:", { rol, tipos_permitidos });

    // Filtrar por tipos permitidos
    let query = supabase
      .from("portal_documentos_cargue")
      .select(
        `
      id, 
      tipo_documento, 
      estado, 
      version, 
      cantidad_registros,
      creado_en,
      editado_en,
      aprobado_en,
      creado_por,
      editado_por,
      aprobado_por,
      comentarios_rechazo
    `
      )
      .eq("convocatoria_id", convocatoria_id)
      .in("tipo_documento", tipos_permitidos)
      .order("creado_en", { ascending: false });

    // Aplicar filtros adicionales
    if (tipo_filtro) {
      query = query.eq("tipo_documento", tipo_filtro);
    }

    console.log("🔍 Ejecutando consulta...");
    const { data: documentos, error } = await query;

    if (error) {
      console.error("❌ Query error:", error);
      return new Response(JSON.stringify({ 
        error: "Database query failed", 
        details: error.message,
        code: error.code 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("✅ Query success:", { count: documentos?.length || 0 });

    return new Response(
      JSON.stringify({
        success: true,
        rol,
        convocatoria_id,
        documentos_encontrados: documentos?.length || 0,
        documentos: documentos || [],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("❌ Uncaught error:", error);
    return new Response(JSON.stringify({ 
      error: "Internal server error",
      message: error?.message,
      stack: error?.stack?.split('\n').slice(0, 3).join('\n')
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
