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
    // Solo admin_contabilidad puede generar CONTABILIDAD
    if (userRole !== "admin_contabilidad") {
      return new Response(
        JSON.stringify({
          error: "Only admin_contabilidad can generate CONTABILIDAD",
        }),
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

    // Obtener documento CONTABILIDAD
    const { data: documento, error: errorDoc } = await supabaseAdmin
      .from("portal_documentos_cargue")
      .select("*")
      .eq("id", documento_id)
      .eq("tipo_documento", "contabilidad")
      .single();

    if (errorDoc || !documento) {
      return new Response(
        JSON.stringify({
          error: "Document not found or not of type 'contabilidad'",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Obtener OP aprobados de la misma convocatoria
    const { data: opAprobados, error: errorOP } = await supabaseAdmin
      .from("portal_documentos_cargue")
      .select("id, convocatoria_id")
      .eq("tipo_documento", "op")
      .eq("estado", "aprobado")
      .eq("convocatoria_id", documento.convocatoria_id || convocatoria_id)
      .order("created_at", { ascending: true });

    if (errorOP) {
      return new Response(JSON.stringify({ error: errorOP.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Obtener valores de OP aprobados y sus transiciones para extraer cuenta débito/crédito
    const { data: valoresOP, error: errorValores } = await supabaseAdmin
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
        opAprobados.map((op: Record<string, unknown>) => op.id)
      );

    if (errorValores) {
      return new Response(JSON.stringify({ error: errorValores.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generar registros CONTABILIDAD
    // Nota: Los datos_cambio de transiciones pueden contener cuenta_debito y cuenta_credito
    // Para este ejemplo, usaremos estructura genérica
    const contabilidadList = valoresOP.map(
      (v: Record<string, unknown>, index: number) => ({
        tipo: "OP",
        no_registro: `CT-${documento.convocatoria_id || convocatoria_id}-${String(index + 1).padStart(4, "0")}`,
        cuenta_debito: "240101", // Cuenta por defecto (pueden ser personalizadas por OP)
        cuenta_credito: "110101", // Cuenta por defecto
        tercero_presupuestal: v.tercero_presupuestal,
        concepto: `OP ${v.rubro_presupuestal}`,
        valor_debito: v.valor_neto,
        valor_credito: v.valor_neto,
        procedencia_op: v.documento_id,
      })
    );

    // Generar CSV
    const headers = [
      "TIPO",
      "NO_REGISTRO",
      "CUENTA_DEBITO",
      "CUENTA_CREDITO",
      "TERCERO_PRESUPUESTAL",
      "CONCEPTO",
      "VALOR_DEBITO",
      "VALOR_CREDITO",
      "PROCEDENCIA_OP_ID",
    ];

    const csvContent = [
      headers.join(","),
      ...contabilidadList.map((ct: Record<string, unknown>) =>
        [
          ct.tipo,
          ct.no_registro,
          ct.cuenta_debito,
          ct.cuenta_credito,
          ct.tercero_presupuestal,
          `"${ct.concepto}"`,
          ct.valor_debito,
          ct.valor_credito,
          ct.procedencia_op,
        ].join(",")
      ),
    ].join("\n");

    // Guardar archivo
    const fileName = `contabilidad-${documento_id}-${Date.now()}.csv`;
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
      comentario: "Archivo CONTABILIDAD generado desde OP aprobados",
      datos_cambio: {
        filas_generadas: contabilidadList.length,
        valor_total_debito: contabilidadList.reduce(
          (sum: number, ct: Record<string, unknown>) =>
            sum + (Number(ct.valor_debito) || 0),
          0
        ),
        valor_total_credito: contabilidadList.reduce(
          (sum: number, ct: Record<string, unknown>) =>
            sum + (Number(ct.valor_credito) || 0),
          0
        ),
        op_procesadas: opAprobados.length,
        archivo_url: publicURL.publicUrl,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        documento_id,
        filas_generadas: contabilidadList.length,
        op_procesadas: opAprobados.length,
        valor_total: contabilidadList.reduce(
          (sum: number, ct: Record<string, unknown>) =>
            sum + (Number(ct.valor_debito) || 0),
          0
        ),
        archivo_url: publicURL.publicUrl,
        archivo_nombre: fileName,
        mensaje: "Archivo CONTABILIDAD generado automáticamente",
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
