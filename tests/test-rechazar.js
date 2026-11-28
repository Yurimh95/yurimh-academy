// Rechazar alumnos pendientes y correos bloqueados (blocked_emails).
// s3 ("Nuevo", n@x.com) está pendiente de aprobar en seed.js.
const { chromium } = require('playwright');
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
  async function open(me, db = null, vp = { width: 1400, height: 900 }) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('dialog', d => d.accept());
    if (me) await page.addInitScript(`window.__ME=${JSON.stringify(me)}`);
    if (db) await page.addInitScript(`window.__DB_OVERRIDE=${JSON.stringify(db)}`);
    await page.goto(require('url').pathToFileURL(require('path').join(__dirname, 'test.html')).href);
    await page.waitForTimeout(450);
    return page;
  }
  const goto = async (p, s) => { await navTo(p, s); await p.waitForTimeout(200); };
  const wait = (p, ms = 300) => p.waitForTimeout(ms);
  const snapshot = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__DB)));
  const shot = (p, n) => p.screenshot({ path: require('path').join(__dirname, 'shots', n) });

  // ============ PROFESOR: rechazar y bloquear el dominio ============
  let p = await open('t1');
  // s3 con un correo de dominio propio, para que se ofrezca bloquear el dominio
  await p.evaluate(() => { __DB.profiles.find(x => x.id === 's3').email = 'Bot.Uno+x@spam-bots.net'; });
  await p.evaluate(() => loadData(true).then(render));
  await goto(p, 'students');
  ok(await p.locator('[data-action=reject][data-id=s3]').count() === 1, 'El pendiente tiene botón "Rechazar" junto a "Aprobar"');
  ok(await p.locator('.linkbtn[data-action=block-pending][data-id=s3]').count() === 1, 'Y aparte, un enlace pequeño "Bloquear"');
  await shot(p, 'rechazar-fila.png');
  await p.click('[data-action=block-pending][data-id=s3]'); await wait(p);
  ok(await p.locator('.modal [data-action=block-confirm]').count() === 2, 'Bloquear: elegir correo o dominio');
  ok((await p.textContent('.modal')).includes('@spam-bots.net'), 'Ofrece bloquear @spam-bots.net');
  await shot(p, 'rechazar-modal.png');
  await p.click('.modal [data-action=block-confirm][data-kind=domain]'); await wait(p, 500);
  let d = await snapshot(p);
  ok(!d.profiles.some(x => x.id === 's3'), 'Bloquear quita también la solicitud');
  ok(d.blocked_emails.length === 1 && d.blocked_emails[0].kind === 'domain' && d.blocked_emails[0].pattern === 'spam-bots.net', 'Queda bloqueado el dominio spam-bots.net');
  ok(!(await p.textContent('#app')).includes('Correos bloqueados'), 'La lista ya no está en Alumnos');
  await goto(p, 'settings');
  ok((await p.textContent('[data-blocked-emails]')).includes('(1)'), 'Ajustes → Privacidad: "Correos bloqueados (1)"');
  ok((await p.textContent('.settings')).includes('@spam-bots.net'), 'Sale @spam-bots.net en la lista');

  // ---- Bloquear un correo de Gmail a mano: se normaliza ----
  await p.fill('#blockAddInput', 'Pe.Pito+clase@GMAIL.com');
  await p.click('#blockAddForm [type=submit]'); await wait(p);
  d = await snapshot(p);
  ok(d.blocked_emails.some(b => b.kind === 'email' && b.pattern === 'pepito@gmail.com'), 'Gmail: se guarda sin puntos ni "+etiqueta" (pepito@gmail.com)');
  await p.fill('#blockAddInput', 'pepito@gmail.com');
  await p.click('#blockAddForm [type=submit]'); await wait(p);
  ok((await snapshot(p)).blocked_emails.length === 2, 'Repetido: no se duplica');
  await p.fill('#blockAddInput', '@nodominio');
  await p.click('#blockAddForm [type=submit]'); await wait(p);
  ok((await snapshot(p)).blocked_emails.length === 2 && (await p.textContent('body')).includes('Ese dominio no es válido'), 'Dominio mal escrito: se rechaza con aviso');
  await shot(p, 'rechazar-lista.png');
  const blockedDb = await snapshot(p);

  // ---- Desbloquear ----
  const pid = blockedDb.blocked_emails.find(b => b.kind === 'email').id;
  await p.click(`[data-action=unblock-email][data-id="${pid}"]`); await wait(p);
  ok(!(await snapshot(p)).blocked_emails.some(b => b.id === pid), 'Desbloquear lo quita de la lista');
  await p.context().close();

  // ============ Rechazar sin bloquear ============
  p = await open('t1');
  await goto(p, 'students');
  await p.click('[data-action=reject][data-id=s3]'); await wait(p, 500); // confirm() se acepta solo
  ok(await p.locator('.modal').count() === 0, 'Rechazar no abre ninguna ventana de opciones');
  d = await snapshot(p);
  ok(!d.profiles.some(x => x.id === 's3') && d.blocked_emails.length === 0, 'Solo rechazar: cuenta borrada y nada bloqueado');
  await p.context().close();

  // ============ Proveedor común: no se ofrece bloquear el dominio ============
  p = await open('t1');
  await p.evaluate(() => { __DB.profiles.find(x => x.id === 's3').email = 'alguien@gmail.com'; });
  await p.evaluate(() => loadData(true).then(render));
  await goto(p, 'students');
  await p.click('[data-action=block-pending][data-id=s3]'); await wait(p);
  ok(await p.locator('.modal [data-kind=domain]').count() === 0 && await p.locator('.modal [data-kind=email]').count() === 1, 'Gmail: se ofrece bloquear el correo, no el dominio entero');
  await p.context().close();

  // ============ El profesor no puede rechazar a un alumno aprobado ============
  p = await open('t1');
  const r = await p.evaluate(async () => { const { error } = await sb.functions.invoke('delete-account', { body: { user_id: 's1' } }); return error ? await error.context.json() : null; });
  ok(r && /archivado o pendiente/.test(r.error), 'Un alumno aprobado no se puede borrar sin archivarlo antes');
  await p.context().close();

  // ============ ALUMNA: no ve la lista ni puede bloquear ============
  p = await open('s1', blockedDb);
  const st = await p.evaluate(async () => {
    const a = await sb.from('blocked_emails').select('*');
    const b = await sb.from('blocked_emails').insert({ kind: 'domain', pattern: 'evil.com' }).select();
    return { n: (a.data || []).length, ins: !!b.error };
  });
  ok(st.n === 0, 'Alumna: no puede leer los correos bloqueados');
  ok(st.ins, 'Alumna: no puede bloquear correos');
  await p.context().close();

  // ============ REGISTRO con correo o dominio bloqueado ============
  async function register(email) {
    const q = await open(null, blockedDb, { width: 1000, height: 900 });
    await q.click('[data-action=auth-mode][data-mode=register]'); await wait(q, 100);
    await q.fill('#authForm [name=name]', 'Prueba');
    await q.fill('#authForm [name=birth]', '2000-01-01');
    await q.fill('#authForm [name=email]', email);
    await q.fill('#authForm [name=password]', 'contrasena123');
    await q.click('#authBtn'); await wait(q);
    const t = (await q.locator('.msg.bad').count()) ? await q.locator('.msg.bad').textContent() : '';
    await q.context().close();
    return t;
  }
  let t = await register('PEPITO@gmail.com');
  ok(t.includes('No se ha podido crear la cuenta con este correo'), 'Correo bloqueado: mensaje genérico → ' + t);
  ok(!/bloque/i.test(t) && !/database/i.test(t), 'No dice que está bloqueado ni sale el texto en inglés');
  t = await register('p.e.p.i.t.o+otra@googlemail.com');
  ok(t.includes('No se ha podido crear la cuenta'), 'Variante de Gmail (puntos, +, googlemail): también bloqueada');
  t = await register('otro@mail.spam-bots.net');
  ok(t.includes('No se ha podido crear la cuenta'), 'Subdominio de un dominio bloqueado: bloqueado');
  t = await register('maria@ejemplo.com');
  ok(t === '', 'Un correo normal se registra sin error');

  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'ERRORES DE CONSOLA/PÁGINA: ninguno');
  await browser.close();
  if (fails || errors.length) { console.log(fails + ' FALLOS'); process.exit(1); }
  console.log('TODO OK');
})();
