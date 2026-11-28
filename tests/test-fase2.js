// Fase 2: perfiles completos, mensajes privados (con reglas de menores y bloqueo) y notificaciones.
// Marta (s1) tiene 13 años y no tiene permiso familiar. Luis (s2) es adulto.
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
    page.on('console',m=>{ if(m.type()==='error') errors.push('console: '+m.text()); });
    page.on('dialog',d=>d.accept());
    await page.addInitScript(`window.__ME=${JSON.stringify(me)}`);
    if (db) await page.addInitScript(`window.__DB_OVERRIDE=${JSON.stringify(db)}`);
    await page.goto(require('url').pathToFileURL(require('path').join(__dirname,'test.html')).href);
    await page.waitForTimeout(450);
    return page;
  }
  const goto = async (p,s)=>{ await navTo(p, s); await p.waitForTimeout(200); };
  const db = (p,fn,arg) => p.evaluate(fn,arg);
  // Mensajes va en la barra superior: su contador es el número de la burbuja
  const navText = async p => (await p.locator('.nav button, .top-r [data-s=messages]').evaluateAll(b => b.map(x => x.dataset.s === 'messages' ? 'Mensajes' + (x.querySelector('.dotn') ? x.querySelector('.dotn').textContent + ' sin leer' : '') : x.textContent))).join('|');
  const wait = (p,ms=250) => p.waitForTimeout(ms);
  const snapshot = p => p.evaluate(()=>JSON.parse(JSON.stringify(window.__DB))); // para seguir con el mismo estado en otra sesión

  // ================= MARTA (menor, sin permiso) =================
  let p = await open('s1');
  ok((await navText(p)).includes('Mensajes1 sin leer'), 'Menú: "Mensajes 1 sin leer"');
  ok((await p.locator('.bell .dotn').count())===0, 'Un mensaje privado no sube la campanita (solo el contador de Mensajes)');

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
  ok((await p.locator('#aboutForm [name=learning]').count())===0, 'Sin el campo \"Ahora estoy aprendiendo\"'); await p.click('#aboutForm button[type=submit]'); await wait(p,350);
  const me1 = await db(p,()=>window.__DB.profiles.find(x=>x.id==='s1'));
  ok(me1.bio==='Me encanta el metal' && me1.instrument==='electric' && me1.level==='beginner', 'Guarda "Sobre ti" (bio, instrumento, nivel)');
  ok(!(await p.evaluate(async()=>JSON.stringify((await sb.rpc('get_directory')).data))).includes('2013'), 'Su fecha de nacimiento no sale en el directorio');

  // Notificaciones
  await p.click('.bell'); await wait(p,300);
  ok((await p.locator('.modal').count())===0 && (await p.locator('#notifBox').count())===1, 'Notificaciones: se abren como desplegable bajo la campanita, no como ventana');
  { const b=await p.locator('.bell').boundingBox(), n=await p.locator('#notifBox').boundingBox(); ok(n.y>=b.y+b.height && n.y-(b.y+b.height)<20 && n.x+n.width<=b.x+b.width+12, 'El desplegable sale justo debajo de la campanita, alineado a su derecha'); }
  ok(!(await p.textContent('#notifBox')).includes('te ha enviado un mensaje'), 'Notificaciones: los mensajes privados no salen en la lista');
  ok(!!(await db(p,()=>window.__DB.notifications.find(n=>n.id==='n1').read_at)), 'Al abrir la conversación, su aviso de mensaje queda leído (así el siguiente vuelve a llegar al móvil)');
  await p.keyboard.press('Escape'); await wait(p);
  await p.evaluate(()=>openNotifFromUrl('?n=n1')); await wait(p,400);
  ok((await p.evaluate(()=>S.section))==='messages' && (await p.textContent('.dm-thread-head')).includes('Yuri'), 'Tocar el aviso del móvil abre la conversación');
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
  ok((await p.evaluate(()=>S.section))==='messages' && (await p.locator('.top-r [data-s=messages].on').count())===1, 'Atrás: vuelve de Avisos a Mensajes');
  await p.click('.bell'); await wait(p,300);
  ok((await p.locator('#notifBox').count())===1, 'Abre las notificaciones');
  await p.goBack(); await wait(p,300);
  ok((await p.locator('#notifBox').count())===0 && (await p.evaluate(()=>S.section))==='messages', 'Atrás: cierra el desplegable sin cambiar de sección');
  await p.click('.bell'); await wait(p,250); await p.click('.bell'); await wait(p,300);
  ok((await p.locator('#notifBox').count())===0, 'La campanita cierra su desplegable');
  await p.click('.bell'); await wait(p,250); await p.mouse.click(5,600); await wait(p,300);
  ok((await p.locator('#notifBox').count())===0, 'Tocar fuera cierra el desplegable');
  await p.goBack(); await wait(p,300);
  ok((await p.textContent('.nav button.on')).includes('Inicio'), 'Tras cerrar el desplegable, Atrás sigue funcionando bien (Inicio)');

  // Escucha analítica en lista con iconos y botón ▶
  await goto(p,'listening'); await p.click('[data-action=filter][data-f=all]'); await wait(p);
  const nTracks = await p.locator('.track').count();
  ok(nTracks>0 && (await p.locator('.track .kicon').count())===nTracks && (await p.locator('.track .playbtn').count())===nTracks && (await p.locator('.track .cover').count())===nTracks, 'Escucha: filas con portada/icono, icono de tipo y botón ▶ ('+nTracks+')');
  ok((await p.locator('.track .playbtn.sp, .track .playbtn.yt').count())===nTracks, 'El botón ▶ lleva el color de Spotify o YouTube');
  await p.screenshot({path:require('path').join(__dirname,'shots','escucha_lista.png')});
  await goto(p,'settings');
  ok((await p.textContent('#app')).includes('Tenla en el móvil como una app'), 'Ajustes: explica cómo instalarla en el móvil');
  ok((await p.textContent('#app')).includes('Notificaciones en el móvil'), 'Ajustes: apartado de notificaciones en el móvil');
  ok((await p.textContent('#app')).includes('Solo lo ve tu profesor') && (await p.textContent('#app')).includes('Personas bloqueadas'), 'Ajustes: privacidad explicada y lista de bloqueados');
  await p.click('.bell'); await wait(p,250);
  ok((await p.locator('#notifBox .nb-push').count())===0, 'La campanita no invita a activar push si no se pueden activar (eso va en Ajustes)');
  await p.keyboard.press('Escape'); await wait(p,200);
  // Grupos como Facebook: Nuevas (sin leer), Hoy (leídas de hoy) y Anteriores
  await p.evaluate(()=>{ const d=new Date(Date.now()-3*864e5).toISOString(), now=new Date().toISOString();
    S.notifs.push({id:'ng1',user_id:'s1',kind:'homework',extra:'Escala nueva',created_at:now,read_at:null},
      {id:'ng2',user_id:'s1',kind:'homework',extra:'Escala vista hoy',created_at:now,read_at:now},
      {id:'ng4',user_id:'s1',kind:'homework',extra:'Escala de hace 20 h',created_at:new Date(Date.now()-20*3600e3).toISOString(),read_at:now},
      {id:'ng3',user_id:'s1',kind:'homework',extra:'Escala antigua',created_at:d,read_at:d}); });
  await p.evaluate(()=>{ S.push='off'; }); await p.click('.bell'); await wait(p,250);
  const grp = async k => (await p.locator(`#notifBox [data-ngroup=${k}]`).count()) ? await p.textContent(`#notifBox [data-ngroup=${k}]`) : '';
  ok((await grp('new')).includes('Nuevas') && (await grp('new')).includes('Escala nueva') && !(await grp('new')).includes('Escala vista hoy'), 'Grupo "Nuevas": las que no has leído');
  ok((await grp('today')).includes('Hoy') && (await grp('today')).includes('Escala vista hoy') && (await grp('today')).includes('Escala de hace 20 h'), 'Grupo "Hoy": leídas de las últimas 24 h (aunque sean de ayer)');
  ok((await grp('old')).includes('Anteriores') && (await grp('old')).includes('Escala antigua'), 'Grupo "Anteriores": leídas de hace más de 24 h');
  ok((await p.locator('#notifBox .nb-tab.on').textContent()).includes('Todas'), 'Filtro: empieza en "Todas"');
  await p.click('#notifBox [data-action=notif-filter][data-f=unread]'); await wait(p,200);
  { const t = await p.textContent('#notifBox .nb-scroll'); ok((await p.locator('#notifBox').count())===1 && t.includes('Escala nueva') && !t.includes('Escala vista hoy') && !t.includes('Escala antigua') && (await p.locator('#notifBox .nb-group').count())===0, 'Filtro "No leídas": solo las sin leer, y el desplegable sigue abierto'); }
  await p.click('#notifBox [data-action=notif-filter][data-f=all]'); await wait(p,200);
  // Activar push: franja arriba, antes de la lista (no al final, donde nadie llega)
  ok((await p.locator('#notifBox .nb-push [data-action=push-on]').count())===1, 'Si se pueden activar y están apagadas, la campanita invita a activarlas');
  { const bp = await p.locator('#notifBox .nb-push').boundingBox(), bl = await p.locator('#notifBox .nb-scroll').boundingBox(); ok(bp.y < bl.y, 'La invitación sale arriba, antes de las notificaciones'); }
  await p.click('#notifBox [data-action=push-later]'); await wait(p,200);
  ok((await p.locator('#notifBox').count())===1 && (await p.locator('#notifBox .nb-push').count())===0, '"Ahora no" la esconde sin cerrar el desplegable');
  await p.keyboard.press('Escape'); await wait(p,200); await p.click('.bell'); await wait(p,250);
  ok((await p.locator('#notifBox .nb-push').count())===0, 'Y sigue escondida al volver a abrir');
  await p.evaluate(()=>{ localStorage.removeItem('ya-push-later'); S.notifs=S.notifs.filter(n=>!/^ng/.test(n.id)); });
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
  await p.click('[data-action=block]'); await wait(p,250);
  await p.click('#blockForm button[type=submit]'); await wait(p,350);
  ok((await p.locator('#dmForm').count())===0 && (await db(p,()=>window.__DB.user_blocks.some(b=>b.blocker_id==='s1'&&b.blocked_id==='s2')))===true, 'Bloquea a Lu: ya no puede escribirle');
  state = await snapshot(p);

  // ================= LUIS: bloqueado, denuncia =================
  const l = await open('s2', undefined, state);
  const lb = await l.evaluate(async()=>({ ins:(await sb.from('dm_messages').insert({sender_id:'s2',recipient_id:'s1',body:'¿Por qué?'})).error, seeBlocks:(await sb.from('user_blocks').select('*')).data.length }));
  ok(!!lb.ins && lb.seeBlocks===0, 'Lu no puede escribir a quien le ha bloqueado, ni ve el bloqueo');
  await goto(l,'messages'); await l.click('.dm-conv:has-text("Marta")'); await wait(l,350);
  await l.hover('.msg-row:has-text("me pasas la tab") .msg'); await l.click('.msg-row:has-text("me pasas la tab") .msg-more'); await wait(l,200);
  await l.click('#dmMenu [data-action=report]'); await wait(l,350);
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

  // ================= Invitación a instalar la app =================
  const base = await snapshot(m);
  const fresh = JSON.parse(JSON.stringify(base)); fresh.profiles.find(x=>x.id==='s1').install_prompted_at = null;
  const i1 = await open('s1', undefined, fresh); await wait(i1,400);
  ok(await i1.locator('#installHow').isVisible() && (await i1.locator('#qrBox').count())===1, 'Primera visita (ordenador): ventana de bienvenida con QR para abrirla en el móvil');
  ok(!!(await db(i1,()=>window.__DB.profiles.find(x=>x.id==='s1').install_prompted_at)), 'Queda apuntado que ya se le enseñó');
  await i1.screenshot({path:require('path').join(__dirname,'shots','install_modal.png')});
  await i1.click('.modal [data-action=close]:has-text("Ahora no")'); await wait(i1,250);
  ok(await i1.locator('.installbtn').isVisible(), 'Tras "Ahora no", queda el botón neón "Instalar app" arriba');
  await i1.click('.installbtn'); await wait(i1,250);
  ok(await i1.locator('#installHow').isVisible(), 'El botón vuelve a abrir la ventana');
  const again = await open('s1', undefined, await snapshot(i1)); await wait(again,400);
  ok((await again.locator('#installHow').count())===0 && await again.locator('.installbtn').isVisible(), 'Segunda visita: sin ventana, solo el botón');
  const inst = JSON.parse(JSON.stringify(base)); inst.profiles.find(x=>x.id==='s1').app_installed_at = '2026-11-23T10:00:00Z';
  const i3 = await open('s1', {width:390,height:844}, inst);
  ok((await i3.locator('.installbtn').count())===0, 'Con la app del móvil ya instalada, el botón desaparece para siempre');
  ok(await i3.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1), 'Móvil: barra superior sin scroll horizontal');

  // ================= Ficha: ¿tiene las notificaciones activadas? =================
  const pdb = JSON.parse(JSON.stringify(base));
  pdb.push_subscriptions = [{user_id:'s1',endpoint:'https://x/1'},{user_id:'s1',endpoint:'https://x/2'}];
  const pt = await open('t1', undefined, pdb); await wait(pt,300);
  const pushTxt = async id => { await pt.evaluate(async i=>{ await closeModal(); S.section='students'; render(); studentDetailModal(i); }, id); await wait(pt,150);
    return (await pt.locator('.modal [data-pushchip]').count()) ? pt.locator('.modal [data-pushchip]').innerText() : ''; };
  ok((await pushTxt('s1')).includes('Tiene las notificaciones activadas (en 2 dispositivos)'), 'Ficha: con notificaciones, lo dice y cuenta los dispositivos');
  { const t2 = await pushTxt('s2'); ok(t2.includes('No tiene las notificaciones activadas'), 'Ficha: sin notificaciones, lo dice'); }
  const ps1 = await open('s1', undefined, pdb); await wait(ps1,300);
  ok((await ps1.evaluate(async()=>(await sb.rpc('get_push_status')).data.length))===0, 'Un alumno no puede saber quién tiene las notificaciones activadas');

  console.log('\nERRORES DE CONSOLA/PÁGINA:', errors.length? errors : 'ninguno');
  console.log(fails? `\n${fails} FALLOS`:'\nTODO OK');
  await browser.close();
  process.exit(fails?1:0);
})().catch(e=>{ console.error('CRASH',e); process.exit(1); });
