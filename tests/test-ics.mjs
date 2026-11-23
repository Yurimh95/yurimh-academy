// Prueba del lector de calendarios (supabase/functions/calendar-sync/ics.ts) con un calendario de ejemplo.
// Node 22+ quita los tipos de TypeScript solo: node tests/test-ics.mjs
import { parseIcs, parseDt, toMs, expand, norm } from '../supabase/functions/calendar-sync/ics.ts';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const ICS = `BEGIN:VCALENDAR
X-WR-TIMEZONE:Europe/Madrid
BEGIN:VEVENT
UID:luis@google.com
DTSTART;TZID=Europe/Madrid:20261015T180000
DTEND;TZID=Europe/Madrid:20261015T190000
RRULE:FREQ=WEEKLY;BYDAY=TH
EXDATE;TZID=Europe/Madrid:20261105T180000
SUMMARY:Clase Luis
BEGIN:VALARM
TRIGGER:-PT8H
END:VALARM
END:VEVENT
BEGIN:VEVENT
UID:luis@google.com
RECURRENCE-ID;TZID=Europe/Madrid:20261112T180000
DTSTART;TZID=Europe/Madrid:20261113T170000
DTEND;TZID=Europe/Madrid:20261113T180000
SUMMARY:Clase Luis (cambiada al viernes)
END:VEVENT
BEGIN:VEVENT
UID:marta@google.com
DTSTART;TZID=Europe/Madrid:20261007T163000
DTEND;TZID=Europe/Madrid:20261007T173000
RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE;UNTIL=20261231T230000Z
SUMMARY:Guitarra -\\, Marta García
END:VEVENT
BEGIN:VEVENT
UID:fiesta@google.com
DTSTART;VALUE=DATE:20261208
SUMMARY:Festivo
END:VEVENT
END:VCALENDAR`;
const ev = parseIcs(ICS);
ok(ev.length === 4, 'Lee los 4 eventos (el aviso VALARM no se confunde con un evento)');
const luis = ev[0], s = parseDt(luis.DTSTART[0], 'Europe/Madrid');
const winEnd = Date.UTC(2026, 11, 31);
const inst = expand(s, luis.RRULE[0].value, winEnd);
const iso = l => new Date(toMs(l)).toISOString();
ok(iso(inst[0]) === '2026-10-15T16:00:00.000Z', 'Jueves 15/10 a las 18:00 en Madrid = 16:00 UTC (horario de verano)');
ok(inst.some(l => iso(l) === '2026-10-29T17:00:00.000Z'), 'Tras el cambio de hora sigue a las 18:00 en Madrid (17:00 UTC)');
ok(inst.every(l => new Date(Date.UTC(l.y, l.mo - 1, l.d)).getUTCDay() === 4), 'Todas las repeticiones caen en jueves');
const marta = ev[2], ms = parseDt(marta.DTSTART[0], 'Europe/Madrid');
const mi = expand(ms, marta.RRULE[0].value, winEnd);
const gaps = mi.slice(1).map((l, i) => (toMs(l) - toMs(mi[i])) / 86400000);
ok(gaps.every(g => Math.round(g) === 14), 'Clase cada dos semanas: 14 días entre clases (' + mi.length + ' clases)');
ok(mi.every(l => toMs(l) <= Date.UTC(2026, 11, 31, 23)), 'Respeta la fecha final (UNTIL)');
ok(parseDt(ev[3].DTSTART[0], 'Europe/Madrid').allDay === true, 'Detecta los eventos de todo el día (se ignoran: no son clases)');
const t = ` ${norm('Guitarra -, Marta García')} `;
ok(t.includes(' marta garcia ') && t.includes(' marta '), 'Reconoce el nombre aunque lleve tildes o signos');
ok(!` ${norm('Clase Martina')} `.includes(' marta '), 'No confunde "Martina" con "Marta" (palabra completa)');
console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
process.exit(fails ? 1 : 0);
