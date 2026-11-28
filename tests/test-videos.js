// Vídeos: stories (24 h) y posts del Inicio con un vídeo que caduca a 1, 3 o 7 días (2026-11-25)
// La compresión real (Mediabunny/WebCodecs) se sustituye por window.__VID_STUB.
const { chromium } = require('playwright');
// Navegación: menú lateral, barra inferior (móvil), barra superior (Mensajes) o menú de la cuenta (Perfil, Ajustes)
const navTo = async (p, s) => {
  const sel = `.nav button[data-s=${s}]:visible, .tabbar button[data-s=${s}]:visible, .top-r button[data-s=${s}]:visible`;
  if (await p.locator(sel).count()) return p.click(sel);
  await p.click('.avbtn'); await p.waitForTimeout(80);
  if (await p.evaluate(s => S.section === s, s)) return; // en el móvil la foto lleva directa al Perfil
  await p.click(`.memenu [data-s=${s}]`);
};
const path = require('path');
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  const STUB = `window.__VID_STUB = async (file, onProg) => {
    for (let i = 1; i <= 4; i++) { await new Promise(r => setTimeout(r, 30)); onProg && onProg(i / 4); }
    if (/malo/.test(file.name)) throw Object.assign(new Error('Tu navegador no puede preparar este vídeo. Prueba con Chrome o Safari actualizados'), { vd: true });
    const c = document.createElement('canvas'); c.width = 90; c.height = 160; c.getContext('2d').fillRect(0, 0, 90, 160);
    const thumb = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.7));
    return { k: crypto.randomUUID(), w: 720, h: 1280, d: 12.5, blob: new Blob([new Uint8Array(300000)], { type: 'video/mp4' }), thumb, url: URL.createObjectURL(thumb), trimmed: /largo/.test(file.name) };
  };`;
  async function open(me, db = null, files = null, vp = { width: 1100, height: 900 }) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(me + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|MEDIA_ERR|NotSupportedError|no supported source/i.test(m.text())) errors.push(me + ' console: ' + m.text()); });
    page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Me hace sentir mal' : undefined));
    await page.addInitScript(`window.__ME=${JSON.stringify(me)};${STUB}`);
    if (db) await page.addInitScript(`window.__DB_OVERRIDE=${JSON.stringify(db)}`);
    await page.goto(require('url').pathToFileURL(path.join(__dirname, 'test.html')).href);
    if (files) await page.evaluate(fs => fs.forEach(([p, bucket, size, owner]) => { window.__STORAGE[p] = { blob: new Blob([new Uint8Array(size)], { type: bucket === 'video' ? 'video/mp4' : 'image/jpeg' }), owner, bucket, size, created_at: new Date().toISOString() }; }), files);
    await page.waitForTimeout(400);
    return page;
  }
  const db = (p, f, a) => p.evaluate(f, a);
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'shots', n) });
  const state = p => db(p, () => window.__DB);
  const files = p => db(p, () => Object.entries(window.__STORAGE).map(([k, v]) => [k, v.bucket, v.size, v.owner]));
  async function pickVideo(p, sel, name = 'riff.mp4') {
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(sel)]);
    await fc.setFiles({ name, mimeType: 'video/mp4', buffer: Buffer.alloc(2000) });
    await p.waitForTimeout(80);
    await p.waitForFunction(() => !document.querySelector('.vd-chip.busy'), null, { timeout: 8000 });
  }
  const toastText = p => p.evaluate(() => (document.querySelector('#toast') || {}).textContent || '');

  // ======================= Marta (s1, alumna menor) =======================
  let p = await open('s1');
  ok(await p.locator('.stories:visible .st-me [data-action=story-add]').count() >= 1, 'Arriba del Inicio está "Tu story" con el botón +');
  ok(await p.locator('#feedForm [data-action=md-add]').count() === 1 && await p.locator('#feedForm [data-action=vd-add], #feedForm [data-action=ph-add]').count() === 0, 'El cuadro de publicar tiene un solo botón multimedia (fotos o vídeo)');
  ok(!(await p.locator('#feedForm .vd-days').isVisible()), 'Sin vídeo no sale la duración');

  // --- Elegir vídeo: sale el borrador y la duración; no se mezclan fotos y vídeo ---
  await pickVideo(p, '#feedForm [data-action=md-add]');
  ok(await p.locator('[data-vd-draft="feed-new"] .vd-chip:not(.busy)').count() === 1, 'El vídeo elegido sale como borrador con su portada');
  ok(await p.locator('#feedForm .vd-days').isVisible(), 'Con vídeo sale "El vídeo se borra a los…"');
  ok(/poco espacio/.test(await p.locator('#feedForm .vd-days small').textContent()), 'Y la letra pequeña sobre el poco espacio');
  ok(await p.locator('#feedForm [name=vdays] option').evaluateAll(o => o.map(x => x.value).join(',')) === '1,3,7', 'Se puede elegir 1, 3 o 7 días');
  await p.evaluate(() => mdAddFiles('feed-new', [new File([1], 'foto.jpg', { type: 'image/jpeg' })])); await p.waitForTimeout(150);
  ok(/fotos o un vídeo/.test(await toastText(p)), 'Con un vídeo no deja añadir fotos');
  await p.click('[data-vd-draft="feed-new"] [data-action=vd-del]');
  ok(await p.locator('[data-vd-draft="feed-new"] .vd-chip').count() === 0 && !(await p.locator('#feedForm .vd-days').isVisible()), 'La × quita el vídeo');

  // --- Un vídeo que el navegador no sabe preparar ---
  await pickVideo(p, '#feedForm [data-action=md-add]', 'malo.mov');
  ok(/no puede preparar/.test(await toastText(p)) && await p.locator('[data-vd-draft="feed-new"] .vd-chip').count() === 0, 'Si no se puede preparar, avisa y no queda borrador');

  // --- Publicar con texto y 7 días ---
  await pickVideo(p, '#feedForm [data-action=md-add]');
  await p.fill('#feedForm textarea', 'Mi primer riff en vídeo');
  await p.selectOption('#feedForm [name=vdays]', '7');
  await shot(p, 'vd1-borrador.png');
  await p.click('#feedForm button[type=submit]'); await p.waitForTimeout(600);
  let D = await state(p);
  const fp = D.feed_posts.find(x => x.author_id === 's1' && x.video);
  ok(!!fp && fp.body === 'Mi primer riff en vídeo' && fp.photos.length === 0, 'Se publica el post con su vídeo');
  ok(fp && Object.keys(fp.video).sort().join() === 'd,h,k,w' && fp.video.w === 720, 'La fila guarda {k, w, h, d}: ' + JSON.stringify(fp && fp.video));
  ok(fp && Math.abs((new Date(fp.video_expires_at) - Date.now()) / 86400000 - 7) < 0.01, 'Caduca a los 7 días');
  let F = await files(p);
  ok(F.some(([k, b]) => k === `fvideo/s1/${fp.id}/${fp.video.k}.mp4` && b === 'video') && F.some(([k, b]) => k === `fvideo/s1/${fp.id}/${fp.video.k}_t.jpg` && b === 'media'), 'El vídeo va al almacén "video" y su portada al de fotos');
  const card = `[data-fpost="${fp.id}"]`;
  ok(await p.locator(`${card} .vd`).count() === 1 && /7 días/.test(await p.locator(`${card} .vd-exp`).textContent()), 'La tarjeta enseña el vídeo y "Se borra en 7 días"');
  ok(await p.locator(`${card} .vd-dur`).textContent() === '0:13', 'Y su duración');
  await p.click(`${card} [data-action=vd-play]`); await p.waitForTimeout(300);
  ok(await p.locator(`${card} .vd video`).count() === 1, 'Al pulsar ▶ sale el reproductor');
  ok((await state(p)).video_plays.length === 0, 'Ver tu propio vídeo recién subido no cuenta (no se descarga)');
  await shot(p, 'vd2-post.png');
  // Si sale de la pantalla mientras suena, se pausa y al volver se reanuda (en la prueba el vídeo no suena de verdad: se simula)
  await p.evaluate(sel => {
    const v = document.querySelector(sel); window.__vdPaused = 0; window.__vdPlayed = 0; let paused = false;
    Object.defineProperty(v, 'paused', { configurable: true, get: () => paused });
    v.pause = () => { window.__vdPaused++; paused = true; };
    v.play = () => { window.__vdPlayed++; paused = false; return Promise.resolve(); };
    const sp = document.createElement('div'); sp.id = 'vdSpacer'; sp.style.height = '5000px'; document.body.appendChild(sp);
  }, `${card} .vd video`);
  await p.locator(`${card} .vd video`).scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
  ok(await p.evaluate(() => window.__vdPaused) === 0, 'Mientras se ve, el vídeo sigue sonando');
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(300);
  ok(await p.evaluate(() => window.__vdPaused) >= 1, 'Al desplazarse hasta que no se ve, el vídeo se pausa');
  await p.locator(`${card} .vd video`).scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  ok(await p.evaluate(() => window.__vdPlayed) === 1, 'Al volver a verlo, se reanuda solo');
  await p.evaluate(sel => document.querySelector(sel).pause(), `${card} .vd video`); // lo pausa la persona
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(300);
  await p.locator(`${card} .vd video`).scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  ok(await p.evaluate(() => window.__vdPlayed) === 1, 'Si lo había pausado la persona, al volver no se reanuda');
  await p.evaluate(() => { document.getElementById('vdSpacer').remove(); window.scrollTo(0, 0); });
  // Arranque solo al bajar (muteado); el que ya se ve al entrar en el Inicio espera a que salga y vuelva
  await p.evaluate(() => { S.section = 'board'; render(); S.section = 'feed'; render(); window.scrollTo(0, 0); });
  await p.locator(`${card} .vd`).scrollIntoViewIfNeeded(); await p.waitForTimeout(700);
  ok(await p.locator(`${card} .vd video`).count() === 0, 'El vídeo que ya está en pantalla al entrar en el Inicio no arranca solo');
  await p.evaluate(() => { const sp = document.createElement('div'); sp.id = 'vdSpacer'; sp.style.height = '5000px'; document.body.appendChild(sp); window.scrollTo(0, document.body.scrollHeight); });
  await p.waitForTimeout(300);
  await p.locator(`${card} .vd`).scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
  ok(await p.locator(`${card} .vd video`).count() === 1, 'Al salir de la pantalla y volver, arranca solo');
  ok(await p.evaluate(sel => document.querySelector(sel).muted, `${card} .vd video`), 'Y arranca muteado');
  await p.evaluate(() => { document.getElementById('vdSpacer').remove(); S.section = 'board'; render(); S.section = 'feed'; render(); window.scrollTo(0, 0); });

  // --- Solo vídeo, sin texto ---
  await pickVideo(p, '#feedForm [data-action=md-add]');
  await p.click('#feedForm button[type=submit]'); await p.waitForTimeout(600);
  D = await state(p);
  const fp2 = D.feed_posts.find(x => x.author_id === 's1' && x.video && x.body === '');
  ok(!!fp2 && Math.abs((new Date(fp2.video_expires_at) - Date.now()) / 86400000 - 1) < 0.01, 'Un post solo con vídeo se publica (1 día por defecto)');

  // --- La base de datos pone la caducidad (no se puede alargar) ---
  const cheat = await db(p, async () => { const { data, error } = await sb.from('feed_posts').insert({ id: crypto.randomUUID(), author_id: 's1', body: 'trampa', photos: [], video: { k: crypto.randomUUID(), w: 720, h: 1280, d: 5 }, video_expires_at: new Date(Date.now() + 90 * 86400000).toISOString() }).select().single(); return error ? 'ERR' : (new Date(data.video_expires_at) - Date.now()) / 86400000; });
  ok(cheat !== 'ERR' && Math.abs(cheat - 1) < 0.01, 'Una caducidad que no sea 1, 3 o 7 días se queda en 1');
  const mix = await db(p, async () => (await sb.from('feed_posts').insert({ id: crypto.randomUUID(), author_id: 's1', body: '', photos: [{ k: crypto.randomUUID(), w: 10, h: 10 }], video: { k: crypto.randomUUID(), w: 720, h: 1280, d: 5 }, video_expires_at: new Date().toISOString() })).error);
  ok(!!mix, 'Vídeo y fotos en el mismo post: la base de datos lo rechaza');
  const editVid = await db(p, async id => { await sb.from('feed_posts').update({ body: 'editado', video: { k: crypto.randomUUID(), w: 1, h: 1, d: 1 }, video_expires_at: new Date(Date.now() + 99 * 86400000).toISOString() }).eq('id', id); return window.__DB.feed_posts.find(x => x.id === id); }, fp.id);
  ok(editVid.video.k === fp.video.k && editVid.video_expires_at === fp.video_expires_at && editVid.body === 'editado', 'Al editar no se puede cambiar el vídeo ni su caducidad');

  // --- Story ---
  await pickVideo(p, '.stories:visible .st-me [data-action=story-add]', 'escala-largo.mp4');
  await p.waitForFunction(() => document.querySelector('#lightbox.sed [data-sed=publish]:not([disabled])'), null, { timeout: 8000 });
  ok(await p.locator('#lightbox.sed .st-media video:not([hidden])').count() === 1, 'El editor de la story enseña el vídeo');
  ok(/24 horas/.test(await p.locator('#lightbox.sed .sed-hint').textContent()), 'Y explica que se borra a las 24 horas');
  ok(/primer minuto/.test(await toastText(p)), 'Un vídeo de más de 60 s avisa de que se queda el primer minuto');
  await shot(p, 'vd3-nueva-story.png');
  await p.click('#lightbox.sed [data-sed=publish]'); await p.waitForTimeout(600);
  D = await state(p);
  const st = D.stories.find(x => x.author_id === 's1');
  ok(!!st && Math.abs((new Date(st.expires_at) - Date.now()) / 3600000 - 24) < 0.05, 'La story se publica y caduca a las 24 h');
  ok(await p.locator('#modalRoot .modal').count() === 0 && /own/.test(await p.locator('.stories:visible .st-me .st-ring').getAttribute('class')), 'Se cierra la ventana y "Tu story" sale con aro');
  const cheatSt = await db(p, async () => { const { data } = await sb.from('stories').insert({ id: crypto.randomUUID(), author_id: 's1', video: { k: crypto.randomUUID(), w: 720, h: 1280, d: 3 }, expires_at: '2099-01-01T00:00:00Z' }).select().single(); window.__DB.stories = window.__DB.stories.filter(x => x.id !== data.id); return (new Date(data.expires_at) - Date.now()) / 3600000; });
  ok(Math.abs(cheatSt - 24) < 0.05, 'La caducidad de la story la pone la base de datos (24 h siempre)');
  await p.click('.stories:visible .st-me .st-ring'); await p.waitForTimeout(400);
  ok(await p.locator('#lightbox.story').count() === 1, 'Pulsar tu story abre el visor');
  ok(/0 vistas/.test(await p.locator('.sv-foot').textContent()) && await p.locator('.sv-reply').count() === 0, 'En la tuya salen las vistas y no el cuadro de responder');
  await shot(p, 'vd4-visor-propio.png');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok(await p.locator('#lightbox').count() === 0, 'Esc cierra el visor');

  // --- Borrar un post con vídeo borra sus archivos ---
  await p.click(`[data-fpost="${fp2.id}"] [data-action=feed-delete]`); await p.waitForTimeout(400);
  F = await files(p);
  ok(!F.some(([k]) => k.includes(fp2.id)), 'Borrar tu post con vídeo borra el vídeo y su portada');
  // Otro post solo con vídeo y un comentario, para ver qué queda al caducar
  await pickVideo(p, '#feedForm [data-action=md-add]');
  await p.click('#feedForm button[type=submit]'); await p.waitForTimeout(500);
  const fp3 = (await state(p)).feed_posts.find(x => x.author_id === 's1' && x.video && x.body === '');
  await db(p, id => sb.from('feed_comments').insert({ id: crypto.randomUUID(), post_id: id, author_id: 's1', body: '¿Qué tal suena?' }), fp3.id);
  D = await state(p); F = await files(p);
  await p.context().close();

  // ======================= Luis (s2, alumno adulto) =======================
  p = await open('s2', D, F);
  ok(await p.locator('.stories:visible button.st-item[data-id=s1] .st-ring.new').count() === 1, 'Luis ve la story de Marta con el aro de "nueva"');
  ok(await p.locator(`[data-fpost="${fp.id}"] .vd`).count() === 1, 'Y el post con vídeo');
  await p.click(`[data-fpost="${fp.id}"] [data-action=vd-play]`); await p.waitForTimeout(400);
  D = await state(p);
  ok(D.video_plays.length === 1 && D.video_plays[0].user_id === 's2' && D.video_plays[0].bytes === 300000, 'Reproducir apunta lo que pesa el vídeo para el fusible del mes');
  await p.click('.stories:visible button.st-item[data-id=s1]'); await p.waitForTimeout(500);
  D = await state(p);
  ok(D.story_views.some(v => v.story_id === st.id && v.user_id === 's2'), 'Al verla se apunta que Luis la ha visto');
  ok(await p.locator('.sv-quick button').count() === 7, 'Salen los 6 emojis rápidos y el "+"');
  ok(await p.locator('#svReplyForm').count() === 0, 'Marta es menor sin permiso: Luis no le puede responder por privado');
  await p.click('.sv-quick [data-sv-pick="❤️"]'); await p.waitForTimeout(300);
  D = await state(p);
  ok(D.story_reactions.some(r => r.story_id === st.id && r.user_id === 's2' && r.emoji === '❤️'), 'Reaccionar con un emoji');
  ok(D.notifications.some(n => n.user_id === 's1' && n.kind === 'story_reaction' && n.extra === '❤️'), 'A Marta le llega el aviso de la reacción');
  await p.click('.sv-quick [data-sv-more]'); await p.waitForTimeout(250);
  await p.click('#emojiBox [data-emoji="🔥"]'); await p.waitForTimeout(300);
  D = await state(p);
  ok(D.story_reactions.filter(r => r.story_id === st.id && r.user_id === 's2').map(r => r.emoji).join() === '🔥', 'Con "+" se puede reaccionar con cualquier emoji (una por persona)');
  ok(await p.locator('#lightbox.story').count() === 1, 'Elegir el emoji no cierra el visor');
  await shot(p, 'vd5-visor-otro.png');
  await p.click('.sv-head [data-sv=more]'); await p.waitForTimeout(150);
  await p.click('.sv-menu [data-action=report]'); await p.waitForTimeout(300);
  D = await state(p);
  ok(D.moderation_reports.some(r => r.target_type === 'story' && r.target_id === st.id && r.reporter_id === 's2'), 'Se puede denunciar una story');
  await p.click('.sv-head [data-sv=close]'); await p.waitForTimeout(150);
  ok(await p.locator('.stories:visible button.st-item[data-id=s1] .st-ring.new').count() === 0, 'Al cerrar, la story ya sale como vista');
  const canRead = await db(p, ([sid, path]) => ({
    s2: window.__mediaVisible(path),
    pending: window.__asUser('s3', () => window.__mediaVisible(path))
  }), [st.id, `story/s1/${st.id}/${st.video.k}.mp4`]);
  ok(canRead.s2 === true && canRead.pending === false, 'El vídeo de la story lo ve un alumno aprobado, no una cuenta pendiente');
  D = await state(p); F = await files(p);
  await p.context().close();

  // ======================= Yuri (profesor) =======================
  p = await open('t1', D, F);
  await p.click('.nav button[data-s=mod]'); await p.waitForTimeout(200);
  ok(await p.locator('.row.rep .msg-story').count() === 1 && await p.locator('.row.rep', { hasText: 'Story · denunciada' }).count() === 1, 'En Moderación sale la story denunciada con "Ver la story"');
  ok((await db(p, async () => (await sb.from('story_views').select('*')).data.length)) === 0, 'El profesor no ve quién ha visto las stories de los alumnos');
  await p.click('.row.rep .msg-story'); await p.waitForTimeout(400);
  ok(!(await state(p)).story_views.some(v => v.user_id === 't1'), 'Revisar una story denunciada no cuenta como vista');
  ok(await p.locator('#lightbox.story').count() === 1, 'El profesor la puede abrir desde la denuncia');
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  // Caducada pero denunciada: el profesor la sigue viendo; los alumnos no
  await db(p, id => { window.__DB.stories.find(s => s.id === id).expires_at = new Date(Date.now() - 60000).toISOString(); }, st.id);
  const exp = await db(p, ([id, path]) => ({
    teacher: window.__mediaVisible(path),
    s2: window.__asUser('s2', () => window.__mediaVisible(path))
  }), [st.id, `story/s1/${st.id}/${st.video.k}.mp4`]);
  ok(exp.teacher === true && exp.s2 === false, 'Caducada: los alumnos ya no la ven; el profesor sí, porque está denunciada');
  // Los vídeos de posts caducados
  await db(p, id => { const t = new Date(Date.now() - 1000).toISOString(); window.__DB.feed_posts.find(x => x.id === id).video_expires_at = t; S.fposts.find(x => x.id === id).video_expires_at = t; }, fp.id);
  const fexp = await db(p, path => window.__asUser('s2', () => window.__mediaVisible(path)), `fvideo/s1/${fp.id}/${fp.video.k}.mp4`);
  ok(fexp === false, 'Un vídeo de post caducado deja de verse al momento');
  await p.click('.nav button[data-s=feed]'); await p.waitForTimeout(200);
  ok(await p.locator(`[data-fpost="${fp.id}"] .vd-gone`).count() === 1 && await p.locator(`[data-fpost="${fp.id}"] .fbody`).count() === 1, 'El post caducado se queda con el texto y "Vídeo no disponible"');
  // Lo que hace media_expire cada hora: quitar el vídeo (llega en directo como un cambio del post)
  await db(p, id => window.__rtExternalUpdate('feed_posts', id, { video: null, video_expires_at: new Date(Date.now() - 1000).toISOString() }), fp3.id);
  await p.waitForTimeout(300);
  const c3 = `[data-fpost="${fp3.id}"]`;
  ok(await p.locator(c3).count() === 1 && /no disponible/.test(await p.locator(`${c3} .vd-gone`).textContent()), 'Un post solo con vídeo NO se borra al caducar: sale "Vídeo no disponible"');
  ok(/Qué tal suena/.test(await p.locator(`${c3} [data-cmpeek]`).textContent()), 'Y conserva sus comentarios');
  ok(await db(p, id => window.__DB.feed_posts.some(x => x.id === id && x.video === null && x.body === ''), fp3.id), 'La base de datos acepta el post sin texto y sin vídeo porque tuvo vídeo');
  // Ajustes: lo gastado este mes
  await navTo(p, 'settings'); await p.waitForTimeout(300);
  ok(/de 3 GB este mes/.test(await p.locator('[data-vquota]').textContent()), 'En Ajustes el profesor ve lo gastado en vídeo este mes');
  // Una story del profesor
  await pickVideo(p, '.stories:visible .st-me [data-action=story-add]').catch(async () => { await p.click('.nav button[data-s=feed]'); await pickVideo(p, '.stories:visible .st-me [data-action=story-add]'); });
  await p.waitForFunction(() => document.querySelector('#lightbox.sed [data-sed=publish]:not([disabled])'), null, { timeout: 8000 });
  await p.click('#lightbox.sed [data-sed=publish]'); await p.waitForTimeout(500);
  D = await state(p); F = await files(p);
  const tst = D.stories.find(x => x.author_id === 't1');
  ok(!!tst, 'El profesor también sube stories');
  await p.context().close();

  // ======================= Luis responde a la story del profesor =======================
  p = await open('s2', D, F);
  await p.click('.stories:visible button.st-item[data-id=t1]'); await p.waitForTimeout(400);
  ok(await p.locator('#svReplyForm').count() === 1, 'Al profesor sí se le puede responder');
  await p.fill('#svReplyForm input', '¡Qué bien suena!');
  await p.press('#svReplyForm input', 'Enter'); await p.waitForTimeout(400);
  D = await state(p);
  const rep = D.dm_messages.find(m => m.story_id === tst.id);
  ok(!!rep && rep.sender_id === 's2' && rep.recipient_id === 't1' && rep.body === '¡Qué bien suena!', 'La respuesta llega como mensaje privado ligado a la story');
  const fake = await db(p, async () => (await sb.from('dm_messages').insert({ id: crypto.randomUUID(), sender_id: 's2', recipient_id: 't1', body: 'x', story_id: 'no-existe' })).error);
  ok(!!fake, 'No se puede ligar un mensaje a una story que no existe o no es de quien lo recibe');
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  await navTo(p, 'messages'); await p.waitForTimeout(200);
  await p.click('.dm-conv[data-id=t1]');
  await p.waitForTimeout(250);
  ok(await p.locator('.msg-story').count() >= 1 && /Has respondido a su story/.test(await p.locator('.msg-story').first().textContent()), 'En la conversación sale "Has respondido a su story"');
  // Fusible: si se pasa del presupuesto del mes, no se pueden subir vídeos
  await db(p, () => { window.__VIDEO_BUDGET = 100; });
  await p.click('.nav button[data-s=feed]'); await p.waitForTimeout(150);
  await pickVideo(p, '#feedForm [data-action=md-add]');
  await p.click('#feedForm button[type=submit]'); await p.waitForTimeout(500);
  ok(/presupuesto de vídeo/.test(await toastText(p)), 'Con el presupuesto del mes gastado, avisa y no sube el vídeo');
  const direct = await db(p, async () => (await sb.storage.from('video').upload(`fvideo/s2/${crypto.randomUUID()}/${crypto.randomUUID()}.mp4`, new Blob([1], { type: 'video/mp4' }), { contentType: 'video/mp4' })).error);
  ok(!!direct, 'Y el almacén también rechaza la subida directa');
  const wrong = await db(p, async () => [(await sb.storage.from('video').upload(`story/s1/${crypto.randomUUID()}/${crypto.randomUUID()}.mp4`, new Blob([1], { type: 'video/mp4' }), { contentType: 'video/mp4' })).error, (await sb.storage.from('media').upload(`story/s2/${crypto.randomUUID()}/${crypto.randomUUID()}.mp4`, new Blob([1], { type: 'video/mp4' }), { contentType: 'video/mp4' })).error]);
  ok(wrong.every(Boolean), 'Nadie sube a la carpeta de otro ni vídeos al almacén de fotos');
  D = await state(p); F = await files(p);
  await p.context().close();

  // ======================= Marta ve quién ha visto su story =======================
  D.stories.forEach(s => { if (s.author_id === 's1') s.expires_at = new Date(Date.now() + 3600000).toISOString(); });
  D.moderation_reports = [];
  p = await open('s1', D, F, { width: 390, height: 800 });
  await p.click('.stories:visible .st-me .st-ring'); await p.waitForTimeout(400);
  ok(/1 vista/.test(await p.locator('.sv-views').textContent()) && /🔥/.test(await p.locator('.sv-views').textContent()), 'Marta ve "1 vista" y la reacción');
  await p.click('.sv-views'); await p.waitForTimeout(200);
  ok(/Lu/.test(await p.locator('.sv-viewers').textContent()) && /🔥/.test(await p.locator('.sv-viewers').textContent()), 'La lista dice quién la ha visto y con qué emoji');
  await shot(p, 'vd6-vistas-movil.png');
  await p.click('.sv-views'); await p.waitForTimeout(100);
  await p.click('.sv-head [data-sv=more]'); await p.waitForTimeout(150);
  await p.click('.sv-menu [data-action=story-delete]'); await p.waitForTimeout(400);
  D = await state(p); F = await files(p);
  ok(!D.stories.some(s => s.author_id === 's1') && !D.story_views.some(v => v.story_id === st.id) && !F.some(([k]) => k.includes(st.id)), 'Borrar tu story borra sus vistas, reacciones y archivos');
  ok(await p.locator('#lightbox').count() === 0 || /Yuri/.test(await p.locator('.sv-who').textContent()), 'Al borrarla, el visor pasa a la siguiente (la del profesor) o se cierra');
  await p.context().close();

  ok(errors.length === 0, 'Sin errores en la consola' + (errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n${fails} FALLOS` : '\nTodo OK');
  process.exit(fails ? 1 : 0);
})();
