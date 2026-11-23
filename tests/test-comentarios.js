// Inicio: vista previa de comentarios en cada publicación (los más relevantes a la vista y caja para comentar)
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  async function open(me, vp = { width: 1000, height: 900 }) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.addInitScript(`window.__ME=${JSON.stringify(me)};`);
    await page.goto(require('url').pathToFileURL(require('path').join(__dirname, 'test.html')).href);
    await page.waitForTimeout(400);
    return page;
  }
  const shot = (p, n) => p.screenshot({ path: require('path').join(__dirname, 'shots', n) });
  // Más comentarios en f2 (el del profesor): fc2 sin reacciones, fx1 largo con 2 reacciones, fx2 del profe, fx3 el más nuevo
  const extra = () => {
    const T = m => new Date(Date.now() - m * 60000).toISOString();
    S.fcomments.push(
      { id: 'fx1', post_id: 'f2', author_id: 's1', body: 'Los bends del final son brutales. Me cuesta muchísimo afinarlos y que no se queden bajos, ¿algún consejo para practicarlos? Lo he intentado con afinador pero no hay manera de que suenen igual que en la grabación, siempre se me quedan un poco cortos. Además, cuando intento hacer el vibrato encima del bend se me desafina todavía más y la nota se muere enseguida. ¿Es cuestión de fuerza en los dedos o de cómo apoyo la muñeca? Os leo.', created_at: T(140) },
      { id: 'fx2', post_id: 'f2', author_id: 't1', body: 'Buen punto, el próximo día lo trabajamos', created_at: T(120) },
      { id: 'fx3', post_id: 'f2', author_id: 's2', body: 'Gracias!', created_at: T(110) });
    S.reactions.push({ target_type: 'feed_comment', target_id: 'fx1', user_id: 't1', emoji: 'love', created_at: T(100) },
      { target_type: 'feed_comment', target_id: 'fx1', user_id: 's2', emoji: 'like', created_at: T(100) });
    S.section = 'feed'; render();
  };

  let p = await open('s1');
  await p.evaluate(extra); await p.waitForTimeout(150);
  const f2 = p.locator('[data-fpost=f2]'), f3 = p.locator('[data-fpost=f3]'), f1 = p.locator('[data-fpost=f1]');
  ok(await f2.locator('.peek-cmt').count() === 2, 'Se ven 2 comentarios sin pulsar nada');
  const order = await f2.locator('.peek-cmt').evaluateAll(n => n.map(x => x.dataset.cmt));
  ok(order[0] === 'fx1', 'Arriba el que tiene más reacciones');
  ok(order[1] === 'fx2', 'Después, a igualdad, el del profesor');
  ok((await f2.locator('.peek-more').innerText()).includes('Ver los 4 comentarios'), 'Enlace "Ver los 4 comentarios"');
  ok((await f2.locator('.peek-rx').innerText()).includes('2'), 'El comentario muestra sus reacciones');
  const clamp = await f2.locator('[data-cmt=fx1] .peek-body').evaluate(n => n.scrollHeight > n.clientHeight + 2);
  ok(clamp, 'Un comentario largo se corta a unas líneas');
  ok(await f1.locator('.peek-cmt').count() === 1 && await f1.locator('.peek-more').count() === 0, 'Con un solo comentario no sale "Ver los N"');
  ok(await f3.locator('.peek-cmt').count() === 0 && (await f3.locator('.peek-input').innerText()).includes('Sé el primero'), 'Sin comentarios invita a ser el primero');
  await f2.screenshot({ path: require('path').join(__dirname, 'shots', 'cm1-vista-previa.png') });

  // Pulsar un comentario abre la publicación y baja hasta él
  await f2.locator('[data-cmt=fx2] .peek-body').click(); await p.waitForTimeout(250);
  ok(await p.locator('.modal [data-cm="feed:f2"] .cmt').count() === 4, 'Al pulsar se abren todos los comentarios');
  ok(await p.locator('.modal [data-cmt-id=fx2].flash').count() === 1, 'Y resalta el comentario pulsado');
  await shot(p, 'cm2-abierto.png');
  await p.click('.modal [data-action=close]'); await p.waitForTimeout(200);

  // "Escribe un comentario…" abre con el cursor en la caja
  await f3.locator('.peek-input').click(); await p.waitForTimeout(250);
  ok(await p.evaluate(() => document.activeElement && document.activeElement.id === 'cmInput-feed-f3'), 'La caja de comentario queda lista para escribir');
  await p.fill('#cmInput-feed-f3', 'Muy buena reflexión');
  await p.click('.modal [data-action=comment-send]'); await p.waitForTimeout(250);
  await p.click('.modal [data-action=close]'); await p.waitForTimeout(200);
  ok(await f3.locator('.peek-cmt').count() === 1, 'Tu comentario aparece en la vista previa al cerrar');

  // Pulsar el nombre abre el perfil, no la publicación
  await f2.locator('[data-cmt=fx2] .wholink b').click(); await p.waitForTimeout(250);
  ok(await p.locator('.modal [data-cm="feed:f2"]').count() === 0, 'Pulsar el nombre no abre la publicación');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  if (await p.locator('.modal').count()) { await p.click('.modal [data-action=close]').catch(() => {}); await p.waitForTimeout(150); }

  // Tiempo real: un comentario de otra persona aparece y actualiza el contador
  await p.evaluate(() => window.__rtExternal('feed_comments', { id: 'fx9', post_id: 'f1', author_id: 's2', body: 'Comentario en directo', created_at: new Date().toISOString() }));
  await p.waitForTimeout(250);
  ok(await f1.locator('.peek-cmt').count() === 2, 'Un comentario nuevo en directo sale en la vista previa');

  // Móvil
  const m = await open('s1', { width: 390, height: 844 });
  await m.evaluate(extra); await m.waitForTimeout(150);
  await m.locator('[data-fpost=f2]').scrollIntoViewIfNeeded();
  await m.locator('[data-fpost=f2]').screenshot({ path: require('path').join(__dirname, 'shots', 'cm3-movil.png') });
  const over = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  ok(!over, 'En el móvil no hay desplazamiento lateral');

  ok(errors.length === 0, 'Sin errores en consola' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n${fails} FALLOS` : '\nTodo OK');
  process.exit(fails ? 1 : 0);
})();
