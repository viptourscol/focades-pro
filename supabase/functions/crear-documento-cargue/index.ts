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

    console.log("User roles:", roles);
    console.log("Selected rol:", rol);

    // Validar que usuario es admin_educacion (el único que crea documentos iniciales)
    if (rol !== "admin_educacion") {
      return new Response(
        JSON.stringify({
          error: "Only admin_educacion can create documents",
          received_role: rol,
        }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Obtener parámetros
    const { convocatoria_id, tipo_documento, cantidad_registros } =
      await req.json();

    // Validar inputs
    if (!convocatoria_id || !tipo_documento) {
      return new Response(
        JSON.stringify({
          error: "Missing required parameters: convocatoria_id, tipo_documento",
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Tipos válidos
    const tipos_validos = ["terceros", "rp", "op", "contabilidad", "siafe"];
    if (!tipos_validos.includes(tipo_documento)) {
      return new Response(
        JSON.stringify({
          error: `Invalid tipo_documento. Must be one of: ${tipos_validos.join(", ")}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Crear documento
    const { data: documento, error: errorDoc } = await supabaseAdmin
      .from("portal_documentos_cargue")
      .insert({
        convocatoria_id,
        tipo_documento,
        estado: "borrador",
        cantidad_registros: cantidad_registros || 0,
        creado_por: user.id,
        version: 1,
      })
      .select()
      .single();

    if (errorDoc) {
      console.error("Error creating document:", errorDoc);
      return new Response(JSON.stringify({ error: errorDoc.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Registrar transición inicial
    const { error: errorTransicion } = await supabaseAdmin
      .from("portal_transiciones_documento")
      .insert({
        documento_id: documento.id,
        estado_anterior: null,
        estado_nuevo: "borrador",
        rol_quien_transiciona: "sistema",
        usuario_id: user.id,
        comentario: "Documento creado",
        datos_cambio: {
          tipo_documento,
          cantidad_registros,
        },
      });

    if (errorTransicion) {
      console.error("Error registering transition:", errorTransicion);
      // No es crítico, continuar
    }

    return new Response(
      JSON.stringify({
        success: true,
        documento: {
          id: documento.id,
          tipo_documento: documento.tipo_documento,
          estado: documento.estado,
          convocatoria_id: documento.convocatoria_id,
          creado_en: documento.creado_en,
        },
      }),
      {
        status: 201,
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
