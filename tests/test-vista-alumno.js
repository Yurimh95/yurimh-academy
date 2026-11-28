// Vista de alumno: el profesor ve la app como un alumno ficticio, sin guardar nada en la base de datos.
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
(async()=>{
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors=[]; let fails=0;
  const ok=(c,m)=>{ console.log((c?'OK   ':'FAIL ')+m); if(!c) fails++; };
  const url = require('url').pathToFileURL(require('path').join(__dirname,'test.html')).href;
  const shot = n => require('path').join(__dirname,'shots',n);

  const ctx = await browser.newContext({ viewport:{ width:1280, height:860 } });
  const p = await ctx.newPage();
  p.on('pageerror',e=>errors.push('pageerror: '+e.message));
  await p.addInitScript(`window.__ME="t1"`);
  await p.goto(url);
  await p.waitForTimeout(400);

  await p.click('.avbtn'); await p.waitForTimeout(100);
  ok(await p.isVisible('.memenu [data-action="preview-on"]'), 'Profesor: "Ver como alumno" en el menú de la cuenta (su foto, arriba)');
  const before = await p.evaluate(()=>JSON.stringify(window.__DB));
  await p.click('.memenu [data-action="preview-on"]');
  await p.waitForTimeout(300);
  ok(await p.isVisible('.pvbar'), 'Sale la barra "Vista de alumno" con el botón Salir');
  ok(await p.evaluate(()=>!isTeacher() && S.profile.display_name==='Alumno de prueba'), 'La app se pinta como el alumno ficticio');
  const navs = await p.$$eval('.sidebar .nav button', b=>b.map(x=>x.dataset.s));
  ok(!navs.includes('students') && !navs.includes('payments') && !navs.includes('mod') && navs.includes('homework'), 'Menú de alumno (sin Alumnos, Pagos ni Moderación): '+navs.join(', '));
  await p.screenshot({ path: shot('vista-alumno-inicio.png') });

  // Recorre las secciones del alumno
  for (const s of ['board','listening','homework','messages','profile','settings']) {
    await navTo(p, s); await p.waitForTimeout(200);
    ok(await p.isVisible('.pvbar'), `Sección ${s}: se sigue viendo la barra de la vista de alumno`);
  }
  await navTo(p, 'listening'); await p.waitForTimeout(200);
  ok(await p.$$eval('#slList .track, .tracklist .track', x=>x.length) > 0, 'Escucha analítica del alumno con escuchas de ejemplo');
  await p.screenshot({ path: shot('vista-alumno-escuchas.png') });
  await navTo(p, 'homework'); await p.waitForTimeout(200);
  await p.screenshot({ path: shot('vista-alumno-deberes.png') });

  // Intentar guardar: nada llega a la base de datos
  await navTo(p, 'profile'); await p.waitForTimeout(200);
  await p.fill('#nameForm [name=display_name]', 'Cambio que no debe guardarse');
  await p.click('#nameForm button[type=submit]'); await p.waitForTimeout(300);
  await navTo(p, 'feed'); await p.waitForTimeout(200);
  const ta = await p.$('#feedForm textarea');
  if (ta) { await ta.fill('Publicación de prueba que no debe guardarse'); await p.click('#feedForm button[type=submit]'); await p.waitForTimeout(300); }
  const rx = await p.$('.rxb.main'); if (rx) { await rx.click(); await p.waitForTimeout(300); }
  ok(await p.evaluate(b=>JSON.stringify(window.__DB)===b, before), 'Nada de lo pulsado en la vista de alumno cambia la base de datos');
  ok(await p.evaluate(async()=>{ const r = await sb.from('feed_posts').insert({ body:'x' }).select(); return r.error && r.error.code==='preview'; }), 'Cualquier insert directo devuelve el error "solo para mirar"');

  // Salir
  await p.click('.pvbar [data-action="preview-off"]'); await p.waitForTimeout(400);
  ok(await p.evaluate(()=>isTeacher() && S.user.id==='t1' && !S.preview), 'Al salir vuelves a ser el profesor');
  ok(!(await p.isVisible('.pvbar')), 'La barra desaparece al salir');
  ok(await p.evaluate(()=>!S.posts.length || S.students.length>0), 'Se recuperan los datos del profesor (alumnos)');
  ok(await p.evaluate(async()=>{ const r = await sb.from('feed_posts').select('*').limit(1); return !r.error; }), 'Fuera de la vista, la base de datos funciona normal');

  // Móvil: el botón está en el Perfil del profesor
  const m = await browser.newContext({ viewport:{ width:390, height:780 } });
  const q = await m.newPage();
  q.on('pageerror',e=>errors.push('pageerror móvil: '+e.message));
  await q.addInitScript(`window.__ME="t1"`);
  await q.goto(url); await q.waitForTimeout(400);
  await q.click('.top .avbtn'); await q.waitForTimeout(200);
  ok(await q.isVisible('.prof-bar [data-action="preview-on"]'), 'Móvil: botón "Ver como alumno" en el Perfil del profesor');
  await q.click('.prof-bar [data-action="preview-on"]'); await q.waitForTimeout(300);
  ok(await q.isVisible('.pvbar') && await q.isVisible('.tabbar'), 'Móvil: vista de alumno con su barra inferior');
  await q.screenshot({ path: shot('vista-alumno-movil.png') });
  await q.click('.tabbar [data-s="profile"]'); await q.waitForTimeout(200);
  ok(!(await q.isVisible('.prof-bar [data-action="preview-on"]')), 'Móvil: en el perfil del alumno ficticio no sale el botón');
  await q.screenshot({ path: shot('vista-alumno-movil-perfil.png') });

  ok(errors.length===0, 'Sin errores en la página'+(errors.length?': '+errors.join(' | '):''));
  await browser.close();
  console.log(fails ? `\n${fails} FALLOS` : '\nTodo correcto');
  process.exit(fails?1:0);
})();
