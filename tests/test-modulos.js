// Deberes (homework_tasks) y Pagos (payments_*): reglas de privacidad, flujo del profesor y del alumno.
// Marta (s1): mensual 60 €, 2 deberes pendientes (uno vencido) y 1 practicado. Luis (s2): gratis, 1 deber.
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
  const db = (p,fn,arg) => p.evaluate(fn,arg);
  const snapshot = p => p.evaluate(()=>JSON.parse(JSON.stringify(window.__DB)));
  const shot = (p,n) => p.screenshot({path:require('path').join(__dirname,'shots',n)});

  // ================= ALUMNA: sus deberes =================
  let p = await open('s1');
  ok((await p.locator('.nav button[data-s=homework]').textContent()).includes('2 pendientes'), 'Menú: "Deberes 2 pendientes"');
  ok((await p.textContent('.foryou')).includes('deberes') && (await p.locator('.fy-chip.bad:has-text("Vencidos")').count())===1, 'Inicio: el bloque "Para ti" recuerda los deberes (y que hay vencidos)');
  await goto(p,'homework');
  ok((await p.locator('.hw:not(.done)').count())===2 && !(await p.textContent('#app')).includes('Walking bass'), 'Ve solo sus 2 deberes pendientes (no los de Luis)');
  ok((await p.locator('.hw:has-text("Acordes con cejilla") .chip.bad').count())===1, 'El deber con fecha pasada sale como vencido');
  ok((await p.locator('.hwdone summary').textContent()).includes('Practicadas (1)'), 'Historial de practicadas (1)');
  ok((await p.locator('[data-action=hw-edit], [data-action=hw-delete], [data-action=hw-new], [data-action=hw-copy], [data-action=hw-copy-all]').count())===0, 'La alumna no puede crear, editar, copiar ni borrar deberes');
  const sneak = await p.evaluate(async()=>{
    const a = await sb.from('homework_tasks').select('*').eq('student_id','s2');
    const b = await sb.from('homework_tasks').update({title:'Hackeado'}).eq('id','h1');
    const c = await sb.from('homework_tasks').insert({student_id:'s1',title:'Me pongo yo'});
    const d = await sb.from('payments_plans').select('*'); const e = await sb.from('payments_records').select('*');
    return { otros:a.data.length, edit:!!b.error, ins:!!c.error, plans:d.data.length, recs:e.data.length };
  });
  ok(sneak.otros===0, 'Privacidad: no puede leer los deberes de otro alumno');
  ok(sneak.edit && sneak.ins, 'No puede cambiar el texto de un deber ni crearse deberes');
  ok(sneak.plans===0 && sneak.recs===0, 'Privacidad: no puede ver ningún pago ni trato (ni el suyo)');
  await p.click('.hw:has-text("Pentatónica") [data-action=hw-toggle]'); await wait(p,300);
  ok(!!(await db(p,()=>window.__DB.homework_tasks.find(h=>h.id==='h1').done_at)) && (await p.locator('.hwlist .hw:not(.done)').count())===1, 'Marca un deber como practicado y pasa al historial');
  ok((await p.locator('.nav button[data-s=homework]').textContent()).includes('1 pendiente'), 'El contador del menú baja a 1');
  await p.click('.hwdone summary'); await p.click('.hwdone .hw:has-text("Pentatónica") [data-action=hw-toggle]'); await wait(p,300);
  ok(!(await db(p,()=>window.__DB.homework_tasks.find(h=>h.id==='h1').done_at)), 'Puede desmarcarlo si se equivocó');
  await shot(p,'deberes_alumna.png');
  ok(!(await p.locator('.nav button[data-s=payments]').count()), 'La alumna no tiene sección Pagos');

  // ================= PROFESOR: deberes =================
  const t = await open('t1');
  await goto(t,'homework');
  ok((await t.locator('.hwgroup').count())===2, 'Profesor: deberes agrupados por alumno (2)');
  await t.click('.sec-head [data-action=hw-new]'); await wait(t);
  await t.click('[data-action=hw-all]');
  await t.fill('#hwForm [name=title]','Improvisar 2 min sobre un blues en La');
  await t.fill('#hwForm [name=details]','Usa solo 3 notas. Grábate si puedes.');
  await t.fill('#hwForm [name=due_date]','2099-01-15');
  await t.click('#hwForm button[type=submit]'); await wait(t,400);
  const nuevos = await db(t,()=>window.__DB.homework_tasks.filter(h=>h.title==='Improvisar 2 min sobre un blues en La'));
  ok(nuevos.length===2 && nuevos.every(h=>h.due_date==='2099-01-15'), 'Pone el mismo deber a todos de golpe (2 filas, con fecha)');
  ok((await db(t,()=>window.__DB.notifications.filter(n=>n.kind==='homework').map(n=>n.user_id).sort().join(','))) === 's1,s2', 'A cada alumno le llega su notificación');
  await t.click('.hwgroup:has-text("Luis") .hw:has-text("Walking bass") [data-action=hw-edit]'); await wait(t);
  ok((await t.locator('#hwForm input[name=pick]').count())===0, 'Al editar no se puede cambiar de alumno');
  await t.fill('#hwForm [name=title]','Walking bass sobre Autumn Leaves (negras)'); await t.click('#hwForm button[type=submit]'); await wait(t,350);
  ok((await db(t,()=>window.__DB.homework_tasks.find(h=>h.id==='h4').title))==='Walking bass sobre Autumn Leaves (negras)', 'Edita un deber');
  await t.click('.hwgroup:has-text("Luis") .hw:has-text("Walking bass") [data-action=hw-toggle]'); await wait(t,300);
  ok(!!(await db(t,()=>window.__DB.homework_tasks.find(h=>h.id==='h4').done_at)), 'El profe también puede marcarlo como practicado (en clase)');
  await t.click('.hwgroup:has-text("Marta") .hw:has-text("Acordes con cejilla") [data-action=hw-delete]'); await wait(t,300);
  ok(!(await db(t,()=>window.__DB.homework_tasks.some(h=>h.id==='h2'))), 'Borra un deber');
  await shot(t,'deberes_profe.png');
  const afterT = await snapshot(t);

  // La alumna recibe en directo un deber nuevo
  const p2 = await open('s1', undefined, afterT);
  await goto(p2,'homework');
  const before = await p2.locator('.hwlist .hw').count();
  await p2.evaluate(()=>window.__rtExternal('homework_tasks',{id:'hx',student_id:'s1',title:'Leer el capítulo 3 de armonía',details:null,due_date:null,done_at:null,created_by:'t1'})); await wait(p2,400);
  ok((await p2.locator('.hwlist .hw').count())===before+1 && (await p2.textContent('#app')).includes('capítulo 3'), 'Tiempo real: el deber nuevo aparece solo, sin recargar');
  ok((await p2.textContent('.bell')).match(/\d/), 'Y suena la campanita');

  // ================= PROFESOR: deberes desde la ficha del alumno =================
  await goto(t,'students'); await t.click('.row.click:has-text("Marta")'); await wait(t,300);
  ok((await t.locator('.modal [data-sdm-hw] .hw:not(.done)').count())===2, 'Ficha de Marta: ve sus deberes pendientes ahí mismo');
  await t.click('.modal .dhead [data-action=hw-new]'); await wait(t);
  ok(await t.locator('#hwForm input[name=pick][value=s1]').isChecked() && !(await t.locator('#hwForm input[name=pick][value=s2]').isChecked()), '"+ Añadir" desde la ficha ya trae a Marta elegida');
  await t.fill('#hwForm [name=title]','Transcribir 4 compases de un solo'); await t.click('#hwForm button[type=submit]'); await wait(t,400);
  ok((await t.locator('.modal [data-sdm-hw]').count())===1 && (await t.textContent('.modal [data-sdm-hw]')).includes('Transcribir 4 compases'), 'Al guardar vuelve a la ficha de Marta con el deber nuevo');
  await t.click('.modal [data-sdm-hw] .hw:has-text("Transcribir") [data-action=hw-toggle]'); await wait(t,300);
  ok((await t.locator('.modal [data-sdm-hw] .hwdone summary').textContent()).includes('Practicadas') && !!(await db(t,()=>window.__DB.homework_tasks.find(h=>h.title==='Transcribir 4 compases de un solo').done_at)), 'Lo marca como practicado sin salir de la ficha');
  await t.click('.modal [data-sdm-hw] .hw:has-text("Pentatónica") [data-action=hw-edit]'); await wait(t);
  await t.click('#hwForm [data-action=hw-cancel]'); await wait(t,250);
  ok((await t.locator('.modal [data-sdm-hw]').count())===1, 'Cancelar una edición vuelve a la ficha (no la cierra)');
  // Copiar deberes de Marta a Luis desde la ficha
  await t.click('.modal .dhead [data-action=hw-copy-all]'); await wait(t);
  ok(await t.locator('#hwCopyForm input[name=task]:checked').count()===2 && !(await t.locator('#hwCopyForm input[name=pick][value=s1]').count()), 'Copiar: vienen marcadas sus 2 pendientes y Marta no sale como destino');
  await t.check('#hwCopyForm input[name=pick][value=s2]');
  await t.click('#hwCopyForm button[type=submit]'); await wait(t,400);
  const copiados = await db(t,()=>window.__DB.homework_tasks.filter(h=>h.student_id==='s2'&&!h.done_at).map(h=>h.title));
  ok(copiados.filter(x=>x.startsWith('Pentatónica')).length===1 && copiados.filter(x=>x.startsWith('Improvisar')).length===1, 'Copia "Pentatónica" a Luis y no duplica "Improvisar", que ya tenía pendiente');
  ok((await db(t,()=>window.__DB.homework_tasks.find(h=>h.student_id==='s2'&&h.title.startsWith('Pentatónica')).details))==='A 80 bpm con metrónomo, subiendo y bajando.', 'La copia lleva los detalles');
  ok((await t.locator('.modal [data-sdm-hw="s1"]').count())===1, 'Al copiar vuelve a la ficha de Marta');
  await t.keyboard.press('Escape'); await wait(t,250);
  // Copiar una sola tarea, con fecha nueva, desde la sección Deberes
  await goto(t,'homework');
  await t.click('.hwgroup:has-text("Luis") .hw:has-text("Pentatónica") [data-action=hw-copy]'); await wait(t);
  ok(await t.locator('#hwCopyForm input[name=task]:checked').count()===1, 'Copiar una tarea: viene marcada solo esa');
  await t.check('#hwCopyForm input[name=pick][value=s1]');
  await t.click('#hwCopyForm button[type=submit]'); await wait(t,300);
  ok((await db(t,()=>window.__DB.homework_tasks.filter(h=>h.student_id==='s1'&&h.title.startsWith('Pentatónica')).length))===1, 'No se la vuelve a poner a Marta si ya la tiene pendiente');
  await t.click('#hwCopyForm [data-action=hw-cancel]').catch(()=>{}); await wait(t,250);
  await t.click('.hwgroup:has-text("Luis") .hwdone summary');
  await t.click('.hwgroup:has-text("Luis") .hw:has-text("Walking bass") [data-action=hw-copy]'); await wait(t);
  await t.click('[data-action=hw-all]');
  await t.fill('#hwCopyForm [name=due_date]','2099-02-01'); await t.locator('#hwCopyForm [name=due_date]').dispatchEvent('change');
  ok(await t.locator('#hwCopyForm input[name=due][value=new]').isChecked(), 'Elegir una fecha marca "Otra"');
  await t.screenshot({path:require('path').join(__dirname,'shots','deberes_copiar.png')});
  await t.click('#hwCopyForm button[type=submit]'); await wait(t,300);
  const wb = await db(t,()=>window.__DB.homework_tasks.find(h=>h.student_id==='s1'&&h.title.startsWith('Walking bass')));
  ok(!!wb && wb.due_date==='2099-02-01' && !wb.done_at, 'Copia una tarea ya practicada con fecha nueva; la copia nace pendiente');
  await goto(t,'students'); await t.click('.row.click:has-text("Marta")'); await wait(t,300);
  await shot(t,'ficha_deberes.png');
  await t.keyboard.press('Escape'); await wait(t,250);

  // ================= PROFESOR: pagos =================
  await goto(t,'payments');
  ok((await t.textContent('.monthnav h2')).match(/\d{4}/) && (await t.locator('.payrow').count())===2, 'Pagos: mes actual y una fila por alumno');
  ok((await t.locator('.payrow:has-text("Luis") .chip:has-text("Gratis")').count())===1, 'Luis (gratis) no sale como pendiente');
  await t.click('.payrow:has-text("Marta") [data-action=pay-mark]'); await wait(t,350);
  let recs = await db(t,()=>window.__DB.payments_records);
  ok(recs.length===1 && recs[0].kind==='monthly' && recs[0].amount===60 && /-01$/.test(recs[0].period), 'Marca el pago mensual de Marta (60 €, mes actual)');
  ok((await t.textContent('.stats')).includes('60 €'), 'El total cobrado del mes sube a 60 €');
  ok((await t.evaluate(async()=>{ const per=S.payMonth; return !!(await sb.from('payments_records').insert({student_id:'s1',period:per,kind:'monthly',amount:60})).error; })), 'No se puede apuntar dos veces el mismo mes');
  await t.click('[data-action=pay-month][data-n="1"]'); await wait(t,250);
  ok((await t.locator('.payrow:has-text("Marta") [data-action=pay-mark]').count())===1, 'El mes siguiente empieza sin marcar ("se desmarca al acabar el mes")');
  await t.click('[data-action=pay-month][data-n="-1"]'); await t.click('[data-action=pay-month][data-n="-1"]'); await wait(t,250);
  ok((await t.locator('.payrow:has-text("Marta") .chip.warn:has-text("No pagado")').count())===1, 'En meses pasados sin pago sale "No pagado"');
  await t.click('[data-action=pay-month][data-n="0"]'); await wait(t,250);
  ok((await t.locator('.payrow:has-text("Marta") .chip.ok').count())===1, 'Volviendo al mes actual, sigue pagado (historial)');
  await t.click('.payrow:has-text("Marta") [data-action=pay-undo]'); await wait(t,300);
  ok((await db(t,()=>window.__DB.payments_records.length))===0, 'Puede desmarcar un pago por error');
  // Cambiar el trato de Luis a "por clase" (25 €) y apuntar 2 clases
  await t.click('.payrow:has-text("Luis") [data-action=pay-plan]'); await wait(t);
  await t.check('#planForm input[value=per_class]'); await t.fill('#planForm [name=amount]','25'); await t.click('#planForm button[type=submit]'); await wait(t,350);
  ok((await db(t,()=>window.__DB.payments_plans.find(x=>x.student_id==='s2').mode))==='per_class', 'Cambia el trato de Luis a "por clase"');
  await t.click('.payrow:has-text("Luis") [data-action=pay-class]'); await wait(t,300);
  await t.click('.payrow:has-text("Luis") [data-action=pay-class]'); await wait(t,300);
  ok((await t.textContent('.payrow:has-text("Luis")')).includes('2 clases pagadas · 50 €'), 'Apunta 2 clases pagadas (50 €)');
  await t.click('.payrow:has-text("Luis") [data-action=pay-class-undo]'); await wait(t,300);
  ok((await t.textContent('.payrow:has-text("Luis")')).includes('1 clase pagada'), 'Quita la última clase apuntada');
  await shot(t,'pagos.png');

  // Móvil del profesor: Pagos desde Alumnos y barra inferior sin desbordarse
  const m = await open('t1',{width:390,height:844}, await snapshot(t));
  ok(await m.evaluate(()=>{ const b=document.querySelector('.tabbar'); return b.scrollWidth<=b.clientWidth+1; }), 'Móvil (profe): la barra inferior cabe con Deberes');
  await goto(m,'students'); await m.click('.dhead [data-action=section][data-s=payments]'); await wait(m,250);
  ok((await m.locator('.payrow').count())===2 && await m.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1), 'Móvil: Pagos desde Alumnos, sin scroll horizontal');
  await shot(m,'m_pagos.png');
  await goto(m,'homework');
  ok(await m.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1), 'Móvil: Deberes sin scroll horizontal');
  await shot(m,'m_deberes.png');

  console.log('\nERRORES DE CONSOLA/PÁGINA:', errors.length? errors : 'ninguno');
  console.log(fails? `\n${fails} FALLOS`:'\nTODO OK');
  await browser.close();
  process.exit(fails?1:0);
})().catch(e=>{ console.error('CRASH',e); process.exit(1); });
