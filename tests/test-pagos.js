// Pagos v2: tabla (PC) o filas (móvil), cifras del mes y gráfica de lo cobrado (3, 6 o 12 meses).
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
    // Historial de cobros: 60 € hace 2 meses y 120 € el mes pasado (en la "base de datos" y en pantalla)
    await p.evaluate(() => {
      const mk = (n, amt) => { const per = shiftMonth(monthStart(), n), r = { id: 'h' + n, student_id: 's1', kind: 'monthly', period: per, paid_on: per.slice(0, 8) + '10', amount: amt, classes: 4, created_at: per };
        __DB.payments_records.push(r); S.payRecords.push({ ...r }); };
      mk(-2, 60); mk(-1, 120);
    });
    return p;
  }
  const w = (p, ms = 200) => p.waitForTimeout(ms);

  const p = await open({ width: 1400, height: 900 });
  await p.click('.nav [data-s=feed]'); await w(p);
  ok(await p.locator('.nav [data-s=payments], .nav [data-s=agenda], .nav [data-s=homework]').count() === 0, 'PC: Deberes, Pagos y Agenda ya no están en el menú lateral');
  await p.click('.nav [data-s=students]'); await w(p);
  ok((await p.locator('.stu-tabs button').allTextContents()).map(x => x.trim()).join('|').startsWith('Alumnos') && await p.locator('.stu-tabs button').count() === 4, 'Alumnos tiene las pestañas Alumnos, Deberes, Pagos y Agenda');
  await p.click('.stu-tabs [data-s=payments]'); await w(p);
  ok(await p.locator('.nav [data-s=students].on').count() === 1 && (await p.textContent('.phead h1')).includes('Alumnos') && await p.locator('.stu-tabs [data-s=payments].on').count() === 1, 'En Pagos sigue marcado Alumnos en el menú y la pestaña Pagos');
  ok(await p.locator('table.pay-t tr.payrow').count() === 2, 'PC: tabla con una fila por alumno');
  ok(await p.locator('.pch-b').count() === 6 && await p.locator('[data-action=pay-range][data-n="6"].on').count() === 1, 'Gráfica: 6 meses por defecto');
  ok((await p.textContent('.pay-chart')).includes('180 €'), 'La gráfica suma lo cobrado en el periodo (180 €)');
  ok((await p.getAttribute('.pch-b:nth-child(5)', 'title')).includes('120 €'), 'Cada barra dice lo cobrado ese mes');
  await p.click('[data-action=pay-range][data-n="3"]'); await w(p);
  ok(await p.locator('.pch-b').count() === 3 && await p.evaluate(() => localStorage.getItem('ya-payrange')) === '3', 'Se puede elegir 3 meses y se recuerda');
  await p.click('[data-action=pay-range][data-n="12"]'); await w(p);
  ok(await p.locator('.pch-b').count() === 12, 'Y un año (12 barras)');
  await p.screenshot({ path: path.join(__dirname, 'shots', 'pagos-ano.png') });
  await p.click('[data-action=pay-range][data-n="6"]'); await w(p);
  await p.click('.pch-b:nth-child(5)'); await w(p);
  ok(await p.evaluate(() => S.payMonth === shiftMonth(monthStart(), -1)) && (await p.textContent('.pay-kp')).includes('120 €'), 'Pulsar una barra lleva a ese mes con su total');
  ok((await p.textContent('tr.payrow:has-text("Marta")')).includes('120 €') && await p.locator('tr.payrow:has-text("Marta") [data-action=pay-mark]').count() === 0, 'En un mes pasado se ve lo cobrado, sin botón de cobrar');
  await p.click('[data-action=pay-month][data-n="0"]'); await w(p);
  ok((await p.textContent('tr.payrow:has-text("Marta")')).includes('Sin pagos apuntados') === false, 'Mes actual: Marta ya tiene un bono apuntado');
  ok(await p.locator('tr.payrow:has-text("Marta") .pay-dots i').count() >= 4, 'El bono se ve en puntitos (una por clase)');
  // Ordenar
  await p.click('.stt-h[data-k=name]'); await w(p);
  const first = async () => (await p.locator('tr.payrow .pay-who > span:last-child').first().textContent()).trim();
  ok((await first()).startsWith('Lu'), 'Ordenar por nombre');
  await p.click('.stt-h[data-k=name]'); await w(p);
  ok((await first()).startsWith('Marta'), 'Pulsar otra vez invierte el orden');
  // Del nombre a la ficha y Atrás vuelve a Pagos
  await p.click('tr.payrow:has-text("Marta") .pay-who'); await w(p, 300);
  ok(await p.locator('.stu-page[data-stu=s1]').count() === 1, 'Pulsar el nombre abre su ficha');
  await p.goBack(); await w(p, 300);
  ok(await p.evaluate(() => S.section) === 'payments', 'Atrás vuelve a Pagos');

  // Móvil
  const m = await open({ width: 375, height: 800 }, true);
  await m.click('.tabbar button[data-s=students]'); await w(m);
  await m.click('.stu-tabs [data-s=payments]'); await w(m, 250);
  ok(await m.locator('.payrow.pm').count() === 2 && await m.locator('table.pay-t').count() === 0, 'Móvil: filas cortas en vez de tabla');
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Móvil: sin scroll lateral (también la gráfica)');
  await m.screenshot({ path: path.join(__dirname, 'shots', 'pagos-movil.png'), fullPage: true });

  ok(!errors.length, 'Sin errores de JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} correctas, ${fail} fallidas`);
  process.exit(fail ? 1 : 0);
})();
