// Fase 2: perfiles completos, mensajes privados (con reglas de menores y bloqueo) y notificaciones.
// Marta (s1) tiene 13 años y no tiene permiso familiar. Luis (s2) es adulto.
const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors=[]; let fails=0;
  const ok=(c,m)=>{ console.log((c?'OK   ':'FAIL ')+m); if(!c) fails++; };
  async function open(me, vp={width:1400,height:900}, db=null){
    const ctx = await browser.newContext({ viewport:vp });
    const page = await ctx.newPage();
    page.on('pageerror',e=>errors.push('pageerror: '+e.message));
    page.on('console',m=>{ if(m.type()==='error') errors.push('console: '+m.text()); });
    page.on('dialog',d=>d.accept());
    await page.addInitScript(`window.__ME=${JSON.stringify(me)}`);
    if (db) await page.addInitScript(`window.__DB_OVERRIDE=${JSON.stringify(db)}`);
    await page.goto(require('url').pathToFileURL(require('path').join(__dirname,'test.html')).href);
    await page.waitForTimeout(450);
    return page;
  }
  const goto = async (p,s)=>{ await p.click(`.nav button[data-s=${s}]:visible, .tabbar button[data-s=${s}]:visible`); await p.waitForTimeout(200); };
  const db = (p,fn,arg) => p.evaluate(fn,arg);
  const navText = async p => (await p.locator('.nav button').allTextContents()).join('|');
  const wait = (p,ms=250) => p.waitForTimeout(ms);
  const snapshot = p => p.evaluate(()=>JSON.parse(JSON.stringify(window.__DB))); // para seguir con el mismo estado en otra sesión

  // ================= MARTA (menor, sin permiso) =================
  let p = await open('s1');
  ok((await navText(p)).includes('Mensajes1 sin leer'), 'Menú: "Mensajes 1 sin leer"');
  ok((await p.textContent('.bell')).includes('1'), 'Campanita con 1 notificación');

  await goto(p,'messages');
  ok((await p.locator('.dm-conv').count())===2, 'Ve sus 2 conversaciones (Yuri y la antigua con Lu)');
  await p.click('.dm-conv:has-text("Yuri")'); await wait(p,350);
  ok((await p.textContent('#dmThread')).includes('repasa el ejercicio'), 'Abre la conversación con el profe');
  ok(!!(await db(p,()=>window.__DB.dm_messages.find(m=>m.id==='d3').read_at)) && !(await navText(p)).includes('sin leer'), 'Al abrirla se marca como leído y desaparece el contador');
  await p.fill('#dmForm textarea','Vale profe, lo repaso'); await p.click('#dmForm button[type=submit]'); await wait(p,400);
  ok((await db(p,()=>window.__DB.dm_messages.filter(m=>m.body==='Vale profe, lo repaso'&&m.sender_id==='s1'&&m.recipient_id==='t1').length))===1
     && (await p.locator('.msg-row.mine:has-text("Vale profe")').count())===1, 'Envía un mensaje al profe (una sola vez, sin duplicar)');
  await p.screenshot({path:require('path').join(__dirname,'shots','dm_alumna.png')});

  await p.click('[data-action=dm-new]'); await wait(p,300);
  const contacts = await p.locator('.modal .row.click').allTextContents();
  ok(contacts.length===1 && contacts[0].includes('Yuri') && (await p.textContent('.modal')).includes('Como eres menor'), 'Nuevo mensaje: como menor sin permiso, solo puede escribir al profe');
  await p.keyboard.press('Escape'); await wait(p);
  await p.click('.dm-conv:has-text("Lu")'); await wait(p,350);
  ok((await p.locator('#dmForm').count())===0 && (await p.textContent('.dm-pane')).includes('No podéis escribiros'), 'Con Lu: ve el mensaje antiguo pero no puede responder');
  const forced = await p.evaluate(async()=>(await sb.from('dm_messages').insert({sender_id:'s1',recipient_id:'s2',body:'colado'})).error);
  ok(!!forced, 'Saltándose la interfaz tampoco puede escribir a Lu (RLS)');
  const hack = await p.evaluate(async()=>({
    fam:(await sb.from('profiles').update({family_dm_ok:true}).eq('id','s1').select()).error,
    bd:(await sb.from('profiles').update({birth_date:'1990-01-01'}).eq('id','s1').select()).error }));
  ok(!!hack.fam && !!hack.bd, 'No puede darse permiso ni cambiarse la fecha de nacimiento');

  // Perfil público de Luis desde el Inicio
  await goto(p,'feed');
  await p.click('.fpost:has-text("Joe Pass") .fhead .wholink >> nth=1'); await wait(p,350);
  const pf = await p.textContent('.modal');
  ok(pf.includes('Bajista y fan del jazz') && pf.includes('Bajo') && pf.includes('Intermedio') && pf.includes('Joe Pass, Jaco'), 'Ficha pública de Luis: bio, instrumento, nivel y favoritos');
  ok((await p.locator('.modal [data-action=dm-open]').count())===0 && pf.includes('No podéis escribiros'), 'En la ficha no hay "Enviar mensaje" (no está permitido)');
  ok(!pf.includes('2000') && !pf.includes('l@x.com'), 'La ficha no muestra fecha de nacimiento ni email');
  await p.keyboard.press('Escape'); await wait(p);

  // Su propio perfil
  await goto(p,'profile');
  await p.fill('#aboutForm [name=bio]','Me encanta el metal'); await p.selectOption('#aboutForm [name=instrument]','electric'); await p.selectOption('#aboutForm [name=level]','beginner');
  await p.fill('#aboutForm [name=learning]','Seek & Destroy'); await p.click('#aboutForm button[type=submit]'); await wait(p,350);
  const me1 = await db(p,()=>window.__DB.profiles.find(x=>x.id==='s1'));
  ok(me1.bio==='Me encanta el metal' && me1.instrument==='electric' && me1.level==='beginner' && me1.learning==='Seek & Destroy', 'Guarda "Sobre ti" (bio, instrumento, nivel, aprendiendo)');
  ok(!(await p.evaluate(async()=>JSON.stringify((await sb.rpc('get_directory')).data))).includes('2013'), 'Su fecha de nacimiento no sale en el directorio');

  // Notificaciones
  await p.click('.bell'); await wait(p,300);
  ok((await p.textContent('.modal')).includes('Yuri te ha enviado un mensaje'), 'Notificaciones: "Yuri te ha enviado un mensaje"');
  await p.click('.modal .nrow'); await wait(p,400);
  ok((await p.textContent('.nav button.on')).includes('Mensajes') && (await p.textContent('.dm-thread-head')).includes('Yuri') && !!(await db(p,()=>window.__DB.notifications.find(n=>n.id==='n1').read_at)), 'Pulsarla abre la conversación y la marca como leída');
  // Llega un mensaje en directo mientras tiene la conversación abierta
  await p.evaluate(()=>window.__rtExternal('dm_messages',{id:'drt',sender_id:'t1',recipient_id:'s1',body:'¿Lo tienes ya?',read_at:null})); await wait(p,400);
  ok((await p.textContent('#dmThread')).includes('¿Lo tienes ya?') && !!(await db(p,()=>window.__DB.dm_messages.find(m=>m.id==='drt').read_at)), 'Mensaje en directo: aparece y queda leído al estar viéndolo');
  // ...y en otra sección: sube la campanita
  await goto(p,'feed');
  await p.evaluate(()=>window.__rtExternal('feed_comments',{id:'frt',post_id:'f3',author_id:'s2',body:'¡Buena reflexión!'})); await wait(p,400);
  ok((await p.textContent('.bell')).includes('1'), 'Comentan su publicación: la campanita sube sola');

  // Privacidad: no puede averiguar si otro compañero es menor
  const leak = await p.evaluate(async()=>({ other:(await sb.rpc('can_dm',{a:'s2',b:'t1'})).data, ok:(await sb.rpc('dm_ok',{uid:'s2'})).error }));
  ok(leak.other===false && !!leak.ok, 'No puede consultar permisos de mensajes de otros (no revela quién es menor)');

  // Botón "Atrás" (ratón/móvil): vuelve a la sección anterior y cierra ventanas
  await goto(p,'messages'); await goto(p,'board');
  await p.goBack(); await wait(p,300);
  ok((await p.textContent('.nav button.on')).includes('Mensajes'), 'Atrás: vuelve de Avisos a Mensajes');
  await p.click('.bell'); await wait(p,300);
  ok((await p.locator('.modal').count())===1, 'Abre las notificaciones');
  await p.goBack(); await wait(p,300);
  ok((await p.locator('.modal').count())===0 && (await p.textContent('.nav button.on')).includes('Mensajes'), 'Atrás: cierra la ventana sin cambiar de sección');
  await p.click('.bell'); await wait(p,250); await p.click('.modal .x'); await wait(p,300);
  await p.goBack(); await wait(p,300);
  ok((await p.textContent('.nav button.on')).includes('Inicio'), 'Tras cerrar una ventana con la ✕, Atrás sigue funcionando bien (Inicio)');

  // Escucha analítica en lista con iconos y botón ▶
  await goto(p,'listening'); await p.click('[data-action=filter][data-f=all]'); await wait(p);
  const nTracks = await p.locator('.track').count();
  ok(nTracks>0 && (await p.locator('.track .kicon').count())===nTracks && (await p.locator('.track .playbtn').count())===nTracks && (await p.locator('.track .cover').count())===nTracks, 'Escucha: filas con portada/icono, icono de tipo y botón ▶ ('+nTracks+')');
  ok((await p.locator('.track .playbtn.sp, .track .playbtn.yt').count())===nTracks, 'El botón ▶ lleva el color de Spotify o YouTube');
  await p.screenshot({path:require('path').join(__dirname,'shots','escucha_lista.png')});
  await goto(p,'profile');
  ok((await p.textContent('#app')).includes('Tenla en el móvil como una app'), 'Perfil: explica cómo instalarla en el móvil');
  ok((await p.textContent('#app')).includes('Notificaciones en el móvil'), 'Perfil: apartado de notificaciones en el móvil');
  await p.click('.bell'); await wait(p,250);
  ok((await p.locator('.modal .push-box').count())===1, 'La campanita también ofrece activar las notificaciones en el móvil');
  await p.keyboard.press('Escape'); await wait(p);
  let state = await snapshot(p);

  // ================= PROFESOR =================
  let t = await open('t1', undefined, state);
  await goto(t,'messages');
  ok((await t.locator('.dm-conv').count())===1 && (await t.textContent('.dm-list')).includes('Marta'), 'Profe: solo ve su conversación con Marta');
  const spy = await t.evaluate(async()=>({ dm:(await sb.from('dm_messages').select('*').eq('id','d1')).data.length, blocks:(await sb.from('user_blocks').select('*')).data.length }));
  ok(spy.dm===0, 'Profe NO puede leer el mensaje privado entre Lu y Marta');
  // Escucha: al pegar el enlace se elige el tipo y, con el título vacío, se usa el de Spotify
  await t.evaluate(()=>{ window.__META_STUB = async url => ({ title: url.includes('album/abc') ? 'Master of Puppets' : null, thumb: null }); });
  await goto(t,'listening'); await t.click('[data-action=new-item]'); await wait(t,250);
  await t.fill('#itemForm [name=url]','open.spotify.com/album/abc'); await wait(t,700);
  ok((await t.inputValue('#itemForm [name=kind]'))==='album' && (await t.getAttribute('#itemForm [name=title]','placeholder')).includes('Master of Puppets'), 'Nuevo elemento: tipo "álbum" elegido solo y título sugerido');
  await t.click('#itemForm button[type=submit]'); await wait(t,500);
  ok((await db(t,()=>window.__DB.listening_items.some(i=>i.title==='Master of Puppets'&&i.kind==='album'&&i.url==='https://open.spotify.com/album/abc')))===true, 'Con el título vacío se guarda el de Spotify');
  await t.click('[data-action=new-item]'); await wait(t,250);
  await t.fill('#itemForm [name=url]','https://youtu.be/abcdefghijk'); await wait(t,600);
  await t.click('#itemForm button[type=submit]'); await wait(t,400);
  ok((await t.locator('#itemForm').count())===1 && !(await db(t,()=>window.__DB.listening_items.some(i=>i.url==='https://youtu.be/abcdefghijk'))), 'Si no se puede sacar el título, pide escribirlo (no guarda vacío)');
  await t.keyboard.press('Escape'); await wait(t);
  await goto(t,'students'); await t.click('.row.click:has-text("Marta")'); await wait(t,300);
  const ficha = await t.textContent('.modal');
  ok(ficha.includes('13 años') && ficha.includes('Menor'), 'Ficha de Marta: 13 años, menor (calculado de la fecha)');
  await t.check('#familyDm'); await wait(t,350);
  ok((await db(t,()=>window.__DB.profiles.find(x=>x.id==='s1').family_dm_ok))===true, 'Profe activa "la familia autoriza mensajes"');
  await t.keyboard.press('Escape'); await wait(t);
  state = await snapshot(t);

  // ================= MARTA con permiso =================
  p = await open('s1', undefined, state);
  await goto(p,'messages'); await p.click('[data-action=dm-new]'); await wait(p,300);
  ok((await p.locator('.modal .row.click:has-text("Lu")').count())===1, 'Con permiso familiar ya puede escribir a Lu (adulto)');
  await p.click('.modal .row.click:has-text("Lu")'); await wait(p,350);
  await p.fill('#dmForm textarea','Hola Lu, ¿me pasas la tab?'); await p.click('#dmForm button[type=submit]'); await wait(p,350);
  ok((await db(p,()=>window.__DB.dm_messages.some(m=>m.sender_id==='s1'&&m.recipient_id==='s2'&&m.body.includes('tab'))))===true, 'Mensaje a Lu enviado');
  await p.click('[data-action=block]'); await wait(p,350);
  ok((await p.locator('#dmForm').count())===0 && (await db(p,()=>window.__DB.user_blocks.some(b=>b.blocker_id==='s1'&&b.blocked_id==='s2')))===true, 'Bloquea a Lu: ya no puede escribirle');
  state = await snapshot(p);

  // ================= LUIS: bloqueado, denuncia =================
  const l = await open('s2', undefined, state);
  const lb = await l.evaluate(async()=>({ ins:(await sb.from('dm_messages').insert({sender_id:'s2',recipient_id:'s1',body:'¿Por qué?'})).error, seeBlocks:(await sb.from('user_blocks').select('*')).data.length }));
  ok(!!lb.ins && lb.seeBlocks===0, 'Lu no puede escribir a quien le ha bloqueado, ni ve el bloqueo');
  await goto(l,'messages'); await l.click('.dm-conv:has-text("Marta")'); await wait(l,350);
  await l.click('.msg-row:has-text("me pasas la tab") [data-action=report]'); await wait(l,350);
  ok((await db(l,()=>window.__DB.moderation_reports.some(r=>r.target_type==='dm_message'&&r.reporter_id==='s2')))===true, 'Lu denuncia un mensaje privado');
  state = await snapshot(l);

  // ================= PROFESOR ve la denuncia (y solo ese mensaje) =================
  t = await open('t1', undefined, state);
  ok((await t.locator('.bell .dotn').count())===1, 'Profe: notificación de denuncia');
  await goto(t,'mod');
  const mod = await t.textContent('.dcard.mod');
  ok(mod.includes('Mensaje privado') && mod.includes('me pasas la tab'), 'En Moderación ve el mensaje privado denunciado');
  const still = await t.evaluate(async()=>(await sb.from('dm_messages').select('*').eq('id','d1')).data.length);
  ok(still===0, 'Pero sigue sin poder leer el resto de la conversación');
  const blocksT = await t.evaluate(async()=>(await sb.from('user_blocks').select('*')).data.length);
  ok(blocksT===0, 'Y no se entera de los bloqueos');
  await t.click('.dcard.mod .row.rep:has-text("me pasas la tab") [data-action=mod-delete]'); await wait(t,350);
  ok((await db(t,()=>window.__DB.dm_messages.some(m=>m.body&&m.body.includes('me pasas la tab'))))===false, 'Puede borrar el mensaje denunciado');

  // ================= Registro: pide fecha de nacimiento =================
  const a = await open(null);
  await a.click('[data-action=auth-mode][data-mode=register]'); await wait(a,200);
  ok((await a.locator('#authForm input[name=birth][type=date][required]').count())===1 && (await a.textContent('#authForm')).includes('menos de 14 años'), 'Registro: fecha de nacimiento obligatoria y aviso de menores de 14');

  // ================= Móvil =================
  const m = await open('s1',{width:390,height:844});
  await goto(m,'messages'); await m.click('.dm-conv:has-text("Yuri")'); await wait(m,350);
  ok(await m.locator('.dm-list').isHidden() && await m.locator('.dm-back').isVisible(), 'Móvil: la conversación ocupa la pantalla y hay botón Volver');
  ok(await m.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1), 'Móvil: mensajes sin scroll horizontal');
  await m.screenshot({path:require('path').join(__dirname,'shots','m_dm.png')});

  console.log('\nERRORES DE CONSOLA/PÁGINA:', errors.length? errors : 'ninguno');
  console.log(fails? `\n${fails} FALLOS`:'\nTODO OK');
  await browser.close();
  process.exit(fails?1:0);
})().catch(e=>{ console.error('CRASH',e); process.exit(1); });
