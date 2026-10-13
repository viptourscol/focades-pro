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
    // Solo admin_contabilidad puede generar OP
    if (userRole !== "admin_contabilidad") {
      return new Response(
        JSON.stringify({ error: "Only admin_contabilidad can generate OP" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const { documento_id, convocatoria_id } = await req.json();

    if (!documento_id) {
      return new Response(
        JSON.stringify({ error: "Missing documento_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Obtener documento OP
    const { data: documento, error: errorDoc } = await supabaseAdmin
      .from("portal_documentos_cargue")
      .select("*")
      .eq("id", documento_id)
      .eq("tipo_documento", "op")
      .single();

    if (errorDoc || !documento) {
      return new Response(
        JSON.stringify({ error: "Document not found or not of type 'op'" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Obtener RP aprobados de la misma convocatoria
    const { data: rpAprobados, error: errorRP } = await supabaseAdmin
      .from("portal_documentos_cargue")
      .select("id, convocatoria_id")
      .eq("tipo_documento", "rp")
      .eq("estado", "aprobado")
      .eq("convocatoria_id", documento.convocatoria_id || convocatoria_id)
      .order("created_at", { ascending: true });

    if (errorRP) {
      return new Response(JSON.stringify({ error: errorRP.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Obtener valores de RP aprobados
    const { data: valoresRP, error: errorValores } = await supabaseAdmin
      .from("portal_valores_cargue")
      .select(
        `
        id,
        documento_id,
        tercero_presupuestal,
        rubro_presupuestal,
        fuente_financiamiento,
        valor_bruto,
        valor_deducciones,
        valor_neto
      `
      )
      .in(
        "documento_id",
        rpAprobados.map((rp: Record<string, unknown>) => rp.id)
      );

    if (errorValores) {
      return new Response(JSON.stringify({ error: errorValores.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generar OP desde RP
    // Auto-generar NO_OP con formato: OP-{convocatoria_id}-{secuencial}
    const opList = valoresRP.map((v: Record<string, unknown>, index: number) => ({
      no_op: `OP-${documento.convocatoria_id || convocatoria_id}-${String(index + 1).padStart(4, "0")}`,
      rubro_presupuestal: v.rubro_presupuestal,
      fuente_financiamiento: v.fuente_financiamiento,
      tercero_presupuestal: v.tercero_presupuestal,
      valor: v.valor_neto,
      procedencia_rp: v.documento_id,
    }));

    // Generar CSV
    const headers = [
      "NO_OP",
      "RUBRO_PRESUPUESTAL",
      "FUENTE_FINANCIAMIENTO",
      "TERCERO_PRESUPUESTAL",
      "VALOR",
      "PROCEDENCIA_RP_ID",
    ];

    const csvContent = [
      headers.join(","),
      ...opList.map((op: Record<string, unknown>) =>
        [
          op.no_op,
          op.rubro_presupuestal,
          op.fuente_financiamiento,
          op.tercero_presupuestal,
          op.valor,
          op.procedencia_rp,
        ].join(",")
      ),
    ].join("\n");

    // Guardar archivo
    const fileName = `op-${documento_id}-${Date.now()}.csv`;
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
      comentario: "Archivo OP generado automáticamente desde RP aprobados",
      datos_cambio: {
        filas_generadas: opList.length,
        valor_total: opList.reduce(
          (sum: number, op: Record<string, unknown>) =>
            sum + (Number(op.valor) || 0),
          0
        ),
        rp_procesadas: rpAprobados.length,
        archivo_url: publicURL.publicUrl,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        documento_id,
        filas_generadas: opList.length,
        rp_procesadas: rpAprobados.length,
        valor_total: opList.reduce(
          (sum: number, op: Record<string, unknown>) =>
            sum + (Number(op.valor) || 0),
          0
        ),
        archivo_url: publicURL.publicUrl,
        archivo_nombre: fileName,
        mensaje: "Archivo OP generado automáticamente",
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
