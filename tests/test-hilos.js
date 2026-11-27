// Respuestas en hilo a los comentarios (un nivel, como Facebook): Inicio y Escucha analítica
const { chromium } = require('playwright');
const path = require('path');
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
    await page.goto(require('url').pathToFileURL(path.join(__dirname, 'test.html')).href);
    await page.waitForTimeout(400);
    return page;
  }
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'shots', n) });
  const notifs = (p, user, kind) => p.evaluate(([u, k]) => __DB.notifications.filter(n => n.user_id === u && n.kind === k).length, [user, kind]);

  // ---- s1 responde al comentario de s2 (fc2) en la publicación del profesor (f2) ----
  const p = await open('s1');
  await p.evaluate(() => { S.section = 'feed'; render(); feedPostModal('f2'); }); await p.waitForTimeout(200);
  const M = p.locator('.modal [data-cm="feed:f2"]');
  ok(await M.locator('[data-cmt-id=fc2] [data-action=comment-reply]').count() === 1, 'Cada comentario tiene "Responder"');
  await M.locator('[data-cmt-id=fc2] [data-action=comment-reply]').click(); await p.waitForTimeout(150);
  const ta = '#cmReply-feed-f2-fc2';
  ok(await p.evaluate(t => document.activeElement && document.activeElement.matches(t), ta), 'Se abre la caja de respuesta con el cursor dentro');
  ok((await p.inputValue(ta)) === '', 'Al responder a un comentario raíz no se añade @mención');
  await p.fill(ta, 'De nada, ¡a practicar!');
  await M.locator('[data-action=comment-send][data-root=fc2]').click(); await p.waitForTimeout(250);
  const r1 = await p.evaluate(() => __DB.feed_comments.find(c => c.body === 'De nada, ¡a practicar!'));
  ok(r1 && r1.parent_id === 'fc2' && r1.post_id === 'f2', 'La respuesta se guarda con parent_id del comentario');
  ok(await M.locator('[data-thread=fc2] .cmt.reply').count() === 1, 'Sale dentro del hilo, ya abierto');
  ok(await M.locator(ta).count() === 0, 'La caja de respuesta se cierra al enviar');
  ok(await notifs(p, 's2', 'reply_feed') === 1, 'Aviso "ha respondido a tu comentario" al autor del comentario');
  ok(await notifs(p, 't1', 'comment') === 1, 'El dueño de la publicación sigue recibiendo "ha comentado"');
  await shot(p, 'hilo-1-respuesta.png');

  // Responder a una respuesta ajena: mismo hilo y empieza con su @mención
  await p.evaluate(() => window.__rtExternal('feed_comments', { id: 'fr2', post_id: 'f2', parent_id: 'fc2', author_id: 't1', body: 'Eso, a practicar', created_at: new Date().toISOString() }));
  await p.waitForTimeout(200);
  ok(await M.locator('[data-thread=fc2] .cmt.reply').count() === 2, 'Una respuesta en directo entra en su hilo');
  await M.locator('[data-cmt-id=fr2] [data-action=comment-reply]').click(); await p.waitForTimeout(150);
  ok(/^@\S+/.test(await p.inputValue(ta)), 'Responder a una respuesta ajena empieza con su @mención: ' + await p.inputValue(ta));
  await p.type(ta, 'vale');
  await M.locator('[data-action=comment-send][data-root=fc2]').click(); await p.waitForTimeout(250);
  const r3 = await p.evaluate(() => __DB.feed_comments.find(c => /vale$/.test(c.body)));
  ok(r3 && r3.parent_id === 'fc2' && r3.body.startsWith('<@t1>'), 'Se guarda en el mismo hilo (un nivel) con la mención codificada');
  ok(r3 && r3.reply_to === 'fr2', 'Se guarda a qué respuesta concreta se contesta (reply_to)');
  ok(await notifs(p, 't1', 'reply_feed') === 1, 'El autor de esa respuesta recibe "ha respondido a tu comentario"');
  // Sin @: igualmente le llega el aviso
  await p.evaluate(() => { __DB.notifications = __DB.notifications.filter(n => !(n.user_id === 't1' && n.kind === 'reply_feed')); });
  await M.locator('[data-cmt-id=fr2] [data-action=comment-reply]').click(); await p.waitForTimeout(120);
  await p.fill(ta, 'sin arroba');
  await M.locator('[data-action=comment-send][data-root=fc2]').click(); await p.waitForTimeout(250);
  ok(await p.evaluate(() => __DB.feed_comments.some(c => c.body === 'sin arroba' && c.reply_to === 'fr2')), 'Sin @mención también se guarda a quién respondes');
  ok(await notifs(p, 't1', 'reply_feed') === 1, 'Y le llega el aviso aunque no lleve @');
  ok(await notifs(p, 't1', 'mention_feed') === 0,'El mencionado que es dueño de la publicación no recibe un aviso de más');

  // Plegar / desplegar
  await M.locator('[data-thread=fc2] [data-action=cm-thread]').click(); await p.waitForTimeout(120);
  ok(await M.locator('[data-thread=fc2] .cmt.reply').count() === 1, '"Ocultar respuestas" pliega el hilo y deja la primera como adelanto');
  ok(await M.locator('[data-thread=fc2] .cmt.reply').first().getAttribute('data-cmt-id') === r1.id, 'El adelanto es la primera respuesta');
  ok((await M.locator('[data-thread=fc2] .cm-tbtn').innerText()).includes('Ver 3 respuestas más'), 'Plegado dice "Ver 3 respuestas más"');
  await M.locator('[data-thread=fc2] .cm-tbtn').click(); await p.waitForTimeout(120);
  ok(await M.locator('[data-thread=fc2] .cmt.reply').count() === 4, 'Al pulsar se despliega');

  // Escribir en la respuesta no se pierde si llega algo en directo
  await M.locator('[data-cmt-id=fc2] [data-action=comment-reply]').first().click(); await p.waitForTimeout(100);
  await p.fill(ta, 'a medias');
  await p.evaluate(() => window.__rtExternal('feed_comments', { id: 'fr9', post_id: 'f2', author_id: 's2', body: 'Otro comentario', created_at: new Date().toISOString() }));
  await p.waitForTimeout(150);
  ok((await p.inputValue(ta)) === 'a medias', 'Lo que estás escribiendo en la respuesta se conserva');
  await M.locator('[data-action=cm-reply-cancel]').click(); await p.waitForTimeout(100);
  ok(await M.locator(ta).count() === 0, '"Cancelar" cierra la caja');

  // Un hilo con una sola respuesta, plegado: se ve entera y sin botón
  await p.evaluate(() => window.__rtExternal('feed_comments', { id: 'fr11', post_id: 'f2', parent_id: 'fr9', author_id: 't1', body: 'Respuesta única', created_at: new Date().toISOString() }));
  await p.waitForTimeout(150);
  ok(await M.locator('[data-thread=fr9] .cmt.reply').count() === 1 && await M.locator('[data-thread=fr9] .cm-tbtn').count() === 0, 'Con una sola respuesta se ve sin pulsar nada');

  // Vista previa del Inicio: solo comentarios raíz y "N respuestas"
  await p.click('.modal [data-action=close]'); await p.waitForTimeout(200);
  const f2 = p.locator('[data-fpost=f2]');
  const peekIds = await f2.locator('.peek-cmt').evaluateAll(n => n.map(x => x.dataset.cmt));
  ok(!peekIds.includes('fr2') && peekIds.includes('fc2'), 'La vista previa enseña comentarios, no respuestas');
  ok((await f2.locator('.peek-rep').innerText()).includes('4 respuestas'), 'Y debajo "4 respuestas"');
  await p.evaluate(() => cmOpen.clear());
  await f2.locator('.peek-rep').click(); await p.waitForTimeout(250);
  ok(await p.locator('.modal [data-thread=fc2] .cmt.reply').count() === 4, 'Pulsar "4 respuestas" abre la publicación con el hilo abierto');
  await p.click('.modal [data-action=close]'); await p.waitForTimeout(200);

  // ---- Borrar el comentario raíz: las respuestas se quedan con "Comentario eliminado" ----
  const t = await open('t1');
  await t.evaluate(() => {
    __DB.feed_comments.push({ id: 'fr5', post_id: 'f2', parent_id: 'fc2', author_id: 's1', body: 'Respuesta que se queda', created_at: new Date().toISOString(), photos: [] });
    S.fcomments.push(__DB.feed_comments.at(-1)); S.section = 'feed'; render(); cmOpen.add('fc2'); feedPostModal('f2');
  });
  await t.waitForTimeout(200);
  t.once('dialog', d => { ok(/respuesta/.test(d.message()), 'El aviso de borrar dice que las respuestas se quedan'); d.accept(); });
  await t.locator('.modal [data-cmt-id=fc2] [data-action=comment-delete]').first().click(); await t.waitForTimeout(250);
  ok(await t.locator('.modal .cmt.gone').count() === 1, 'En su lugar sale "Comentario eliminado"');
  ok(await t.locator('.modal [data-thread=fc2] .cmt.reply [data-action=comment-reply]').count() === 0, 'Bajo un comentario eliminado ya no se puede responder');
  ok(await t.locator('.modal [data-cmt-id=fr5]').count() === 1, 'Las respuestas siguen ahí');
  await shot(t, 'hilo-2-eliminado.png');
  const bad = await t.evaluate(async () => (await sb.from('feed_comments').insert({ id: 'zz1', post_id: 'f2', parent_id: 'fc2', author_id: S.user.id, body: 'x' })).error);
  ok(!!bad, 'La base de datos no deja responder a un comentario que ya no existe');
  const bad2 = await t.evaluate(async () => (await sb.from('feed_comments').insert({ id: 'zz2', post_id: 'f2', parent_id: 'fr5', author_id: S.user.id, body: 'x' })).error);
  ok(!!bad2, 'Ni responder a una respuesta (solo un nivel)');
  const bad3 = await t.evaluate(async () => (await sb.from('feed_comments').insert({ id: 'zz3', post_id: 'f1', parent_id: 'fc9', author_id: S.user.id, body: 'x' })).error);
  ok(!!bad3, 'Ni colgarla de un comentario de otra publicación');
  // Al borrar todas las respuestas, el hueco desaparece
  for (const id of ['fr5', 'fr2']) {
    const loc = t.locator(`.modal [data-cmt-id=${id}] [data-action=comment-delete]`);
    if (await loc.count()) { t.once('dialog', d => d.accept()); await loc.click(); await t.waitForTimeout(200); }
  }
  await t.evaluate(() => { const rest = __DB.feed_comments.filter(c => c.parent_id === 'fc2'); rest.forEach(c => window.__rtExternalDelete('feed_comments', { id: c.id })); });
  await t.waitForTimeout(200);
  ok(await t.locator('.modal .cmt.gone').count() === 0, 'Sin respuestas, "Comentario eliminado" desaparece');

  // ---- Escucha analítica: s2 responde al comentario de... s2 tiene lc1 en i1; s1 responde si tiene i1 ----
  const s = await open('t1');
  await s.evaluate(() => { S.section = 'listening'; render(); itemModal('i1'); }); await s.waitForTimeout(250);
  const L = s.locator('.modal [data-cm="listening:i1"]');
  ok(await L.locator('[data-cmt-id=lc1] [data-action=comment-reply]').count() === 1, 'En Escucha analítica también se puede responder');
  await L.locator('[data-cmt-id=lc1] [data-action=comment-reply]').click(); await s.waitForTimeout(120);
  await s.fill('#cmReply-listening-i1-lc1', 'Ron Carter manda');
  await L.locator('[data-action=comment-send][data-root=lc1]').click(); await s.waitForTimeout(250);
  ok(await s.evaluate(() => __DB.listening_comments.some(c => c.parent_id === 'lc1' && c.item_id === 'i1')), 'La respuesta de escucha se guarda en su hilo');
  ok(await notifs(s, 's2', 'reply_listening') === 1, 'Aviso "ha respondido a tu comentario en una escucha"');
  await shot(s, 'hilo-3-escucha.png');

  // Abrir el aviso de respuesta lleva al hilo y lo resalta
  const s2 = await open('s2');
  await s2.evaluate(() => { S.notifs.push({ id: 'nx1', user_id: 's2', kind: 'reply_feed', actor_id: 's1', target_id: 'f2', extra: 'hola', created_at: new Date().toISOString(), read_at: null }); });
  ok((await s2.evaluate(() => notifText(S.notifs.find(n => n.id === 'nx1')))).includes('ha respondido a tu comentario'), 'Texto del aviso en la campanita');

  // Móvil: sin desbordar
  const m = await open('s1', { width: 375, height: 800 });
  await m.evaluate(() => { S.section = 'feed'; render(); cmOpen.add('fc2'); feedPostModal('f2'); }); await m.waitForTimeout(200);
  await m.locator('.modal [data-cmt-id=fc2] [data-action=comment-reply]').click(); await m.waitForTimeout(150);
  ok(await m.evaluate(() => { const b = document.querySelector('.backdrop'); return b.scrollWidth <= b.clientWidth; }), 'Móvil: el hilo y la caja caben a lo ancho');
  await shot(m, 'hilo-4-movil.png');

  ok(errors.length === 0, 'Sin errores en consola' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(fails ? `${fails} FALLOS` : 'TODO OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
