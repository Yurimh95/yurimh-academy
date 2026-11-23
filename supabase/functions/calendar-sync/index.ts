// Yurimh Music Academy · Edge Function "calendar-sync"
// Lee el calendario de clases de Google (dirección secreta en formato iCal) y lo copia en la tabla `lessons`.
// La llama pg_cron cada 15 minutos (y el botón "Sincronizar ahora" de la Agenda). También envía el
// recordatorio de clase al alumno 8 horas antes (crea una notificación `lesson`; el push sale solo).
//
// Seguridad:
//  · La dirección del calendario es un secreto (CALENDAR_ICS_URL, Edge Function secret). Nunca va al repo.
//  · Solo se guardan los eventos; el texto de la descripción no se guarda. Los alumnos solo leen sus clases (RLS).
//  · Es idempotente y tiene un freno: si se llamó hace menos de 60 s, no vuelve a leer Google.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { parseIcs, unesc, tzOffset, parseDt, toMs, expand, norm, two, type VEvent } from "./ics.ts";

const DEFAULT_TZ = "Europe/Madrid";
const REMIND_HOURS = 8;
const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });
  const icsUrl = Deno.env.get("CALENDAR_ICS_URL");
  const { data: st } = await supa.from("lessons_sync").select("*").eq("id", 1).maybeSingle();
  const now = Date.now();
  if (st?.last_run_at && now - new Date(st.last_run_at).getTime() < 60_000) return Response.json({ skipped: true });
  await supa.from("lessons_sync").upsert({ id: 1, last_run_at: new Date(now).toISOString() });
  if (!icsUrl) { await supa.from("lessons_sync").update({ last_error: "Falta la dirección del calendario (CALENDAR_ICS_URL)" }).eq("id", 1); return Response.json({ error: "sin calendario" }); }

  try {
    const res = await fetch(icsUrl, { headers: { "User-Agent": "calendar-sync" } });
    if (!res.ok) throw new Error(`Google respondió ${res.status}`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("La dirección no devuelve un calendario iCal");
    const calTz = (text.match(/^X-WR-TIMEZONE:(.+)$/m)?.[1] || DEFAULT_TZ).trim();

    // Ventana: desde 7 días antes de empezar el mes hasta 60 días adelante
    const d0 = new Date(now); const winStart = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1) - 7 * 86400000;
    const winEnd = now + 60 * 86400000;

    // Alumnos y cómo se llaman en el calendario
    const [{ data: studs }, { data: alias }] = await Promise.all([
      supa.from("profiles").select("id, display_name, nickname").eq("role", "student").eq("approved", true),
      supa.from("lessons_students").select("student_id, calendar_name"),
    ]);
    const names: { id: string; key: string }[] = [];
    for (const s of studs ?? []) {
      const a = (alias ?? []).find((x) => x.student_id === s.id)?.calendar_name;
      for (const n of a ? [a] : [s.display_name, s.nickname]) if (n && norm(n)) names.push({ id: s.id, key: norm(n) });
    }
    names.sort((a, b) => b.key.length - a.key.length); // el nombre más largo gana ("Ana María" antes que "Ana")
    const whoIs = (title: string) => { const t = ` ${norm(title)} `; return names.find((n) => t.includes(` ${n.key} `))?.id ?? null; };

    // Eventos → repeticiones; los cambios puntuales (RECURRENCE-ID) sustituyen a su repetición
    const events = parseIcs(text);
    const overrides = new Map<string, VEvent>(); const masters: VEvent[] = [];
    for (const e of events) {
      const rid = e["RECURRENCE-ID"]?.[0];
      if (rid) { const l = parseDt(rid, calTz); if (l) overrides.set(`${e.UID?.[0]?.value}|${toMs(l)}`, e); } else masters.push(e);
    }
    const rows: Record<string, unknown>[] = [];
    const addRow = (e: VEvent, key: string, startMs: number, durMs: number) => {
      if (e.STATUS?.[0]?.value === "CANCELLED") return;
      if (startMs + durMs < winStart || startMs > winEnd) return;
      const title = unesc(e.SUMMARY?.[0]?.value || "Clase").slice(0, 300);
      rows.push({ event_key: key, title, starts_at: new Date(startMs).toISOString(), ends_at: new Date(startMs + durMs).toISOString(), student_id: whoIs(title), synced_at: new Date(now).toISOString() });
    };
    for (const e of masters) {
      const s = parseDt(e.DTSTART?.[0], calTz); if (!s || s.allDay) continue; // los de todo el día no son clases
      const en = parseDt(e.DTEND?.[0], calTz);
      const dur = en ? toMs(en) - toMs(s) : 3600000;
      const ex = new Set<number>();
      for (const p of e.EXDATE ?? []) for (const v of p.value.split(",")) { const l = parseDt({ ...p, value: v }, calTz); if (l) ex.add(toMs(l)); }
      const uid = e.UID?.[0]?.value || crypto.randomUUID();
      for (const inst of expand(s, e.RRULE?.[0]?.value, winEnd)) {
        const ms = toMs(inst); if (ex.has(ms)) continue;
        const key = `${uid}|${ms}`, ov = overrides.get(key);
        if (ov) { const os = parseDt(ov.DTSTART?.[0], calTz), oe = parseDt(ov.DTEND?.[0], calTz); if (os) addRow(ov, key, toMs(os), oe ? toMs(oe) - toMs(os) : dur); overrides.delete(key); }
        else addRow(e, key, ms, dur);
      }
    }
    for (const [key, ov] of overrides) { const os = parseDt(ov.DTSTART?.[0], calTz), oe = parseDt(ov.DTEND?.[0], calTz); if (os && !os.allDay) addRow(ov, key, toMs(os), oe ? toMs(oe) - toMs(os) : 3600000); }

    // Guardar: actualizar/insertar y quitar de la ventana lo que ya no está en Google
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supa.from("lessons").upsert(rows.slice(i, i + 200), { onConflict: "event_key" });
      if (error) throw new Error("Guardando clases: " + error.message);
    }
    const keys = new Set(rows.map((r) => r.event_key as string));
    const { data: inWin } = await supa.from("lessons").select("id, event_key").gte("starts_at", new Date(winStart).toISOString()).lte("starts_at", new Date(winEnd).toISOString());
    const gone = (inWin ?? []).filter((r) => !keys.has(r.event_key)).map((r) => r.id);
    if (gone.length) await supa.from("lessons").delete().in("id", gone);

    // Recordatorios: clases que empiezan en las próximas 8 horas y aún sin avisar
    const { data: soon } = await supa.from("lessons").select("id, student_id, starts_at").is("reminded_at", null).not("student_id", "is", null)
      .gt("starts_at", new Date(now).toISOString()).lte("starts_at", new Date(now + REMIND_HOURS * 3600000).toISOString());
    let reminded = 0;
    for (const l of soon ?? []) {
      const { count } = await supa.from("homework_tasks").select("id", { count: "exact", head: true }).eq("student_id", l.student_id).is("done_at", null);
      const t = new Date(l.starts_at); const off = tzOffset(t.getTime(), calTz); const loc = new Date(t.getTime() + off);
      const hour = `${two(loc.getUTCHours())}:${two(loc.getUTCMinutes())}`;
      const nowLoc = new Date(now + tzOffset(now, calTz)); // ¿la clase es hoy o mañana (en hora de España)?
      const day = loc.getUTCDate() === nowLoc.getUTCDate() ? "hoy" : "mañana";
      const extra = `${day} a las ${hour}${count ? ` · ${count} deber${count === 1 ? "" : "es"} pendiente${count === 1 ? "" : "s"}` : ""}`;
      const { error } = await supa.from("notifications").insert({ user_id: l.student_id, kind: "lesson", target_id: l.id, extra });
      if (!error) { await supa.from("lessons").update({ reminded_at: new Date().toISOString() }).eq("id", l.id); reminded++; }
    }

    const unmatched = rows.filter((r) => !r.student_id).length;
    await supa.from("lessons_sync").update({ last_ok_at: new Date().toISOString(), last_error: null, events: rows.length, unmatched }).eq("id", 1);
    return Response.json({ events: rows.length, unmatched, removed: gone.length, reminded });
  } catch (e) {
    const msg = String((e as Error).message || e).slice(0, 300);
    await supa.from("lessons_sync").update({ last_error: msg }).eq("id", 1);
    return Response.json({ error: msg }, { status: 200 });
  }
});
