// Recargar (F5): la app vuelve a la sección (y al chat) donde estaba, no al Inicio
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
  const open = async me => {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(me + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(me + ' console: ' + m.text()); });
    await p.addInitScript(`window.__ME="${me}"`);
    await p.goto(require('url').pathToFileURL(path.join(__dirname, 'test.html')).href);
    await p.waitForTimeout(400);
    return p;
  };
  const reload = async p => { await p.reload(); await p.waitForTimeout(400); };
  const sec = p => p.evaluate(() => S.section);

  /* ---------- Alumna ---------- */
  const s = await open('s1');
  ok(await sec(s) === 'feed', 'Al entrar por primera vez se ve el Inicio');
  await s.click('.nav [data-s=board]'); await s.waitForTimeout(150);
  await reload(s);
  ok(await sec(s) === 'board', 'Tras recargar en Avisos sigue en Avisos');
  ok(await s.locator('.nav button.on[data-s=board]').count() === 1, 'El menú marca Avisos');
  await s.click('.nav [data-s=listening]'); await s.waitForTimeout(150);
  await reload(s);
  ok(await sec(s) === 'listening', 'Tras recargar en Escucha analítica sigue ahí');
  // "Atrás" después de recargar sigue funcionando
  await s.evaluate(() => history.back()); await s.waitForTimeout(250);
  ok(await sec(s) === 'board', 'Atrás tras recargar vuelve a la sección anterior');
  // Con una ventana abierta: se recarga en la sección, sin la ventana, y la navegación sigue apuntándose
  await s.click('.nav [data-s=feed]'); await s.waitForTimeout(150);
  await s.evaluate(() => { S.section = 'messages'; S.dmWith = 't1'; render(); }); await s.waitForTimeout(150);
  await s.evaluate(() => profileModal('t1')); await s.waitForTimeout(250);
  ok(await s.evaluate(() => !!(history.state && history.state.modal)), 'Con la ventana abierta el historial lleva la marca de ventana');
  await reload(s);
  ok(await sec(s) === 'messages', 'Tras recargar con una ventana abierta sigue en Mensajes');
  ok(await s.evaluate(() => S.dmWith) === 't1', 'Y en el mismo chat');
  ok(await s.locator('.modal').count() === 0, 'La ventana no se vuelve a abrir');
  ok(await s.evaluate(() => !history.state.modal), 'Se limpia la marca de ventana del historial');
  await navTo(s, 'profile'); await s.waitForTimeout(150);
  ok(await s.evaluate(() => history.state.s) === 'profile', 'Después de recargar, cambiar de sección se apunta en el historial');
  await reload(s);
  ok(await sec(s) === 'profile', 'Tras recargar en Perfil sigue en Perfil');

  /* ---------- Profesor: secciones solo suyas ---------- */
  const t = await open('t1');
  await t.click('.nav [data-s=students]'); await t.waitForTimeout(150);
  await reload(t);
  ok(await sec(t) === 'students', 'El profesor recarga en Alumnos y sigue en Alumnos');
  // Solo se restaura al cargar la página: si luego entra otra persona en la misma pestaña, empieza en el Inicio
  await t.evaluate(() => { S.section = 'feed'; histRestoreOnLoad(); });
  ok(await sec(t) === 'feed', 'La restauración solo ocurre una vez por carga de página');
  // Una sección del profesor no se abre a un alumno aunque venga en el historial (lista blanca de render)
  await s.evaluate(() => { history.replaceState({ app: 1, s: 'students', dm: null }, ''); });
  await reload(s);
  ok(await sec(s) === 'feed', 'Una sección del profesor guardada en el historial no se abre a un alumno');

  await s.screenshot({ path: path.join(__dirname, 'shots', 'recargar-1.png') });
  ok(errors.length === 0, 'Sin errores en consola' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n${fails} FALLOS` : '\nTodo OK');
  process.exit(fails ? 1 : 0);
})();
