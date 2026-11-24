// Bajas: archivar, reactivar y borrar cuentas (profesor y el propio alumno).
// Luis (s2) publica f1 y comenta fc2; Marta (s1) comenta fc1. s3 está pendiente de aprobar.
const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors=[]; let fails=0;
  const ok=(c,m)=>{ console.log((c?'OK   ':'FAIL ')+m); if(!c) fails++; };
  async function open(me, vp={width:1400,height:900}, db=null){
    const ctx = await browser.newContext({ viewport:vp });
    const page = await ctx.newPage();
    page.on('pageerror',e=>errors.push('pageerror: '+e.message));
    page.on('console',m=>{ if(m.type()==='error' && !/Failed to load resource/.test(m.text())) errors.push('console: '+m.text()); });
    page.on('dialog',d=>d.accept());
    await page.addInitScript(`window.__ME=${JSON.stringify(me)}`);
    if (db) await page.addInitScript(`window.__DB_OVERRIDE=${JSON.stringify(db)}`);
    await page.goto(require('url').pathToFileURL(require('path').join(__dirname,'test.html')).href);
    await page.waitForTimeout(450);
    return page;
  }
  const goto = async (p,s)=>{ await p.click(`.nav button[data-s=${s}]:visible, .tabbar button[data-s=${s}]:visible`); await p.waitForTimeout(200); };
  const wait = (p,ms=250) => p.waitForTimeout(ms);
  const snapshot = p => p.evaluate(()=>JSON.parse(JSON.stringify(window.__DB)));
  const shot = (p,n) => p.screenshot({path:require('path').join(__dirname,'shots',n)});

  // ================= PROFESOR: archivar a Luis =================
  let p = await open('t1');
  // el avatar malicioso de s2 (prueba de XSS) rompe el check de profiles al actualizarlo: aquí se quita
  await p.evaluate(()=>{ __DB.profiles.find(x=>x.id==='s2').avatar=null; });
  await goto(p,'students');
  ok(await p.locator('[data-action=revoke]').count()===0, 'Ya no existe "Revocar acceso" suelto en la lista');
  await p.click('[data-action=open-student][data-id=s2]'); await wait(p);
  ok(await p.locator('.modal [data-action=archive]').count()===1, 'La ficha tiene "Archivar alumno"');
  await p.click('.modal [data-action=archive]'); await wait(p,400);
  let d = await snapshot(p);
  const luis = d.profiles.find(x=>x.id==='s2');
  ok(luis.archived_at && luis.approved===false, 'Archivado: archived_at puesto y sin acceso');
  ok(await p.locator('details.archived').count()===1 && (await p.textContent('details.archived summary')).includes('Archivados (1)'), 'Aparece en "Archivados (1)" al final de Alumnos');
  ok(!(await p.textContent('#app')).includes('Pendientes de aprobar') || !(await p.locator('h2:has-text("Pendientes de aprobar") + .list').textContent()).includes('Luis'), 'No sale como pendiente de aprobar');
  await p.click('details.archived summary'); await wait(p);
  await shot(p,'bajas-archivados.png');
  await goto(p,'feed');
  ok(!(await p.textContent('#app')).includes('Joe Pass, ¡qué barbaridad!'), 'Profesor: la publicación del archivado queda oculta');
  await goto(p,'payments');
  ok(!(await p.textContent('#app')).includes('Luis'), 'Pagos: el archivado no sale');
  const archivedDb = await snapshot(p);
  await p.context().close();

  // ================= ALUMNA: no ve nada de Luis =================
  p = await open('s1', undefined, archivedDb);
  ok(!(await p.textContent('#app')).includes('Joe Pass, ¡qué barbaridad!'), 'Alumna: no ve la publicación del archivado');
  const dir = await p.evaluate(()=>Object.keys(S.dir));
  ok(!dir.includes('s2'), 'Alumna: el archivado no está en el directorio (menciones, mensajes…)');
  ok(await p.evaluate(()=>!S.fcomments.some(c=>c.author_id==='s2')), 'Alumna: sus comentarios no se cargan');
  // la alumna no puede archivar a nadie
  const r = await p.evaluate(async()=>{ const {error} = await sb.from('profiles').update({archived_at:new Date().toISOString()}).eq('id','s1').select(); return error && error.message; });
  ok(/profesor/.test(r||''), 'Un alumno no puede archivarse ni archivar (guard)');
  await p.context().close();

  // ================= ARCHIVADO: pantalla propia =================
  p = await open('s2', undefined, archivedDb);
  ok((await p.textContent('#app')).includes('Cuenta archivada'), 'Luis ve "Cuenta archivada" en vez de la app');
  await shot(p,'bajas-archivada.png');
  await p.context().close();

  // ================= PROFESOR: reactivar y borrar =================
  p = await open('t1', undefined, archivedDb);
  await goto(p,'students');
  await p.click('details.archived summary'); await wait(p);
  await p.click('[data-action=unarchive][data-id=s2]'); await wait(p,400);
  d = await snapshot(p);
  ok(d.profiles.find(x=>x.id==='s2').approved && !d.profiles.find(x=>x.id==='s2').archived_at, 'Reactivar: vuelve a tener acceso');
  await goto(p,'feed');
  ok((await p.textContent('#app')).includes('Joe Pass, ¡qué barbaridad!'), 'Al reactivar, su publicación vuelve a verse');
  // borrar: hay que archivar antes
  const notArch = await p.evaluate(async()=>{ const {error} = await sb.functions.invoke('delete-account',{body:{user_id:'s2'}}); return !!error; });
  ok(notArch, 'No se puede borrar a un alumno activo (hay que archivarlo antes)');
  await goto(p,'students');
  await p.click('[data-action=open-student][data-id=s2]'); await wait(p);
  await p.click('.modal [data-action=archive]'); await wait(p,400);
  await p.click('details.archived summary'); await wait(p);
  await p.click('[data-action=delete-student][data-id=s2]'); await wait(p);
  ok((await p.textContent('.modal')).includes('no se puede deshacer'), 'Modal de borrado con aviso');
  await shot(p,'bajas-borrar.png');
  await p.fill('#delConfirm','Lui'); await p.click('[data-action=delete-confirm]'); await wait(p,300);
  ok((await snapshot(p)).profiles.some(x=>x.id==='s2'), 'Con el nombre mal escrito no borra');
  await p.fill('#delConfirm','Luis'); await p.click('[data-action=delete-confirm]'); await wait(p,500);
  d = await snapshot(p);
  ok(!d.profiles.some(x=>x.id==='s2') && !d.feed_posts.some(x=>x.author_id==='s2') && !d.feed_comments.some(x=>x.author_id==='s2'), 'Borrado: cuenta y contenido desaparecen');
  ok(!d.notifications.some(n=>n.kind==='account_deleted'), 'Borrar a un archivado no te manda aviso a ti mismo');
  ok(await p.locator('details.archived').count()===0, 'Ya no queda en Archivados');
  await p.context().close();

  // ================= ALUMNA: borra su propia cuenta =================
  p = await open('s1');
  await goto(p,'settings');
  ok(await p.locator('[data-action=delete-me]').count()===1, 'Ajustes del alumno: "Borrar mi cuenta"');
  await p.click('[data-action=delete-me]'); await wait(p);
  await p.fill('#delConfirm','borrar'); await p.click('[data-action=delete-confirm]'); await wait(p,300);
  ok((await snapshot(p)).profiles.some(x=>x.id==='s1'), 'Sin escribir BORRAR exacto no borra');
  await p.fill('#delConfirm','BORRAR'); await p.click('[data-action=delete-confirm]'); await wait(p,500);
  d = await snapshot(p);
  ok(!d.profiles.some(x=>x.id==='s1') && !d.homework_tasks.some(x=>x.student_id==='s1'), 'Su cuenta y sus datos se borran');
  ok(d.notifications.some(n=>n.user_id==='t1' && n.kind==='account_deleted' && n.extra==='Marta'), 'El profesor recibe el aviso "Marta ha borrado su cuenta"');
  ok((await p.textContent('#app')).includes('Cuenta borrada'), 'Ve la pantalla de despedida');
  await shot(p,'bajas-despedida.png');
  await p.context().close();

  // ================= PROFESOR: no tiene "Borrar mi cuenta" =================
  p = await open('t1');
  await goto(p,'settings');
  ok(await p.locator('[data-action=delete-me]').count()===0, 'El profesor no tiene "Borrar mi cuenta"');
  const tSelf = await p.evaluate(async()=>{ const {error} = await sb.functions.invoke('delete-account',{body:{}}); return !!error; });
  ok(tSelf, 'La cuenta del profesor no se puede borrar desde la app');
  await p.context().close();

  ok(errors.length===0, 'Sin errores de JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n${fails} FALLO(S)` : '\nTODO OK');
  process.exit(fails ? 1 : 0);
})();
