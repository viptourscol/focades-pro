import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

const supabase = createClient(supabaseUrl, supabaseAnonKey);

serve(async (req: Request) => {
  try {
    // Obtener usuario autenticado
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return new Response(
        JSON.stringify({ error: "No authorization token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verificar usuario
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

    const rol = user.user_metadata?.role;

    // Obtener parámetros
    const { convocatoria_id, tipo_documento, tipo_filtro } = await req.json();

    // Validar inputs
    if (!convocatoria_id || (!tipo_documento && !tipo_filtro)) {
      return new Response(
        JSON.stringify({
          error: "Missing required parameters: convocatoria_id and (tipo_documento or tipo_filtro)",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
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
        return new Response(JSON.stringify({ error: "Invalid role" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
    }

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

    const { data: documentos, error } = await query;

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        rol,
        convocatoria_id,
        documentos_encontrados: documentos?.length || 0,
        documentos,
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
