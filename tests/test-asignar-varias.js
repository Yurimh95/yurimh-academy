// Escucha analítica → "Asignar varias": varias escuchas a varios alumnos de golpe, con un solo aviso por alumno
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.addInitScript(`window.__ME="t1"`);
  await page.goto(require('url').pathToFileURL(path.join(__dirname, 'test.html')).href);
  await page.waitForTimeout(400);
  const t = page;
  // Una tercera escucha que nadie tiene
  await t.evaluate(async () => {
    __DB.listening_items.push({ id: 'i3', title: 'Ágape (Álbum)', url: 'https://open.spotify.com/album/y', kind: 'album', brief: null, created_at: '2026-01-03' });
    await loadData(); S.section = 'listening'; render();
  });
  await t.waitForTimeout(200);
  ok(await t.locator('[data-action=assign-many]').count() === 1, 'El catálogo tiene el botón "Asignar varias"');
  await t.click('[data-action=assign-many]'); await t.waitForTimeout(200);
  ok(await t.locator('#assignManyForm input[name=item]').count() === 3, 'Salen las 3 escuchas');
  ok(await t.locator('#assignManyForm input[name=pick]').count() === 2, 'Salen solo los alumnos aprobados (2)');
  ok(await t.evaluate(() => { const f = $('#assignManyForm'); return f.querySelector('input[name=pick]').compareDocumentPosition(f.querySelector('input[name=item]')) & Node.DOCUMENT_POSITION_FOLLOWING; }), 'Primero se elige a quién y luego qué');
  ok((await t.$$eval('#assignManyForm .am-items .chk', ls => ls.map(l => l.dataset.amId))).join() === 'i3,i2,i1', 'Ordenadas como el catálogo (no por fecha de creación)');
  ok(!(await t.isVisible('#amShowAll')), 'Sin alumnos marcados no sale "Mostrar también las que ya tienen"');

  // Al marcar un alumno se esconden las que ya tiene
  await t.check('#assignManyForm input[name=pick][value=s1]'); await t.waitForTimeout(100);
  const vis = () => t.$$eval('#assignManyForm .am-items .chk', ls => ls.filter(l => !l.hidden).map(l => l.dataset.amId).sort().join());
  ok(await vis() === 'i2,i3', 'Con Marta marcada solo salen las que aún no tiene');
  await t.check('#amShowAll'); await t.waitForTimeout(100);
  ok(await vis() === 'i1,i2,i3' && (await t.textContent('[data-am-id=i1] [data-am-has]')) === 'Ya la tiene', '"Mostrar también" las enseña con la etiqueta "Ya la tiene"');
  await t.uncheck('#amShowAll');
  await t.check('#assignManyForm input[name=pick][value=s2]'); await t.waitForTimeout(100);
  ok(await vis() === 'i2,i3' && (await t.textContent('[data-am-id=i2] [data-am-has]')) === 'La tiene 1 de 2', 'Con dos alumnos: se esconde solo si la tienen todos y se dice cuántos la tienen');
  await t.uncheck('#assignManyForm input[name=pick][value=s1]'); await t.uncheck('#assignManyForm input[name=pick][value=s2]'); await t.waitForTimeout(100);
  ok(await vis() === 'i1,i2,i3', 'Sin alumnos marcados vuelven a salir todas');

  // Buscar sin tildes
  await t.fill('#amFilter', 'agape'); await t.waitForTimeout(100);
  ok(await t.locator('#assignManyForm .am-items .chk:visible').count() === 1, 'El buscador filtra (sin tildes)');
  await t.check('#assignManyForm input[name=item][value=i3]');
  await t.fill('#amFilter', 'kind'); await t.waitForTimeout(100);
  ok(await t.locator('#assignManyForm .am-items .chk:visible').count() === 2, 'Las ya marcadas no se esconden al buscar otra');
  await t.check('#assignManyForm input[name=item][value=i1]');
  await t.fill('#amFilter', ''); await t.waitForTimeout(100);
  await t.check('#assignManyForm input[name=item][value=i2]');
  ok((await t.textContent('[data-am-count]')).includes('3 marcadas'), 'Cuenta las marcadas');

  // Sin alumnos no deja
  await t.click('#assignManyForm button[type=submit]'); await t.waitForTimeout(150);
  ok(await t.locator('#assignManyForm').count() === 1, 'Sin alumnos marcados no asigna');
  await t.click('#assignManyForm [data-action=am-all]');
  await t.fill('#assignManyForm [name=due_date]', '2026-12-15');
  await t.fill('#assignManyForm [name=note]', 'Para la próxima clase');
  await t.screenshot({ path: path.join(__dirname, 'shots', 'asignar-varias-1.png') });
  const before = await t.evaluate(() => __DB.notifications.length);
  await t.click('#assignManyForm button[type=submit]'); await t.waitForTimeout(300);

  const as = await t.evaluate(() => __DB.listening_assignments.map(a => a.item_id + '|' + a.student_id + '|' + (a.due_date || '') + '|' + (a.note || '')));
  ok(as.length === 6, 'Se crean solo las que faltaban (3 nuevas + 3 que ya había)');
  ok(as.includes('i2|s1|2026-12-15|Para la próxima clase') && as.includes('i3|s1|2026-12-15|Para la próxima clase') && as.includes('i3|s2|2026-12-15|Para la próxima clase'), 'Las nuevas llevan la fecha y la nota comunes');
  ok(as.includes('i1|s1|2026-11-10|Solo Marta'), 'Las que ya existían no se tocan');
  ok(await t.locator('#assignManyForm').count() === 0, 'La ventana se cierra');

  const nt = await t.evaluate(b => __DB.notifications.slice(b).filter(n => n.kind === 'assignment'), before);
  const ms = nt.filter(n => n.user_id === 's1'), lu = nt.filter(n => n.user_id === 's2');
  ok(ms.length === 1 && ms[0].target_id === null && ms[0].extra === 'Cliffs of Dover, Ágape (Álbum)', 'Marta (2 nuevas) recibe UN solo aviso con los títulos');
  ok(lu.length === 1 && lu[0].target_id === 'i3', 'Luis (1 nueva) recibe el aviso normal de esa escucha');
  ok(await t.evaluate(n => notifText(n), ms[0]).then(x => x.startsWith('Escuchas nuevas asignadas')), 'Texto en plural en la campanita');

  // Todo asignado ya: avisa y no inserta
  await t.click('[data-action=assign-many]'); await t.waitForTimeout(200);
  for (const v of ['i1', 'i3']) await t.check(`#assignManyForm input[name=item][value=${v}]`);
  await t.click('#assignManyForm [data-action=am-all]');
  await t.click('#assignManyForm button[type=submit]'); await t.waitForTimeout(200);
  ok(await t.evaluate(() => __DB.listening_assignments.length) === 6 && await t.locator('#assignManyForm').count() === 1, 'Si ya las tienen todas, no inserta nada');

  // Móvil
  await t.setViewportSize({ width: 390, height: 800 }); await t.waitForTimeout(200);
  await t.screenshot({ path: path.join(__dirname, 'shots', 'asignar-varias-movil.png') });
  ok(await t.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'En el móvil no hay scroll horizontal');

  ok(errors.length === 0, 'Sin errores en consola' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n${fails} FALLOS` : '\nTodo OK');
  process.exit(fails ? 1 : 0);
})();
