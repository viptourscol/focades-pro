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
    const userRole = Array.isArray(roles) && roles.length > 0 ? roles[0] : null;
    // admin_educacion y admin_presupuesto pueden generar RP
    if (!["admin_educacion", "admin_presupuesto"].includes(userRole)) {
      return new Response(
        JSON.stringify({
          error: "Only admin_educacion or admin_presupuesto can generate RP",
        }),
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
      .eq("tipo_documento", "rp")
      .single();

    if (errorDoc || !documento) {
      return new Response(
        JSON.stringify({
          error: "Document not found or not of type 'rp'",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Obtener valores RP asociados
    const { data: valores, error: errorValores } = await supabaseAdmin
      .from("portal_valores_cargue")
      .select(
        `
        id,
        tercero_presupuestal,
        rubro_presupuestal,
        fuente_financiamiento,
        valor_bruto,
        valor_deducciones,
        valor_neto,
        datos_adicionales
      `
      )
      .eq("documento_id", documento_id)
      .order("created_at", { ascending: true });

    if (errorValores) {
      return new Response(JSON.stringify({ error: errorValores.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generar CSV
    const headers = [
      "TERCERO_PRESUPUESTAL",
      "RUBRO_PRESUPUESTAL",
      "FUENTE_FINANCIAMIENTO",
      "VALOR_BRUTO",
      "VALOR_DEDUCCIONES",
      "VALOR_NETO",
    ];

    const csvContent = [
      headers.join(","),
      ...valores.map((v: Record<string, unknown>) =>
        [
          v.tercero_presupuestal,
          v.rubro_presupuestal,
          v.fuente_financiamiento,
          v.valor_bruto,
          v.valor_deducciones,
          v.valor_neto,
        ].join(",")
      ),
    ].join("\n");

    // Guardar archivo en Storage
    const fileName = `rp-${documento_id}-${Date.now()}.csv`;
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

    // Obtener URL pública
    const { data: publicURL } = supabaseAdmin.storage
      .from("documentos-cargue")
      .getPublicUrl(fileName);

    // Actualizar documento
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
      comentario: "Archivo RP generado",
      datos_cambio: {
        filas_generadas: valores.length,
        valor_total: valores.reduce(
          (sum: number, v: Record<string, unknown>) =>
            sum + (Number(v.valor_neto) || 0),
          0
        ),
        archivo_url: publicURL.publicUrl,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        documento_id,
        filas_generadas: valores.length,
        valor_total: valores.reduce(
          (sum: number, v: Record<string, unknown>) =>
            sum + (Number(v.valor_neto) || 0),
          0
        ),
        archivo_url: publicURL.publicUrl,
        archivo_nombre: fileName,
        mensaje: "Archivo RP generado exitosamente",
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
