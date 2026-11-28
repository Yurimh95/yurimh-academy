// Compañeros y visibilidad: un alumno solo aparece para los demás si ha participado
// (publicación, comentario o reacción), si sois compañeros, si hay solicitud o si os habéis escrito.
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
  async function open(me, db, vp = { width: 1240, height: 900 }) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('dialog', d => d.accept());
    await page.addInitScript(`window.__ME=${JSON.stringify(me)};window.__DB_OVERRIDE=${JSON.stringify(db)};`);
    await page.goto(require('url').pathToFileURL(require('path').join(__dirname, 'test.html')).href);
    await page.waitForTimeout(400);
    return page;
  }
  const goto = async (p, s) => { await navTo(p, s); await p.waitForTimeout(150); };
  const shot = (p, n) => p.screenshot({ path: require('path').join(__dirname, 'shots', n) });
  const dir = p => p.evaluate(() => Object.keys(S.dir).sort());
  const dbOf = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__DB)));

  // Base: la semilla de siempre + Sara (s4), alumna adulta aprobada que no ha participado en nada
  const seedPage = await open('s1', null);
  const base = await seedPage.evaluate(() => JSON.parse(JSON.stringify(window.__DB_SEED)));
  await seedPage.context().close();
  base.profiles.push({ id: 's4', install_prompted_at: '2026-01-01', display_name: 'Sara', email: 's@x.com', role: 'student', approved: true, nickname: null, avatar: null, birth_date: '1995-01-01', family_dm_ok: false });
  base.classmates = [];

  // ================= Marta (s1): a quién ve =================
  let p = await open('s1', base);
  let d = await dir(p);
  ok(d.includes('s2') && d.includes('t1') && d.includes('s1'), 'Marta ve a Luis (ha participado), al profesor y a sí misma');
  ok(!d.includes('s4'), 'Marta NO ve a Sara, que no ha participado en nada');
  const prof4 = await p.evaluate(async () => (await sb.rpc('get_profile', { p_id: 's4' })).data);
  ok(Array.isArray(prof4) && prof4.length === 0, 'El perfil de Sara no se puede abrir pidiéndolo a mano');
  const ins4 = await p.evaluate(async () => (await sb.from('classmates').insert({ requester_id: 's1', addressee_id: 's4' })).error);
  ok(!!ins4, 'No se puede enviar solicitud a alguien invisible (RLS)');
  const insT = await p.evaluate(async () => (await sb.from('classmates').insert({ requester_id: 's1', addressee_id: 't1' })).error);
  ok(!!insT, 'El profesor no se agrega como compañero');
  const insFake = await p.evaluate(async () => (await sb.from('classmates').insert({ requester_id: 's2', addressee_id: 's1' })).error);
  ok(!!insFake, 'No se puede crear una solicitud en nombre de otro');
  ok(await p.locator('.rail .av, .rail .wholink, .rail [data-action=open-profile]').count() === 0, 'La columna derecha del Inicio no enseña gente (ni compañeros ni listas de alumnos)');

  // Marta abre el perfil de Luis desde el Inicio y le envía solicitud
  await p.locator('.fpost:has-text("Joe Pass") .wholink').first().click(); await p.waitForTimeout(300);
  ok(await p.locator('[data-mate-box=s2] [data-action=mate-add]').count() === 1, 'En el perfil de Luis sale "+ Agregar como compañero"');
  await shot(p, 'c1-perfil-agregar.png');
  await p.click('[data-mate-box=s2] [data-action=mate-add]'); await p.waitForTimeout(300);
  ok((await p.textContent('[data-mate-box=s2]')).includes('Solicitud enviada'), 'Tras pulsar: "Solicitud enviada" con Cancelar');
  let db = await dbOf(p);
  ok(db.classmates.length === 1 && db.classmates[0].status === 'pending' && db.classmates[0].requester_id === 's1', 'Se guarda la solicitud pendiente');
  ok(db.notifications.some(n => n.user_id === 's2' && n.kind === 'classmate_request' && n.actor_id === 's1'), 'Luis recibe la notificación de solicitud');
  const dup = await p.evaluate(async () => (await sb.from('classmates').insert({ requester_id: 's1', addressee_id: 's2' })).error);
  ok(!!dup, 'No se puede duplicar la solicitud');
  await p.click('.modal [data-action=close]'); await p.waitForTimeout(200);
  await goto(p, 'profile');
  ok((await p.textContent('.panel.mates')).includes('Solicitudes enviadas'), 'En Perfil, Marta ve su solicitud enviada');
  await p.context().close();

  // ================= Luis (s2) acepta =================
  p = await open('s2', db);
  await p.click('.avbtn'); await p.waitForTimeout(100);
  ok((await p.textContent('.memenu [data-s=profile]')).includes('1 solicitud') && await p.locator('.avbtn .dotn.mini').count() === 1, 'Luis ve "1 solicitud" en Tu perfil (menú de la cuenta) y un punto en su foto');
  await p.keyboard.press('Escape');
  const lnot = await p.evaluate(() => notifText(S.notifs.find(n => n.kind === 'classmate_request')).replace(/<[^>]+>/g, ''));
  ok(lnot === 'Marta te ha enviado una solicitud para ser compañeros', 'Texto de la notificación: ' + lnot);
  await goto(p, 'profile');
  ok(await p.locator('.prof-bar + .prof-mates > .panel.mates').count() === 1, 'Con solicitudes pendientes, el bloque Compañeros sale arriba del todo');
  await shot(p, 'c2-solicitud-recibida.png');
  await p.click('.panel.mates [data-action=mate-accept]'); await p.waitForTimeout(300);
  db = await dbOf(p);
  ok(db.classmates[0].status === 'accepted' && !!db.classmates[0].accepted_at, 'La solicitud queda aceptada');
  ok(db.notifications.some(n => n.user_id === 's1' && n.kind === 'classmate_accept' && n.actor_id === 's2'), 'Marta recibe "ha aceptado tu solicitud"');
  ok(db.notifications.find(n => n.user_id === 's2' && n.kind === 'classmate_request').read_at, 'La notificación de solicitud de Luis queda leída');
  ok(await p.locator('.avbtn .dotn.mini').count() === 0, 'Desaparece el punto de la foto');
  ok((await p.textContent('.panel.mates')).includes('Marta') && !(await p.textContent('.panel.mates')).includes('Solicitudes recibidas'), 'Perfil se repinta: Marta pasa a la lista de compañeros de Luis');
  await p.locator('.panel.mates').scrollIntoViewIfNeeded();
  await shot(p, 'c3-companeros.png');
  await goto(p, 'feed');
  await shot(p, 'c4-inicio-sin-columna.png');
  const hack = await p.evaluate(async () => (await sb.from('classmates').update({ status: 'pending' }).eq('requester_id', 's1').select('*')).error);
  ok(!!hack, 'Una relación aceptada no se puede volver a tocar (solo borrar)');
  await p.context().close();

  // ================= Marta ve a Luis como compañero; luego Luis la bloquea =================
  p = await open('s1', db);
  await goto(p, 'profile');
  ok((await p.textContent('.panel.mates')).includes('Lu') && !(await p.textContent('.panel.mates')).includes('Luis'), 'Marta ve a "Lu" (apodo) en sus compañeros');
  await p.locator('.panel.mates .wholink[data-id=s2]').click(); await p.waitForTimeout(300);
  ok((await p.textContent('[data-mate-box=s2]')).includes('Compañeros'), 'En la ficha de Luis pone "Compañeros" con Quitar');
  await p.context().close();

  p = await open('s2', db);
  await p.evaluate(async () => { await sb.from('user_blocks').insert({ blocker_id: 's2', blocked_id: 's1' }); });
  await p.waitForTimeout(100);
  db = await dbOf(p);
  ok(db.classmates.length === 0, 'Al bloquear, la relación de compañeros se borra');
  await p.context().close();

  // ================= Sara (s4) se hace visible al reaccionar =================
  db.user_blocks = db.user_blocks.filter(b => !(b.blocker_id === 's2' && b.blocked_id === 's1'));
  p = await open('s1', db);
  ok(!(await dir(p)).includes('s4'), 'Antes de participar, Sara sigue invisible');
  await p.evaluate(() => window.__rtExternal('reactions', { target_type: 'feed_post', target_id: 'f3', user_id: 's4', emoji: 'like' }));
  await p.waitForTimeout(300);
  ok((await dir(p)).includes('s4'), 'En cuanto Sara reacciona, aparece (en directo)');
  await p.context().close();

  // ================= Sara (silenciosa) entra: ve al profesor y a quien participa =================
  const silent = JSON.parse(JSON.stringify(base));
  p = await open('s4', silent);
  d = await dir(p);
  ok(d.includes('t1') && d.includes('s1') && d.includes('s2'), 'Sara ve al profesor y a los que han participado');
  ok((await p.evaluate(() => S.dmContacts)).every(id => ['t1', 's2'].includes(id)), 'Los contactos de mensajes solo incluyen personas visibles');
  // No hay listas de gente: ni "Nuevo mensaje" ni las menciones enseñan a quien no es compañero
  await goto(p, 'messages');
  await p.click('[data-action=dm-new]'); await p.waitForTimeout(250);
  const dmList = await p.$$eval('.modal .list [data-action=dm-open]', els => els.map(e => e.dataset.id));
  ok(dmList.length === 1 && dmList[0] === 't1', '"Nuevo mensaje" solo enseña al profesor (Sara aún no tiene compañeros): ' + dmList.join(','));
  await p.click('.modal [data-action=close]'); await p.waitForTimeout(150);
  await goto(p, 'feed');
  await p.click('#feedForm [name=body]'); await p.type('#feedForm [name=body]', 'Hola @');
  await p.waitForTimeout(100);
  const atNew = await p.$$eval('#mentionBox .mopt b', els => els.map(e => e.textContent));
  ok(atNew.length === 1 && atNew[0] === '@Yuri', 'En una publicación nueva, @ solo sugiere al profesor (no hay lista del grupo): ' + atNew.join(','));
  await p.keyboard.press('Escape'); await p.fill('#feedForm [name=body]', '');
  // En los comentarios de la publicación de Luis sí salen quienes participan en ella
  await p.locator('.fpost:has-text("Joe Pass") [data-action=open-fpost]').first().click();
  await p.waitForTimeout(250);
  const cta = p.locator('textarea[id="cmInput-feed-f1"]').first();
  if (await cta.count()) {
    await cta.click(); await cta.type('Muy bueno @');
    await p.waitForTimeout(100);
    const atCm = await p.$$eval('#mentionBox .mopt b', els => els.map(e => e.textContent));
    ok(atCm.includes('@Lu') && atCm.includes('@Marta') && atCm.includes('@Yuri'), 'En los comentarios de un post, @ sugiere al autor y a quien comenta: ' + atCm.join(','));
  } else ok(false, 'No se encontró el cuadro de comentarios del post de Luis');
  await p.context().close();

  // ================= El profesor ve a todos =================
  p = await open('t1', base);
  ok((await dir(p)).includes('s4'), 'El profesor ve también a Sara');
  await p.context().close();

  // ================= Privacidad: el texto explica la regla =================
  p = await open('s1', base);
  await goto(p, 'settings');
  ok((await p.textContent('.settings')).includes('solo cuando participas'), 'Ajustes > Privacidad explica que solo te ven si participas');
  await p.context().close();

  console.log('ERRORES DE CONSOLA/PÁGINA:', errors.length ? errors.join('\n') : 'ninguno');
  await browser.close();
  console.log(fails || errors.length ? `FALLOS: ${fails}` : 'TODO OK');
  process.exit(fails || errors.length ? 1 : 0);
})();
