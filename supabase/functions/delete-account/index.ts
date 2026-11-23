// Yurimh Music Academy · Edge Function "delete-account"
// Borra una cuenta para siempre: el usuario de Auth y, en cascada, todos sus datos.
//
// Quién puede:
//  · Un alumno, su propia cuenta (Ajustes → Borrar mi cuenta). Body: {}
//  · El profesor, un alumno ya archivado. Body: { user_id }
// Seguridad:
//  · verify_jwt true: sin sesión válida ni se llega aquí.
//  · El permiso lo decide la base de datos (rpc account_delete_check) con el token de quien llama;
//    esta función solo ejecuta el borrado con la clave de servicio, que nunca sale del servidor.
//  · La cuenta del profesor no se puede borrar desde aquí.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const apikey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const asUser = createClient(URL, apikey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const body = await req.json().catch(() => ({}));
    const p_id = typeof body?.user_id === "string" ? body.user_id : null;

    const { data: target, error } = await asUser.rpc("account_delete_check", { p_id });
    if (error || !target) return json({ error: error?.message ?? "No autorizado" }, 403);

    const { error: delErr } = await admin.auth.admin.deleteUser(target as string);
    if (delErr) {
      console.error("deleteUser:", delErr.message);
      return json({ error: "No se pudo borrar la cuenta" }, 500);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("delete-account:", (e as Error).message);
    return json({ error: "Error inesperado" }, 500);
  }
});
