// Lectura de calendarios iCal (sin dependencias: se prueba también fuera de Supabase)
// ---------- iCal ----------
export type Prop = { name: string; params: Record<string, string>; value: string };
export type VEvent = Record<string, Prop[]>;
export function parseIcs(text: string): VEvent[] {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: VEvent[] = []; let cur: VEvent | null = null; let depth = 0;
  for (const raw of lines) {
    if (!raw) continue;
    if (raw === "BEGIN:VEVENT") { cur = {}; depth = 0; continue; }
    if (raw === "END:VEVENT") { if (cur) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    if (raw.startsWith("BEGIN:")) { depth++; continue; } // VALARM dentro del evento: se ignora
    if (raw.startsWith("END:")) { depth--; continue; }
    if (depth > 0) continue;
    const i = raw.indexOf(":"); if (i < 0) continue;
    const [name, ...ps] = raw.slice(0, i).split(";");
    const params: Record<string, string> = {};
    for (const p of ps) { const [k, v] = p.split("="); params[k.toUpperCase()] = (v || "").replace(/^"|"$/g, ""); }
    (cur[name.toUpperCase()] ||= []).push({ name: name.toUpperCase(), params, value: raw.slice(i + 1) });
  }
  return out;
}
export const unesc = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

// Hora local de una zona → instante UTC (respeta el cambio de hora)
export function tzOffset(ts: number, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ts));
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ts;
}
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = guess - tzOffset(guess, tz);
  const o2 = tzOffset(t, tz); if (guess - o2 !== t) t = guess - o2;
  return t;
}
export type Local = { y: number; mo: number; d: number; h: number; mi: number; s: number; tz: string; utc: boolean; allDay: boolean };
export function parseDt(p: Prop | undefined, calTz: string): Local | null {
  if (!p) return null;
  const m = p.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/); if (!m) return null;
  const allDay = !m[4];
  return { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0), tz: p.params.TZID || calTz, utc: !!m[7], allDay };
}
export const toMs = (l: Local) => l.utc ? Date.UTC(l.y, l.mo - 1, l.d, l.h, l.mi, l.s) : zonedToUtc(l.y, l.mo, l.d, l.h, l.mi, l.s, l.tz);
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Repeticiones (semanal / cada N semanas con días concretos, diaria y mensual simple) dentro de la ventana
export function expand(start: Local, rrule: string | undefined, winEnd: number): Local[] {
  if (!rrule) return [start];
  const r: Record<string, string> = {}; rrule.split(";").forEach((kv) => { const [k, v] = kv.split("="); r[k] = v; });
  const freq = r.FREQ, interval = Math.max(1, Number(r.INTERVAL || 1)), count = r.COUNT ? Number(r.COUNT) : Infinity;
  let until = Infinity;
  if (r.UNTIL) { const u = parseDt({ name: "UNTIL", params: {}, value: r.UNTIL }, start.tz); if (u) until = u.utc ? toMs(u) : toMs({ ...u, h: 23, mi: 59, s: 59 }); }
  const out: Local[] = []; let n = 0;
  const base = new Date(Date.UTC(start.y, start.mo - 1, start.d)); // fecha "de calendario" (sin zona)
  const push = (dt: Date) => {
    const l: Local = { ...start, y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
    const ms = toMs(l);
    if (ms < toMs(start)) return true;
    if (ms > until || n >= count || ms > winEnd) return false;
    n++; out.push(l); return true;
  };
  if (freq === "WEEKLY") {
    const by = (r.BYDAY ? r.BYDAY.split(",").map((x) => DAYS.indexOf(x.slice(-2))) : [base.getUTCDay()]).filter((x) => x >= 0).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const monday = new Date(base); monday.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7));
    for (let w = 0; w < 1000; w++) {
      for (const wd of by) {
        const dt = new Date(monday); dt.setUTCDate(monday.getUTCDate() + w * 7 * interval + ((wd + 6) % 7));
        if (!push(dt)) return out;
      }
    }
  } else if (freq === "DAILY") {
    for (let i = 0; i < 3000; i++) { const dt = new Date(base); dt.setUTCDate(base.getUTCDate() + i * interval); if (!push(dt)) return out; }
  } else if (freq === "MONTHLY" && !r.BYDAY) {
    for (let i = 0; i < 240; i++) { const dt = new Date(Date.UTC(start.y, start.mo - 1 + i * interval, start.d)); if (dt.getUTCDate() !== start.d) continue; if (!push(dt)) return out; }
  } else return [start]; // otras reglas raras: solo la primera
  return out;
}

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();
export const two = (n: number) => String(n).padStart(2, "0");

