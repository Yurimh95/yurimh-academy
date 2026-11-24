// Yurimh Music Academy · Edge Function "media-cleanup"
// Borra del almacén "media" las fotos que ya no usa ninguna publicación, comentario,
// aviso o mensaje (contenido borrado por el profesor, cuentas borradas, subidas a medias).
//
// · La llama pg_cron cada noche (cron "media-cleanup", en schema.sql).
// · verify_jwt false: no recibe datos ni devuelve nada privado. Solo borra archivos
//   que la base de datos (rpc media_orphans) da por huérfanos desde hace más de 1 día,
//   así que llamarla de más no hace daño.
// · service_role no tiene permisos por defecto en este proyecto: media_orphans tiene su
//   grant execute to service_role en schema.sql.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve(async () => {
  let removed = 0;
  try {
    for (let round = 0; round < 10; round++) { // como mucho 10 × 500 archivos por noche
      const { data, error } = await admin.rpc("media_orphans", { p_limit: 500 });
      if (error) { console.error("media_orphans:", error.message); break; }
      const names = (data ?? []).map((x: unknown) => typeof x === "string" ? x : (x as Record<string, string>).media_orphans).filter(Boolean);
      if (!names.length) break;
      const { error: delErr } = await admin.storage.from("media").remove(names);
      if (delErr) { console.error("remove:", delErr.message); break; }
      removed += names.length;
      if (names.length < 500) break;
    }
  } catch (e) {
    console.error("media-cleanup:", (e as Error).message);
  }
  console.log(`media-cleanup: ${removed} archivos borrados`);
  return new Response(JSON.stringify({ removed }), { headers: { "Content-Type": "application/json" } });
});
