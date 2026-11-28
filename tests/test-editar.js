// Editar publicaciones del Inicio: solo quien la escribió, y sale la etiqueta "editado"
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
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('dialog', d => d.accept());
    await page.addInitScript(`window.__ME=${JSON.stringify(me)};`);
    await page.goto(require('url').pathToFileURL(require('path').join(__dirname, 'test.html')).href);
    await page.waitForTimeout(400);
    return page;
  }
  const goto = async (p, s) => { await navTo(p, s); await p.waitForTimeout(150); };
  const shot = (p, n) => p.screenshot({ path: require('path').join(__dirname, 'shots', n) });
  const db = (p, f, a) => p.evaluate(f, a);

  // ================= Marta (s1): su publicación f3 =================
  let p = await open('s1');
  await goto(p, 'feed');
  const mine = p.locator('[data-fpost=f3]'), other = p.locator('[data-fpost=f1]');
  ok(await mine.locator('[data-action=feed-edit]').count() === 1, 'En tu publicación sale "Editar"');
  ok(await other.locator('[data-action=feed-edit]').count() === 0, 'En la de otro no sale "Editar"');
  ok(await mine.locator('.edited').count() === 0, 'Sin editar no sale la etiqueta');

  // Guardar sin cambios no la marca como editada
  await mine.locator('[data-action=feed-edit]').click(); await p.waitForTimeout(150);
  ok(await p.locator('#feedEditForm').count() === 1, 'Se abre el editor');
  ok((await p.inputValue('#feedEditForm [name=body]')) === 'Mi reflexión sobre Kind of Blue', 'El editor trae el texto actual');
  await p.click('#feedEditForm button[type=submit]'); await p.waitForTimeout(250);
  ok(!(await db(p, () => window.__DB.feed_posts.find(x => x.id === 'f3').edited_at)), 'Guardar sin cambios no la marca como editada');

  // Editar de verdad (añadiendo una mención y un enlace)
  await mine.locator('[data-action=feed-edit]').click(); await p.waitForTimeout(150);
  await p.fill('#feedEditForm [name=body]', 'Mi reflexión sobre Kind of Blue (corregida) @Lu youtu.be/abc123');
  await shot(p, 'e1-editor.png');
  await p.click('#feedEditForm button[type=submit]'); await p.waitForTimeout(300);
  const f3 = await db(p, () => window.__DB.feed_posts.find(x => x.id === 'f3'));
  ok(f3.body.includes('(corregida)') && f3.body.includes('<@s2>'), 'Se guarda el texto nuevo con la mención codificada: ' + f3.body);
  ok(f3.link_url === 'https://youtu.be/abc123', 'El enlace se recalcula al editar: ' + f3.link_url);
  ok(!!f3.edited_at && f3.created_at !== f3.edited_at, 'La base de datos pone edited_at');
  ok(await p.locator('#feedEditForm').count() === 0, 'El editor se cierra al guardar');
  ok((await mine.locator('.sub .edited').textContent()) === 'editado', 'Sale "editado" junto a la fecha');
  ok((await mine.locator('.fbody').textContent()).includes('(corregida)'), 'La tarjeta muestra el texto nuevo');
  ok(await db(p, () => window.__DB.notifications.some(n => n.user_id === 's2' && n.kind === 'mention_feed' && n.target_id === 'f3')), 'A quien se menciona al editar le llega la notificación');
  await shot(p, 'e2-editado.png');

  // En el modal de la publicación también sale
  await mine.locator('[data-action=open-fpost]').click(); await p.waitForTimeout(150);
  ok(await p.locator('.modal .edited').count() === 1, 'En la publicación abierta también sale "editado"');
  await p.click('.modal [data-action=close]'); await p.waitForTimeout(150);

  // Volver a editar sin tocar la mención no repite la notificación
  const before = await db(p, () => window.__DB.notifications.filter(n => n.kind === 'mention_feed' && n.target_id === 'f3').length);
  await db(p, () => window.__DB.notifications.forEach(n => n.read_at = n.read_at || new Date().toISOString()));
  await mine.locator('[data-action=feed-edit]').click(); await p.waitForTimeout(150);
  await p.locator('#feedEditForm [name=body]').press('End'); await p.type('#feedEditForm [name=body]', ' !');
  await p.click('#feedEditForm button[type=submit]'); await p.waitForTimeout(300);
  ok(await db(p, () => window.__DB.notifications.filter(n => n.kind === 'mention_feed' && n.target_id === 'f3').length) === before, 'Editar otra vez no vuelve a avisar a quien ya estaba mencionado');

  // Seguridad: no se puede editar lo ajeno ni falsear campos
  const r = await db(p, async () => {
    const a = await sb.from('feed_posts').update({ body: 'hackeado' }).eq('id', 'f1').select();
    const b = await sb.from('feed_posts').update({ body: 'otra vez', author_id: 's2', edited_at: null, created_at: '2020-01-01T00:00:00Z' }).eq('id', 'f3').select();
    return { a: a.data && a.data.length, f1: window.__DB.feed_posts.find(x => x.id === 'f1').body, b: b.data && b.data[0] };
  });
  ok(!r.a && r.f1 !== 'hackeado', 'Un alumno no puede editar la publicación de otro');
  ok(r.b && r.b.author_id === 's1' && !!r.b.edited_at && r.b.created_at !== '2020-01-01T00:00:00Z', 'No se puede cambiar el autor, la fecha ni quitar "editado"');

  // Tiempo real: Luis edita la suya y Marta lo ve sin recargar
  await db(p, () => window.__rtExternalUpdate('feed_posts', 'f1', { body: 'Joe Pass, versión corregida', edited_at: new Date().toISOString() }));
  await p.waitForTimeout(200);
  ok((await other.locator('.fbody').textContent()).includes('versión corregida') && await other.locator('.edited').count() === 1, 'Una edición de otra persona aparece al momento con "editado"');

  // ================= Profesor: modera borrando, no edita lo ajeno =================
  const t = await open('t1');
  await goto(t, 'feed');
  ok(await t.locator('[data-fpost=f1] [data-action=feed-edit]').count() === 0 && await t.locator('[data-fpost=f1] [data-action=feed-delete]').count() === 1, 'El profesor puede borrar pero no editar lo de un alumno');
  ok(await t.locator('[data-fpost=f2] [data-action=feed-edit]').count() === 1, 'El profesor sí edita sus propias publicaciones');
  const tr = await db(t, async () => { const a = await sb.from('feed_posts').update({ body: 'x' }).eq('id', 'f1').select(); return a.data && a.data.length; });
  ok(!tr, 'Ni siquiera por la base de datos puede el profesor cambiar el texto de un alumno');

  // Móvil: el botón cabe
  const m = await open('s1', { width: 390, height: 844 });
  await goto(m, 'feed');
  ok(await m.locator('[data-fpost=f3] [data-action=feed-edit]').isVisible(), 'En el móvil se ve "Editar"');
  await shot(m, 'e3-movil.png');

  ok(errors.length === 0, 'Sin errores en consola: ' + errors.join(' | '));
  console.log(fails ? `\n${fails} FALLOS` : '\nTodo OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
