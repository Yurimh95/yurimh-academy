// Moderación (v2): cola de respuestas sin leer con "Mostrar más", filtro por alumno y revisión seguida (leído y siguiente)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  const open = async (me, viewport = { width: 1280, height: 900 }) => {
    const page = await (await browser.newContext({ viewport })).newPage();
    page.on('pageerror', e => errors.push(me + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(me + ' console: ' + m.text()); });
    page.on('dialog', d => d.accept());
    await page.addInitScript(`window.__ME=${JSON.stringify(me)};`);
    await page.goto(require('url').pathToFileURL(path.join(__dirname, 'test.html')).href);
    await page.waitForTimeout(400);
    return page;
  };
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'shots', n + '.png') });
  // 26 escuchas nuevas: Marta responde a 18 (13 seguidas "de golpe") y Luis a 8; 2 ya leídas
  const seed = async p => { await p.evaluate(async () => {
    const now = Date.now();
    for (let i = 0; i < 26; i++) {
      const sid = i < 18 ? 's1' : 's2', id = 'mx' + i;
      __DB.listening_items.push({ id: 'im' + i, title: 'Disco ' + String(i).padStart(2, '0'), url: 'https://open.spotify.com/album/m' + i, kind: 'album', created_at: '2026-11-01' });
      __DB.listening_assignments.push({ id, item_id: 'im' + i, student_id: sid, note: null, due_date: null, assigned_at: '2026-11-01', listened: true, listened_at: 'x',
        answers: { likes: 'Me gusta ' + i, learned: 'Aprendí ' + i }, updated_at: new Date(now - i * 60000).toISOString(), teacher_read_at: i >= 24 ? new Date(now).toISOString() : null });
    }
    await loadData(); S.section = 'mod'; render();
  }); await p.waitForTimeout(250); };

  const t = await open('t1');
  await seed(t);
  const stats = (await t.locator('.stat').allTextContents()).map(s => s.replace(/\s+/g, ' ').trim());
  ok(stats.length === 4 && stats[0].startsWith('25') && /sin leer/.test(stats[0]), 'Ficha "Respuestas sin leer": 24 nuevas + la de Luis del seed = 25 -> ' + stats[0]);
  ok(!(await t.textContent('.shell')).includes('Últimos avisos'), 'Ya no está "Últimos avisos"');
  ok(await t.locator('#modRev .mrow').count() === 20, 'La cola enseña 20 de golpe (antes solo 5)');
  ok(await t.locator('#modRev .mrow.unread').count() === 20, 'Todas marcadas como sin leer');
  ok((await t.textContent('#modRev [data-action=mod-more]')).includes('quedan 5'), 'Botón "Mostrar 5 más (quedan 5)"');
  await shot(t, 'mod-1');
  await t.click('#modRev [data-action=mod-more]'); await t.waitForTimeout(120);
  ok(await t.locator('#modRev .mrow').count() === 25 && await t.locator('#modRev [data-action=mod-more]').count() === 0, 'Mostrar más enseña las 25 y desaparece el botón');
  await t.click('#modRev .tab[data-t=all]'); await t.waitForTimeout(120);
  ok(await t.locator('#modRev .mrow').count() === 20 && (await t.textContent('#modRev .tab[data-t=all]')).includes('27'), 'Pestaña Todas: 27 (también las leídas), vuelve a 20 a la vista');
  await t.click('#modRev .tab[data-t=unread]'); await t.waitForTimeout(120);

  // Filtro por alumno
  await t.selectOption('#modStu', 's2'); await t.waitForTimeout(120);
  ok(await t.locator('#modRev .mrow').count() === 7 && (await t.locator('#modRev .mrow').allTextContents()).every(x => x.includes('Luis')), 'Filtro: solo Luis (6 nuevas sin leer + la del seed)');

  // Revisar seguidas
  await t.click('#modRev [data-action=mod-review].primary'); await t.waitForTimeout(150);
  ok(await t.locator('.modal .rv-who').count() === 1 && (await t.textContent('.modal .rv-who')).includes('Luis'), 'Se abre la revisión con Luis');
  ok((await t.textContent('.modal .rv-nav')).includes('1 de 7'), 'Indica la posición "1 de 7"');
  ok(await t.locator('.modal .qblock').count() === 6, 'Enseña las 6 preguntas');
  await shot(t, 'mod-2-revision');
  const first = await t.evaluate(() => S.modQueue[0]);
  await t.click('.modal [data-action=rv-read-next]'); await t.waitForTimeout(200);
  ok(await t.evaluate(id => !!__DB.listening_assignments.find(a => a.id === id).teacher_read_at, first), 'Leído y siguiente: guarda teacher_read_at');
  ok((await t.textContent('.modal .rv-nav')).includes('2 de 7'), 'Y pasa a la 2 de 7 sin cerrar');
  await t.click('.modal .rv-nav [data-action=mod-review]:has-text("Anterior")'); await t.waitForTimeout(150);
  ok((await t.textContent('.modal .rv-nav')).includes('1 de 7') && (await t.textContent('.modal .rv-nav')).includes('Siguiente'), 'Anterior vuelve a la ya leída, que ofrece "Siguiente"');
  for (let i = 0; i < 7; i++) { // marca todas: la última cierra la ventana
    const b = t.locator('.modal [data-action=rv-read-next]');
    if (await b.count()) await b.click(); else await t.click('.modal .rv-nav [data-action=mod-review]:has-text("Siguiente")');
    await t.waitForTimeout(150);
  }
  ok(await t.locator('.modal').count() === 0, 'Al terminar la cola se cierra la ventana');
  ok(await t.locator('#modRev .mod-empty').count() === 1, 'Luis al día: "Estás al día"');
  ok(await t.evaluate(() => __DB.listening_assignments.filter(a => a.student_id === 's2' && a.answers && Object.keys(a.answers).length && !a.teacher_read_at).length) === 0, 'Todas las de Luis quedan leídas en la base de datos');
  await t.selectOption('#modStu', ''); await t.waitForTimeout(120);
  ok((await t.locator('.stat').first().textContent()).includes('18'), 'La ficha baja a 18 sin leer');

  // Móvil
  const m = await open('t1', { width: 390, height: 844 });
  await seed(m);
  ok(await m.locator('#modRev .mrow').count() === 20, 'Móvil: también 20 filas');
  const over = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok(!over, 'Móvil: sin desbordar a lo ancho');
  await shot(m, 'mod-3-movil');
  await t.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await t.waitForTimeout(400); await shot(t, 'mod-4-oscuro');

  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'Sin errores en consola');
  console.log(fails ? `\n${fails} FALLOS` : '\nTodo OK');
  await browser.close();
  process.exit(fails || errors.length ? 1 : 0);
})();
