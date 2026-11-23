// Yurimh Music Academy · Edge Function "media-info"
// La llama la app del profesor con { url } al guardar un elemento de Escucha analítica.
// Devuelve la duración: { duration_sec, track_count, partial } (cualquiera puede ser null).
// Spotify y YouTube no dejan leer esto desde el navegador (CORS), por eso se hace aquí.
//
// Cómo:
//  · Spotify: la página pública de "embed" (sin claves). Trae como mucho 100 temas: si hay 100,
//    la suma puede quedarse corta y se marca partial = true.
//  · YouTube: la página del vídeo (lengthSeconds) o de la playlist (suma de las primeras 100).
//
// Seguridad:
//  · verify_jwt = true: solo usuarios con sesión. No lee ni escribe la base de datos.
//  · Nunca se pide la URL que manda el cliente: se saca el id con una regex y se construye
//    la dirección de Spotify/YouTube aquí (así nadie puede usarla para pedir otras webs).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
type Info = { duration_sec: number | null; track_count: number | null; partial: boolean };
const EMPTY: Info = { duration_sec: null, track_count: null, partial: false };

// Si el servicio dice "demasiadas peticiones" (429) o falla (5xx), espera y reintenta hasta 2 veces.
// Los fallos se apuntan en los registros de la función (Supabase → Edge Functions → media-info → Logs).
async function get(url: string): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.8" },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) return await r.text();
      console.log(`media-info: ${r.status} en ${url}`);
      if (r.status !== 429 && r.status < 500) return null;
      const wait = Math.min(Number(r.headers.get("retry-after")) || 0, 4) * 1000 || 800 * (i + 1);
      await new Promise((ok) => setTimeout(ok, wait));
    } catch (e) {
      console.log(`media-info: error en ${url}: ${e}`);
    }
  }
  return null;
}

async function spotify(type: string, id: string): Promise<Info> {
  const html = await get(`https://open.spotify.com/embed/${type}/${id}`);
  const m = html?.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) { if (html) console.log(`media-info: Spotify ${type}/${id} sin datos (${html.length} caracteres)`); return EMPTY; }
  try {
    const e = JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity;
    if (!e) { console.log(`media-info: Spotify ${type}/${id} sin "entity"`); return EMPTY; }
    if (type === "track" || type === "episode") {
      return { duration_sec: e.duration > 0 ? Math.round(e.duration / 1000) : null, track_count: null, partial: false };
    }
    const list: { duration?: number }[] = Array.isArray(e.trackList) ? e.trackList : [];
    const ms = list.reduce((s, t) => s + (Number(t.duration) || 0), 0);
    if (!ms) console.log(`media-info: Spotify ${type}/${id} con ${list.length} temas pero sin duraciones`);
    return { duration_sec: ms > 0 ? Math.round(ms / 1000) : null, track_count: list.length || null, partial: list.length >= 100 };
  } catch { return EMPTY; }
}

const hms = (t: string) => t.split(":").reduce((s, p) => s * 60 + Number(p), 0);

async function youtube(video: string | null, list: string | null): Promise<Info> {
  if (list) {
    const html = await get(`https://www.youtube.com/playlist?list=${list}`);
    if (html) {
      const times = [...html.matchAll(/"thumbnailBadgeViewModel":\{(?:(?!"thumbnailBadgeViewModel").){0,400}?"text":"(\d{1,2}(?::\d{2}){1,2})"/g)].map((x) => hms(x[1]));
      const total = html.match(/"(\d[\d,.]*) videos"/);
      const n = total ? Number(total[1].replace(/[,.]/g, "")) : times.length;
      if (times.length) {
        const sec = times.reduce((a, b) => a + b, 0);
        return { duration_sec: sec, track_count: n || times.length, partial: n > times.length };
      }
    }
    if (!video) return EMPTY;
  }
  const html = await get(`https://www.youtube.com/watch?v=${video}`);
  const m = html?.match(/"lengthSeconds":"(\d+)"/);
  if (html && !m) console.log(`media-info: YouTube ${video} sin duración (${html.length} caracteres; ¿página de cookies o de "no eres un robot"?)`);
  return m && Number(m[1]) > 0 ? { duration_sec: Number(m[1]), track_count: null, partial: false } : EMPTY;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let url = "";
  try { url = String((await req.json())?.url ?? "").slice(0, 500); } catch { /* cuerpo vacío */ }
  let info = EMPTY;
  const sp = url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(?:embed\/)?(track|album|playlist|episode)\/([A-Za-z0-9]{22})/);
  const yv = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})/);
  const yl = /youtu\.?be/.test(url) ? url.match(/[?&]list=([A-Za-z0-9_-]{10,64})/) : null;
  if (sp) info = await spotify(sp[1], sp[2]);
  else if (yv || yl) info = await youtube(yv ? yv[1] : null, yl ? yl[1] : null);
  return new Response(JSON.stringify(info), { headers: { ...CORS, "Content-Type": "application/json" } });
});
