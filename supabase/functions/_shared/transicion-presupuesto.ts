import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

export const corsPresupuesto = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function transicionarPresupuesto(
  url: string, key: string, authorization: string,
  documentoId: string, accion: string, comentario: string,
): Promise<Response> {
  const cliente = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await cliente.rpc("transicionar_documento_presupuesto", {
    p_documento_id: documentoId, p_accion: accion, p_comentario: comentario || "",
  });
  if (error) console.error("Error en transición de Presupuesto:", error);
  return new Response(JSON.stringify(error ? { error: error.message } : data), {
    status: error ? 400 : 200,
    headers: { "Content-Type": "application/json", ...corsPresupuesto },
  });
}
