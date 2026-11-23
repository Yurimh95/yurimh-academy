// Límite de emails de Supabase: el aviso dice a qué hora se podrá volver a intentar (email_wait_seconds)
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  async function open(wait) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('dialog', d => d.accept('alumno@ejemplo.com'));
    await page.addInitScript(`window.__EMAIL_LIMITED = true; window.__EMAIL_WAIT = ${JSON.stringify(wait)};`);
    await page.goto(require('url').pathToFileURL(require('path').join(__dirname, 'test.html')).href);
    await page.waitForTimeout(400);
    return page;
  }
  async function register(p) {
    await p.click('[data-action=auth-mode][data-mode=register]'); await p.waitForTimeout(100);
    await p.fill('#authForm [name=name]', 'Prueba');
    await p.fill('#authForm [name=birth]', '2000-01-01');
    await p.fill('#authForm [name=email]', 'alumno@ejemplo.com');
    await p.fill('#authForm [name=password]', 'contrasena123');
    await p.click('#authBtn'); await p.waitForTimeout(300);
    return (await p.locator('.msg.bad').textContent()) || '';
  }
  const hhmm = secs => new Date(Date.now() + secs * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  let p = await open(1380); // 23 minutos
  let t = await register(p);
  ok(t.includes('demasiados emails'), 'Registro: explica el límite en castellano');
  ok(t.includes('dentro de 23 minutos'), 'Registro: dice cuántos minutos faltan → ' + t);
  ok(t.includes('a partir de las ' + hhmm(1380)), 'Registro: y a qué hora');
  ok(!/rate limit/i.test(t), 'Registro: sin el texto en inglés');
  await p.screenshot({ path: require('path').join(__dirname, 'shots', 'limite-email.png') });

  p = await open(50);
  t = await register(p);
  ok(t.includes('dentro de 1 minuto)'), 'Menos de un minuto: "dentro de 1 minuto" → ' + t);

  p = await open(0); // la cuenta dice que ya se puede pero Supabase aún no deja
  t = await register(p);
  ok(t.includes('Vuelve a intentarlo en unos minutos'), 'Si la cuenta no cuadra: mensaje genérico');

  p = await open(null); // la función no existe o falla
  t = await register(p);
  ok(t.includes('Espera una hora'), 'Si la función falla: el mensaje de siempre');

  p = await open(600); // recuperar contraseña
  await p.click('[data-action=forgot]'); await p.waitForTimeout(300);
  t = (await p.locator('.msg.bad').textContent()) || '';
  ok(t.includes('dentro de 10 minutos'), 'Recuperar contraseña: también da la hora → ' + t);

  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'ERRORES DE CONSOLA/PÁGINA: ninguno');
  await browser.close();
  if (fails || errors.length) { console.log(fails + ' FALLOS'); process.exit(1); }
  console.log('TODO OK');
})();
