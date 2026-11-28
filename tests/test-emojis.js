// Emojis: botón 🙂 en cada cuadro de texto y selector #emojiBox (Inicio, comentarios, Avisos, mensajes…)
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
    const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 600 });
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
  const btnOf = sel => `${sel} + .emo-btn`; // el botón va justo detrás del campo

  // ================= Marta (s1) en el Inicio =================
  let p = await open('s1');
  await goto(p, 'feed');
  const ta = '#feedForm [name=body]';
  ok(await p.locator(btnOf(ta)).count() === 1, 'El cuadro del Inicio lleva el botón de emojis');
  await p.click(ta); await p.type(ta, 'Hola  clase');
  await p.evaluate(s => { const t = document.querySelector(s); t.setSelectionRange(5, 5); }, ta); // cursor entre "Hola " y " clase"
  await p.click(btnOf(ta));
  ok(await p.locator('#emojiBox').isVisible(), 'Al pulsar el botón se abre el selector');
  ok(await p.evaluate(s => document.activeElement === document.querySelector(s), ta), 'En el PC el cursor sigue en el cuadro de texto');
  ok(await p.locator('#emojiBox .ebox-scroll').count() === 1 && await p.locator('#emojiBox [data-esec]').count() === 7, 'Una sola lista con todas las categorías (recientes + 6)');
  ok(await p.locator('#emojiBox [data-emoji="😀"]').count() === 1 && await p.locator('#emojiBox [data-emoji="🎸"]').count() === 1 && await p.locator('#emojiBox [data-emoji="🦈"]').count() === 1, 'Están todos a la vez, de la primera a la última categoría');
  ok(await p.locator('#emojiBox [data-etab=recent].on').count() === 1, 'Al abrir, arriba del todo (Recientes marcada)');
  await shot(p, 'e1-selector.png');
  const secTop = id => p.evaluate(id => { const sc = document.querySelector('#emojiBox .ebox-scroll'), x = sc.querySelector(`[data-esec="${id}"]`); return Math.abs(x.getBoundingClientRect().top - sc.getBoundingClientRect().top); }, id);
  await p.click('#emojiBox [data-etab=music]'); await p.waitForTimeout(700);
  ok(await secTop('music') < 3 && await p.locator('#emojiBox [data-etab=music].on').count() === 1, 'La pestaña Música lleva la lista a su zona y queda marcada');
  await p.click('#emojiBox [data-etab=nature]'); await p.waitForTimeout(700);
  ok(await secTop('nature') < 3 && await p.locator('#emojiBox [data-etab=nature].on').count() === 1, 'También la última categoría sube arriba del todo');
  await p.locator('#emojiBox .ebox-scroll').evaluate(sc => { sc.scrollTop = sc.querySelector('[data-esec=hands]').offsetTop + 20; });
  await p.waitForTimeout(100);
  ok(await p.locator('#emojiBox [data-etab=hands].on').count() === 1, 'Al deslizar a mano se marca la pestaña de la zona que se ve');
  await shot(p, 'e1b-gestos.png');
  await p.click('#emojiBox [data-etab=music]'); await p.waitForTimeout(700);
  await p.click('#emojiBox [data-emoji="🎸"]');
  ok(await p.inputValue(ta) === 'Hola 🎸 clase', 'El emoji se mete donde estaba el cursor');
  await p.click('#emojiBox [data-emoji="🎶"]');
  ok(await p.inputValue(ta) === 'Hola 🎸🎶 clase', 'El selector sigue abierto y se pueden poner varios seguidos');
  await p.keyboard.press('Escape');
  ok(await p.locator('#emojiBox').count() === 0, 'Esc cierra el selector');
  await p.click(btnOf(ta));
  ok(await p.locator('#emojiBox [data-etab=recent].on').count() === 1 && (await p.textContent('#emojiBox .ebox-grid')).startsWith('🎶🎸'), 'Al volver a abrirlo salen primero los recientes');
  await p.mouse.click(5, 5);
  ok(await p.locator('#emojiBox').count() === 0, 'Pulsar fuera lo cierra');
  await p.click('#feedForm button[type=submit]'); await p.waitForTimeout(300);
  ok((await p.textContent('.fpost .fbody')).includes('Hola 🎸🎶 clase'), 'La publicación se guarda con los emojis');

  // Comentarios y límite de caracteres
  const cm = '.cm-new textarea';
  if (await p.locator(cm).count() === 0) { await p.click('[data-action=open-fpost]'); await p.waitForTimeout(250); }
  ok(await p.locator(".cm-new .emo-btn").first().count() === 1, 'Los comentarios llevan el botón');
  await p.locator(cm).first().evaluate(t => { t.maxLength = 3; t.value = 'abc'; });
  await p.locator(".cm-new .emo-btn").first().click();
  await p.click('#emojiBox [data-emoji]:first-child');
  ok(await p.locator(cm).first().inputValue() === 'abc', 'No se pasa del límite de caracteres');
  await p.keyboard.press('Escape');

  await p.keyboard.press('Escape'); await p.waitForTimeout(200); // cierra la ventana de la publicación
  // Campos de datos sin botón
  await goto(p, 'profile');
  ok(await p.locator('.emo-wrap:has([name=display_name])').count() === 0 && await p.locator('.emo-wrap:has([name=nickname])').count() === 0, 'Nombre y apodo no llevan botón');
  ok(await p.locator(btnOf('#aboutForm [name=bio]')).count() === 1, '"Bio corta" sí lo lleva');

  // ================= Profesor: Avisos (dentro de una ventana) =================
  const t = await open('t1');
  await goto(t, 'board');
  await t.click('[data-action=new-post]'); await t.waitForTimeout(200);
  ok(await t.locator(btnOf('#postForm [name=title]')).count() === 1 && await t.locator(btnOf('#postForm [name=body]')).count() === 1, 'Avisos: título y mensaje llevan el botón');
  await t.click(btnOf('#postForm [name=body]'));
  await t.click('#emojiBox [data-emoji="😀"]');
  ok(await t.inputValue('#postForm [name=body]') === '😀', 'Sin haber pulsado el cuadro antes, el emoji va al final');
  await t.keyboard.press('Escape');
  ok(await t.locator('#postForm').count() === 1, 'Esc cierra el selector pero no la ventana del aviso');
  await shot(t, 'e2-avisos.png');

  // ================= Móvil: mensajes privados =================
  const m = await open('s1', { width: 390, height: 780 });
  await m.evaluate(() => openDm('t1')); await m.waitForTimeout(300); // conversación con el profesor
  if (await m.locator('#dmForm textarea').count()) {
    await m.tap(btnOf('#dmForm textarea'));
    const box = await m.locator('#emojiBox').boundingBox();
    ok(!!box && box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 780, 'Móvil: el selector cabe en la pantalla');
    await m.tap('#emojiBox [data-emoji]:first-child');
    ok((await m.inputValue('#dmForm textarea')).length > 0, 'Móvil: el emoji entra en el mensaje');
    await shot(m, 'e3-movil-dm.png');
  } else ok(false, 'No encuentro el cuadro de mensaje privado');

  ok(!errors.length, 'Sin errores en consola' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n${fails} FALLOS` : '\nTodo OK (emojis)');
  process.exit(fails ? 1 : 0);
})();
