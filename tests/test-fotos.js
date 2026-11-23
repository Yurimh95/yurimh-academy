// Foto de perfil: copia grande recortada (avatar_lg) y visor a pantalla completa
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  async function open(me, vp = { width: 1000, height: 900 }) {
    const page = await (await browser.newContext({ viewport: vp })).newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('dialog', d => d.accept());
    await page.addInitScript(`window.__ME=${JSON.stringify(me)}`);
    await page.goto(require('url').pathToFileURL(path.join(__dirname, 'test.html')).href);
    await page.waitForTimeout(400);
    return page;
  }
  // Foto de prueba (rectangular, con detalle) subida por el mismo camino que el botón "Cambiar foto"
  const upload = p => p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
    const x = c.getContext('2d');
    for (let i = 0; i < 60; i++) { x.fillStyle = `hsl(${i * 6},70%,${30 + (i % 5) * 10}%)`; x.fillRect((i * 97) % 1100, (i * 53) % 800, 140, 120); }
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    await processAvatar(new File([blob], 'foto.jpg', { type: 'image/jpeg' }));
  });

  // ===== Alumna: sube su foto =====
  let p = await open('s1');
  await upload(p); await p.waitForTimeout(200);
  await p.click('[data-action=avatar-save]'); await p.waitForTimeout(300);
  const row = await p.evaluate(() => { const r = __DB.profiles.find(x => x.id === 's1'); return { a: (r.avatar || '').length, lg: r.avatar_lg || '' }; });
  ok(row.a > 0 && row.lg.startsWith('data:image/jpeg;base64,') && row.lg.length <= 160000, `Al guardar la foto se guarda también la grande (${row.lg.length} caracteres)`);
  const dims = await p.evaluate(src => new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = src; }), row.lg);
  ok(dims[0] === 640 && dims[1] === 640, 'La foto grande es cuadrada de 640×640 (mismo recorte): ' + dims.join('×'));

  // ===== Profesor: ve su perfil y la amplía =====
  let t = await open('t1');
  await t.evaluate(() => { const r = __DB.profiles.find(x => x.id === 's1'); return r; });
  // la sesión del profesor tiene su propia base simulada: le copiamos la foto de la alumna
  const s1 = await p.evaluate(() => { const r = __DB.profiles.find(x => x.id === 's1'); return { avatar: r.avatar, avatar_lg: r.avatar_lg, avatar_src: r.avatar_src, avatar_crop: r.avatar_crop }; });
  await t.evaluate(f => { Object.assign(__DB.profiles.find(x => x.id === 's1'), f); return loadDirectory(); }, s1);
  await t.evaluate(() => profileModal('s1')); await t.waitForTimeout(200);
  ok(await t.locator('.pf-head .av-zoom').count() === 1, 'En el perfil la foto es pulsable');
  await t.click('.pf-head .av-zoom'); await t.waitForTimeout(250);
  ok(await t.locator('#lightbox').isVisible(), 'Al pulsarla se abre el visor a pantalla completa');
  ok(await t.locator('#lightbox img').getAttribute('src') === s1.avatar_lg, 'El visor enseña la foto grande');
  ok((await t.textContent('#lightbox .lb-name')).includes('Marta'), 'El visor lleva el nombre');
  await t.screenshot({ path: path.join(__dirname, 'shots', 'foto_visor.png') });
  await t.keyboard.press('Escape'); await t.waitForTimeout(200);
  ok(await t.locator('#lightbox').count() === 0 && await t.locator('.pf-head').count() === 1, 'Esc cierra el visor y deja el perfil abierto');
  await t.click('.pf-head .av-zoom'); await t.waitForTimeout(200);
  await t.goBack(); await t.waitForTimeout(250);
  ok(await t.locator('#lightbox').count() === 0 && await t.locator('.pf-head').count() === 1, '"Atrás" cierra el visor y deja el perfil abierto');
  await t.click('.pf-head .av-zoom'); await t.waitForTimeout(200);
  await t.click('#lightbox'); await t.waitForTimeout(250);
  ok(await t.locator('#lightbox').count() === 0 && await t.locator('.pf-head').count() === 1, 'Un toque cierra el visor');
  await t.goBack(); await t.waitForTimeout(250);
  ok(await t.locator('#modalRoot .modal').count() === 0, 'Después, "Atrás" cierra el perfil (el historial cuadra)');
  // Ficha del alumno (profesor)
  await t.evaluate(() => { S.section = 'students'; render(); studentDetailModal('s1'); }); await t.waitForTimeout(200);
  await t.click('.sdm-head .av-zoom'); await t.waitForTimeout(200);
  ok(await t.locator('#lightbox').isVisible(), 'En la ficha del alumno la foto también se amplía');
  await t.keyboard.press('Escape'); await t.waitForTimeout(150);
  // Sin foto: no es pulsable
  await t.evaluate(() => { closeModal(); profileModal('s2'); }); await t.waitForTimeout(200);
  ok(await t.locator('.pf-head .av-zoom').count() === 0, 'Sin foto válida (avatar malicioso de s2) no hay nada que ampliar');

  // ===== Fotos antiguas sin copia grande: el profesor las genera =====
  await t.evaluate(f => { const r = __DB.profiles.find(x => x.id === 's1'); r.avatar_lg = null; r.avatar_src = f.avatar_src; r.avatar_crop = f.avatar_crop; avatarLgDone = false; return avatarLgBackfill(); }, s1);
  const lg2 = await t.evaluate(() => __DB.profiles.find(x => x.id === 's1').avatar_lg || '');
  ok(lg2.startsWith('data:image/jpeg;base64,'), 'Las fotos antiguas sin copia grande se generan solas desde la original');

  // ===== Otra alumna: la ve si puede ver su perfil =====
  const c = await open('s2');
  const r1 = await c.evaluate(() => sb.rpc('get_avatar_large', { p_id: 's3' }));
  ok(r1.data === null, 'No se puede pedir la foto grande de alguien no aprobado / no visible');
  await c.evaluate(f => { Object.assign(__DB.profiles.find(x => x.id === 's1'), f); }, s1);
  const r2 = await c.evaluate(() => sb.rpc('get_avatar_large', { p_id: 's1' }));
  ok(r2.data === s1.avatar_lg, 'Otro alumno que puede ver el perfil recibe la foto grande');
  const own = await c.evaluate(() => sb.from('profiles').select('avatar_lg, avatar_src').eq('id', 's1'));
  ok(!own.data || own.data.length === 0, 'La fila de profiles ajena sigue sin poder leerse (avatar_src privado)');

  // Quitar la foto borra también la grande
  await p.evaluate(() => actions['avatar-remove']()); await p.waitForTimeout(200);
  ok(await p.evaluate(() => { const r = __DB.profiles.find(x => x.id === 's1'); return !r.avatar && !r.avatar_lg; }), 'Quitar la foto borra también la grande');

  console.log(errors.length ? 'ERRORES DE CONSOLA/PÁGINA:\n' + errors.join('\n') : 'ERRORES DE CONSOLA/PÁGINA: ninguno');
  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
