import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsPresupuesto } from "../_shared/transicion-presupuesto.ts";
import { terceroDesdeRegistro } from "../../../src/lib/tercerosCargue.js";
import { crearExcelTerceros } from "../../../src/lib/exportarTerceros.js";

serve(async (req: Request) => {
  const headers = { ...corsPresupuesto, "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers });
    const cliente = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: errorUsuario } = await cliente.auth.getUser();
    if (errorUsuario || !user) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers });
    const { documento_id } = await req.json();
    if (!documento_id) return new Response(JSON.stringify({ error: "Falta documento_id" }), { status: 400, headers });
    const { data, error } = await cliente.rpc("obtener_terceros_exportacion", { p_documento_id: documento_id });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers });
    if (!Array.isArray(data)) throw new Error("No se recibió una lista válida para exportar");
    const archivo = await crearExcelTerceros(data.map(terceroDesdeRegistro));
    return new Response(new Uint8Array(archivo), {
      headers: {
        ...corsPresupuesto,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="terceros.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exportando TERCEROS:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Error exportando terceros" }), { status: 500, headers });
  }
});
