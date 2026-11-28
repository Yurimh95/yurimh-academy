// Alumnos (profesor) v2: lista + resumen o tabla en el PC, filas cortas en el móvil, y la ficha como pantalla con "Atrás".
const { chromium } = require('playwright');
const path = require('path'), url = require('url');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = [];
  async function open(vp, mob) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: !!mob, hasTouch: !!mob });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await p.addInitScript('window.__ME="t1"');
    await p.goto(url.pathToFileURL(path.join(__dirname, 'test.html')).href);
    await p.waitForTimeout(450);
    return p;
  }
  const w = (p, ms = 200) => p.waitForTimeout(ms);

  // ---------- PC ----------
  const p = await open({ width: 1400, height: 900 });
  await p.click('.nav [data-s=feed]'); await w(p);
  await p.click('.nav [data-s=students]'); await w(p);
  ok(await p.locator('.stu-md .stl').count() === 2 && await p.locator('.stu-sum .sts-head').count() === 1, 'PC: lista de alumnos a la izquierda y resumen a la derecha');
  ok((await p.locator('.stl').first().textContent()).includes('Marta') && await p.locator('.stl').first().locator('.stu-dot.bad').count() === 1, 'Primero quien tiene algo vencido, con punto rojo');
  ok(await p.locator('.stu-pend [data-action=approve]').count() === 1, 'Los pendientes de aprobar salen en la franja de arriba con "Aprobar"');
  await p.click('.stl:has-text("Luis")'); await w(p);
  ok((await p.textContent('.stu-sum h2')).includes('Luis') && await p.locator('.modal').count() === 0, 'Pulsar un alumno de la lista cambia el resumen (sin abrir nada)');
  ok((await p.textContent('.stu-sum')).includes('Gratis'), 'El resumen enseña su trato de pago');
  // Tabla
  await p.click('[data-action=stu-view][data-v=table]'); await w(p);
  ok(await p.locator('table.stt .stt-r').count() === 2 && await p.locator('.stu-md').count() === 0, 'El interruptor cambia a la tabla');
  ok(await p.evaluate(() => localStorage.getItem('ya-stuview')) === 'table', 'La vista elegida se recuerda en este dispositivo');
  await p.click('.stt-h[data-k=name]'); await w(p);
  const names = async () => (await p.locator('.stt-r .stt-n > span:last-child').allTextContents()).map(t => t.trim());
  ok((await names())[0].startsWith('Lu'), 'Ordenar por nombre (A-Z)');
  await p.click('.stt-h[data-k=name]'); await w(p);
  ok((await names())[0].startsWith('Marta'), 'Pulsar otra vez invierte el orden');
  await p.screenshot({ path: path.join(__dirname, 'shots', 'alumnos-tabla.png') });
  // Ficha como pantalla
  await p.click('.stt-r:has-text("Marta")'); await w(p, 300);
  ok(await p.locator('.stu-page[data-stu=s1]').count() === 1 && await p.locator('.modal').count() === 0, 'Pulsar una fila abre la ficha como pantalla, no como ventana');
  ok(await p.locator('.sp-c1').isVisible() && await p.locator('.sp-c3').isVisible(), 'La ficha va a varias columnas');
  const cols = await p.evaluate(() => getComputedStyle(document.querySelector('.sp-cols')).gridTemplateColumns.split(' ').length);
  ok(cols >= 2, `En el PC aprovecha el ancho (${cols} columnas)`);
  await p.screenshot({ path: path.join(__dirname, 'shots', 'alumnos-ficha.png'), fullPage: true });
  await p.goBack(); await w(p, 300);
  ok(await p.locator('.stu-page').count() === 0 && await p.locator('table.stt').count() === 1, 'Atrás vuelve a la lista de alumnos');
  await p.goBack(); await w(p, 300);
  ok(await p.evaluate(() => S.section) === 'feed', 'Otro Atrás vuelve a la sección anterior');
  await p.goForward(); await w(p, 300);
  // Volver a la lista y abrir desde un recuadro del resumen: baja a su bloque
  await p.click('[data-action=stu-view][data-v=list]'); await w(p);
  await p.click('.stl:has-text("Marta")'); await w(p);
  await p.click('.sts-box[data-jump=listen]'); await w(p, 300);
  ok(await p.locator('.stu-page').count() === 1 && await p.evaluate(() => { const r = document.querySelector('[data-sp=listen]').getBoundingClientRect(); return r.top < 200; }) || await p.evaluate(() => window.scrollY === 0 && document.documentElement.scrollHeight <= innerHeight + 5), 'Un recuadro del resumen abre la ficha en su bloque');
  await p.click('.sp-back'); await w(p, 300);
  ok(await p.locator('.stu-md').count() === 1, '"← Alumnos" también vuelve a la lista');
  await p.goBack(); await w(p, 300);
  ok(await p.evaluate(() => S.section) === 'feed', '…sin dejar una entrada de más en el historial');
  // Una ventana encima de la ficha se cierra y la ficha sigue debajo
  await p.click('.nav [data-s=students]'); await w(p); await p.click('.stl:has-text("Marta")'); await p.click('.sts-open'); await w(p, 300);
  await p.click('.stu-page [data-action=goals-open]'); await w(p);
  ok(await p.locator('.modal [data-goals=s1]').count() === 1, 'Desde la ficha se abren sus ventanas (objetivos)');
  await p.click('.modal [data-action=open-student]'); await w(p, 300);
  ok(await p.locator('.modal').count() === 0 && await p.locator('.stu-page[data-stu=s1]').count() === 1, '"Volver a la ficha" cierra la ventana y deja la ficha');
  await p.goBack(); await w(p, 300);
  ok(await p.locator('.stu-page').count() === 0 && await p.evaluate(() => S.section) === 'students', 'Y Atrás sigue llevando a la lista');

  // Escuchas de la ficha: se ven 4 y la flecha despliega el resto en un panel con scroll propio
  await p.evaluate(() => { const b = S.assigns.find(a => a.student_id === 's1'); for (let k = 0; k < 11; k++) S.assigns.push({ ...b, id: 'zz' + k, note: 'Nota larga de prueba ' + k }); studentDetailModal('s1'); }); await w(p, 300);
  const vis = () => p.evaluate(() => [...document.querySelectorAll('.sp-ls .arow')].filter(e => e.offsetParent).length);
  ok(await vis() === 4 && await p.locator('.sp-more:has-text("Ver las 12")').count() === 1, 'Ficha: solo se ven 4 escuchas y una flecha "Ver las 12"');
  const h0 = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.click('.sp-more'); await w(p);
  const box = await p.evaluate(() => { const l = document.querySelector('.sp-ls'); return { sh: l.scrollHeight, ch: l.clientHeight, ov: getComputedStyle(l).overflowY }; });
  ok(await vis() === 12 && box.ov === 'auto' && box.sh > box.ch, 'Al desplegar salen todas en un panel con su propio scroll');
  ok(await p.evaluate(() => document.documentElement.scrollHeight) <= h0 + 700, 'La página no crece hasta abajo del todo');
  await p.screenshot({ path: path.join(__dirname, 'shots', 'alumnos-ficha-escuchas.png'), fullPage: true });
  await p.click('.sp-more'); await w(p);
  ok(await vis() === 4, '"Mostrar menos" las vuelve a plegar');

  // ---------- Móvil ----------
  const m = await open({ width: 375, height: 800 }, true);
  await m.click('.tabbar button[data-s=students]'); await w(m);
  ok(await m.locator('.stm').count() === 2 && await m.locator('.stu-seg').count() === 0, 'Móvil: filas cortas y sin interruptor');
  ok(await m.locator('.stm:has-text("Marta") .stm-i.bad').count() >= 1, 'Las filas enseñan en rojo lo vencido');
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Sin scroll lateral');
  await m.screenshot({ path: path.join(__dirname, 'shots', 'alumnos-movil.png') });
  await m.click('.stm:has-text("Marta")'); await w(m, 300);
  ok(await m.locator('.stu-page').count() === 1 && await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Móvil: la ficha se abre como pantalla y cabe a lo ancho');
  await m.screenshot({ path: path.join(__dirname, 'shots', 'alumnos-movil-ficha.png'), fullPage: true });
  await m.goBack(); await w(m, 300);
  ok(await m.locator('.stm').count() === 2, 'Móvil: el Atrás del teléfono vuelve a la lista');

  ok(!errors.length, 'Sin errores de JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} correctas, ${fail} fallidas`);
  process.exit(fail ? 1 : 0);
})();
