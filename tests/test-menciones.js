// Menciones estilo Discord: @persona, #sección y #escucha (Inicio, Avisos y comentarios)
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  async function open(me, vp = { width: 1000, height: 900 }, db) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('dialog', d => d.accept());
    await page.addInitScript(`window.__ME=${JSON.stringify(me)};${db ? `window.__DB_OVERRIDE=${JSON.stringify(db)};` : ''}`);
    await page.goto(require('url').pathToFileURL(require('path').join(__dirname, 'test.html')).href);
    await page.waitForTimeout(400);
    return page;
  }
  const goto = async (p, s) => { await p.click(`.nav button[data-s=${s}]:visible, .tabbar button[data-s=${s}]:visible`); await p.waitForTimeout(150); };
  const shot = (p, n) => p.screenshot({ path: require('path').join(__dirname, 'shots', n) });

  // ================= Marta (s1) escribe en el Inicio =================
  let p = await open('s1');
  await goto(p, 'feed');
  const ta = '#feedForm [name=body]';
  await p.click(ta); await p.type(ta, 'Mirad esto @l');
  await p.waitForTimeout(100);
  ok(await p.locator('#mentionBox .mopt').count() >= 1, 'Al escribir @ sale la lista de personas');
  ok((await p.textContent('#mentionBox')).includes('@Lu') && !(await p.textContent('#mentionBox')).includes('Luis'), 'La lista usa el apodo (Lu), nunca el nombre real');
  await shot(p, 'm1-lista-personas.png');
  await p.keyboard.press('Enter');
  ok((await p.inputValue(ta)) === 'Mirad esto @Lu ', 'Enter elige la persona y la escribe en el texto');
  ok(await p.locator('#mentionBox').count() === 0, 'La lista se cierra al elegir');
  await p.type(ta, 'y el profe @yu');
  await p.waitForTimeout(80);
  await p.click('#mentionBox .mopt');
  await p.type(ta, 'id ');           // por la "i" de "id": tras elegir, el texto sigue normal
  await p.type(ta, 'mirad #aj');
  await p.waitForTimeout(80);
  ok((await p.textContent('#mentionBox')).includes('#Ajustes'), 'Con # salen las secciones');
  await p.keyboard.press('Tab');
  await p.type(ta, 'y #kind');
  await p.waitForTimeout(80);
  ok((await p.textContent('#mentionBox')).includes('#Kind of Blue'), 'Con # salen las escuchas que tienes asignadas');
  await shot(p, 'm2-lista-escuchas.png');
  await p.keyboard.press('Enter');
  // Escape cierra la lista sin cerrar nada más
  await p.type(ta, '#'); await p.waitForTimeout(60);
  await p.keyboard.press('Escape');
  ok(await p.locator('#mentionBox').count() === 0, 'Esc cierra la lista');
  await p.keyboard.press('Backspace');
  await p.click('#feedForm button[type=submit]'); await p.waitForTimeout(300);
  const saved = await p.evaluate(() => window.__DB.feed_posts.slice(-1)[0] && window.__DB.feed_posts.find(x => x.body.startsWith('Mirad esto')).body);
  ok(saved && saved.includes('<@s2>') && saved.includes('<@t1>') && saved.includes('<#settings>') && saved.includes('<#l:i1>'), 'Se guarda con códigos (<@id>, <#seccion>, <#l:id>): ' + saved);
  const post = p.locator('.fpost:has-text("Mirad esto")');
  ok(await post.locator('.mention[data-action=open-profile][data-id=s2]').count() === 1, '@Lu se ve como mención pulsable');
  ok((await post.locator('.mention[data-s=settings]').textContent()) === 'Ajustes' && (await post.locator('.mention[data-action=mention-item]').textContent()) === 'Kind of Blue' && (await post.locator('.mention[data-id=s2]').textContent()) === 'Lu', 'Las menciones se ven con su nombre, sin @ ni #');
  await shot(p, 'm3-publicacion.png');
  await post.locator('.mention[data-s=settings]').click(); await p.waitForTimeout(200);
  ok(await p.locator('.nav button.on[data-s=settings]').count() === 1, 'Pulsar #Ajustes lleva a Ajustes');
  await goto(p, 'feed');
  await p.locator('.fpost:has-text("Mirad esto") .mention[data-action=mention-item]').click(); await p.waitForTimeout(300);
  ok(await p.locator('.nav button.on[data-s=listening]').count() === 1 && await p.locator('.modal').count() === 1, 'Pulsar #Kind of Blue abre esa escucha');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // escrito a mano, sin usar la lista
  await goto(p, 'feed');
  await p.fill(ta, 'Escrito a mano: @lu y #avisos, pero no a@lu.com');
  await p.click('#feedForm button[type=submit]'); await p.waitForTimeout(300);
  const manual = await p.evaluate(() => window.__DB.feed_posts.find(x => x.body.startsWith('Escrito a mano')).body);
  ok(manual === 'Escrito a mano: <@s2> y <#board>, pero no a@lu.com', 'Lo escrito a mano también se reconoce (y un email no): ' + manual);
  // XSS: un código raro o un id inventado no rompe nada
  await p.evaluate(() => window.__rtExternal('feed_posts', { id: 'fx', author_id: 's2', body: 'Hola <@zz9> <#hack> <img src=x onerror=alert(1)>', link_url: null }));
  await p.waitForTimeout(200);
  if (await p.locator('[data-action=show-new]').count()) { await p.click('[data-action=show-new]'); await p.waitForTimeout(150); }
  ok(await p.locator('img[src=x]').count() === 0 && (await p.textContent('.fpost:has-text("Hola")')).includes('usuario'), 'Códigos de personas desconocidas salen como "usuario" y el HTML se escapa');
  // comentario con mención
  await p.click('.fpost:has-text("Bienvenidos") [data-action=open-fpost]'); await p.waitForTimeout(200);
  const cta = '.modal textarea[id^=cmInput]';
  await p.click(cta); await p.type(cta, 'Gracias @y'); await p.waitForTimeout(80);
  await p.keyboard.press('Enter');
  ok(await p.locator('.modal').count() === 1 && (await p.inputValue(cta)).startsWith('Gracias @Yuri'), 'En comentarios también funciona (y Enter no cierra ni envía)');
  await p.click('.modal [data-action=comment-send]'); await p.waitForTimeout(250);
  ok(await p.locator('.modal .cmt-body .mention[data-id=t1]').count() === 1, 'El comentario muestra la mención');
  await p.keyboard.press('Escape');
  const db1 = await p.evaluate(() => window.__DB);

  // ================= Luis (s2) recibe las notificaciones =================
  p = await open('s2', undefined, db1);
  const n2 = await p.evaluate(() => window.__DB.notifications.filter(n => n.user_id === 's2'));
  ok(n2.some(n => n.kind === 'mention_feed' && n.actor_id === 's1' && n.extra.includes('@Lu') && !n.extra.includes('<@')), 'Luis recibe "te ha mencionado", con el texto legible');
  await p.click('[data-action=notifs]'); await p.waitForTimeout(200);
  ok((await p.textContent('.nlist')).includes('te ha mencionado'), 'Sale en la campanita');
  await shot(p, 'm4-notificacion.png');
  await p.click('.nrow:has-text("Mirad esto")'); await p.waitForTimeout(300);
  ok(await p.locator('.modal .fbody:has-text("Mirad esto")').count() === 1, 'Al pulsarla se abre la publicación');
  await p.keyboard.press('Escape');
  const nt = await p.evaluate(() => window.__DB.notifications.filter(n => n.user_id === 't1' && n.kind === 'mention_feed').length);
  ok(nt >= 1, 'El profesor también recibe su mención');

  // ================= Profesor: aviso con mención =================
  p = await open('t1', undefined, db1);
  await goto(p, 'board');
  await p.click('[data-action=new-post]'); await p.waitForTimeout(150);
  await p.fill('#postForm [name=title]', 'Concierto');
  const bta = '#postForm [name=body]';
  await p.click(bta); await p.type(bta, 'Felicidades @mar'); await p.waitForTimeout(80);
  await p.keyboard.press('Enter');
  await p.type(bta, 'mira #alu'); await p.waitForTimeout(80);
  await p.keyboard.press('Enter');
  await shot(p, 'm5-aviso.png');
  await p.click('#postForm button[type=submit]'); await p.waitForTimeout(400);
  const bp = await p.evaluate(() => window.__DB.board_posts.find(x => x.title === 'Concierto'));
  ok(bp && bp.body === 'Felicidades <@s1> mira <#students>', 'Aviso guardado con códigos: ' + (bp && bp.body));
  const nb = await p.evaluate(() => window.__DB.notifications.filter(n => n.kind === 'mention_board' || (n.kind === 'board_post' && n.extra === 'Concierto')).map(n => n.user_id + ':' + n.kind));
  ok(nb.includes('s1:mention_board') && nb.includes('s2:board_post') && !nb.includes('s1:board_post'), 'La mencionada recibe "te ha mencionado en un aviso"; el resto, "nuevo aviso": ' + nb);
  // editar conserva las menciones
  await p.click('.card.post:has-text("Concierto") [data-action=edit-post]'); await p.waitForTimeout(200);
  ok((await p.inputValue(bta)) === 'Felicidades @Marta mira #Alumnos', 'Al editar se ven nombres, no códigos');
  await p.click('#postForm button[type=submit]'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => window.__DB.board_posts.find(x => x.title === 'Concierto').body) === 'Felicidades <@s1> mira <#students>', 'Y al guardar se conservan');
  const db2 = await p.evaluate(() => window.__DB);

  // ================= Marta ve el aviso: #Alumnos (solo profesor) no enlaza =================
  p = await open('s1', undefined, db2);
  await goto(p, 'board');
  ok((await p.textContent('.card.post:has-text("Concierto") .postbody')).trim() === 'Felicidades Marta mira Alumnos', 'El aviso sale en texto legible, sin @ ni #');
  ok(await p.locator('.card.post .postbody .mention.off:has-text("Alumnos")').count() === 1 && await p.locator('.card.post .postbody [data-s=students]').count() === 0, 'A un alumno, #Alumnos le sale como texto normal (no enlaza)');
  await shot(p, 'm6-aviso-alumna.png');
  await p.keyboard.press('Escape');

  // ================= Móvil: la lista cabe en pantalla =================
  p = await open('s1', { width: 390, height: 760 }, db2);
  await goto(p, 'feed');
  await p.click(ta); await p.type(ta, '#'); await p.waitForTimeout(100);
  const box = await p.locator('#mentionBox').boundingBox();
  ok(box && box.x >= 0 && box.x + box.width <= 390, 'En el móvil la lista cabe a lo ancho');
  await shot(p, 'm7-movil.png');

  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'Sin errores de consola');
  console.log(fails ? `${fails} FALLOS` : 'TODO OK');
  await browser.close();
  process.exit(fails || errors.length ? 1 : 0);
})();
