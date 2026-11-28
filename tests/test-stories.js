// Stories con foto, textos, @menciones y dibujo, como Instagram (2026-11-25)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  async function open(me, db = null, files = null, vp = { width: 390, height: 844 }) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(me + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|MEDIA_ERR|NotSupportedError|no supported source/i.test(m.text())) errors.push(me + ' console: ' + m.text()); });
    page.on('dialog', d => d.accept());
    await page.addInitScript(`window.__ME=${JSON.stringify(me)};`);
    if (db) await page.addInitScript(`window.__DB_OVERRIDE=${JSON.stringify(db)}`);
    await page.goto(require('url').pathToFileURL(path.join(__dirname, 'test.html')).href);
    if (files) await page.evaluate(fs => fs.forEach(([p, bucket, size, owner]) => { window.__STORAGE[p] = { blob: new Blob([new Uint8Array(size)], { type: 'image/jpeg' }), owner, bucket, size, created_at: new Date().toISOString() }; }), files);
    await page.waitForTimeout(400);
    return page;
  }
  const db = (p, f, a) => p.evaluate(f, a);
  const state = p => db(p, () => window.__DB);
  const files = p => db(p, () => Object.entries(window.__STORAGE).map(([k, v]) => [k, v.bucket, v.size, v.owner]));
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'shots', n) });
  // Arrastres con "dedos" (eventos de puntero táctiles)
  const drag = (p, sel, dx, dy, id = 5) => db(p, ([sel, dx, dy, id]) => {
    const el = document.querySelector(sel), box = SE.box, r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const f = (t, X, Y, tg) => tg.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: X, clientY: Y, pointerId: id, pointerType: 'touch', isPrimary: true, buttons: 1 }));
    f('pointerdown', x, y, el); for (let i = 1; i <= 8; i++) f('pointermove', x + dx * i / 8, y + dy * i / 8, box); f('pointerup', x + dx, y + dy, box);
  }, [sel, dx, dy, id]);
  const PNG = async p => db(p, async () => { // foto horizontal de prueba
    const c = Object.assign(document.createElement('canvas'), { width: 1600, height: 900 }), g = c.getContext('2d');
    g.fillStyle = '#2f86ff'; g.fillRect(0, 0, 800, 900); g.fillStyle = '#ff4d6d'; g.fillRect(800, 0, 800, 900);
    return Array.from(new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', .9))).arrayBuffer()));
  });

  // ======================= Luis (s2) crea una story con foto =======================
  let p = await open('s2');
  const bytes = await PNG(p);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.stories:visible .st-me [data-action=story-add]')]);
  ok(/image\/\*/.test(await p.evaluate(() => document.querySelector('#stFile').accept)) && /video\/\*/.test(await p.evaluate(() => document.querySelector('#stFile').accept)), 'Al subir una story se puede elegir foto o vídeo');
  await fc.setFiles({ name: 'guitarra.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(bytes) });
  await p.waitForSelector('#lightbox.sed'); await p.waitForTimeout(200);
  ok(await p.locator('#lightbox.sed [data-sed=text]').count() === 1 && await p.locator('#lightbox.sed [data-sed=draw]').count() === 1, 'Se abre el editor con "Aa" (texto) y ✏️ (dibujar)');
  const ratio = await db(p, () => { const r = SE.box.getBoundingClientRect(); return r.width / r.height; });
  ok(Math.abs(ratio - 9 / 16) < 0.01, 'El marco es vertical 9:16');
  const z0 = await db(p, () => SE.z), bg0 = await db(p, () => SE.box.style.background);
  ok(z0 < 0.4 && /linear-gradient/.test(bg0), 'Una foto horizontal empieza entera (alejada) con un degradado de sus colores de fondo');
  // Encuadrar: arrastrar la foto
  await drag(p, '.st-media .st-photo', -120, 0);
  const ox = await db(p, () => SE.ox);
  ok(ox < -0.2, 'Arrastrar la foto la encuadra (se desplaza): ' + ox.toFixed(2));
  await db(p, () => { const f = (t, X, Y, id) => SE.box.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: X, clientY: Y, pointerId: id, pointerType: 'touch', buttons: 1 }));
    f('pointerdown', 150, 300, 21); f('pointerdown', 200, 300, 22); f('pointermove', 240, 300, 22); f('pointerup', 240, 300, 22); f('pointerup', 150, 300, 21); });
  ok(await db(p, () => SE.z) > 0.5, 'Pellizcar con dos dedos amplía la foto');
  // Texto 1
  await p.click('[data-sed=text]');
  ok(await p.locator('.sed-textbox:not([hidden]) #sedText').count() === 1, '"Aa" abre el cuadro de texto');
  await p.fill('#sedText', '¡Mirad mi guitarra nueva!');
  await p.click('.sed-textbox [data-sed-color="#ff4d6d"]');
  await p.click('.sed-textbox [data-sed=bg]');
  ok(/sí/.test(await p.textContent('.sed-textbox [data-sed=bg]')), 'Se puede poner fondo de color al texto');
  await p.click('[data-sed=text-ok]');
  ok(await p.locator('.st-t[data-ti="0"].bg').count() === 1, 'El texto aparece encima, con su fondo');
  // Texto 2 con @mención (escrita a mano)
  await p.click('[data-sed=text]'); await p.fill('#sedText', '@Yuri escúchalo'); await p.click('[data-sed=text-ok]');
  ok(await db(p, () => SE.texts[1].t) === '<@t1> escúchalo', 'La @mención se guarda como código (como en el Inicio)');
  // Mover el texto 0 y pellizcarlo
  const before = await db(p, () => ({ ...SE.texts[0] }));
  await drag(p, '.st-t[data-ti="0"]', 0, 120);
  const after = await db(p, () => ({ ...SE.texts[0] }));
  ok(after.y > before.y + 0.1, 'El texto se arrastra a otro sitio');
  // Tocar un texto lo edita
  await drag(p, '.st-t[data-ti="1"]', 0, 0, 31);
  ok(await p.locator('.sed-textbox:not([hidden])').count() === 1 && /@Yuri escúchalo/.test(await p.inputValue('#sedText')), 'Un toque en un texto lo abre para editarlo (con la mención por nombre)');
  await p.locator('[data-sed-size]').fill('2');
  await p.click('[data-sed=text-ok]');
  ok(await db(p, () => SE.texts[1].s) === 2, 'El deslizador cambia el tamaño');
  // Un tercer texto para tirarlo a la papelera
  await p.click('[data-sed=text]'); await p.fill('#sedText', 'Borrar'); await p.click('[data-sed=text-ok]');
  ok(await db(p, () => SE.texts.length) === 3, 'Se pueden añadir varios textos');
  await db(p, () => { const el = document.querySelector('.st-t[data-ti="2"]'), r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const f = (t, X, Y, tg) => tg.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: X, clientY: Y, pointerId: 41, pointerType: 'touch', buttons: 1 }));
    f('pointerdown', x, y, el); window.__trashSeen = !document.querySelector('.sed-trash').hidden;
    const tr = document.querySelector('.sed-trash').getBoundingClientRect(), tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
    for (let i = 1; i <= 8; i++) f('pointermove', x + (tx - x) * i / 8, y + (ty - y) * i / 8, SE.box); f('pointerup', tx, ty, SE.box); });
  ok(await db(p, () => window.__trashSeen) && await db(p, () => SE.texts.length) === 2, 'Al arrastrar sale la papelera y soltarlo encima lo quita');
  // Dibujar
  await p.click('[data-sed=draw]');
  await p.click('.sed-bottom [data-sed-color="#3ff0ff"]');
  await db(p, () => { const f = (t, X, Y) => SE.box.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: X, clientY: Y, pointerId: 51, pointerType: 'touch', buttons: 1 }));
    f('pointerdown', 60, 300); for (let i = 1; i <= 10; i++) f('pointermove', 60 + i * 25, 300 + (i % 2) * 40); f('pointerup', 310, 300); });
  ok(await p.locator('.st-draw polyline').count() === 1 && await db(p, () => SE.draw[0].c) === '#3ff0ff', 'Se dibuja a mano con el color elegido');
  await db(p, () => { const f = (t, X, Y) => SE.box.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: X, clientY: Y, pointerId: 52, pointerType: 'touch', buttons: 1 })); f('pointerdown', 60, 500); f('pointermove', 200, 520); f('pointerup', 200, 520); });
  await p.click('[data-sed=undo]');
  ok(await db(p, () => SE.draw.length) === 1, '"Deshacer" quita el último trazo');
  await p.click('[data-sed=draw-ok]');
  await shot(p, 'st1-editor.png');
  await p.click('[data-sed=publish]');
  await p.waitForFunction(() => !document.querySelector('#lightbox'), null, { timeout: 8000 });
  let D = await state(p);
  const st = D.stories.find(s => s.author_id === 's2');
  ok(!!st && !st.video && st.photo && st.photo.w === 1080 && st.photo.h === 1920, 'Se publica la story con la foto en 1080×1920');
  ok(st && st.overlay.texts.length === 2 && st.overlay.draw.length === 1 && /^[0-9, ]+$/.test(st.overlay.draw[0].p), 'Guarda los textos y el dibujo como datos');
  let F = await files(p);
  ok(F.some(([k, b, size]) => k === `story/s2/${st.id}/${st.photo.k}.jpg` && b === 'media' && size > 1000) && F.some(([k]) => k === `story/s2/${st.id}/${st.photo.k}_t.jpg`), 'La foto y su miniatura van al almacén de fotos');
  ok(D.notifications.some(n => n.user_id === 't1' && n.kind === 'mention_story' && n.target_id === st.id), 'A Yuri le llega el aviso de que le han mencionado');
  // La base de datos no acepta stories raras
  const bad = await db(p, async () => {
    const k = () => crypto.randomUUID(), base = { author_id: 's2' };
    const t = async row => !!(await sb.from('stories').insert({ id: k(), ...base, ...row })).error;
    return [
      await t({ photo: { k: k(), w: 1080, h: 1920 }, video: { k: k(), w: 720, h: 1280, d: 5 } }),
      await t({ overlay: {} }),
      await t({ photo: { k: k(), w: 1080, h: 1920 }, overlay: { texts: [{ t: 'x'.repeat(500) }] } }),
      await t({ photo: { k: k(), w: 1080, h: 1920 }, overlay: { hack: 1 } })
    ];
  });
  ok(bad.every(Boolean), 'La base de datos rechaza: foto y vídeo a la vez, ninguno, textos enormes o datos extraños');
  // Ver la propia story
  await p.click('.stories:visible .st-me .st-ring'); await p.waitForTimeout(600);
  ok(await p.locator('#lightbox.story .st-photo:not([hidden])').count() === 1 && await p.locator('#lightbox.story .st-t').count() === 2, 'En el visor salen la foto y los textos encima');
  await shot(p, 'st2-visor-foto.png');
  await p.keyboard.press('Escape');
  D = await state(p); F = await files(p);
  await p.context().close();

  // ======================= Marta (s1) la ve: 5 s y pasa sola =======================
  p = await open('s1', D, F);
  await p.click('.stories:visible button.st-item[data-id=s2]'); await p.waitForTimeout(500);
  ok(await p.locator('.st-t .mention').count() === 1 && await p.textContent('.st-t .mention') === 'Yuri', 'La mención se ve con el nombre y se puede pulsar');
  const w1 = await db(p, () => parseFloat(document.querySelector('.sv-bars i.cur b').style.width) || 0);
  await p.waitForTimeout(1500);
  const w2 = await db(p, () => parseFloat(document.querySelector('.sv-bars i.cur b').style.width) || 0);
  ok(w2 > w1 && w2 > 20 && w2 < 60, 'La barra de la foto avanza (5 segundos): ' + w2.toFixed(0) + ' %');
  await db(p, () => svPause()); const w3 = await db(p, () => parseFloat(document.querySelector('.sv-bars i.cur b').style.width)); await p.waitForTimeout(700);
  ok(Math.abs(await db(p, () => parseFloat(document.querySelector('.sv-bars i.cur b').style.width)) - w3) < 1, 'En pausa la foto no avanza');
  await db(p, () => svResume()); await p.waitForTimeout(4200);
  ok(await p.locator('#lightbox').count() === 0, 'A los 5 segundos pasa sola (y al acabar se cierra)');
  D = await state(p);
  ok(D.story_views.some(v => v.story_id === st.id && v.user_id === 's1'), 'Cuenta como vista');
  // Pulsar la mención abre el perfil
  await p.click('.stories:visible button.st-item[data-id=s2]'); await p.waitForTimeout(400);
  await p.click('.st-t .mention'); await p.waitForTimeout(500);
  ok(await p.locator('#lightbox').count() === 0 && await p.locator('#modalRoot .modal').count() === 1, 'Pulsar la mención cierra la story y abre el perfil');
  // Privacidad: archivos de la foto
  const vis = await db(p, ([a, b]) => ({ s1: window.__mediaVisible(a), pending: window.__asUser('s3', () => window.__mediaVisible(b)) }), [`story/s2/${st.id}/${st.photo.k}.jpg`, `story/s2/${st.id}/${st.photo.k}.jpg`]);
  ok(vis.s1 === true && vis.pending === false, 'La foto la ve un alumno aprobado, no una cuenta pendiente');
  await p.context().close();

  ok(errors.length === 0, 'Sin errores en la consola' + (errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n${fails} FALLOS` : '\nTodo OK');
  process.exit(fails ? 1 : 0);
})();
