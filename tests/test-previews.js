// Previews de Spotify y YouTube (portada, título, tipo y duración) en Inicio, comentarios, Avisos y mensajes privados
const { chromium } = require('playwright');
// Navegación: menú lateral, barra inferior (móvil), barra superior (Mensajes) o menú de la cuenta (Perfil, Ajustes)
const navTo = async (p, s) => {
  const sel = `.nav button[data-s=${s}]:visible, .tabbar button[data-s=${s}]:visible, .top-r button[data-s=${s}]:visible, .stu-tabs button[data-s=${s}]:visible`;
  if (await p.locator(sel).count()) return p.click(sel);
  if (['homework', 'payments', 'agenda'].includes(s) && await p.locator('.nav button[data-s=students]:visible, .tabbar button[data-s=students]:visible').count()) { // profesor: pestañas de Alumnos
    await p.click('.nav button[data-s=students]:visible, .tabbar button[data-s=students]:visible'); await p.waitForTimeout(80); return p.click(`.stu-tabs button[data-s=${s}]`); }
  await p.click('.avbtn'); await p.waitForTimeout(80);
  if (await p.evaluate(s => S.section === s, s)) return; // en el móvil la foto lleva directa al Perfil
  await p.click(`.memenu [data-s=${s}]`);
};
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  async function open(me, vp = { width: 1000, height: 900 }) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('dialog', d => d.accept());
    // Respuestas simuladas: título por oEmbed y duración por la Edge Function
    await page.addInitScript(`window.__ME=${JSON.stringify(me)};
      window.__META_CALLS = 0;
      window.__META_STUB = async u => { window.__META_CALLS++; await new Promise(r => setTimeout(r, 80)); const m = { title: /spotify/.test(u) ? 'Kind of Blue' : 'Last Train Home', thumb: null }; metaCache[u] = m; return m; };
      window.__DUR_STUB = async u => { const d = /spotify/.test(u) ? { duration_sec: 2756, track_count: 5, partial: false } : { duration_sec: 341, track_count: null, partial: false }; durCache[u] = d; return d; };`);
    await page.goto(require('url').pathToFileURL(require('path').join(__dirname, 'test.html')).href);
    await page.waitForTimeout(400);
    return page;
  }
  const goto = async (p, s) => { await navTo(p, s); await p.waitForTimeout(150); };
  const shot = (p, n) => p.screenshot({ path: require('path').join(__dirname, 'shots', n) });
  const SP = 'https://open.spotify.com/album/1weenld61qoidwYuZ1GESA', YT = 'https://www.youtube.com/watch?v=YCNUd1yRo2E';

  // ================= Marta (s1) =================
  let p = await open('s1');
  await goto(p, 'feed');
  await p.fill('#feedForm [name=body]', 'Mirad este disco ' + SP);
  await p.click('#feedForm button[type=submit]'); await p.waitForTimeout(400);
  const card = p.locator('.fpost').first().locator('.linkcard.media');
  ok(await card.count() === 1, 'Inicio: el enlace de Spotify sale como preview');
  ok((await card.locator('.lk').textContent()) === 'Kind of Blue', 'Inicio: la preview lleva el título');
  ok((await card.locator('.tdur').textContent()) === '5 temas · 46 min', 'Inicio: y los temas y la duración');
  ok(await card.locator('.cover.k-album').count() === 1, 'Inicio: portada con el tipo (álbum)');
  ok(await card.getAttribute('data-lp') === null, 'Una vez cargada no se vuelve a pedir');

  // Comentario con YouTube
  await p.locator('.fpost').first().locator('[data-action=open-fpost]').click(); await p.waitForTimeout(200);
  await p.fill('.modal .cm-new textarea', 'Y este directo: ' + YT.replace('https://', ''));
  await p.locator('.modal [data-action=comment-send]').click(); await p.waitForTimeout(400);
  const cc = p.locator('.modal .cmt .linkcard.media');
  ok(await cc.count() === 1, 'Comentario: el enlace de YouTube (aunque sea sin https) sale como preview');
  ok((await cc.locator('.tdur').textContent()) === '5:41', 'Comentario: duración de la canción');
  await shot(p, 'pv1-comentario.png');
  await p.locator('.modal [data-action=close]').first().click(); await p.waitForTimeout(200);

  // Un comentario con un enlace normal no lleva tarjeta
  const n0 = await p.evaluate(() => window.__META_CALLS);
  await p.evaluate(() => { const d = document.createElement('div'); d.innerHTML = commentRow('feed', { id: 'x', author_id: 's1', body: 'Mira https://example.com', created_at: new Date().toISOString() }); return d.querySelectorAll('.linkcard').length; })
    .then(n => ok(n === 0, 'Comentario con un enlace que no es de Spotify/YouTube: sin tarjeta'));

  // Aviso del profesor con enlace de Spotify, visto por la alumna
  await p.evaluate(sp => {
    const now = new Date().toISOString();
    window.__rtExternal('board_posts', { id: 'pv', author_id: 't1', title: 'Para el jueves', body: 'Escuchad esto:\n' + sp, audience: 'all', pinned: false, created_at: now, updated_at: now });
  }, SP);
  await p.waitForTimeout(300);
  await goto(p, 'board'); await p.waitForTimeout(300);
  const bc = p.locator('[data-post=pv] .linkcard.media');
  ok(await bc.count() === 1, 'Avisos: el enlace sale como preview');
  ok((await bc.locator('.lk').textContent()) === 'Kind of Blue', 'Avisos: con su título');
  ok(await p.evaluate(() => window.__META_CALLS) === n0, 'El mismo enlace no se vuelve a pedir (caché)');
  ok(await p.locator('[data-post=p1] .linkcard').count() === 0, 'Avisos: un enlace normal no lleva tarjeta');

  // Mensaje privado al profesor
  await goto(p, 'messages');
  await p.locator('[data-action=dm-open][data-id=t1]').click(); await p.waitForTimeout(200);
  await p.fill('#dmForm textarea', '¿Te vale este? ' + YT);
  await p.click('#dmForm button[type=submit]'); await p.waitForTimeout(400);
  const dc = p.locator('.msg-row.mine .linkcard.media').last();
  ok(await dc.count() === 1, 'Mensajes: el enlace sale como preview');
  ok((await dc.locator('.lk').textContent()) === 'Last Train Home', 'Mensajes: con su título');
  await shot(p, 'pv2-mensajes.png');

  // Móvil: la tarjeta cabe en la pantalla
  const m = await open('s1', { width: 375, height: 800 });
  await goto(m, 'feed');
  await m.fill('#feedForm [name=body]', SP);
  await m.click('#feedForm button[type=submit]'); await m.waitForTimeout(400);
  const box = await m.locator('.fpost').first().locator('.linkcard.media').boundingBox();
  ok(box && box.x >= 0 && box.x + box.width <= 375, 'Móvil: la preview cabe en la pantalla');
  await shot(m, 'pv3-movil.png');

  ok(errors.length === 0, 'Sin errores en consola' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(fails ? `${fails} FALLOS (previews)` : 'Todo OK (previews)');
  process.exit(fails ? 1 : 0);
})();
