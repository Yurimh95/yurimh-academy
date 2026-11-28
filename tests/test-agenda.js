// Agenda (clases leídas de Google Calendar), recordatorio, pagos según la primera clase del mes,
// copia de seguridad y texto de privacidad. Semilla: Luis mañana 18:00, Marta pasado mañana 16:30
// (y una clase el día 1 de este mes), y un evento "Clase Pedro (prueba)" sin alumno.
const { chromium } = require('playwright');
// Navegación: menú lateral, barra inferior (móvil), barra superior (Mensajes) o menú de la cuenta (Perfil, Ajustes)
const navTo = async (p, s) => {
  const sel = `.nav button[data-s=${s}]:visible, .tabbar button[data-s=${s}]:visible, .top-r button[data-s=${s}]:visible`;
  if (await p.locator(sel).count()) return p.click(sel);
  await p.click('.avbtn'); await p.waitForTimeout(80);
  if (await p.evaluate(s => S.section === s, s)) return; // en el móvil la foto lleva directa al Perfil
  await p.click(`.memenu [data-s=${s}]`);
};
(async()=>{
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors=[]; let fails=0;
  const ok=(c,m)=>{ console.log((c?'OK   ':'FAIL ')+m); if(!c) fails++; };
  async function open(me, vp={width:1400,height:900}, db=null){
    const ctx = await browser.newContext({ viewport:vp, acceptDownloads:true });
    const page = await ctx.newPage();
    page.on('pageerror',e=>errors.push('pageerror: '+e.message));
    page.on('console',m=>{ if(m.type()==='error' && !/Failed to load resource/.test(m.text())) errors.push('console: '+m.text()); });
    page.on('dialog',d=>d.accept());
    // Reloj fijo en el último miércoles a las 10:00: "mañana" y "pasado mañana" (clases de la semilla) caen siempre
    // en la misma semana de la Agenda. Sin esto, la prueba fallaba en sábado (pasado mañana = lunes = otra semana).
    const wed = new Date(); wed.setDate(wed.getDate() - ((wed.getDay() + 4) % 7)); wed.setHours(10, 0, 0, 0);
    await page.clock.setFixedTime(wed);
    await page.addInitScript(`window.__ME=${JSON.stringify(me)}`);
    if (db) await page.addInitScript(`window.__DB_OVERRIDE=${JSON.stringify(db)}`);
    await page.goto(require('url').pathToFileURL(require('path').join(__dirname,'test.html')).href);
    await page.waitForTimeout(450);
    return page;
  }
  const goto = async (p,s)=>{ await navTo(p, s); await p.waitForTimeout(200); };
  const wait = (p,ms=250) => p.waitForTimeout(ms);
  const shot = (p,n) => p.screenshot({path:require('path').join(__dirname,'shots',n)});

  // ================= PROFESOR: Agenda =================
  const t = await open('t1');
  await goto(t,'agenda');
  ok((await t.locator('.cal .cev').count())>=3 && (await t.locator('.cal .cal-dh').count())===7, 'Agenda: semana en rejilla (7 días) con las clases como bloques');
  ok((await t.textContent('#app')).includes('Sincronizado con Google Calendar'), 'Dice cuándo se sincronizó');
  ok((await t.locator('.cev.unk:has-text("Clase Pedro")').count())===1 && (await t.textContent('.cev.unk')).includes('Sin alumno en la app') && (await t.locator('.callout').count())===1, 'Avisa del evento que no corresponde a ningún alumno');
  ok((await t.textContent('.cev:has-text("Marta")')).includes('📝 2'), 'En cada clase ve los deberes pendientes del alumno');
  ok((await t.textContent('.cev:has-text("Marta")')).includes('Sin pago apuntado'), 'Y si tiene el bono de clases pagado o no');
  await t.click('.cev:has-text("Luis")'); await wait(t,300);
  ok((await t.locator('.modal [data-sdm-hw]').count())===1, 'Pulsar una clase abre la ficha del alumno');
  ok((await t.textContent('.modal')).includes('Próxima clase: mañana'), 'La ficha dice cuándo es su próxima clase');
  await t.fill('#calNameInput','Lucho'); await t.click('[data-action=cal-name]'); await wait(t,300);
  ok((await t.evaluate(()=>window.__DB.lessons_students.find(x=>x.student_id==='s2').calendar_name))==='Lucho', 'Guarda cómo se llama el alumno en el calendario');
  await t.keyboard.press('Escape'); await wait(t,200);
  await t.click('[data-action=agenda-week][data-n="1"]'); await wait(t,200);
  ok((await t.textContent('#app')).includes('Esta semana'), 'Navega a la semana siguiente (con botón para volver)');
  await shot(t,'agenda.png');

  // Pagos: bonos de N clases contados con las clases del calendario
  await goto(t,'payments');
  ok((await t.textContent('.payrow:has-text("Marta")')).includes('Sin pagos apuntados'), 'Pagos: Marta sin ningún pago apuntado → aviso');
  const l3day = await t.evaluate(()=>dayKey(new Date(S.lessons.find(l=>l.id==='l3').starts_at)));
  await t.click('.payrow:has-text("Marta") [data-action=pay-mark]'); await wait(t,300);
  ok((await t.inputValue('#payPackForm [name=day]'))===l3day, 'Propone como fecha su última clase de este mes');
  await t.fill('#payPackForm [name=classes]','1'); await t.click('#payPackForm button[type=submit]'); await wait(t,350);
  let row = await t.textContent('.payrow:has-text("Marta")');
  ok(row.includes('1 de 1 clases') && row.includes('le toca el') && !(await t.locator('.payrow:has-text("Marta") .chip.warn').count()), 'Bono de 1 clase ya usada: dice cuándo le toca (su próxima clase), sin aviso');
  await goto(t,'agenda');
  await t.evaluate(()=>{ const l=S.lessons.filter(x=>x.student_id==='s1' && new Date(x.starts_at)>new Date()).sort((a,b)=>a.starts_at.localeCompare(b.starts_at))[0]; S.agendaWeek = weekStart(new Date(l.starts_at)).toISOString(); render(); });
  ok((await t.textContent('.cev:has-text("Marta"):not(.past)')).includes('Toca cobrar'), 'Agenda: en la clase siguiente al bono pone "Toca cobrar"');
  await goto(t,'payments');
  row = await t.evaluate(()=>{ const d=new Date(); d.setHours(0,5,0,0); S.lessons.push({id:'lx',student_id:'s1',title:'Marta',starts_at:d.toISOString(),ends_at:new Date(d.getTime()+3600000).toISOString()}); render(); return document.querySelector('.payrow:last-child').innerText; });
  ok(row.includes('Toca cobrar') , 'Cuando llega el día de la clase siguiente al bono → toca cobrar');
  await t.evaluate(()=>{ S.lessons = S.lessons.filter(l=>l.id!=='lx'); render(); });

  // Copia de seguridad
  await goto(t,'settings');
  const [dl] = await Promise.all([t.waitForEvent('download'), t.click('[data-action=backup]')]);
  const file = await dl.path(); const j = JSON.parse(require('fs').readFileSync(file,'utf8'));
  ok(/^yurimh-music-academy-copia-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), 'Copia de seguridad: descarga un archivo con la fecha');
  ok(j.tables.profiles.length>=3 && j.tables.homework_tasks.length>=3 && j.tables.payments_plans.length>=1 && j.tables.lessons.length>=3, 'Incluye alumnos, deberes, pagos y clases');
  ok(!('dm_messages' in j.tables) && !j.tables.profiles.some(p=>'avatar_src' in p), 'No incluye mensajes privados ni fotos grandes');

  // ================= ALUMNA =================
  const p = await open('s1');
  ok((await p.textContent('.foryou')).includes('Tu próxima clase'), 'Alumna: "Tu próxima clase" en su Inicio');
  ok(!(await p.textContent('#app')).includes('Clase Luis') && !(await p.textContent('#app')).includes('Pedro'), 'No ve las clases de nadie más');
  const sneak = await p.evaluate(async()=>{ const a=await sb.from('lessons').select('*'); const b=await sb.from('lessons_students').select('*'); const c=await sb.from('lessons_sync').select('*'); return [a.data.length, b.data.length, c.data.length, a.data.every(l=>l.student_id==='s1')]; });
  ok(sneak[3] && sneak[1]===0 && sneak[2]===0, 'Privacidad: solo lee sus propias clases; ni nombres de calendario ni estado de sincronización');
  ok(!(await p.locator('.nav button[data-s=agenda]').count()), 'La alumna no tiene Agenda');
  await goto(p,'homework');
  ok((await p.textContent('#app')).includes('Próxima clase: '), 'En Deberes también ve cuándo es su próxima clase');
  // Recordatorio de clase (lo crea la función del servidor): así se ve en la campanita
  await p.evaluate(()=>window.__rtExternal('notifications',{id:'nl',user_id:'s1',kind:'lesson',actor_id:null,target_id:'l2',extra:'hoy a las 16:30 · 2 deberes pendientes',read_at:null,pushed_at:null})); await wait(p,300);
  await p.click('.bell'); await wait(p,250);
  ok((await p.textContent('#notifBox')).includes('Tienes clase hoy a las 16:30 · 2 deberes pendientes'), 'Recordatorio: "Tienes clase hoy a las 16:30 · 2 deberes pendientes"');
  await p.click('.nrow:has-text("Tienes clase")'); await wait(p,300);
  ok(await p.evaluate(()=>S.section==='homework'), 'Al tocarlo abre sus Deberes');
  // Privacidad
  await goto(p,'settings'); await p.click('.panel [data-action=privacy]'); await wait(p,250);
  const priv = await p.textContent('.modal');
  ok(priv.includes('Qué datos se guardan') && priv.includes('Tus derechos') && priv.includes('Unión Europea'), 'Ajustes: texto de privacidad completo');
  const a = await open(null);
  await a.click('[data-action=auth-mode][data-mode=register]'); await wait(a,200);
  await a.click('#authForm [data-action=privacy]'); await wait(a,250);
  ok((await a.textContent('.modal')).includes('Quién es el responsable'), 'Al registrarse se puede leer qué datos se guardan');
  await shot(a,'privacidad.png');

  // Móvil del profesor: Agenda desde Alumnos
  const m = await open('t1',{width:390,height:844});
  await goto(m,'students'); await m.click('.dhead [data-action=section][data-s=agenda]'); await wait(m,250);
  ok((await m.locator('.cev').count())>=3 && await m.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1), 'Móvil: Agenda desde Alumnos; la rejilla se desliza dentro de su caja, la página no');
  await shot(m,'m_agenda.png');

  console.log('\nERRORES DE CONSOLA/PÁGINA:', errors.length? errors : 'ninguno');
  console.log(fails? `\n${fails} FALLOS`:'\nTODO OK');
  await browser.close();
  process.exit(fails?1:0);
})().catch(e=>{ console.error('CRASH',e); process.exit(1); });
