// Escuchar del tirón: el profesor marca un álbum conceptual; el alumno ve "💿 Del tirón" y un aviso cada vez que abre el enlace
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
  const setFlags = (p, f) => p.evaluate(f => { S.assigns.forEach(a => { if (a.item_id === 'i1') Object.assign(a.item, f); }); S.section = 'listening'; S.filter = 'all'; render(); }, f);

  /* ---------- Profesor ---------- */
  const { p: t } = await open('t1');
  await t.evaluate(() => itemFormModal('i1')); await t.waitForTimeout(100);
  ok(await t.locator('#itemForm [name=play_through]').count() === 1, 'El formulario tiene la casilla "Escuchar del tirón"');
  ok(!(await t.isChecked('#itemForm [name=play_through]')), 'Viene desmarcada');
  await t.check('#itemForm [name=play_through]');
  await t.screenshot({ path: path.join(__dirname, 'shots', 'del-tiron-1-form.png') });
  await t.click('#itemForm button[type=submit]'); await t.waitForTimeout(400);
  const row = await t.evaluate(() => __DB.listening_items.find(i => i.id === 'i1'));
  ok(row.play_through === true && !row.watch_video, 'Se guarda play_through = true (y no marca "Para ver")');
  await t.evaluate(() => { closeModal(); S.section = 'listening'; render(); }); await t.waitForTimeout(150);
  ok(/Del tirón/.test(await t.locator('.track[data-id=i1] .wtag').textContent()), 'En el catálogo sale la etiqueta "Del tirón"');
  ok(await t.locator('.track[data-id=i2] .wtag').count() === 0, 'La otra escucha no la lleva');
  await t.click('.track[data-id=i1] .playbtn'); await t.waitForTimeout(100);
  ok(await box(t) === 1, 'Al profesor también le sale el aviso al pulsar ▶');
  await t.click('#watchBox [data-watch-close]'); await t.waitForTimeout(100);
  await t.evaluate(() => itemModal('i1')); await t.waitForTimeout(100);
  ok(await t.locator('.modal a[data-watch]').textContent() === 'Escuchar del tirón ↗', 'Su botón dice "Escuchar del tirón"');
  await t.evaluate(() => closeModal());
  await t.evaluate(() => itemFormModal('i1')); await t.waitForTimeout(100);
  ok(await t.isChecked('#itemForm [name=play_through]'), 'Al editar, la casilla sale marcada');
  await t.uncheck('#itemForm [name=play_through]');
  await t.click('#itemForm button[type=submit]'); await t.waitForTimeout(400);
  ok(await t.evaluate(() => __DB.listening_items.find(i => i.id === 'i1').play_through) === false, 'Se puede volver a desactivar');

  /* ---------- Alumna ---------- */
  const { ctx: sc, p: s } = await open('s1');
  await setFlags(s, { play_through: true }); await s.waitForTimeout(150);
  ok(/Del tirón/.test(await s.locator('.track .wtag').textContent()), 'La alumna ve la etiqueta en su lista');
  await s.screenshot({ path: path.join(__dirname, 'shots', 'del-tiron-2-lista.png') });
  ok(await s.locator('a[data-watch][href]').count() === 0, 'Sin enlace directo (no se salta el aviso con "Abrir en pestaña nueva")');
  await s.click('.track .playbtn'); await s.waitForTimeout(150);
  ok(await box(s) === 1, 'Al pulsar ▶ sale el aviso');
  ok(await s.locator('.modal').count() === 0, 'Pulsar ▶ no abre la ventana de la escucha');
  const txt = await s.locator('#watchBox').textContent();
  ok(/del tirón/.test(txt) && /anuncios/.test(txt) && /fundido/.test(txt), 'El aviso habla de escucharlo del tirón, sin anuncios y sin fundido');
  ok(/dura 46 min/.test(txt), 'Dice cuánto dura');
  ok(!/4K/.test(txt), 'No habla de 4K (eso es de los vídeos)');
  ok((await s.locator('#watchBox [data-watch-go]').textContent()).trim() === 'Entendido, abrir álbum', 'El botón dice "Entendido, abrir álbum"');
  ok(await s.locator('#watchBox [data-watch-go]').getAttribute('href') === 'https://open.spotify.com/album/x', 'Y lleva el enlace bueno');
  await s.screenshot({ path: path.join(__dirname, 'shots', 'del-tiron-3-aviso.png') });
  await s.keyboard.press('Escape'); await s.waitForTimeout(100);
  ok(await box(s) === 0, 'Esc lo cierra');
  await s.evaluate(() => studentModal('a1')); await s.waitForTimeout(150);
  ok(await s.locator('.modal .wtag').count() === 1, 'En la ventana sale la etiqueta');
  ok(await s.locator('.modal a[data-watch]').textContent() === 'Escuchar del tirón ↗', 'El botón dice "Escuchar del tirón"');
  await s.click('.modal a[data-watch]'); await s.waitForTimeout(100);
  ok(await box(s) === 1, 'Desde la ventana también sale el aviso');
  await s.evaluate(() => { document.querySelector('#watchBox [data-watch-go]').href = 'about:blank'; });
  const [tab] = await Promise.all([sc.waitForEvent('page', { timeout: 3000 }).catch(() => null), s.click('#watchBox [data-watch-go]')]);
  await s.waitForTimeout(150);
  ok(!!tab && await box(s) === 0 && await s.locator('.modal').count() === 1, '"Entendido" abre el enlace y cierra el aviso, no la ventana');
  await s.evaluate(() => closeModal());

  // Con las dos marcas: aviso del vídeo con el punto de escucharlo entero
  await setFlags(s, { play_through: true, watch_video: true }); await s.waitForTimeout(150);
  ok(await s.locator('.track .wtag').count() === 2, 'Con las dos marcas salen las dos etiquetas');
  await s.click('.track .playbtn'); await s.waitForTimeout(150);
  const t2 = await s.locator('#watchBox').textContent();
  ok(/4K/.test(t2) && /entero y sin pausas/.test(t2), 'Con las dos, el aviso del vídeo incluye escucharlo entero');
  await s.keyboard.press('Escape'); await s.waitForTimeout(100);
  // Sin marcas: enlace normal
  await setFlags(s, { play_through: false, watch_video: false }); await s.waitForTimeout(150);
  ok(await s.locator('.track .playbtn[href]').count() === 1 && await s.locator('a[data-watch]').count() === 0, 'Una escucha normal sigue con su enlace directo');

  // Móvil
  const { p: m } = await open('s1', { width: 390, height: 800 });
  await setFlags(m, { play_through: true }); await m.waitForTimeout(150);
  await m.click('.track .playbtn'); await m.waitForTimeout(150);
  const bb = await m.locator('#watchBox .wb').boundingBox();
  ok(bb && bb.x >= 0 && bb.x + bb.width <= 390 && bb.y >= 0 && bb.y + bb.height <= 800, 'En el móvil el aviso cabe en la pantalla');
  await m.screenshot({ path: path.join(__dirname, 'shots', 'del-tiron-4-movil.png') });

  console.log(errors.length ? 'ERRORES DE CONSOLA/PÁGINA:\n' + errors.join('\n') : 'ERRORES DE CONSOLA/PÁGINA: ninguno');
  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
