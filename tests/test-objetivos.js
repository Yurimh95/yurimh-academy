// Objetivos: lista general por etapas + personales; el profesor marca, el alumno lo ve en su Perfil y lo celebra.
// Seed: etapas 1-3; g1-g4 generales, g5 personal de Marta (s1), g6 personal de Luis (s2).
// Marta tiene g1 y g2 conseguidos (ya vistos). Luis tiene g6.
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
    const ctx = await browser.newContext({ viewport:vp });
    const page = await ctx.newPage();
    page.on('pageerror',e=>errors.push('pageerror: '+e.message));
    page.on('console',m=>{ if(m.type()==='error' && !/Failed to load resource/.test(m.text())) errors.push('console: '+m.text()); });
    page.on('dialog',d=>d.accept());
    await page.addInitScript(`window.__ME=${JSON.stringify(me)}`);
    if (db) await page.addInitScript(`window.__DB_OVERRIDE=${JSON.stringify(db)}`);
    await page.goto(require('url').pathToFileURL(require('path').join(__dirname,'test.html')).href);
    await page.waitForTimeout(500);
    return page;
  }
  const goto = async (p,s)=>{ await navTo(p, s); await p.waitForTimeout(200); };
  const wait = (p,ms=250) => p.waitForTimeout(ms);
  const snapshot = p => p.evaluate(()=>JSON.parse(JSON.stringify(window.__DB)));
  const shot = (p,n) => p.screenshot({path:require('path').join(__dirname,'shots',n)});

  // ================= ALUMNA: su bloque privado en Deberes =================
  let p = await open('s1');
  ok(await p.locator('.modal').count()===0, 'Sin logros nuevos no sale ninguna celebración');
  await goto(p,'profile');
  ok(await p.locator('#goalsPanel').count()===0, 'Perfil: ya no lleva los objetivos');
  await goto(p,'homework');
  ok(await p.locator('#goalsPanel').count()===0 && await p.locator('.tab[data-t=goals]').count()===1, 'Deberes: "Mis objetivos" va en su pestaña');
  await p.click('.tab[data-t=goals]'); await p.waitForTimeout(200);
  ok(await p.locator('#goalsPanel').count()===1 && await p.locator('.hwcard').count()===0, 'Pestaña "Mis objetivos": solo los objetivos');
  const txt = await p.textContent('#goalsPanel');
  ok(txt.includes('Solo tú y tu profesor'), 'Marcado como privado');
  ok(txt.includes('2/5'), 'Progreso 2/5 (4 generales + 1 personal)');
  ok(txt.includes('Tocar Wonderwall entera') && !txt.includes('Walking bass'), 'Ve su objetivo personal y no el de otro alumno');
  ok(txt.includes('Etapa actual: 2 · Técnica de base'), 'Etapa actual: la primera sin terminar');
  ok(await p.locator('#goalsPanel details.gstage.full').count()===1, 'La etapa 1 sale completada');
  ok(await p.locator('#goalsPanel button[data-action=goal-toggle]').count()===0, 'La alumna no puede marcar nada');
  const hack = await p.evaluate(async()=>{ const a = await sb.from('goals_done').insert({goal_id:'g3',student_id:'s1'}).select(); const b = await sb.from('goals_done').update({done_at:'2020-01-01T00:00:00Z'}).eq('id','gd1').select(); return [!!a.error, !!b.error]; });
  ok(hack[0] && hack[1], 'RLS: el alumno no puede marcarse objetivos ni cambiar la fecha');
  const other = await p.evaluate(async()=>{ const {data} = await sb.from('goals_done').select('*'); const it = await sb.from('goals_items').select('*'); return [data.map(d=>d.student_id), it.data.map(g=>g.id)]; });
  ok(!other[0].includes('s2') && !other[1].includes('g6'), 'RLS: no lee logros ni personales de otros');
  await p.locator('#goalsPanel').scrollIntoViewIfNeeded();
  await shot(p,'objetivos-alumna.png');
  await p.context().close();

  // móvil
  p = await open('s1', {width:390,height:844});
  await goto(p,'homework'); await p.click('.tab[data-t=goals]'); await p.waitForTimeout(200); await p.locator('#goalsPanel').scrollIntoViewIfNeeded();
  const over = await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  ok(!over, 'Móvil: sin desbordamiento horizontal');
  await shot(p,'objetivos-movil.png');
  await p.context().close();

  // ================= PROFESOR: marcar desde la ficha =================
  p = await open('t1');
  await goto(p,'students');
  await p.click('[data-action=open-student][data-id=s1]'); await wait(p);
  ok((await p.textContent('.modal')).includes('2/5'), 'Ficha: resumen de objetivos 2/5');
  await p.click('.modal [data-action=goals-open]'); await wait(p);
  ok(await p.locator('.modal [data-goals=s1]').count()===1, 'Se abre "Objetivos de Marta"');
  await p.click('.modal [data-action=goal-toggle][data-id=g3]'); await wait(p,350);
  let d = await snapshot(p);
  ok(d.goals_done.some(x=>x.goal_id==='g3'&&x.student_id==='s1'), 'Marcar: se guarda el logro');
  ok(d.notifications.some(n=>n.user_id==='s1'&&n.kind==='goal'&&n.extra==='Técnica de mano derecha'), 'Le llega el aviso "Objetivo conseguido"');
  ok((await p.textContent('.modal')).includes('3/5'), 'El contador sube a 3/5 en el momento');
  await shot(p,'objetivos-profesor.png');
  // desmarcar y volver a marcar
  await p.click('.modal [data-action=goal-toggle][data-id=g3]'); await wait(p,300);
  ok(!(await snapshot(p)).goals_done.some(x=>x.goal_id==='g3'), 'Desmarcar lo quita');
  await p.click('.modal [data-action=goal-toggle][data-id=g3]'); await wait(p,300);
  // objetivo personal nuevo
  await p.click('.modal [data-action=goal-new][data-sid=s1]'); await wait(p);
  await p.fill('#goalForm [name=title]','Componer un riff propio'); await p.click('#goalForm [type=submit]'); await wait(p,350);
  d = await snapshot(p);
  ok(d.goals_items.some(g=>g.title==='Componer un riff propio'&&g.student_id==='s1'&&g.stage===null), 'Objetivo personal creado');
  ok(await p.locator('.modal [data-goals=s1]').count()===1 && (await p.textContent('.modal')).includes('Componer un riff propio'), 'Vuelve a los objetivos de Marta con el nuevo');
  // lista general
  await p.click('.modal [data-action=goals-catalog]'); await wait(p);
  ok(await p.locator('.modal [data-gcat]').count()===1, 'Se abre la lista general');
  await p.fill('.gstage-title[data-stage="3"]','Acordes con cejilla'); await p.press('.gstage-title[data-stage="3"]','Tab'); await wait(p,300);
  ok((await snapshot(p)).goals_stages.find(x=>x.stage===3).title==='Acordes con cejilla', 'Renombrar una etapa (se guarda al salir del campo)');
  await p.click('.modal [data-action=goal-new][data-stage="3"]'); await wait(p);
  await p.fill('#goalForm [name=title]','Acordes con cejilla en la 5ª cuerda'); await p.click('#goalForm [type=submit]'); await wait(p,350);
  d = await snapshot(p);
  ok(d.goals_items.some(g=>g.title==='Acordes con cejilla en la 5ª cuerda'&&!g.student_id&&g.stage===3), 'Objetivo general añadido a la etapa 3');
  ok(await p.locator('.modal [data-gcat]').count()===1, 'Vuelve a la lista general');
  await p.click('.modal button.btn.primary[data-action=goal-new]'); await wait(p);
  await p.fill('#goalForm [name=title]','Modos griegos'); await p.click('#goalForm [type=submit]'); await wait(p,350);
  d = await snapshot(p);
  ok(d.goals_items.some(g=>g.title==='Modos griegos'&&g.stage===4) && d.goals_stages.some(s=>s.stage===4), 'Nueva etapa 4 con su objetivo');
  await shot(p,'objetivos-lista.png');
  // borrar un general que alguien tiene conseguido
  await p.click('.modal [data-action=goal-delete][data-id=g1]'); await wait(p,300);
  d = await snapshot(p);
  ok(!d.goals_items.some(g=>g.id==='g1') && !d.goals_done.some(x=>x.goal_id==='g1'), 'Borrar un objetivo general quita también sus logros');
  const afterTeacher = d;
  await p.context().close();

  // ================= ALUMNA: celebración al abrir la app =================
  p = await open('s1', undefined, afterTeacher);
  await wait(p,600);
  ok(await p.locator('.modal .celebrate').count()===1, 'Al entrar ve la celebración del logro nuevo');
  ok((await p.textContent('.modal')).includes('Técnica de mano derecha'), 'Con el título del objetivo');
  ok(await p.locator('.confetti').count()===1, 'Confeti 🎉');
  await shot(p,'objetivos-celebracion.png');
  await p.click('.modal [data-action=close]'); await wait(p,300);
  ok((await snapshot(p)).goals_done.find(x=>x.goal_id==='g3').seen_at, 'Al cerrarla queda como vista');
  const seenDb = await snapshot(p);
  await p.context().close();
  p = await open('s1', undefined, seenDb); await wait(p,600);
  ok(await p.locator('.modal .celebrate').count()===0, 'No se repite la próxima vez');
  // en directo: el profesor marca mientras la alumna tiene la app abierta
  await p.evaluate(()=>{ const row={id:'gdx',goal_id:'g4',student_id:'s1',done_at:new Date().toISOString(),seen_at:null}; __DB.goals_done.push(row); window.__rtExternal('goals_done', row); });
  await wait(p,400);
  ok(await p.locator('.modal .celebrate').count()===1 && (await p.textContent('.modal')).includes('cejilla en la 6ª'), 'En directo: celebra al momento');
  await p.context().close();

  ok(errors.length===0, 'Sin errores de JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n${fails} FALLO(S)` : '\nTODO OK');
  process.exit(fails ? 1 : 0);
})();
