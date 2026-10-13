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

    // Solo admin_educacion puede generar terceros
    const roles = user.user_metadata?.roles || [];
    const userRole = Array.isArray(roles) && roles.length > 0 ? roles[0] : null;
    if (userRole !== "admin_educacion") {
      return new Response(
        JSON.stringify({ error: "Only admin_educacion can generate terceros" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const { documento_id } = await req.json();

    if (!documento_id) {
      return new Response(
        JSON.stringify({ error: "Missing documento_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Obtener documento
    const { data: documento, error: errorDoc } = await supabaseAdmin
      .from("portal_documentos_cargue")
      .select("*")
      .eq("id", documento_id)
      .eq("tipo_documento", "terceros")
      .single();

    if (errorDoc || !documento) {
      return new Response(
        JSON.stringify({
          error: "Document not found or not of type 'terceros'",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Obtener beneficiarios terceros asociados
    const { data: beneficiarios, error: errorBenef } = await supabaseAdmin
      .from("portal_cargue_beneficiarios_terceros")
      .select(
        `
        id,
        identificacion,
        nombre_razon_social,
        tipo_identificacion,
        email,
        telefono,
        direccion,
        ciudad,
        estado_registro,
        datos_adicionales
      `
      )
      .eq("documento_id", documento_id)
      .order("created_at", { ascending: true });

    if (errorBenef) {
      return new Response(JSON.stringify({ error: errorBenef.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generar CSV
    const headers = [
      "IDENTIFICACION",
      "NOMBRE/RAZON_SOCIAL",
      "TIPO_IDENTIFICACION",
      "EMAIL",
      "TELEFONO",
      "DIRECCION",
      "CIUDAD",
      "ESTADO_REGISTRO",
    ];

    const csvContent = [
      headers.join(","),
      ...beneficiarios.map((b: Record<string, unknown>) =>
        [
          b.identificacion,
          `"${b.nombre_razon_social}"`,
          b.tipo_identificacion,
          b.email,
          b.telefono,
          `"${b.direccion || ""}"`,
          b.ciudad,
          b.estado_registro || "ACTIVO",
        ].join(",")
      ),
    ].join("\n");

    // Guardar archivo en Storage
    const fileName = `terceros-${documento_id}-${Date.now()}.csv`;
    const { data: uploadData, error: uploadError } =
      await supabaseAdmin.storage
        .from("documentos-cargue")
        .upload(fileName, csvContent, {
          contentType: "text/csv;charset=UTF-8",
          upsert: false,
        });

    if (uploadError) {
      return new Response(JSON.stringify({ error: uploadError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Obtener URL pública del archivo
    const { data: publicURL } = supabaseAdmin.storage
      .from("documentos-cargue")
      .getPublicUrl(fileName);

    // Actualizar documento con la URL
    await supabaseAdmin
      .from("portal_documentos_cargue")
      .update({ archivo_url: publicURL.publicUrl })
      .eq("id", documento_id);

    // Registrar transición
    await supabaseAdmin.from("portal_transiciones_documento").insert({
      documento_id,
      estado_nuevo: documento.estado,
      rol_quien_transiciona: userRole,
      usuario_id: user.id,
      comentario: "Archivo TERCEROS generado",
      datos_cambio: {
        filas_generadas: beneficiarios.length,
        archivo_url: publicURL.publicUrl,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        documento_id,
        filas_generadas: beneficiarios.length,
        archivo_url: publicURL.publicUrl,
        archivo_nombre: fileName,
        mensaje: "Archivo TERCEROS generado exitosamente",
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
