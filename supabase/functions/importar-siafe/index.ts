import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

interface SiafeLine {
  no_egreso: string;
  identificacion: string;
  nombre_beneficiario: string;
  valor_egreso: number;
  fecha_pago: string;
  referencia_banco: string;
  estado_pago: string;
  [key: string]: unknown;
}

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

    const userRole = user.user_metadata?.role;
    // Solo admin_pagos puede importar SIAFE
    if (userRole !== "admin_pagos") {
      return new Response(
        JSON.stringify({ error: "Only admin_pagos can import SIAFE" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const { documento_id, contenido_archivo } = await req.json();

    if (!documento_id || !contenido_archivo) {
      return new Response(
        JSON.stringify({
          error: "Missing documento_id or contenido_archivo",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Obtener documento SIAFE
    const { data: documento, error: errorDoc } = await supabaseAdmin
      .from("portal_documentos_cargue")
      .select("*")
      .eq("id", documento_id)
      .eq("tipo_documento", "siafe")
      .single();

    if (errorDoc || !documento) {
      return new Response(
        JSON.stringify({
          error: "Document not found or not of type 'siafe'",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parsear contenido CSV
    const lineas = contenido_archivo.trim().split("\n");
    if (lineas.length < 2) {
      return new Response(
        JSON.stringify({ error: "Archivo vacío o sin encabezados" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const encabezados = lineas[0].split(",").map((h: string) => h.trim());
    const registrosEncontrados: SiafeLine[] = [];
    const erroresValidacion: Record<string, unknown>[] = [];

    // Procesar cada línea
    for (let i = 1; i < lineas.length; i++) {
      const valores = lineas[i].split(",").map((v: string) => v.trim());
      if (valores.length !== encabezados.length) continue;

      const registro: SiafeLine = {} as SiafeLine;
      encabezados.forEach((h: string, idx: number) => {
        registro[h.toLowerCase()] = valores[idx];
      });

      // Validar campos requeridos
      if (!registro.no_egreso || !registro.identificacion) {
        erroresValidacion.push({
          fila: i + 1,
          tipo_error: "validacion_formato",
          mensaje: "NO_EGRESO o IDENTIFICACION vacíos",
        });
        continue;
      }

      // Validar que NO_EGRESO existe en OP
      const { data: opExistente } = await supabaseAdmin
        .from("portal_valores_cargue")
        .select("id")
        .ilike("id", `%${registro.no_egreso}%`)
        .limit(1);

      if (!opExistente || opExistente.length === 0) {
        erroresValidacion.push({
          fila: i + 1,
          tipo_error: "validacion_referencia",
          mensaje: `NO_EGRESO ${registro.no_egreso} no encontrado en OP`,
          no_egreso: registro.no_egreso,
        });
        continue;
      }

      // Validar valor
      const valor = parseFloat(String(registro.valor_egreso));
      if (isNaN(valor) || valor <= 0) {
        erroresValidacion.push({
          fila: i + 1,
          tipo_error: "validacion_rango",
          mensaje: "VALOR_EGRESO debe ser un número positivo",
          valor: registro.valor_egreso,
        });
        continue;
      }

      registrosEncontrados.push(registro);
    }

    // Si hay registros válidos, insertarlos en portal_valores_cargue con AUTO-LOOKUP
    let registrosInsertados = 0;
    if (registrosEncontrados.length > 0) {
      const dataParaInsertar = registrosEncontrados.map((r: SiafeLine) => ({
        documento_id,
        tercero_presupuestal: "", // AUTO-LOOKUP desde OP
        rubro_presupuestal: "", // AUTO-LOOKUP desde OP
        fuente_financiamiento: "", // AUTO-LOOKUP desde OP
        valor_bruto: Number(r.valor_egreso),
        valor_deducciones: 0,
        valor_neto: Number(r.valor_egreso),
        datos_adicionales: {
          no_egreso: r.no_egreso,
          identificacion: r.identificacion,
          nombre_beneficiario: r.nombre_beneficiario,
          fecha_pago: r.fecha_pago,
          referencia_banco: r.referencia_banco,
          estado_pago: r.estado_pago || "PROCESADO",
        },
      }));

      const { data: insertados, error: errorInsert } = await supabaseAdmin
        .from("portal_valores_cargue")
        .insert(dataParaInsertar)
        .select("id");

      if (!errorInsert && insertados) {
        registrosInsertados = insertados.length;
      }
    }

    // Registrar errores de validación si existen
    if (erroresValidacion.length > 0) {
      for (const error of erroresValidacion) {
        await supabaseAdmin.from("portal_cargue_validaciones").insert({
          documento_id,
          tipo_error: error.tipo_error,
          mensaje_error: error.mensaje,
          fila_numero: error.fila,
          columna_nombre: "no_egreso",
          valor_problematico: error.no_egreso || error.valor,
          resuelta: false,
        });
      }
    }

    // Registrar transición
    await supabaseAdmin.from("portal_transiciones_documento").insert({
      documento_id,
      estado_nuevo: documento.estado,
      rol_quien_transiciona: userRole,
      usuario_id: user.id,
      comentario: "Importación SIAFE completada",
      datos_cambio: {
        registros_encontrados: registrosEncontrados.length,
        registros_insertados: registrosInsertados,
        errores_validacion: erroresValidacion.length,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        documento_id,
        registros_encontrados: registrosEncontrados.length,
        registros_insertados: registrosInsertados,
        errores_validacion: erroresValidacion.length,
        errores: erroresValidacion.length > 0 ? erroresValidacion : [],
        mensaje:
          registrosInsertados > 0
            ? `Importación exitosa: ${registrosInsertados} registros insertados`
            : "Importación completada con errores de validación",
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
