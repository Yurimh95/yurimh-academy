const { chromium } = require('playwright');
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
  const goto = async (p,s)=>{ await p.click(`.nav button[data-s=${s}]`); await p.waitForTimeout(150); };
  const dbq = (p,fn,arg)=>p.evaluate(fn,arg);

  // ================= ALUMNA: Marta =================
  let p = await open('s1');
  await goto(p,'feed');
  ok((await p.locator('.fpost').count())===3, 'Feed: 3 publicaciones');
  const feedTxt = (await p.textContent('.feed')).replace(/\s+/g,' ');
  ok(feedTxt.includes('Lu')&&!feedTxt.includes('Luis')&&feedTxt.includes('Yuri'), 'Luis aparece con su apodo "Lu", no con su nombre real');
  ok(await p.locator('.fpost:has-text("Joe Pass") .linkcard:has-text("Spotify")').count()===1, 'Enlace con tarjeta Spotify');
  ok((await p.locator('img[src^="javascript"]').count())===0 && (await p.locator('.av.ini').count())>0, 'Avatar manipulado (javascript:) NO se pinta; se usa la inicial');
  ok((await p.locator('.fpost:has-text("Bienvenidos") [data-action=comment-delete], .fpost:has-text("Bienvenidos") [data-action=feed-delete]').count())===0, 'Marta no puede eliminar contenido ajeno');
  // publicar con enlace sin esquema
  await p.fill('#feedForm [name=body]','Probando mi primera publicación'); await p.fill('#feedForm [name=link]','open.spotify.com/x');
  await p.click('#feedForm button[type=submit]'); await p.waitForTimeout(300);
  const np = await dbq(p,()=>window.__DB.feed_posts.find(x=>x.body==='Probando mi primera publicación'));
  ok(np&&np.link_url==='https://open.spotify.com/x'&&np.author_id==='s1', 'Publicación guardada, enlace normalizado a https://');
  ok((await p.locator('.fpost').count())===4, 'Aparece en el feed (4)');
  // reacciones
  const card = '.fpost:has-text("Bienvenidos")';
  await p.click(card+' .rxb.add'); ok(await p.locator(card+' .rx-pick').isVisible(), 'Selector de emojis se abre');
  ok((await p.locator(card+' .rx-pick .rxb').allTextContents()).join('')==='👍🏼❤️😂😮😢😡', 'Los 6 emojis pedidos, en orden');
  await p.click(card+' .rx-pick [data-e=laugh]'); await p.waitForTimeout(200);
  ok((await p.textContent(card+' .rx-list .rxb.mine')).includes('😂'), 'Reacción 😂 marcada como mía');
  ok(await dbq(p,()=>window.__DB.reactions.some(r=>r.target_id==='f2'&&r.user_id==='s1'&&r.emoji==='laugh')), 'Reacción guardada en BD');
  await p.click(card+' .rx-list .rxb.mine'); await p.waitForTimeout(200);
  ok((await p.locator(card+' .rx-list .rxb.mine').count())===0 && !(await dbq(p,()=>window.__DB.reactions.some(r=>r.target_id==='f2'&&r.user_id==='s1'))), 'Quitar la reacción la borra');
  ok((await p.textContent('.fpost:has-text("Joe Pass") .rx-list .rxb.mine')).includes('❤️'), 'Mi ❤️ previa sigue marcada');
  // comentarios
  await p.click('.fpost:has-text("Joe Pass") [data-action=open-fpost]'); await p.waitForTimeout(150);
  ok((await p.textContent('.modal .cm')).includes('Qué bueno, lo apunto'), 'Modal: comentario existente');
  await p.fill('.modal textarea[id^=cmInput]','Totalmente de acuerdo'); await p.click('.modal [data-action=comment-send]'); await p.waitForTimeout(300);
  ok((await p.locator('.modal .cmt').count())===2, 'Comentario nuevo añadido (2)');
  ok((await dbq(p,()=>window.__DB.feed_comments.filter(c=>c.post_id==='f1').length))===2, 'Comentario en BD');
  ok((await p.textContent('.fpost:has-text("Joe Pass") [data-cmcount]')).includes('2 comentarios'), 'Contador de la tarjeta se actualiza en vivo');
  await p.click('.modal .cmt:has-text("Totalmente") .rxb.add'); await p.click('.modal .cmt:has-text("Totalmente") [data-e=wow]'); await p.waitForTimeout(200);
  ok(await dbq(p,()=>window.__DB.reactions.some(r=>r.target_type==='feed_comment'&&r.emoji==='wow'&&r.user_id==='s1')), 'Reacción a un comentario');
  ok((await p.locator('.modal .cmt:has-text("Qué bueno") [data-action=comment-delete]').count())===1 && (await p.locator('.modal .cmt:has-text("Qué bueno") [data-action=report]').count())===0, 'Puede eliminar su comentario y no denunciarse a sí misma');
  await p.keyboard.press('Escape');
  // denuncia
  await p.click('.fpost:has-text("Joe Pass") [data-action=report]'); await p.waitForTimeout(250);
  ok(await dbq(p,()=>window.__DB.moderation_reports.some(r=>r.reporter_id==='s1'&&r.target_type==='feed_post'&&r.target_id==='f1')), 'Denuncia guardada');
  ok((await p.textContent('.fpost:has-text("Joe Pass") .factions')).includes('Denunciado'), 'El botón pasa a "Denunciado"');
  await p.click('.fpost:has-text("Bienvenidos") [data-action=open-fpost]');
  ok((await p.textContent('.modal .cmt:has-text("Gracias profe")')).includes('Denunciado'), 'Denuncia previa recordada');
  await p.keyboard.press('Escape');
  await p.screenshot({path:require('path').join(__dirname,'shots','feed_alumna.png'),fullPage:true});

  // ---- Seguridad ----
  const sec = await p.evaluate(async()=>{
    const r={};
    r.lc=(await sb.from('listening_comments').select('*')).data.map(x=>x.id).sort();
    r.cmtOther=(await sb.from('listening_comments').insert({item_id:'i2',author_id:'s1',body:'intruso'}).select()).error;
    r.cmtAsOther=(await sb.from('listening_comments').insert({item_id:'i1',author_id:'s2',body:'suplantación'}).select()).error;
    r.rxItem=(await sb.from('reactions').insert({target_type:'listening_item',target_id:'i2',user_id:'s1',emoji:'like'})).error;
    r.rxCmt=(await sb.from('reactions').insert({target_type:'listening_comment',target_id:'lc2',user_id:'s1',emoji:'like'})).error;
    r.rxAsOther=(await sb.from('reactions').insert({target_type:'feed_post',target_id:'f2',user_id:'s2',emoji:'like'})).error;
    r.rxBad=(await sb.from('reactions').insert({target_type:'feed_post',target_id:'f2',user_id:'s1',emoji:'💩'})).error;
    r.rxSeen=(await sb.from('reactions').select('*')).data.filter(x=>['i2','lc2'].includes(x.target_id)).length;
    r.repHidden=(await sb.from('moderation_reports').insert({reporter_id:'s1',target_type:'listening_comment',target_id:'lc2'})).error;
    r.repOther=(await sb.from('moderation_reports').insert({reporter_id:'s2',target_type:'feed_post',target_id:'f2'})).error;
    r.reps=(await sb.from('moderation_reports').select('*')).data.map(x=>x.reporter_id);
    r.resolve=(await sb.from('moderation_reports').update({resolved:true}).eq('id','r2').select()).data;
    await sb.from('feed_comments').delete().eq('id','fc2'); await sb.from('feed_posts').delete().eq('id','f2');
    r.stillThere=[window.__DB.feed_comments.some(c=>c.id==='fc2'), window.__DB.feed_posts.some(c=>c.id==='f2')];
    r.profiles=(await sb.from('profiles').select('*')).data.map(x=>x.id);
    const dir=(await sb.rpc('get_directory')).data; r.dirKeys=Object.keys(dir[0]).sort().join(','); r.dirN=dir.length;
    r.dirHasEmail=JSON.stringify(dir).includes('@x.com');
    r.avatarBad=(await sb.from('profiles').update({avatar:'javascript:alert(1)'}).eq('id','s1').select()).error;
    r.nickLong=(await sb.from('profiles').update({nickname:'x'.repeat(31)}).eq('id','s1').select()).error;
    return r;
  });
  ok(JSON.stringify(sec.lc)==='["lc1"]', 'Solo ve comentarios de escucha de lo que tiene asignado (lc1, no lc2)');
  ok(!!sec.cmtOther, 'NO puede comentar un elemento no asignado');
  ok(!!sec.cmtAsOther, 'NO puede comentar haciéndose pasar por otro');
  ok(!!sec.rxItem&&!!sec.rxCmt, 'NO puede reaccionar a contenido que no ve');
  ok(!!sec.rxAsOther, 'NO puede reaccionar en nombre de otro');
  ok(!!sec.rxBad, 'Emoji fuera del set de 6 rechazado');
  ok(sec.rxSeen===0, 'No ve las reacciones de contenido ajeno');
  ok(!!sec.repHidden, 'NO puede denunciar contenido que no ve');
  ok(!!sec.repOther, 'NO puede denunciar en nombre de otro');
  ok(sec.reps.every(x=>x==='s1'), 'Solo ve sus propias denuncias: '+sec.reps);
  ok(Array.isArray(sec.resolve)&&sec.resolve.length===0, 'NO puede resolver denuncias');
  ok(sec.stillThere[0]&&sec.stillThere[1], 'NO puede borrar contenido ajeno');
  ok(JSON.stringify(sec.profiles)==='["s1"]', 'Sigue sin poder leer perfiles ajenos (emails, nombres reales)');
  ok(sec.dirKeys==='avatar,id,public_name,role'&&!sec.dirHasEmail&&sec.dirN===3, 'Directorio: solo id, nombre público, foto y rol ('+sec.dirKeys+')');
  ok(!!sec.avatarBad, 'Avatar con formato inválido rechazado');
  ok(!!sec.nickLong, 'Apodo de más de 30 caracteres rechazado');

  // Escucha: comentarios
  await goto(p,'listening');
  await p.click('.card:has-text("Kind of Blue")'); await p.waitForTimeout(200);
  const mt = (await p.textContent('.modal')).replace(/\s+/g,' ');
  ok(mt.includes('El bajo en So What')&&!mt.includes('otro planeta'), 'Modal de escucha: ve el comentario de su elemento y no el del otro');
  ok(mt.includes('siguen siendo privadas'), 'Aviso de que las respuestas siguen siendo privadas');
  ok(await p.locator('.modal textarea[data-q]').count()===6, 'Las 6 preguntas privadas siguen ahí');
  await p.fill('.modal textarea[id^=cmInput]','Gran disco'); await p.click('.modal [data-action=comment-send]'); await p.waitForTimeout(250);
  ok(await dbq(p,()=>window.__DB.listening_comments.some(c=>c.body==='Gran disco'&&c.author_id==='s1'&&c.item_id==='i1')), 'Comentario de escucha guardado');
  await p.click('.modal > .rx .rxb.add, .modal [data-rx^=listening_item] .rxb.add'); await p.click('.modal [data-rx^=listening_item] [data-e=love]'); await p.waitForTimeout(200);
  ok(await dbq(p,()=>window.__DB.reactions.some(r=>r.target_type==='listening_item'&&r.target_id==='i1'&&r.user_id==='s1')), 'Reacción al propio elemento de escucha');
  await p.screenshot({path:require('path').join(__dirname,'shots','escucha_modal.png')});
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  // Aviso: reacción
  await goto(p,'board'); await p.click('.card.post:has-text("Clase del jueves")');
  await p.click('.modal [data-rx^=board_post] .rxb.add'); await p.click('.modal [data-rx^=board_post] [data-e=like]'); await p.waitForTimeout(200);
  ok(await dbq(p,()=>window.__DB.reactions.some(r=>r.target_type==='board_post'&&r.target_id==='p1'&&r.user_id==='s1')), 'Reacción a un aviso');
  await p.keyboard.press('Escape');

  // Perfil: apodo + foto
  await goto(p,'profile');
  await p.fill('#nameForm [name=nickname]','Marti'); await p.click('#nameForm button[type=submit]'); await p.waitForTimeout(300);
  ok((await dbq(p,()=>window.__DB.profiles.find(x=>x.id==='s1').nickname))==='Marti', 'Apodo guardado');
  const png = await p.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=200;const x=c.getContext('2d');x.fillStyle='#e33';x.fillRect(0,0,300,200);x.fillStyle='#39f';x.fillRect(100,50,100,100);return c.toDataURL('image/png').split(',')[1];});
  await p.setInputFiles('#avatarFile',{name:'a.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}); await p.waitForTimeout(600);
  const av = await dbq(p,()=>window.__DB.profiles.find(x=>x.id==='s1').avatar);
  ok(av&&av.startsWith('data:image/jpeg;base64,')&&av.length<40000, 'Foto recortada y reducida a JPEG ('+(av?av.length:0)+' caracteres)');
  ok((await p.locator('.top-r img.av').count())===1 && (await p.locator('#app .panel img.av').count())===1, 'Foto visible en cabecera y en el perfil');
  await goto(p,'feed');
  ok((await p.textContent('.fpost:has-text("Probando mi primera")')).includes('Marti'), 'En el feed ahora aparece como "Marti"');
  ok(await p.locator('.fpost:has-text("Probando mi primera") img.av').count()===1, 'Con su foto en el feed');
  await goto(p,'profile'); await p.click('[data-action=avatar-remove]'); await p.waitForTimeout(300);
  ok((await dbq(p,()=>window.__DB.profiles.find(x=>x.id==='s1').avatar))===null, 'Quitar foto');
  // Inicio
  await goto(p,'home');
  ok((await p.textContent('.dash')).includes('Feed')&&(await p.locator('[data-action=home-open-fpost]').count())===3, 'Inicio: tarjeta de Feed con 3 últimas');
  await p.click('[data-action=home-open-fpost] >> nth=0'); await p.waitForTimeout(200);
  ok((await p.locator('.modal .cm').count())===1&&(await p.textContent('.nav button.on')).includes('Feed'), 'Desde Inicio se abre la publicación');
  await p.keyboard.press('Escape');

  // ================= PROFESOR =================
  p = await open('t1');
  ok((await p.locator('.nav button').allTextContents()).join('|').includes('Feed2 denuncias'), 'Menú profe: "Feed 2 denuncias"');
  const stats = (await p.locator('.stat').allTextContents()).map(s=>s.replace(/\s+/g,' ').trim());
  ok(stats.length===5&&stats[4].startsWith('2'), 'Estadística: 2 denuncias pendientes -> '+stats[4]);
  ok(await p.locator('.dcard.mod .row.rep').count()===2, 'Tarjeta de denuncias con 2 filas');
  const rt = (await p.textContent('.dcard.mod')).replace(/\s+/g,' ');
  ok(rt.includes('Lu (Luis)')&&rt.includes('Marta')&&rt.includes('Qué bueno, lo apunto')&&rt.includes('No me gusta el tono'), 'Denuncia con nombre real + apodo, contenido y motivo');
  await p.screenshot({path:require('path').join(__dirname,'shots','home_profe_mod.png')});
  // borrar contenido denunciado (comentario de Marta)
  await p.click('.row.rep:has-text("Qué bueno") [data-action=mod-delete]'); await p.waitForTimeout(300);
  ok(!(await dbq(p,()=>window.__DB.feed_comments.some(c=>c.id==='fc1')))&&!(await dbq(p,()=>window.__DB.moderation_reports.some(r=>r.id==='r1'))), 'Borrar contenido elimina el comentario y su denuncia');
  ok(await p.locator('.dcard.mod .row.rep').count()===1, 'Queda 1 denuncia');
  await p.click('.row.rep [data-action=mod-dismiss]'); await p.waitForTimeout(300);
  ok((await dbq(p,()=>window.__DB.moderation_reports.find(r=>r.id==='r2').resolved))===true && (await p.locator('.dcard.mod').count())===0, 'Descartar marca la denuncia como resuelta y oculta la tarjeta');
  ok(!(await p.locator('.nav button').allTextContents()).join('|').includes('denuncia'), 'Desaparece la insignia de denuncias');
  // feed: moderación directa
  await goto(p,'feed');
  ok((await p.locator('.fpost [data-action=feed-delete]').count())===3, 'Profe puede eliminar cualquier publicación');
  const lbl = (await p.textContent('.fpost:has-text("Joe Pass")')).replace(/\s+/g,' ');
  ok(lbl.includes('Lu (Luis)'), 'Profe ve el nombre real junto al apodo');
  const tt = await p.locator('.fpost:has-text("Joe Pass") .rx-list .rxb:has-text("👍🏼")').getAttribute('title');
  ok(tt.includes('Lu (Luis)'), 'Tooltip de reacciones con quién ha reaccionado: '+tt);
  await p.fill('#feedForm [name=body]','Aviso del profe en el feed'); await p.click('#feedForm button[type=submit]'); await p.waitForTimeout(300);
  ok(await dbq(p,()=>window.__DB.feed_posts.some(x=>x.body==='Aviso del profe en el feed'&&x.author_id==='t1')), 'El profesor también puede publicar');
  await p.click('.fpost:has-text("Joe Pass") [data-action=feed-delete]'); await p.waitForTimeout(300);
  ok(!(await dbq(p,()=>window.__DB.feed_posts.some(x=>x.id==='f1')))&&!(await dbq(p,()=>window.__DB.reactions.some(r=>r.target_id==='f1'))), 'Borrar publicación elimina sus reacciones (cascada)');
  // escucha: profe ve comentarios de todos los elementos
  await goto(p,'listening');
  await p.click('.card:has-text("Cliffs of Dover")'); await p.waitForTimeout(200);
  ok((await p.textContent('.modal')).includes('otro planeta'), 'Profe ve los comentarios de cualquier elemento');
  await p.click('.modal .cmt:has-text("otro planeta") [data-action=comment-delete]'); await p.waitForTimeout(250);
  ok(!(await dbq(p,()=>window.__DB.listening_comments.some(c=>c.id==='lc2')))&&!(await dbq(p,()=>window.__DB.reactions.some(r=>r.target_id==='lc2'))), 'Profe elimina comentario de escucha (y su reacción)');
  await p.screenshot({path:require('path').join(__dirname,'shots','escucha_profe.png')});
  await p.keyboard.press('Escape');
  // móvil
  const m = await open('s1',{width:390,height:844}); await goto(m,'feed');
  ok(await m.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1), 'Móvil: feed sin scroll horizontal');
  await m.screenshot({path:require('path').join(__dirname,'shots','m_feed.png')});

  console.log('\nERRORES DE CONSOLA/PÁGINA:', errors.length? errors : 'ninguno');
  console.log(fails? `\n${fails} FALLOS`:'\nTODO OK');
  await browser.close();
})().catch(e=>{ console.error('CRASH',e); process.exit(1); });
