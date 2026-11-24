// Yurimh Music Academy · Edge Function "media-info"
// La llama la app del profesor con { url } al guardar un elemento de Escucha analítica.
// Devuelve la duración: { duration_sec, track_count, partial } (cualquiera puede ser null)
// y, en Spotify, el artista: { artist } ("" si es una playlist de muchos artistas; null si no se sabe).
// El artista de YouTube lo saca la propia app (oEmbed: nombre del canal).
// Spotify y YouTube no dejan leer esto desde el navegador (CORS), por eso se hace aquí.
//
// Cómo:
//  · Spotify: la página pública de "embed" (sin claves). Trae como mucho 100 temas: si hay 100,
//    la suma puede quedarse corta y se marca partial = true.
//  · YouTube: con la API oficial si existe el secret YOUTUBE_API_KEY (exacto, playlists hasta 500 vídeos).
//    Si no, la página del vídeo (lengthSeconds) o de la playlist (suma de las primeras 100).
//
// Seguridad:
//  · verify_jwt = true: solo usuarios con sesión. No lee ni escribe la base de datos.
//  · La clave de YouTube solo vive en el secret; nunca se devuelve ni se escribe en los registros.
//  · Nunca se pide la URL que manda el cliente: se saca el id con una regex y se construye
//    la dirección de Spotify/YouTube aquí (así nadie puede usarla para pedir otras webs).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
type Info = { duration_sec: number | null; track_count: number | null; partial: boolean; artist?: string | null };
const EMPTY: Info = { duration_sec: null, track_count: null, partial: false };

// Si el servicio dice "demasiadas peticiones" (429) o falla (5xx), espera y reintenta hasta 2 veces.
// Los fallos se apuntan en los registros de la función (Supabase → Edge Functions → media-info → Logs).
// label: lo que se apunta en los registros (para no escribir nunca la clave de YouTube)
async function get(url: string, label = url): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.8" },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) return await r.text();
      console.log(`media-info: ${r.status} en ${label}: ${(await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300)}`);
      if (r.status !== 429 && r.status < 500) return null;
      const wait = Math.min(Number(r.headers.get("retry-after")) || 0, 4) * 1000 || 800 * (i + 1);
      await new Promise((ok) => setTimeout(ok, wait));
    } catch (e) {
      console.log(`media-info: error en ${label}: ${e}`);
    }
  }
  return null;
}

// Artista de una lista: el que firma al menos el 60 % de los temas (primer nombre de cada tema); si no, "".
function mainArtist(list: { subtitle?: string }[]): string {
  const n: Record<string, number> = {};
  for (const t of list) { const a = String(t.subtitle ?? "").split(",")[0].trim(); if (a) n[a] = (n[a] ?? 0) + 1; }
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= list.length * 0.6 ? top[0] : "";
}
const cut = (x: unknown) => String(x ?? "").trim().slice(0, 200) || null;

async function spotify(type: string, id: string): Promise<Info> {
  const html = await get(`https://open.spotify.com/embed/${type}/${id}`);
  const m = html?.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) { if (html) console.log(`media-info: Spotify ${type}/${id} sin datos (${html.length} caracteres)`); return EMPTY; }
  try {
    const e = JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity;
    if (!e) { console.log(`media-info: Spotify ${type}/${id} sin "entity"`); return EMPTY; }
    if (type === "track" || type === "episode") {
      return { duration_sec: e.duration > 0 ? Math.round(e.duration / 1000) : null, track_count: null, partial: false, artist: cut(e.subtitle) };
    }
    const list: { duration?: number; subtitle?: string }[] = Array.isArray(e.trackList) ? e.trackList : [];
    // Página de artista: solo el nombre (sus "temas populares" no dicen nada de la duración de lo que se pide escuchar)
    if (type === "artist") return { ...EMPTY, artist: cut(e.name) };
    const ms = list.reduce((s, t) => s + (Number(t.duration) || 0), 0);
    if (!ms) console.log(`media-info: Spotify ${type}/${id} con ${list.length} temas pero sin duraciones`);
    // Álbum: el artista que firma el disco. Playlist: el dueño no sirve (sería Yuri); se mira quién toca los temas.
    const artist = type === "album" ? cut(e.subtitle) : list.length ? mainArtist(list) : null;
    return { duration_sec: ms > 0 ? Math.round(ms / 1000) : null, track_count: list.length || null, partial: list.length >= 100, artist };
  } catch { return EMPTY; }
}

const hms = (t: string) => t.split(":").reduce((s, p) => s * 60 + Number(p), 0);

// ---- YouTube con la API oficial (YouTube Data API v3) ----
// Clave en el secret YOUTUBE_API_KEY (Supabase → Edge Functions → Secrets). Cupo gratis: 10.000 unidades al día;
// cada consulta gasta 1 (un vídeo = 1; una playlist = 1 por cada 50 vídeos, ×2).
// Sin espacios ni comillas que se cuelen al pegarla en el panel
const YT_KEY = (Deno.env.get("YOUTUBE_API_KEY") ?? "").trim().replace(/^["']|["']$/g, "");
const YT_API = "https://www.googleapis.com/youtube/v3/";
// "PT1H2M3S" / "P1DT2H" → segundos
const isoSecs = (d: string) => {
  const m = d.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  return m ? (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + (+(m[4] ?? 0)) : 0;
};
async function ytApi(path: string, params: Record<string, string>): Promise<any | null> {
  const q = new URLSearchParams({ ...params, key: YT_KEY });
  const txt = await get(`${YT_API}${path}?${q}`, `${YT_API}${path}`);
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}
async function ytDurations(ids: string[]): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await ytApi("videos", { part: "contentDetails", id: ids.slice(i, i + 50).join(",") });
    for (const v of j?.items ?? []) out.push(isoSecs(v?.contentDetails?.duration ?? ""));
  }
  return out;
}
async function youtubeApi(video: string | null, list: string | null): Promise<Info | null> {
  if (list) {
    const ids: string[] = []; let page = "", total = 0;
    for (let n = 0; n < 10; n++) { // hasta 500 vídeos
      const j = await ytApi("playlistItems", { part: "contentDetails", playlistId: list, maxResults: "50", ...(page ? { pageToken: page } : {}) });
      if (!j) break;
      total = j.pageInfo?.totalResults ?? total;
      for (const it of j.items ?? []) if (it?.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
      page = j.nextPageToken ?? ""; if (!page) break;
    }
    if (ids.length) {
      const secs = await ytDurations(ids);
      const sum = secs.reduce((a, b) => a + b, 0);
      if (sum) return { duration_sec: sum, track_count: Math.max(total, ids.length), partial: total > ids.length };
    }
  }
  if (video) {
    const [s] = await ytDurations([video]);
    if (s) return { duration_sec: s, track_count: null, partial: false };
  }
  return null;
}

async function youtube(video: string | null, list: string | null): Promise<Info> {
  if (YT_KEY) {
    const r = await youtubeApi(video, list);
    if (r) return r;
  }
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
  const sp = url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(?:embed\/)?(track|album|playlist|episode|artist)\/([A-Za-z0-9]{22})/);
  const yv = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})/);
  const yl = /youtu\.?be/.test(url) ? url.match(/[?&]list=([A-Za-z0-9_-]{10,64})/) : null;
  if (sp) info = await spotify(sp[1], sp[2]);
  else if (yv || yl) info = await youtube(yv ? yv[1] : null, yl ? yl[1] : null);
  return new Response(JSON.stringify(info), { headers: { ...CORS, "Content-Type": "application/json" } });
});
