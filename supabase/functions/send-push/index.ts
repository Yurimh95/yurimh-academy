// Yurimh Music Academy · Edge Function "send-push"
// La llama la base de datos (trigger notifications_push_trg) con { notification_id } cada vez que se crea
// una notificación para alguien que tiene un dispositivo suscrito. Envía el aviso a sus móviles/ordenadores.
//
// Seguridad:
//  · No lleva datos en la petición: solo el id. El texto se construye aquí, leyendo la base de datos.
//  · Cada notificación se "reclama" marcando pushed_at: aunque alguien llamara a esta URL, nunca se reenvía.
//  · Los mensajes privados NO incluyen su contenido en el aviso (solo "Nuevo mensaje de X").
//  · Secretos: VAPID_PRIVATE_KEY (Edge Function secret). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const VAPID_PUBLIC_KEY = "BEGkt5LzuehpdU19-afE_fSxxdST6mtXx-eCa9cjNTUsJFvrW6W-WAaAvgX-S3vQTQLYmLH-e4grFZYB7Nv6-rw";
const APP_URL = "https://yurimh95.github.io/yurimh-music-academy/";

const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
webpush.setVapidDetails(APP_URL, VAPID_PUBLIC_KEY, Deno.env.get("VAPID_PRIVATE_KEY") ?? "");

const EMOJI: Record<string, string> = { like: "👍🏼", love: "❤️", laugh: "😂", wow: "😮", sad: "😢", angry: "😡" };

function texts(kind: string, actor: string, extra: string | null, target: string | null): { title: string; body: string } {
  switch (kind) {
    case "board_post": return { title: "📣 Nuevo aviso", body: extra ?? "Tienes un aviso nuevo" };
    case "assignment": return target // sin target = varias escuchas asignadas de golpe (extra = sus títulos)
      ? { title: "🎧 Nueva escucha", body: extra ?? "Tienes una escucha nueva" }
      : { title: "🎧 Escuchas nuevas", body: extra ?? "Tienes escuchas nuevas" };
    case "dm": return { title: `💬 ${actor}`, body: extra ? `Ha reaccionado ${extra} a tu mensaje` : "Te ha enviado un mensaje" }; // extra = emoji de la reacción
    case "comment": return { title: `${actor} ha comentado tu publicación`, body: extra ?? "" };
    case "reaction": return { title: "Yurimh Music Academy", body: `${actor} ha reaccionado ${EMOJI[extra ?? ""] ?? ""} a tu publicación` };
    case "signup": return { title: "Nuevo alumno", body: `${extra ?? "Alguien"} se ha registrado y espera tu aprobación` };
    case "goal": return { title: "🏆 ¡Objetivo conseguido!", body: extra ?? "Has conseguido un objetivo nuevo" };
    case "listening_feedback": return { title: `🎧 ${actor} ha revisado tus respuestas`, body: extra ?? "Mira sus reacciones en Escucha analítica" }; // extra = título de la escucha
    case "account_deleted":return { title: "Cuenta borrada", body: `${extra ?? "Un alumno"} ha borrado su cuenta` };
    case "report": return { title: "Denuncia nueva", body: "Hay contenido denunciado para revisar" };
    case "mention_feed": return { title: `${actor} te ha mencionado`, body: extra ?? "" };
    case "mention_board": return { title: `📣 ${actor} te ha mencionado en un aviso`, body: extra ?? "" };
    case "mention_listening": return { title: `🎧 ${actor} te ha mencionado en una escucha`, body: extra ?? "" };
    case "lesson": return { title: "🎸 Recordatorio de clase", body: `Tienes clase ${extra ?? "hoy"}` };
    case "homework": return { title: "📝 Deberes nuevos", body: extra ?? "Tienes deberes nuevos para practicar" };
    case "classmate_request": return { title: "Solicitud de compañero", body: `${actor} te ha enviado una solicitud para ser compañeros` };
    case "classmate_accept": return { title: "Nuevo compañero", body: `${actor} ha aceptado tu solicitud. Ya sois compañeros` };
    default: return { title: "Yurimh Music Academy", body: "Tienes una novedad" };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });
  let id = "";
  try { id = String((await req.json()).notification_id ?? ""); } catch { /* cuerpo no válido */ }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Petición no válida", { status: 400 });

  // Reclamar la notificación (solo si aún no se ha enviado)
  const { data: n } = await supa.from("notifications").update({ pushed_at: new Date().toISOString() })
    .eq("id", id).is("pushed_at", null).select("*").maybeSingle();
  if (!n) return new Response("Nada que enviar", { status: 200 });

  let actor = "Alguien";
  if (n.actor_id) {
    const { data: p } = await supa.from("profiles").select("display_name, nickname").eq("id", n.actor_id).maybeSingle();
    if (p) actor = (p.nickname && p.nickname.trim()) || p.display_name;
  }
  const { title, body } = texts(n.kind, actor, n.extra, n.target_id);
  const payload = JSON.stringify({ title, body, tag: `${n.kind}-${n.target_id ?? n.id}`, url: `${APP_URL}?n=${n.id}` });

  const { data: subs } = await supa.from("push_subscriptions").select("*").eq("user_id", n.user_id);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await supa.from("push_subscriptions").delete().eq("id", s.id); // dispositivo dado de baja
      else console.error("push error", code);
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
