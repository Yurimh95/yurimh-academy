// Escucha analítica: el profesor reacciona a cada respuesta del alumno y marca sus respuestas como leídas
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  const open = async (me, db, viewport = { width: 1000, height: 900 }) => {
    const page = await (await browser.newContext({ viewport })).newPage();
    page.on('pageerror', e => errors.push(me + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(me + ' console: ' + m.text()); });
    page.on('dialog', d => d.accept());
    await page.addInitScript(`window.__ME=${JSON.stringify(me)};${db ? `window.__DB_OVERRIDE=${JSON.stringify(db)};` : ''}`);
    await page.goto(require('url').pathToFileURL(path.join(__dirname, 'test.html')).href);
    await page.waitForTimeout(400);
    return page;
  };
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'shots', n + '.png') });

  // ---------- Profesor ----------
  const t = await open('t1');
  await t.evaluate(() => { S.section = 'listening'; render(); actions['open-item']({ dataset: { id: 'i1' } }); });
  await t.waitForTimeout(150);
  ok(await t.locator('.modal .arow[data-aid=a2] [data-readchip=a2] .chip').textContent() === 'Sin leer', 'Luis tiene respuestas: sale "Sin leer"');
  ok(await t.locator('.modal .arow[data-aid=a1] [data-readchip=a1] .chip').count() === 0, 'Marta no ha respondido: sin chip de leído');
  await t.click('.modal .arow[data-aid=a2] details summary');
  ok(await t.locator('.modal .arow[data-aid=a2] [data-arx-open]').count() === 1, 'Solo la respuesta con texto tiene botón de reaccionar');

  await t.click('.modal [data-arx-open=a2][data-q=likes]'); await t.waitForTimeout(80);
  ok(await t.locator('#dmRxBox [data-arx-pick]').count() === 6, 'Se abre la burbuja con los 6 emojis');
  ok(await t.locator('#dmRxBox [data-arx-more]').count() === 1, 'Y el "+" para el resto');
  await shot(t, 'resp-rx-1');
  await t.click('#dmRxBox [data-arx-pick="👍🏼"]'); await t.waitForTimeout(150);
  const rx = () => t.evaluate(() => __DB.listening_answer_reactions.map(r => r.assignment_id + ':' + r.question + ':' + r.emoji).join(','));
  ok(await rx() === 'a2:likes:👍🏼', 'Se guarda la reacción 👍🏼 en esa respuesta');
  ok(await t.locator('.modal [data-ansrx="a2|likes"] .msg-rx').textContent() === '👍🏼', 'Se ve bajo la respuesta');
  ok(await t.locator('#dmRxBox').count() === 0, 'La burbuja se cierra');

  // Cambiar con el selector completo
  await t.click('.modal [data-ansrx="a2|likes"] .msg-rx'); await t.waitForTimeout(80);
  await t.click('#dmRxBox [data-arx-more]'); await t.waitForTimeout(150);
  ok(await t.locator('#emojiBox').count() === 1, '"+" abre el selector completo');
  await t.evaluate(() => ex.onPick('🔥')); await t.waitForTimeout(150);
  ok(await rx() === 'a2:likes:🔥', 'Una sola reacción por respuesta: 🔥 sustituye a 👍🏼');
  await t.evaluate(() => emojiClose());

  // Pulsar la misma la quita
  await t.click('.modal [data-ansrx="a2|likes"] .msg-rx'); await t.waitForTimeout(80);
  ok(await t.locator('#dmRxBox').count() === 1, 'Pulsar la reacción abre la burbuja para cambiarla');
  await t.evaluate(() => { const b = document.createElement('button'); b.dataset.arxPick = '🔥'; document.getElementById('dmRxBox').appendChild(b); b.click(); });
  await t.waitForTimeout(150);
  ok(await rx() === '', 'Elegir la misma la quita');
  ok(await t.locator('.modal [data-ansrx="a2|likes"] .msg-rx').count() === 0, 'Y desaparece de la pantalla');

  // Volver a poner una y marcar como leído
  await t.click('.modal [data-arx-open=a2][data-q=likes]'); await t.waitForTimeout(80);
  await t.click('#dmRxBox [data-arx-pick="❤️"]'); await t.waitForTimeout(150);
  await t.click('.modal [data-ansread=a2] [data-action=ans-read]'); await t.waitForTimeout(200);
  ok(!!(await t.evaluate(() => __DB.listening_assignments.find(a => a.id === 'a2').teacher_read_at)), 'Marcar como leído guarda la fecha');
  ok((await t.locator('.modal [data-readchip=a2] .chip').textContent()).includes('Leído'), 'El chip pasa a "Leído"');
  ok(await t.locator('.modal [data-ansread=a2] [data-off]').count() === 1, 'Sale "Desmarcar"');
  const notifs = await t.evaluate(() => __DB.notifications.filter(n => n.user_id === 's2' && n.kind === 'listening_feedback'));
  ok(notifs.length === 1 && notifs[0].target_id === 'i1' && notifs[0].extra === 'Kind of Blue', 'Luis recibe UN solo aviso aunque haya reacciones y "leído"');
  ok(!(await t.evaluate(() => __DB.notifications.some(n => n.user_id === 's1' && n.kind === 'listening_feedback'))), 'Marta no recibe nada');
  await shot(t, 'resp-rx-2');

  // Desde la ficha del alumno también
  await t.evaluate(() => { closeModal(); S.section = 'students'; render(); studentDetailModal('s2'); }); await t.waitForTimeout(150);
  ok((await t.locator('.stu-page [data-readchip=a2] .chip').textContent()).includes('Leído'), 'En la ficha del alumno también sale "Leído"');
  ok(await t.locator('.stu-page [data-ansrx="a2|likes"] .msg-rx').textContent() === '❤️', 'Y la reacción');
  const db = await t.evaluate(() => JSON.parse(JSON.stringify(__DB)));

  // ---------- Luis (alumno) ----------
  const s = await open('s2', db);
  await s.evaluate(() => { S.section = 'listening'; render(); studentModal('a2'); }); await s.waitForTimeout(150);
  ok((await s.locator('.modal .ans-seen').textContent()).includes('ha leído tus respuestas'), 'El alumno ve que su profesor ha leído sus respuestas');
  ok(await s.locator('.modal [data-ansrx="a2|likes"] .msg-rx.static').textContent() === '❤️', 'Y la reacción bajo su respuesta, sin poder tocarla');
  ok(await s.locator('.modal [data-arx-open]').count() === 0, 'El alumno no tiene botón de reaccionar');
  await shot(s, 'resp-rx-3');
  const ins = await s.evaluate(async () => (await sb.from('listening_answer_reactions').insert({ assignment_id: 'a2', question: 'likes', user_id: 's2', emoji: '😂' })).error);
  ok(!!ins, 'RLS: el alumno no puede reaccionar');
  const forge = await s.evaluate(async () => (await sb.from('listening_assignments').update({ teacher_read_at: null }).eq('id', 'a2').select()).data[0].teacher_read_at);
  ok(!!forge, 'El alumno no puede quitar ni poner la marca de leído');
  await s.fill('.modal textarea[data-q=likes]', 'Me flipa el bajo, y la batería'); await s.waitForTimeout(1300);
  ok(!(await s.evaluate(() => __DB.listening_assignments.find(a => a.id === 'a2').teacher_read_at)), 'Si cambia sus respuestas, deja de estar leído');
  ok(await s.locator('.modal .ans-seen').count() === 0, 'Y el aviso de leído desaparece de su pantalla');
  const n = await s.evaluate(() => notifText(S.notifs.find(n => n.kind === 'listening_feedback')).replace(/<[^>]+>/g, ''));
  ok(n === 'Yuri ha revisado tus respuestas de Kind of Blue', 'Texto del aviso: ' + n);

  // ---------- Marta: no ve nada de Luis ----------
  const m = await open('s1', db);
  ok(await m.evaluate(() => S.ansRx.length) === 0, 'Marta no recibe las reacciones a las respuestas de Luis');

  // ---------- Tiempo real: el alumno ve llegar la reacción con la ventana abierta ----------
  await s.evaluate(() => __rtExternal('listening_answer_reactions', { assignment_id: 'a2', question: 'highlights', user_id: 't1', emoji: '😮' }));
  await s.waitForTimeout(150);
  ok(await s.locator('.modal [data-ansrx="a2|highlights"] .msg-rx').textContent() === '😮', 'En directo: la reacción aparece sin recargar');

  console.log(errors.length ? 'ERRORES DE CONSOLA/PÁGINA:\n' + errors.join('\n') : 'ERRORES DE CONSOLA/PÁGINA: ninguno');
  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
