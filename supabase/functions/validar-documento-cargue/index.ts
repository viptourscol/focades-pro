import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { terceroDesdeRegistro, validacionesDocumentoTerceros } from "../../../src/lib/tercerosCargue.js";
import { validacionesDocumentoRP } from "../../../src/lib/rpCargue.js";

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

interface ValidacionError {
  tipo_error: string;
  mensaje_error: string;
  fila_numero?: number;
  columna_nombre?: string;
  valor_problematico?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
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

    const { documento_id, datos } = await req.json();

    if (!documento_id || !datos || !Array.isArray(datos)) {
      return new Response(
        JSON.stringify({
          error: "Missing required parameters: documento_id, datos (array of rows)",
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
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
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (["terceros", "rp"].includes(documento.tipo_documento)) {
      const cliente = createClient(supabaseUrl!, supabaseAnonKey!, {
        global: { headers: { Authorization: authHeader! } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const esRP = documento.tipo_documento === "rp";
      const { data: guardado, error: errorLectura } = await cliente.rpc(esRP ? "leer_rp_cargue" : "leer_terceros_cargue", { p_documento_id: documento_id });
      if (errorLectura || !guardado || !Array.isArray(guardado.filas)) return new Response(
        JSON.stringify({ error: errorLectura?.message || "Documento no accesible" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
      const errores = esRP ? validacionesDocumentoRP(guardado.filas, guardado.estado === "borrador" ? "educacion" : "completo")
        : validacionesDocumentoTerceros(guardado.filas.map(terceroDesdeRegistro));
      if (esRP && !guardado.terceros_id) errores.unshift({ tipo_error: "validacion_referencia", mensaje_error: "Debe vincular un documento TERCEROS aprobado." });
      return new Response(JSON.stringify({
        success: true, documento_id, filas_validadas: guardado.filas.length,
        errores_encontrados: errores.length, es_valido: errores.length === 0, errores,
      }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // Obtener plantilla
    const { data: plantilla, error: errorPlantilla } = await supabaseAdmin
      .from("portal_plantillas_cargue")
      .select("*")
      .eq("tipo_documento", documento.tipo_documento)
      .single();

    if (errorPlantilla || !plantilla) {
      return new Response(
        JSON.stringify({ error: "Template not found for this document type" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Array para almacenar errores
    const errores: ValidacionError[] = [];

    // Validar cada fila
    datos.forEach((fila: Record<string, unknown>, indice: number) => {
      const numeroFila = indice + 2; // +2 porque fila 1 es encabezado y comienza en 0

      // Validaciones por tipo de documento
      if (documento.tipo_documento === "rp") {
        // Validar Valor
        const valor = parseFloat(fila.valor as string);
        if (isNaN(valor) || valor < 0) {
          errores.push({
            tipo_error: "validacion_rango",
            mensaje_error: "Valor debe ser un número positivo",
            fila_numero: numeroFila,
            columna_nombre: "valor",
            valor_problematico: String(fila.valor),
          });
        }

        // Validar Tercero Presupuestal
        if (!fila.tercero_presupuestal) {
          errores.push({
            tipo_error: "validacion_referencia",
            mensaje_error: "Tercero Presupuestal es requerido",
            fila_numero: numeroFila,
            columna_nombre: "tercero_presupuestal",
          });
        }
      }

      if (documento.tipo_documento === "op") {
        // Validar No. OP
        if (!fila.no_op) {
          errores.push({
            tipo_error: "validacion_formato",
            mensaje_error: "No. OP es requerido",
            fila_numero: numeroFila,
            columna_nombre: "no_op",
          });
        }

        // Validar Valor
        const valor = parseFloat(fila.valor as string);
        if (isNaN(valor) || valor < 0) {
          errores.push({
            tipo_error: "validacion_rango",
            mensaje_error: "Valor debe ser un número positivo",
            fila_numero: numeroFila,
            columna_nombre: "valor",
          });
        }
      }

      if (documento.tipo_documento === "siafe") {
        // Validar No. Egreso
        if (!fila.no_egreso) {
          errores.push({
            tipo_error: "validacion_formato",
            mensaje_error: "No. Egreso es requerido",
            fila_numero: numeroFila,
            columna_nombre: "no_egreso",
          });
        }

        // Validar Identificación
        if (
          !fila.identificacion ||
          fila.identificacion.toString().length > 15
        ) {
          errores.push({
            tipo_error: "validacion_formato",
            mensaje_error: "Identificación inválida",
            fila_numero: numeroFila,
            columna_nombre: "identificacion",
          });
        }
      }
    });

    // Si hay errores, guardarlos en la BD
    if (errores.length > 0) {
      for (const error of errores) {
        await supabaseAdmin
          .from("portal_cargue_validaciones")
          .insert({
            documento_id,
            tipo_error: error.tipo_error,
            mensaje_error: error.mensaje_error,
            fila_numero: error.fila_numero,
            columna_nombre: error.columna_nombre,
            valor_problematico: error.valor_problematico,
            resuelta: false,
          });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        documento_id,
        filas_validadas: datos.length,
        errores_encontrados: errores.length,
        es_valido: errores.length === 0,
        errores: errores.length > 0 ? errores : [],
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
