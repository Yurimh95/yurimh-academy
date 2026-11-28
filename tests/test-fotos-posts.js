// Fotos en posts del Inicio, avisos, comentarios y mensajes privados (2026-11-24)
// Hasta 10 en posts, avisos y mensajes; 1 en comentarios. Texto opcional. Almacén privado "media".
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
// Navegación: menú lateral, barra inferior (móvil), barra superior (Mensajes) o menú de la cuenta (Perfil, Ajustes)
const navTo = async (p, s) => {
  const sel = `.nav button[data-s=${s}]:visible, .tabbar button[data-s=${s}]:visible, .top-r button[data-s=${s}]:visible`;
  if (await p.locator(sel).count()) return p.click(sel);
  await p.click('.avbtn'); await p.waitForTimeout(80);
  if (await p.evaluate(s => S.section === s, s)) return; // en el móvil la foto lleva directa al Perfil
  await p.click(`.memenu [data-s=${s}]`);
};
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  async function open(me, vp = { width: 1100, height: 900 }) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('dialog', d => d.accept());
    await page.addInitScript(`window.__ME=${JSON.stringify(me)};`);
    await page.goto(require('url').pathToFileURL(path.join(__dirname, 'test.html')).href);
    await page.waitForTimeout(400);
    return page;
  }
  const goto = async (p, s) => { await navTo(p, s); await p.waitForTimeout(150); };
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'shots', n) });
  const db = (p, f, a) => p.evaluate(f, a);
  const LOGO = fs.readFileSync(path.join(__dirname, 'logo.png')), ICON = fs.readFileSync(path.join(__dirname, 'icon-192.png'));
  const imgs = (n, b = LOGO) => Array.from({ length: n }, (_, i) => ({ name: `foto${i + 1}.png`, mimeType: 'image/png', buffer: i % 2 ? ICON : b }));
  async function pick(p, sel, files) {
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(sel)]);
    await fc.setFiles(files);
    await p.waitForTimeout(100);
    await p.waitForFunction(() => !document.querySelector('.ph-chip.busy'), null, { timeout: 15000 });
  }
  const chips = (p, key) => p.locator(`[data-ph-strip="${key}"] .ph-chip`).count();
  const storeKeys = (p, prefix) => db(p, pre => Object.keys(window.__STORAGE).filter(k => k.startsWith(pre)), prefix);
  const loaded = (p, sel) => p.waitForFunction(s => { const i = [...document.querySelectorAll(s + ' img')]; return i.length && i.every(x => x.src.startsWith('blob:')); }, sel, { timeout: 5000 }).then(() => true, () => false);

  // ======================= Marta (s1, alumna) =======================
  let p = await open('s1');
  await goto(p, 'feed');
  ok(await p.locator('#feedForm [data-action=md-add][data-key=feed-new]').count() === 1, 'El cuadro de publicar tiene el botón multimedia');

  // --- Elegir, quitar y publicar solo fotos (sin texto) ---
  await pick(p, '#feedForm [data-action=md-add]', imgs(2));
  ok(await chips(p, 'feed-new') === 2, 'Salen las 2 fotos elegidas como miniaturas');
  await p.locator('[data-ph-strip="feed-new"] .ph-x').first().click();
  ok(await chips(p, 'feed-new') === 1, 'La × quita una foto antes de publicar');
  await pick(p, '#feedForm [data-action=md-add]', imgs(1, ICON));
  ok(await chips(p, 'feed-new') === 2, 'Se pueden añadir más en otra tanda');
  await shot(p, 'ph1-borrador.png');
  await p.click('#feedForm button[type=submit]'); await p.waitForTimeout(500);
  let post = await db(p, () => window.__DB.feed_posts.find(x => x.author_id === 's1' && x.photos && x.photos.length === 2));
  ok(!!post && post.body === '', 'Se publica un post solo con fotos (sin texto)');
  ok(post && /^[0-9a-f-]{36}$/.test(post.id) && post.photos.every(x => /^[0-9a-f-]{36}$/.test(x.k) && x.w > 0 && x.h > 0), 'La fila guarda id y claves uuid con su tamaño: ' + JSON.stringify(post && post.photos[0]));
  let files = await storeKeys(p, `feed/s1/${post.id}/`);
  ok(files.length === 4, 'Se suben 2 archivos por foto (grande + miniatura): ' + files.length);
  const sizes = await db(p, pre => Object.entries(window.__STORAGE).filter(([k]) => k.startsWith(pre)).map(([k, v]) => [k.endsWith('_t.jpg') ? 't' : 'b', v.blob.size, v.blob.type]), `feed/s1/${post.id}/`);
  ok(sizes.every(([, s, t]) => t === 'image/jpeg' && s > 0 && s < 700000), 'Todas son JPEG reducidos: ' + sizes.map(x => x[0] + ':' + x[1]).join(' '));
  ok(await chips(p, 'feed-new') === 0, 'Al publicar, el borrador se vacía');
  const card = `[data-fpost="${post.id}"]`;
  ok(await p.locator(`${card} .ph-grid.n2 .ph-cell`).count() === 2, 'La tarjeta enseña la rejilla de 2');
  ok(await p.locator(`${card} .fbody`).count() === 0, 'Sin texto no sale la caja de texto vacía');
  ok(await loaded(p, `${card} .ph-grid`), 'Las fotos se ven al momento (sin volver a descargarlas)');

  // --- 5 fotos: rejilla de 4 con "+1" ---
  await p.fill('#feedForm textarea[name=body]', 'Mis dedos haciendo el ejercicio de legato');
  await pick(p, '#feedForm [data-action=md-add]', imgs(5));
  await p.click('#feedForm button[type=submit]'); await p.waitForTimeout(700);
  const post5 = await db(p, () => window.__DB.feed_posts.find(x => x.author_id === 's1' && x.photos && x.photos.length === 5));
  ok(!!post5 && post5.body.includes('legato'), 'Post con texto y 5 fotos');
  const c5 = `[data-fpost="${post5.id}"]`;
  ok(await p.locator(`${c5} .ph-grid.n4 .ph-cell`).count() === 4, 'Con 5 fotos se ven 4 en rejilla');
  ok((await p.locator(`${c5} .ph-more`).textContent()) === '+1', 'La cuarta lleva "+1"');
  await loaded(p, `${c5} .ph-grid`);
  await shot(p, 'ph2-rejilla.png');

  // --- Tope de 10 ---
  await pick(p, '#feedForm [data-action=md-add]', imgs(12));
  ok(await chips(p, 'feed-new') === 10, 'Como mucho 10 fotos por publicación');
  ok((await p.locator('.toast').allTextContents()).some(t => t.includes('Solo caben 10')), 'Avisa de que solo caben 10');
  await db(p, () => phClear('feed-new'));
  ok(await chips(p, 'feed-new') === 0, 'phClear vacía el borrador');

  // --- Visor a pantalla completa ---
  await p.locator(`${c5} .ph-cell`).nth(1).click(); await p.waitForTimeout(250);
  ok(await p.locator('#lightbox.gal').count() === 1, 'Al pulsar una foto se abre el visor');
  ok((await p.locator('.lb-count').textContent()) === '2 / 5', 'Empieza en la foto pulsada (2 / 5)');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100);
  ok((await p.locator('.lb-count').textContent()) === '3 / 5', 'Flecha derecha: siguiente');
  await p.click('.lb-nav.prev'); await p.click('.lb-nav.prev'); await p.click('.lb-nav.prev'); await p.waitForTimeout(100);
  ok((await p.locator('.lb-count').textContent()) === '5 / 5', 'Las flechas dan la vuelta');
  await p.waitForFunction(() => { const i = document.querySelector('#lightbox img'); return i && i.dataset.full === '1'; }, null, { timeout: 4000 }).catch(() => {});
  ok(await db(p, () => document.querySelector('#lightbox img').dataset.full === '1'), 'En el visor se carga la foto grande');
  await shot(p, 'ph3-visor.png');
  await p.click('#lightbox img'); await p.waitForTimeout(100);
  ok(await p.locator('#lightbox').count() === 1, 'Tocar la foto no cierra el visor');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok(await p.locator('#lightbox').count() === 0, 'Esc cierra el visor');

  // --- Editar: quitar una y añadir otra ---
  await p.locator(`${card} [data-action=feed-edit]`).click(); await p.waitForTimeout(250);
  ok(await chips(p, 'feed-edit') === 2, 'El editor trae las 2 fotos que tenía');
  await p.waitForFunction(() => [...document.querySelectorAll('[data-ph-strip="feed-edit"] img')].every(i => i.src.startsWith('blob:')), null, { timeout: 4000 }).catch(() => {});
  ok(await db(p, () => [...document.querySelectorAll('[data-ph-strip="feed-edit"] img')].every(i => i.src.startsWith('blob:'))), 'Y se ven sus miniaturas');
  const oldK = post.photos[0].k;
  await p.locator('[data-ph-strip="feed-edit"] .ph-x').first().click();
  await pick(p, '#feedEditForm [data-action=ph-add]', imgs(1, ICON));
  await p.click('#feedEditForm button[type=submit]'); await p.waitForTimeout(600);
  let edited = await db(p, id => window.__DB.feed_posts.find(x => x.id === id), post.id);
  ok(edited.photos.length === 2 && !edited.photos.some(x => x.k === oldK) && edited.photos[0].k === post.photos[1].k, 'Se guarda el nuevo orden de fotos');
  ok(!!edited.edited_at, 'Cambiar las fotos cuenta como "editado"');
  files = await storeKeys(p, `feed/s1/${post.id}/`);
  ok(files.length === 4 && !files.some(f => f.includes(oldK)), 'La foto quitada se borra del almacén');
  ok(await p.locator(`${card} .edited`).count() === 1, 'La tarjeta enseña "editado"');
  // Editar sin cambiar nada no marca nada nuevo
  const ed1 = edited.edited_at;
  await p.locator(`${card} [data-action=feed-edit]`).click(); await p.waitForTimeout(200);
  await p.click('#feedEditForm button[type=submit]'); await p.waitForTimeout(300);
  ok((await db(p, id => window.__DB.feed_posts.find(x => x.id === id).edited_at, post.id)) === ed1, 'Guardar sin cambios no vuelve a marcarlo');
  // Cerrar el editor con una foto nueva sin guardar no la sube
  const before = (await storeKeys(p, '')).length;
  await p.locator(`${card} [data-action=feed-edit]`).click(); await p.waitForTimeout(200);
  await pick(p, '#feedEditForm [data-action=ph-add]', imgs(1));
  await p.click('.modal [data-action=close]'); await p.waitForTimeout(200);
  ok((await storeKeys(p, '')).length === before && !(await db(p, () => PH_DRAFT['feed-edit'])), 'Cancelar el editor descarta las fotos nuevas');

  // --- Comentario con 1 foto (elegir otra la cambia) ---
  await p.locator('[data-fpost=f2] [data-action=open-fpost]').first().click(); await p.waitForTimeout(250);
  await pick(p, '.modal [data-action=ph-add][data-ph="cm-feed-f2"]', imgs(1));
  await pick(p, '.modal [data-action=ph-add][data-ph="cm-feed-f2"]', imgs(1, ICON));
  ok(await chips(p, 'cm-feed-f2') === 1, 'En comentarios, solo 1 foto (elegir otra la sustituye)');
  await p.click('.modal [data-action=comment-send]'); await p.waitForTimeout(500);
  const cmt = await db(p, () => window.__DB.feed_comments.find(x => x.post_id === 'f2' && x.author_id === 's1'));
  ok(!!cmt && cmt.body === '' && cmt.photos.length === 1, 'Comentario solo con foto');
  ok(await p.locator(`.modal [data-cmt-id="${cmt.id}"] .ph-grid.cm`).count() === 1, 'El comentario enseña su foto');
  ok(await db(p, () => window.__DB.notifications.some(n => n.user_id === 't1' && n.kind === 'comment' && n.target_id === 'f2')), 'El autor del post recibe el aviso de comentario');
  await p.click('.modal [data-action=close]'); await p.waitForTimeout(200);
  ok(await p.locator('[data-cmpeek=f2] .ph-grid.peek').count() === 1, 'La vista previa del Inicio enseña la foto del comentario');
  await shot(p, 'ph4-comentario.png');

  // --- Mensaje privado al profesor con 3 fotos ---
  await goto(p, 'messages');
  await db(p, () => openDm('t1')); await p.waitForTimeout(300);
  ok(await p.locator('#dmForm [data-action=ph-add][data-ph="dm-t1"]').count() === 1, 'El chat tiene el botón de foto');
  await pick(p, '#dmForm [data-action=ph-add]', imgs(3));
  ok(await chips(p, 'dm-t1') === 3, 'Salen las 3 encima del cuadro de escribir');
  await p.click('#dmForm button[type=submit]'); await p.waitForTimeout(600);
  const dm = await db(p, () => window.__DB.dm_messages.find(x => x.sender_id === 's1' && x.photos && x.photos.length));
  ok(!!dm && dm.body === '' && dm.photos.length === 3, 'Se envía un mensaje solo con 3 fotos');
  ok(await p.locator(`.msg[data-dmid="${dm.id}"] .ph-grid.dm.n3`).count() === 1, 'El mensaje enseña la rejilla de 3');
  ok(await p.locator(`.msg[data-dmid="${dm.id}"] .msg-body`).count() === 0, 'Sin texto no sale burbuja de texto vacía');
  ok((await p.locator('.dm-list, .dm-side, #app').first().textContent()).includes('📷 Foto'), 'En la lista de chats sale "📷 Foto"');
  await loaded(p, `.msg[data-dmid="${dm.id}"] .ph-grid`);
  await shot(p, 'ph5-mensaje.png');

  // --- Privacidad (mismas reglas que media_visible en el SQL) ---
  const vis = (who, pth) => db(p, ([w, x]) => window.__asUser(w, () => window.__mediaVisible(x)), [who, pth]);
  const dmPath = `dm/s1/${dm.id}/${dm.photos[0].k}.jpg`, feedPath = `feed/s1/${post5.id}/${post5.photos[0].k}_t.jpg`;
  ok(await vis('t1', dmPath), 'El destinatario (profesor) ve las fotos del mensaje');
  ok(!(await vis('s2', dmPath)), 'Otro alumno NO ve las fotos de un mensaje ajeno');
  ok(await vis('s2', feedPath), 'Un alumno aprobado ve las fotos del Inicio');
  ok(!(await vis('s3', feedPath)), 'Una cuenta sin aprobar NO ve las fotos del Inicio');
  ok(!(await vis('s2', `feed/s1/${post.id}/${oldK}.jpg`)), 'Una foto quitada al editar ya no la ve nadie más');
  // Foto en un comentario de una escucha que Marta no tiene (i2 solo es de Luis)
  await db(p, () => { const k = '11111111-2222-4333-8444-555555555555';
    window.__DB.listening_comments.push({ id: 'lcph', item_id: 'i2', author_id: 's2', body: '', photos: [{ k, w: 10, h: 10 }], created_at: new Date().toISOString() }); });
  const lcPath = 'lcomment/s2/lcph/11111111-2222-4333-8444-555555555555.jpg';
  ok(!(await vis('s1', lcPath)), 'Foto en el comentario de una escucha que no tienes: NO la ves');
  ok(await vis('t1', lcPath), 'El profesor sí la ve');
  // Archivar al autor oculta sus fotos
  await db(p, () => { window.__DB.profiles.find(x => x.id === 's1').archived_at = new Date().toISOString(); });
  ok(!(await vis('s2', feedPath)), 'Si el autor está archivado, sus fotos dejan de verse');
  await db(p, () => { window.__DB.profiles.find(x => x.id === 's1').archived_at = null; });
  // Subir: solo a tu carpeta, solo JPEG y los avisos solo el profesor
  const up = (pth, type = 'image/jpeg') => db(p, async ([x, t]) => (await window.supabase.createClient().storage.from('media').upload(x, new Blob(['x'], { type: t }), { contentType: t })).error, [pth, type]);
  const K = '99999999-2222-4333-8444-555555555555';
  ok(!!(await up(`feed/s2/abc/${K}.jpg`)), 'No se puede subir a la carpeta de otra persona');
  ok(!!(await up(`board/s1/abc/${K}.jpg`)), 'Un alumno no puede subir fotos de avisos');
  ok(!!(await up(`feed/s1/abc/${K}.png`, 'image/png')), 'Solo se aceptan JPEG');
  ok(!!(await up(`feed/s1/abc/../../${K}.jpg`)), 'Rutas raras rechazadas');
  ok(!(await up(`feed/s1/abc/${K}.jpg`)), 'A tu carpeta sí');

  // --- Borrar lo tuyo borra sus fotos ---
  await goto(p, 'feed');
  await p.locator(`${card} [data-action=feed-delete]`).click(); await p.waitForTimeout(400);
  ok((await storeKeys(p, `feed/s1/${post.id}/`)).length === 0, 'Al borrar el post se borran sus fotos');
  await goto(p, 'messages'); await db(p, () => openDm('t1')); await p.waitForTimeout(300);
  await db(p, id => actions['dm-delete']({ dataset: { id } }), dm.id); await p.waitForTimeout(400);
  ok((await storeKeys(p, `dm/s1/${dm.id}/`)).length === 0, 'Al borrar el mensaje se borran sus fotos');

  // --- Móvil ---
  await p.setViewportSize({ width: 390, height: 844 });
  await goto(p, 'feed'); await p.waitForTimeout(200);
  await p.locator(c5).scrollIntoViewIfNeeded(); await loaded(p, `${c5} .ph-grid`);
  await shot(p, 'ph6-movil.png');
  const gw = await db(p, s => document.querySelector(s + ' .ph-grid').getBoundingClientRect().width, c5);
  ok(gw > 250 && gw <= 390, 'En el móvil la rejilla ocupa el ancho de la tarjeta: ' + Math.round(gw));
  await p.locator(`${c5} .ph-cell`).first().click(); await p.waitForTimeout(250);
  // deslizar el dedo pasa de foto
  await db(p, () => { const lb = document.querySelector('#lightbox'); const t = (type, x) => lb.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: lb, clientX: x, clientY: 300 })], changedTouches: [new Touch({ identifier: 1, target: lb, clientX: x, clientY: 300 })] })); t('touchstart', 300); t('touchend', 120); });
  await p.waitForTimeout(100);
  ok((await p.locator('.lb-count').textContent()) === '2 / 5', 'Deslizar el dedo pasa a la siguiente foto');
  await shot(p, 'ph7-visor-movil.png');
  await p.keyboard.press('Escape');

  // ======================= Profesor (t1): avisos =======================
  p = await open('t1');
  await goto(p, 'board');
  await p.click('[data-action=new-post]'); await p.waitForTimeout(200);
  await p.fill('#postForm [name=title]', 'Así se coloca la mano');
  await p.click('#postForm button[type=submit]'); await p.waitForTimeout(200);
  ok((await p.locator('.toast').allTextContents()).some(t => t.includes('Escribe un mensaje o añade alguna foto')), 'Aviso sin texto ni fotos: no se publica');
  await pick(p, '#postForm [data-action=ph-add]', imgs(1));
  await p.click('#postForm button[type=submit]'); await p.waitForTimeout(600);
  const bp = await db(p, () => window.__DB.board_posts.find(x => x.title === 'Así se coloca la mano'));
  ok(!!bp && bp.body === '' && bp.photos.length === 1 && bp.author_id === 't1', 'Aviso con título y foto, sin texto');
  ok(await p.locator(`.card.post[data-post="${bp.id}"] .ph-grid.n1`).count() === 1, 'El aviso enseña la foto');
  ok(await p.locator(`.card.post[data-post="${bp.id}"] .postbody`).count() === 0, 'Sin texto no sale el recuadro vacío');
  await loaded(p, `.card.post[data-post="${bp.id}"] .ph-grid`);
  await shot(p, 'ph8-aviso.png');
  const bPath = `board/t1/${bp.id}/${bp.photos[0].k}.jpg`;
  const vis2 = (who, pth) => db(p, ([w, x]) => window.__asUser(w, () => window.__mediaVisible(x)), [who, pth]);
  ok(await vis2('s1', bPath) && await vis2('s2', bPath), 'Aviso para todos: todos los alumnos ven la foto');
  // Aviso solo para Luis
  await p.click('[data-action=new-post]'); await p.waitForTimeout(200);
  await p.fill('#postForm [name=title]', 'Solo Luis, con foto');
  await p.check('#postForm input[name=audience][value=selected]');
  await p.check('#postForm input[name=pick][value=s2]');
  await pick(p, '#postForm [data-action=ph-add]', imgs(2));
  await p.click('#postForm button[type=submit]'); await p.waitForTimeout(600);
  const bp2 = await db(p, () => window.__DB.board_posts.find(x => x.title === 'Solo Luis, con foto'));
  const b2Path = `board/t1/${bp2.id}/${bp2.photos[0].k}_t.jpg`;
  ok(await vis2('s2', b2Path), 'Aviso dirigido: su destinatario ve las fotos');
  ok(!(await vis2('s1', b2Path)), 'Aviso dirigido: los demás NO ven sus fotos');
  // Editar: quitar la única foto de un aviso sin texto no se deja
  await p.locator(`.card.post[data-post="${bp.id}"] [data-action=edit-post]`).click(); await p.waitForTimeout(250);
  ok(await chips(p, 'board') === 1, 'El editor del aviso trae su foto');
  await p.locator('[data-ph-strip="board"] .ph-x').click();
  await p.click('#postForm button[type=submit]'); await p.waitForTimeout(250);
  ok((await db(p, id => window.__DB.board_posts.find(x => x.id === id).photos.length, bp.id)) === 1, 'Quitar la única foto de un aviso sin texto no se guarda');
  await p.fill('#postForm [name=body]', 'Fíjate en el pulgar');
  await p.click('#postForm button[type=submit]'); await p.waitForTimeout(500);
  const bpe = await db(p, id => window.__DB.board_posts.find(x => x.id === id), bp.id);
  ok(bpe.photos.length === 0 && bpe.body.includes('pulgar'), 'Con texto sí se puede quitar la foto');
  ok((await storeKeys(p, `board/t1/${bp.id}/`)).length === 0, 'Y su archivo se borra');
  // Vista de alumno: se ve, pero no se sube nada
  const n0 = (await storeKeys(p, '')).length;
  await db(p, () => enterPreview()); await p.waitForTimeout(400);
  await goto(p, 'feed');
  await pick(p, '#feedForm [data-action=md-add]', imgs(1));
  await p.click('#feedForm button[type=submit]'); await p.waitForTimeout(400);
  ok((await storeKeys(p, '')).length === n0, 'En la vista de alumno no se sube ninguna foto');
  await db(p, () => exitPreview()); await p.waitForTimeout(400);

  // Moderación: una denuncia de un post con fotos las enseña
  await db(p, () => { const k = '22222222-2222-4333-8444-555555555555';
    window.__DB.feed_posts.push({ id: 'fph', author_id: 's2', body: '', link_url: null, photos: [{ k, w: 10, h: 10 }], created_at: new Date().toISOString() });
    window.__DB.moderation_reports.push({ id: 'rph', reporter_id: 's1', target_type: 'feed_post', target_id: 'fph', reason: null, resolved: false, created_at: new Date().toISOString() }); });
  await db(p, async () => { await loadData(); S.section = 'mod'; render(); }); await p.waitForTimeout(300);
  ok(await p.locator('.row.rep .ph-grid').count() >= 1, 'En Moderación se ven las fotos denunciadas');
  ok((await p.locator('.row.rep').allTextContents()).some(t => t.includes('📷 Foto')), 'Y el resumen dice "📷 Foto" si no hay texto');

  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'Sin errores en consola');
  console.log(fails ? `\n${fails} FALLOS` : '\nTodo OK');
  await browser.close();
  process.exit(fails || errors.length ? 1 : 0);
})();
