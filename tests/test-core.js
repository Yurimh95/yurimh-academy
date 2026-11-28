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
  async function open(me, vp={width:1000,height:900}){
    const ctx = await browser.newContext({ viewport:vp });
    const page = await ctx.newPage();
    page.on('pageerror',e=>errors.push('pageerror: '+e.message));
    page.on('console',m=>{ if(m.type()==='error') errors.push('console: '+m.text()); });
    page.on('dialog',d=>d.accept());
    await page.addInitScript(`window.__ME=${JSON.stringify(me)}`);
    await page.goto(require('url').pathToFileURL(require('path').join(__dirname,'test.html')).href);
    await page.waitForTimeout(400);
    return page;
  }
  const nav = p => p.locator('.nav button').allTextContents();
  const goto = async (p,s)=>{ await navTo(p, s); await p.waitForTimeout(150); };

  // ================= ALUMNA: Marta =================
  let p = await open('s1');
  ok((await p.locator('.auth').count())===0 && (await p.locator('#feedForm').count())===1, 'config.js con URL "sucia" (/rest/v1/) aceptada y limpiada');
  ok((await p.textContent('.nav button.on')).includes('Inicio') && (await p.locator('.fpost').count())>0, 'Al entrar se ve el Inicio con las publicaciones');
  const n1 = (await nav(p)).join('|');
  ok(n1.includes('Inicio')&&n1.includes('Avisos2 nuevos')&&n1.includes('Escucha analítica')&&!n1.includes('Perfil')&&!n1.includes('Alumnos')&&!n1.includes('Moderación')&&!n1.includes('Feed'), 'Menú alumna con "2 nuevos", sin "Alumnos" ni "Moderación" (Perfil va en el menú de la cuenta): '+n1);
  const home = await p.textContent('.foryou');
  ok(home.includes('Kind of Blue')&&/avisos? nuevos?/.test(home)&&!home.includes('Secreto de Luis'), 'Inicio: bloque "Para ti" con su aviso nuevo y su escucha, sin el aviso de Luis');
  await p.screenshot({path:require('path').join(__dirname,'shots','h_alumna.png')});
  await goto(p,'board');
  ok((await p.locator('.card.post').count())===2, 'Avisos: Marta ve 2 de 3');
  const bodyTxt = await p.textContent('body');
  ok(!bodyTxt.includes('Secreto de Luis')&&!bodyTxt.includes('no lo debe ver'), 'Aviso ajeno no aparece en ningún sitio');
  ok((await p.locator('.card.post .chip.new').count())===2, 'Dos avisos marcados "Nuevo"');
  const mh = await p.innerHTML('.card.post:has-text("Clase del jueves") .postbody');
  ok((await p.locator('.card.post .brief').count())===0 && (await p.locator('.card.post:has-text("Clase del jueves") .postbody').isVisible()), 'El aviso se lee entero en el tablón, sin resumen ni modal');
  ok(mh.includes('<a href="https://example.com/clase"')&&mh.includes('</a>.'), 'Enlace clicable y punto final fuera del enlace');
  ok((await p.locator('.card.post img').count())===0 && mh.includes('&lt;img'), 'HTML del aviso escapado (sin XSS)');
  await p.waitForTimeout(500);
  ok((await p.evaluate(()=>window.__DB.board_reads.some(r=>r.post_id==='p1'&&r.student_id==='s1'))), 'Al verlo en pantalla se guarda como leído');
  ok(!(await nav(p)).join('|').includes('nuevo'), 'Sin avisos nuevos tras verlos en pantalla');
  await p.screenshot({path:require('path').join(__dirname,'shots','b_alumna.png')});

  // intentos de saltarse la seguridad
  const sec = await p.evaluate(async()=>{
    const r={};
    r.role=(await sb.from('profiles').update({role:'teacher'}).eq('id','s1').select()).error;
    r.appr=(await sb.from('profiles').update({approved:false}).eq('id','s1').select()).error;
    r.otherName=(await sb.from('profiles').update({display_name:'Hack'}).eq('id','s2').select()).data;
    r.post=(await sb.from('board_posts').insert({author_id:'s1',title:'x',body:'y'}).select()).error;
    r.readOther=(await sb.from('board_reads').insert({post_id:'p3',student_id:'s1'})).error;
    r.readAsOther=(await sb.from('board_reads').insert({post_id:'p1',student_id:'s2'})).error;
    r.posts=(await sb.from('board_posts').select('*')).data.map(x=>x.id);
    r.reads=(await sb.from('board_reads').select('*')).data.map(x=>x.student_id);
    r.recips=(await sb.from('board_recipients').select('*')).data.map(x=>x.student_id);
    r.delPost=(await sb.from('board_posts').delete().eq('id','p1')).error;
    return r;
  });
  ok(sec.role&&/profesor/.test(sec.role.message), 'Alumna NO puede darse rol de profesor');
  ok(sec.appr&&/profesor/.test(sec.appr.message), 'Alumna NO puede cambiar su aprobación');
  ok(Array.isArray(sec.otherName)&&sec.otherName.length===0, 'Alumna NO puede renombrar a otro alumno');
  ok(!!sec.post, 'Alumna NO puede publicar avisos');
  ok(!!sec.readOther, 'Alumna NO puede marcar leído un aviso que no ve');
  ok(!!sec.readAsOther, 'Alumna NO puede marcar leído en nombre de otro');
  ok(JSON.stringify(sec.posts.sort())==='["p1","p2"]', 'Solo recibe sus avisos (p1,p2): '+sec.posts);
  ok(sec.reads.every(x=>x==='s1')&&sec.recips.every(x=>x==='s1'), 'Solo ve sus lecturas y destinatarios');
  ok((await p.evaluate(()=>window.__DB.board_posts.length))===3, 'Intento de borrar aviso no borra nada');

  // perfil
  await goto(p,'profile');
  await p.fill('#nameForm [name=display_name]','Marta R.');
  await p.click('#nameForm button'); await p.waitForTimeout(250);
  ok((await p.textContent('.av-meta b')).includes('Marta R.'), 'Perfil: nombre cambiado y visible en cabecera');
  ok((await p.evaluate(()=>window.__DB.profiles.find(x=>x.id==='s1').display_name))==='Marta R.', 'Perfil: nombre guardado en BD');
  ok((await p.locator('#passForm').count())===0, 'Perfil: solo el perfil, sin contraseña ni ajustes');
  await p.click('.prof-bar [data-s=settings]'); await p.waitForTimeout(200);
  ok((await p.locator('#passForm').count())===1, 'Botón ⚙ Ajustes de Perfil abre Ajustes');
  await p.fill('#passForm [name=password]','abcdefgh'); await p.fill('#passForm [name=password2]','abcdefgX');
  await p.click('#passForm button'); await p.waitForTimeout(150);
  ok((await p.textContent('#toast')).includes('no coinciden'), 'Contraseñas distintas rechazadas');
  await p.fill('#passForm [name=password]','abcdefgh'); await p.fill('#passForm [name=password2]','abcdefgh');
  await p.click('#passForm button'); await p.waitForTimeout(200);
  ok((await p.evaluate(()=>window.__lastPassword))==='abcdefgh', 'Contraseña nueva enviada');
  // inicio -> abrir pendiente
  await goto(p,'feed');
  await p.click('.fy-chip[data-action=home-open-assign]'); await p.waitForTimeout(250);
  ok((await p.locator('.modal textarea').count())===7 && (await p.textContent('.nav button.on')).includes('Escucha'), 'Desde Inicio se abre la escucha pendiente');
  await p.keyboard.press('Escape');

  // móvil
  const m = await open('s1',{width:390,height:844});
  await m.screenshot({path:require('path').join(__dirname,'shots','m_alumna.png')});
  ok(await m.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1), 'Móvil: sin scroll horizontal');

  // ================= PROFESOR =================
  p = await open('t1');
  ok((await p.textContent('.nav button.on')).includes('Inicio') && (await p.locator('.foryou').count())===0, 'Profe: también entra al Inicio (sin bloque "Para ti")');
  ok((await nav(p)).join('|').includes('Moderación'), 'Profe: tiene la pestaña Moderación');
  await goto(p,'mod');
  ok((await p.textContent('.phead h1.sec')).includes('Moderación'), 'Moderación: título');
  const stats = (await p.locator('.stat').allTextContents()).map(s=>s.replace(/\s+/g,' ').trim());
  ok(stats.length===4&&/Respuestas sin leer/.test(stats[0])&&stats[1].startsWith('1')&&stats[2].startsWith('1')&&/Denuncias/.test(stats[3]), 'Estadísticas: sin leer, 1 vencida, 1 por aprobar, denuncias -> '+stats.join(' | '));
  ok(!(await p.textContent('.shell')).includes('Avisos publicados'), 'Ya no sale el resumen de avisos');
  await p.click('#modRev .tab[data-t=all]'); await p.waitForTimeout(150);
  const rv = await p.textContent('#modRev');
  ok(rv.includes('Luis')&&rv.includes('Kind of Blue'), 'Respuestas (Todas) muestra a Luis con Kind of Blue');
  await p.screenshot({path:require('path').join(__dirname,'shots','h_profe.png')});
  ok((await nav(p)).join('|').includes('Alumnos1 por aprobar'), 'Menú profe: "Alumnos 1 por aprobar"');
  await goto(p,'board');
  ok((await p.locator('.card.post').count())===3, 'Profe ve los 3 avisos');
  const c1 = (await p.textContent('.card.post:has-text("Clase del jueves")')).replace(/\s+/g,' ');
  ok(c1.includes('Fijado')&&c1.includes('Leído 1/2')&&c1.includes('Todos los alumnos'), 'Aviso general: fijado, Leído 1/2');
  ok((await p.textContent('.card.post:has-text("Solo para Marta")')).includes('Leído 0/1'), 'Aviso individual: Leído 0/1');
  await p.click('.card.post:has-text("Clase del jueves") .post-reads summary');
  const mt = (await p.textContent('.card.post:has-text("Clase del jueves") .post-reads')).replace(/\s+/g,' ');
  ok(mt.includes('○ Marta')&&mt.includes('✔ Luis'), 'Desplegable: quién lo ha leído');
  // nuevo aviso
  await p.click('[data-action=new-post]');
  ok(await p.locator('#pickBox').isHidden(), 'Selector de alumnos oculto con "Todos"');
  await p.fill('#postForm [name=title]','Concierto de fin de curso'); await p.fill('#postForm [name=body]','Apuntaos aquí');
  await p.check('#postForm [name=audience][value=selected]');
  ok(await p.locator('#pickBox').isVisible(), 'Selector visible con "Alumnos concretos"');
  ok(await p.locator('#pickBox input[name=pick]').count()===2, 'Solo alumnos aprobados seleccionables (2)');
  await p.click('#postForm button[type=submit]'); await p.waitForTimeout(150);
  ok((await p.textContent('#toast')).includes('al menos un alumno'), 'No deja publicar sin destinatarios');
  await p.check('#pickBox input[value=s2]'); await p.check('#postForm [name=pinned]');
  await p.screenshot({path:require('path').join(__dirname,'shots','form_aviso.png')});
  await p.click('#postForm button[type=submit]'); await p.waitForTimeout(400);
  const np = await p.evaluate(()=>window.__DB.board_posts.find(x=>x.title==='Concierto de fin de curso'));
  ok(np&&np.pinned&&np.audience==='selected'&&np.author_id==='t1', 'Aviso creado, fijado, con autor');
  ok((await p.evaluate(id=>window.__DB.board_recipients.filter(r=>r.post_id===id).map(r=>r.student_id),np.id)).join()==='s2', 'Destinatario guardado: solo Luis');
  ok((await p.locator('.card.post').count())===4, 'Lista con 4 avisos');
  await p.screenshot({path:require('path').join(__dirname,'shots','b_profe.png')});
  // editar -> todos
  await p.click('.card.post:has-text("Concierto") [data-action=edit-post]');
  await p.check('#postForm [name=audience][value=all]');
  await p.click('#postForm button[type=submit]'); await p.waitForTimeout(400);
  ok((await p.evaluate(id=>window.__DB.board_recipients.filter(r=>r.post_id===id).length,np.id))===0 && (await p.evaluate(id=>window.__DB.board_posts.find(x=>x.id===id).audience,np.id))==='all', 'Editar a "Todos" limpia destinatarios');
  // fijar/desfijar
  await p.click('.card.post:has-text("Concierto") [data-action=toggle-pin]'); await p.waitForTimeout(300);
  ok((await p.evaluate(id=>window.__DB.board_posts.find(x=>x.id===id).pinned,np.id))===false, 'Quitar de fijados');
  // eliminar
  await p.click('.card.post:has-text("Concierto") [data-action=delete-post]'); await p.waitForTimeout(400);
  ok((await p.evaluate(()=>window.__DB.board_posts.length))===3 && (await p.locator('.card.post').count())===3, 'Aviso eliminado');
  // alumnos: renombrar
  await goto(p,'students');
  await p.evaluate(()=>{ window.__DB.profiles.find(x=>x.id==='s2').avatar=null; });
  await p.click('.row.click:has-text("Luis")'); await p.waitForTimeout(200);
  await p.fill('#renameInput','Luis G.'); await p.click('[data-action=rename-student]'); await p.waitForTimeout(250);
  ok((await p.evaluate(()=>window.__DB.profiles.find(x=>x.id==='s2').display_name))==='Luis G.', 'Profe renombra alumno en BD');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok((await p.locator('.row.click:has-text("Luis G.")').count())===1 && (await p.locator('.row.click:has-text("Luis")').count())===1, 'Lista de alumnos refleja el nombre nuevo');
  // escucha intacta
  await goto(p,'listening');
  ok((await p.locator('.track').count())===2, 'Módulo Escucha sigue funcionando (2 filas en la lista)');

  // sin migración de SQL
  const q = await open('t1');
  await q.evaluate(()=>{});
  console.log('\nERRORES DE CONSOLA/PÁGINA:', errors.length? errors : 'ninguno');
  console.log(fails? `\n${fails} FALLOS`:'\nTODO OK');
  await browser.close();
})().catch(e=>{ console.error('CRASH',e); process.exit(1); });
