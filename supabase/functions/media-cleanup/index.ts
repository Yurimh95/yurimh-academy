// Yurimh Music Academy · Edge Function "media-cleanup"
// Borra de los almacenes "media" (fotos) y "video" los archivos que ya no usa nada:
// contenido borrado por el profesor, cuentas borradas, subidas a medias y vídeos caducados
// (media_expire, cada hora, borra de la base de datos las stories y vídeos caducados).
//
// · La llama pg_cron cada hora (cron "media-cleanup", en schema.sql).
// · verify_jwt false: no recibe datos ni devuelve nada privado. Solo borra archivos que la
//   base de datos (rpc storage_orphans) da por huérfanos (fotos: más de 1 día; vídeos: más
//   de 2 horas), así que llamarla de más no hace daño.
// · service_role no tiene permisos por defecto en este proyecto: storage_orphans tiene su
//   grant execute to service_role en schema.sql.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve(async () => {
  let removed = 0;
  try {
    for (let round = 0; round < 10; round++) { // como mucho 10 × 500 archivos por vez
      const { data, error } = await admin.rpc("storage_orphans", { p_limit: 500 });
      if (error) { console.error("storage_orphans:", error.message); break; }
      const rows = (data ?? []) as { bucket: string; name: string }[];
      if (!rows.length) break;
      let failed = false;
      for (const bucket of ["media", "video"]) {
        const names = rows.filter((r) => r.bucket === bucket).map((r) => r.name);
        if (!names.length) continue;
        const { error: delErr } = await admin.storage.from(bucket).remove(names);
        if (delErr) { console.error(`remove ${bucket}:`, delErr.message); failed = true; continue; }
        removed += names.length;
      }
      if (failed || rows.length < 500) break;
    }
  } catch (e) {
    console.error("media-cleanup:", (e as Error).message);
  }
  console.log(`media-cleanup: ${removed} archivos borrados`);
  return new Response(JSON.stringify({ removed }), { headers: { "Content-Type": "application/json" } });
});
