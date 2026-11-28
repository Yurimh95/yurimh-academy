// Racha y rango de Escucha analítica (2026-11-28), deberes ligados a un objetivo y fechas límite en la Agenda.
// Marta (s1) lleva 2 días seguidos y 1.690 puntos (Plata I) y tiene una escucha pendiente para hoy.
// Al terminarla hoy (3 días, ×1,21) gana 30 puntos y asciende a Oro III: celebración y aviso al profesor.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const W = {}; new Function('window', fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8'))(W);
const day = (n, h = 12) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const ymd = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const FULL = { highlights: 'a', likes: 'b', dislikes: 'c', learned: 'd', would_use: 'e', would_never_use: 'f' };
const seed = JSON.parse(JSON.stringify(W.__DB_SEED));
seed.listening_items.push({ id: 'i3', title: 'Texas Flood', url: 'https://youtu.be/tf', kind: 'song', brief: null, created_at: '2026-01-03', duration_sec: 300 });
seed.profiles.find(x => x.id === 's1').rank_seen = 5; // ya vio Plata I
seed.listening_assignments = seed.listening_assignments.filter(a => a.student_id !== 's1').concat([
  { id: 'r1', item_id: 'i1', student_id: 's1', note: null, due_date: null, assigned_at: day(-3, 10), listened: true, listened_at: day(-2), answers: FULL, updated_at: day(-2), completed_at: day(-2), points: 900 },
  { id: 'r2', item_id: 'i2', student_id: 's1', note: null, due_date: null, assigned_at: day(-3, 10), listened: true, listened_at: day(-1), answers: FULL, updated_at: day(-1), completed_at: day(-1), points: 790 },
  { id: 'r3', item_id: 'i3', student_id: 's1', note: null, due_date: ymd(0), assigned_at: day(-3, 10), listened: false, listened_at: null, answers: {}, updated_at: day(-3), completed_at: null }
]);
seed.homework_tasks.find(h => h.id === 'h1').due_date = ymd(0);

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  async function open(me, db, vp = { width: 1400, height: 900 }) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('dialog', d => d.accept());
    await page.addInitScript(`window.__ME=${JSON.stringify(me)}`);
    await page.addInitScript(`window.__DB_OVERRIDE=${JSON.stringify(db)}`);
    await page.goto(require('url').pathToFileURL(path.join(__dirname, 'test.html')).href);
    await page.waitForTimeout(600);
    return page;
  }
  const goto = async (p, s) => { await p.click(`.nav button[data-s=${s}]:visible, .tabbar button[data-s=${s}]:visible`); await p.waitForTimeout(250); };
  const snapshot = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__DB)));
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'shots', n) });

  // ================= ALUMNA: racha y rango =================
  let p = await open('s1', seed);
  const st = await p.evaluate(() => streakOf('s1'));
  ok(st.cur === 2 && st.best === 2 && !st.todayDone && st.atRisk, `Racha calculada: 2 días, en riesgo (${JSON.stringify(st)})`);
  ok(await p.locator('.fy-chip', { hasText: '🔥 2 días' }).count() === 1, 'Inicio: chip "🔥 2 días" en Para ti');
  ok(await p.locator('.celebrate').count() === 0, 'Al entrar no hay celebración (ya vio su rango)');
  await goto(p, 'listening');
  const card = p.locator('[data-rank-card]');
  ok(await card.count() === 1, 'Escucha analítica: tarjeta de rango arriba');
  const ct = await card.innerText();
  ok(/Plata I\b/.test(ct) && /1690 puntos/.test(ct), 'La tarjeta dice "Plata I · 1690 puntos" (en español, 4 cifras van sin punto)');
  ok(/Te faltan 10 para Oro III/.test(ct), 'Progreso: "Te faltan 10 para Oro III"');
  ok(/2 días seguidos/.test(ct) && /×1,21/.test(ct), 'Racha: 2 días y multiplicador ×1,21 para la próxima');
  ok(/no perder la racha/.test(ct), 'Avisa de que hoy hay que terminar una');
  ok(await card.locator('svg.emb').count() === 1, 'La tarjeta lleva la medalla');
  await shot(p, 'rango-tarjeta.png');
  await card.locator('.rk-medal').click(); await p.waitForTimeout(300);
  ok(await p.locator('.modal .rk-rung').count() === 8, 'Todos los rangos a la vista (8)');
  ok(await p.locator('.modal .rk-rung.locked').count() === 6 && await p.locator('.modal .rk-rung.cur').count() === 1, 'Conseguidos Bronce y Plata; el resto bloqueados');
  ok(/Mito/.test(await p.locator('.modal').innerText()) && /35\.000/.test(await p.locator('.modal').innerText()), 'Se ve hasta dónde se llega (Mito, 35.000)');
  await shot(p, 'rango-lista.png');
  await p.click('.modal [data-action="close"]'); await p.waitForTimeout(200);

  // Termina la escucha pendiente (escuchada + 6 respuestas): 3 días de racha → ×1,21; (20 + 5 min) × 1,21 = 30 puntos
  await p.click('[data-action="open-assign"][data-id="r3"]'); await p.waitForTimeout(300);
  for (const k of Object.keys(FULL)) await p.fill(`[data-q="${k}"]`, 'Respuesta ' + k);
  await p.check('#chkListened');
  await p.waitForTimeout(1600);
  let db = await snapshot(p);
  const r3 = db.listening_assignments.find(a => a.id === 'r3');
  ok(!!r3.completed_at, 'La escucha queda terminada (completed_at lo pone la base de datos)');
  ok(r3.points === 30, `Puntos: (20 + 5) × (1 + 3/14) = 30 (${r3.points})`);
  ok(db.notifications.some(n => n.user_id === 't1' && n.kind === 'rank' && n.extra === 'Oro III' && n.actor_id === 's1'), 'Aviso al profesor: ha ascendido a Oro III');
  ok(await p.locator('.celebrate').count() === 0, 'La celebración espera a que se cierre la ventana de la escucha');
  await p.click('.modal [data-action="close"]'); await p.waitForTimeout(700);
  ok(await p.locator('.celebrate svg.emb').count() === 1, 'Celebración con la medalla al cerrar la ventana');
  ok(/ascendido a Oro III/.test(await p.locator('.celebrate').innerText()), 'Celebración: "¡Has ascendido a Oro III!"');
  await shot(p, 'rango-celebracion.png');
  await p.click('.celebrate [data-action="close"]'); await p.waitForTimeout(300);
  db = await snapshot(p);
  ok(db.profiles.find(x => x.id === 's1').rank_seen === 6, 'El rango queda visto (rank_seen = 6)');
  const ct2 = await p.locator('[data-rank-card]').innerText();
  ok(/Oro III/.test(ct2) && /3 días seguidos/.test(ct2) && /Hoy ya has sumado/.test(ct2), 'Tarjeta: Oro III, 3 días y "hoy ya has sumado"');

  // Desmarcar y volver a marcar no cambia la fecha ni los puntos; el alumno no puede inventárselos
  const again = await p.evaluate(async () => {
    await sb.from('listening_assignments').update({ listened: false }).eq('id', 'r3');
    const { data } = await sb.from('listening_assignments').update({ listened: true }).eq('id', 'r3').select();
    return data[0];
  });
  ok(again.completed_at === r3.completed_at && again.points === 30, 'Desmarcar y volver a marcar no cambia completed_at ni los puntos');
  const forge = await p.evaluate(async () => (await sb.from('listening_assignments').update({ completed_at: '2020-01-01T00:00:00Z', points: 99999 }).eq('id', 'r1').select()).data[0]);
  ok(forge.completed_at !== '2020-01-01T00:00:00Z' && forge.points === 900, 'El alumno no puede inventarse completed_at ni puntos');

  // Perfil: su medalla (pública)
  await goto(p, 'profile');
  ok(await p.locator('#rankPanel svg.emb').count() === 1 && /Oro III/.test(await p.locator('#rankPanel').innerText()), 'Perfil: bloque "Tu rango" con la medalla');
  ok(/Lo ven tus compañeros/.test(await p.locator('#rankPanel').innerText()), 'Perfil: avisa de que la medalla es pública');
  await shot(p, 'rango-perfil.png');

  // Reglas: un día con algo pendiente y nada terminado la rompe; sin nada pendiente no se toca
  const rules = await p.evaluate(({ d }) => {
    const keep = S.assigns; const mk = (assigned, done) => ({ student_id: 'zz', assigned_at: assigned, completed_at: done });
    S.assigns = [mk(d[6], d[5]), mk(d[6], d[4]), mk(d[6], null), mk(d[6], d[1])]; // pendiente el día -3, -2: se rompe
    const a = streakOf('zz');
    S.assigns = [mk(d[6], d[5]), mk(d[6], d[4]), mk(d[1], d[0])];             // sin nada pendiente entre medias: congelada
    const b = streakOf('zz');
    S.assigns = keep; return [a, b];
  }, { d: [0, 1, 2, 3, 4, 5, 6].map(n => day(-n)) });
  ok(rules[0].cur === 1 && rules[0].best === 2, `Un día con algo pendiente y sin terminar nada rompe la racha (${JSON.stringify(rules[0])})`);
  ok(rules[1].cur === 3 && !rules[1].atRisk, `Días sin nada pendiente no la rompen (${JSON.stringify(rules[1])})`);
  const mults = await p.evaluate(() => [multTxt(nextMult({ cur: 0, todayDone: false })), multTxt(nextMult({ cur: 13, todayDone: false })), multTxt(nextMult({ cur: 40, todayDone: true })), rankOf(35000).name, rankOf(34999).name, rankOf(0).name]);
  ok(JSON.stringify(mults) === JSON.stringify(['×1,07', '×2', '×2', 'Mito', 'Leyenda I', 'Bronce III']), `Multiplicador y rangos (${mults})`);
  const afterStudent = await snapshot(p);

  // ================= OTRA ALUMNA: lo público y lo privado =================
  let q = await open('s2', afterStudent);
  const pub = await q.evaluate(async () => (await sb.rpc('get_listening_rank', { p_user: 's1' })).data);
  ok(pub.length === 1 && pub[0].points === 1720 && pub[0].best_days === 3, `Luis ve la medalla y el récord de Marta (${JSON.stringify(pub)})`);
  const peek = await q.evaluate(async () => (await sb.from('listening_assignments').select('*').eq('student_id', 's1')).data.length);
  ok(peek === 0, 'Luis no ve las escuchas (ni la racha de hoy) de Marta');
  await q.evaluate(() => profileModal('s1')); await q.waitForTimeout(500);
  ok(await q.locator('.modal .pf-rank svg.emb').count() === 1 && /Oro III/.test(await q.locator('.modal .pf-rank').innerText()), 'Perfil de Marta: su medalla Oro III');
  await shot(q, 'rango-perfil-ajeno.png');
  await q.context().close();

  // ================= PROFESOR =================
  let t = await open('t1', afterStudent);
  ok(await t.evaluate(() => /ascendido a <b>Oro III/.test(notifText(S.notifs.find(n => n.kind === 'rank') || {}))), 'Campanita: "Marta ha ascendido a Oro III"');
  await t.evaluate(() => studentDetailModal('s1')); await t.waitForTimeout(300);
  const ficha = await t.locator('.modal').innerText();
  ok(/Rango y racha/.test(ficha) && /Oro III/.test(ficha) && /3 días seguidos/.test(ficha), 'Ficha: rango Oro III y racha de 3 días');
  await t.click('.modal [data-action="close"]'); await t.waitForTimeout(200);

  // Agenda: fechas límite de deberes y escuchas en su día
  await goto(t, 'agenda');
  ok(await t.locator('.cal-dues').count() === 1, 'Agenda: fila de fechas límite');
  ok(await t.locator('.cal-due.hw', { hasText: 'Pentatónica' }).count() === 1, 'Agenda: deber de Marta para hoy');
  ok(await t.locator('.cal-due.ls', { hasText: 'Texas Flood' }).count() === 0, 'Agenda: la escucha ya terminada no sale');
  await shot(t, 'racha-agenda.png');
  await t.click('.cal-due.hw'); await t.waitForTimeout(250);
  ok(await t.locator('.modal .adue-row', { hasText: 'Marta' }).count() === 1, 'Agenda: al pulsar sale la lista del día');
  await t.click('.modal .adue-row'); await t.waitForTimeout(250);
  ok(await t.locator('.modal [data-sdm-hw="s1"]').count() === 1, 'Agenda: desde la lista se abre la ficha');
  await t.click('.modal [data-action="close"]'); await t.waitForTimeout(200);

  // Deberes con objetivo
  await goto(t, 'homework');
  await t.click('.sec-head [data-action="hw-new"]'); await t.waitForTimeout(250);
  ok(await t.locator('#hwForm select[name=goal_id]').count() === 1, 'Nuevos deberes: campo "Le acerca al objetivo"');
  await t.check('#hwForm input[name=pick][value=s1]');
  ok(await t.locator('#hwForm select[name=goal_id] option[value=g5]').count() === 1, 'Con un alumno salen sus objetivos personales');
  await t.check('#hwForm input[name=pick][value=s2]');
  ok(await t.locator('#hwForm select[name=goal_id] option[value=g5]').count() === 0, 'Con dos alumnos, solo la lista general');
  await t.uncheck('#hwForm input[name=pick][value=s2]');
  await t.selectOption('#hwForm select[name=goal_id]', 'g5');
  await t.fill('#hwForm input[name=title]', 'Rasgueo de Wonderwall');
  await t.click('#hwForm button[type=submit]'); await t.waitForTimeout(400);
  let tdb = await snapshot(t);
  const hw = tdb.homework_tasks.find(h => h.title === 'Rasgueo de Wonderwall');
  ok(hw && hw.goal_id === 'g5' && hw.student_id === 's1', 'Deber guardado con el objetivo g5');
  ok(await t.locator('.hw .goalchip', { hasText: 'Wonderwall entera' }).count() >= 1, 'El deber muestra el objetivo');
  const badGoal = await t.evaluate(async () => (await sb.from('homework_tasks').insert({ student_id: 's2', title: 'x', goal_id: 'g5' })).error);
  ok(!!badGoal, 'No se puede ligar un deber al objetivo personal de otro alumno');
  // Copiar a Luis: el objetivo personal de Marta no viaja
  await t.evaluate(id => hwCopyModal('s1', id), hw.id); await t.waitForTimeout(250);
  await t.check('#hwCopyForm input[name=pick][value=s2]');
  await t.click('#hwCopyForm button[type=submit]'); await t.waitForTimeout(400);
  tdb = await snapshot(t);
  ok(tdb.homework_tasks.some(h => h.student_id === 's2' && h.title === 'Rasgueo de Wonderwall' && !h.goal_id), 'Al copiar, el objetivo personal no se copia');
  await t.context().close();

  // ================= ALUMNA: marca el deber =================
  p = await open('s1', tdb);
  await goto(p, 'homework');
  ok(await p.locator('.hw .goalchip', { hasText: 'Wonderwall entera' }).count() === 1, 'La alumna ve a qué objetivo le acerca');
  const forgeG = await p.evaluate(async id => (await sb.from('homework_tasks').update({ goal_id: 'g1' }).eq('id', id).select()).error, hw.id);
  ok(!!forgeG, 'La alumna no puede cambiar el objetivo');
  await p.click(`[data-action="hw-toggle"][data-id="${hw.id}"]`); await p.waitForTimeout(400);
  const msg = p.locator('.celebrate');
  ok(await msg.count() === 1 && /te acerca a tu objetivo/.test(await msg.innerText()) && /Tocar Wonderwall entera/.test(await msg.innerText()), 'Al marcarlo: "te acerca a tu objetivo: Tocar Wonderwall entera"');
  await shot(p, 'deber-objetivo.png');
  await p.click('[data-action="hw-goal-see"]'); await p.waitForTimeout(300);
  ok(await p.locator('#goalsPanel').count() === 1 && await p.locator('.modal').count() === 0, '"Ver mis objetivos" lleva al Perfil');
  // Un deber sin objetivo sigue con el aviso pequeño de siempre
  await goto(p, 'homework');
  await p.click('[data-action="hw-toggle"][data-id="h2"]'); await p.waitForTimeout(300);
  ok(await p.locator('.celebrate').count() === 0, 'Sin objetivo no sale el mensaje');

  // Móvil: tarjeta de racha y Agenda sin desbordar
  const m = await open('s1', afterStudent, { width: 390, height: 800 });
  await goto(m, 'listening');
  const over = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok(!over, 'Móvil: sin scroll lateral en Escucha analítica');
  await shot(m, 'racha-movil.png');

  ok(!errors.length, 'Sin errores de JS' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
  process.exit(fails ? 1 : 0);
})();
