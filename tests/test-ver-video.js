// Vídeo para ver: el profesor marca una escucha; el alumno ve la etiqueta "🎬 Para ver" y un aviso cada vez que abre el enlace
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  const open = async (me, viewport = { width: 1000, height: 900 }) => {
    const ctx = await browser.newContext({ viewport });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(me + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(me + ' console: ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.addInitScript(`window.__ME="${me}"`);
    await p.goto(require('url').pathToFileURL(path.join(__dirname, 'test.html')).href);
    await p.waitForTimeout(400);
    return { ctx, p };
  };
  const box = p => p.locator('#watchBox').count();

  /* ---------- Profesor ---------- */
  const { p: t } = await open('t1');
  await t.evaluate(() => { S.section = 'listening'; render(); });
  await t.waitForTimeout(150);
  ok(await t.locator('.track .wtag').count() === 0, 'Por defecto ninguna escucha lleva la etiqueta');
  await t.evaluate(() => itemFormModal('i1')); await t.waitForTimeout(100);
  ok(await t.locator('#itemForm [name=watch_video]').count() === 1, 'El formulario tiene la casilla "Vídeo para ver"');
  ok(!(await t.isChecked('#itemForm [name=watch_video]')), 'Viene desmarcada');
  await t.check('#itemForm [name=watch_video]');
  await t.screenshot({ path: path.join(__dirname, 'shots', 'ver-video-1-form.png') });
  await t.click('#itemForm button[type=submit]'); await t.waitForTimeout(400);
  ok(await t.evaluate(() => __DB.listening_items.find(i => i.id === 'i1').watch_video) === true, 'Se guarda watch_video = true');
  await t.evaluate(() => { closeModal(); S.section = 'listening'; render(); }); await t.waitForTimeout(150);
  ok(await t.locator('.track[data-id=i1] .wtag').count() === 1, 'En el catálogo sale la etiqueta "Para ver"');
  ok(await t.locator('.track[data-id=i2] .wtag').count() === 0, 'La otra escucha no la lleva');
  // Al profesor también le sale el aviso
  await t.click('.track[data-id=i1] .playbtn'); await t.waitForTimeout(100);
  ok(await box(t) === 1, 'Al profesor también le sale el aviso al pulsar ▶');
  ok(await t.locator('.modal').count() === 0, 'Pulsar ▶ no abre la ventana de la escucha (profesor)');
  await t.click('#watchBox [data-watch-close]'); await t.waitForTimeout(100);
  await t.evaluate(() => itemModal('i1')); await t.waitForTimeout(100);
  ok(await t.locator('.modal .wtag').count() === 1, 'En la ventana de la escucha del profesor sale la etiqueta');
  ok(await t.locator('.modal a[data-watch]').textContent() === 'Ver vídeo ↗', 'Su botón dice "Ver vídeo"');
  await t.click('.modal a[data-watch]'); await t.waitForTimeout(100);
  ok(await box(t) === 1, 'Desde su ventana también le sale el aviso');
  await t.keyboard.press('Escape'); await t.waitForTimeout(100);
  await t.evaluate(() => closeModal());
  // Desmarcar
  await t.evaluate(() => itemFormModal('i1')); await t.waitForTimeout(100);
  ok(await t.isChecked('#itemForm [name=watch_video]'), 'Al editar, la casilla sale marcada');
  await t.uncheck('#itemForm [name=watch_video]');
  await t.click('#itemForm button[type=submit]'); await t.waitForTimeout(400);
  ok(await t.evaluate(() => __DB.listening_items.find(i => i.id === 'i1').watch_video) === false, 'Se puede volver a desactivar');

  // Vista de alumno: sí sale el aviso
  await t.evaluate(() => { __DB.listening_items.find(i => i.id === 'i1').watch_video = true; S.items.find(i => i.id === 'i1').watch_video = true; closeModal(); });
  await t.evaluate(() => enterPreview()); await t.waitForTimeout(300);
  await t.evaluate(() => { S.section = 'listening'; S.filter = 'all'; render(); }); await t.waitForTimeout(150);
  const pv = await t.locator('a.playbtn[data-watch]').count();
  ok(pv >= 1, 'En "Ver como alumno" el enlace lleva el aviso');
  if (pv) { await t.locator('a.playbtn[data-watch]').first().click(); await t.waitForTimeout(100); }
  ok(await box(t) === 1, 'En "Ver como alumno" sale el aviso');

  /* ---------- Alumna ---------- */
  const { ctx: sc, p: s } = await open('s1');
  await s.evaluate(() => { S.assigns.forEach(a => { if (a.item_id === 'i1') a.item.watch_video = true; }); S.section = 'listening'; S.filter = 'all'; render(); });
  await s.waitForTimeout(150);
  ok(await s.locator('.track .wtag').count() === 1, 'La alumna ve la etiqueta en su lista');
  await s.screenshot({ path: path.join(__dirname, 'shots', 'ver-video-2-lista.png') });
  await s.click('.track .playbtn'); await s.waitForTimeout(150);
  ok(await box(s) === 1, 'Al pulsar ▶ sale el aviso');
  ok(await s.locator('.modal').count() === 0, 'Pulsar ▶ no abre la ventana de la escucha');
  ok((await s.locator('#watchBox [data-watch-go]').textContent()).trim() === 'Entendido, abrir vídeo', 'El botón dice "Entendido, abrir vídeo"');
  ok(/4K/.test(await s.locator('#watchBox').textContent()) && /auriculares/.test(await s.locator('#watchBox').textContent()), 'El aviso habla de 4K y auriculares');
  await s.screenshot({ path: path.join(__dirname, 'shots', 'ver-video-3-aviso.png') });
  await s.click('#watchBox [data-watch-close]'); await s.waitForTimeout(100);
  ok(await box(s) === 0, '"Ahora no" lo cierra');

  // En la ventana de la escucha
  await s.evaluate(() => studentModal('a1')); await s.waitForTimeout(150);
  ok(await s.locator('.modal .wtag').count() === 1, 'En la ventana sale la etiqueta antes de abrir el enlace');
  ok(await s.locator('.modal a[data-watch]').textContent() === 'Ver vídeo ↗', 'El botón dice "Ver vídeo"');
  await s.click('.modal a[data-watch]'); await s.waitForTimeout(100);
  ok(await box(s) === 1, 'Desde la ventana también sale el aviso');
  await s.keyboard.press('Escape'); await s.waitForTimeout(100);
  ok(await box(s) === 0 && await s.locator('.modal').count() === 1, 'Esc cierra el aviso pero no la ventana');
  await s.click('.modal a[data-watch]'); await s.waitForTimeout(100);
  await s.mouse.click(5, 5); await s.waitForTimeout(100);
  ok(await box(s) === 0 && await s.locator('.modal').count() === 1, 'Tocar fuera cierra el aviso pero no la ventana');
  await s.click('.modal a[data-watch]'); await s.waitForTimeout(100);
  await s.evaluate(() => history.back()); await s.waitForTimeout(250);
  ok(await box(s) === 0 && await s.locator('.modal').count() === 1, 'Atrás cierra el aviso pero no la ventana');
  // Cada vez: vuelve a salir, y "Entendido" abre el enlace
  await s.click('.modal a[data-watch]'); await s.waitForTimeout(100);
  ok(await box(s) === 1, 'El aviso sale cada vez');
  await s.evaluate(() => { document.querySelector('#watchBox [data-watch-go]').href = 'about:blank'; });
  const [tab] = await Promise.all([sc.waitForEvent('page', { timeout: 3000 }).catch(() => null), s.click('#watchBox [data-watch-go]')]);
  await s.waitForTimeout(150);
  ok(!!tab, '"Entendido, abrir vídeo" abre el enlace en otra pestaña');
  ok(await box(s) === 0 && await s.locator('.modal').count() === 1, 'Y el aviso se cierra');

  // Móvil
  const { p: m } = await open('s1', { width: 390, height: 800 });
  await m.evaluate(() => { S.assigns.forEach(a => { if (a.item_id === 'i1') a.item.watch_video = true; }); S.section = 'listening'; S.filter = 'all'; render(); });
  await m.waitForTimeout(150);
  await m.click('.track .playbtn'); await m.waitForTimeout(150);
  const bb = await m.locator('#watchBox .wb').boundingBox();
  ok(bb && bb.x >= 0 && bb.x + bb.width <= 390, 'En el móvil el aviso cabe en la pantalla');
  await m.screenshot({ path: path.join(__dirname, 'shots', 'ver-video-4-movil.png') });

  console.log(errors.length ? 'ERRORES DE CONSOLA/PÁGINA:\n' + errors.join('\n') : 'ERRORES DE CONSOLA/PÁGINA: ninguno');
  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
