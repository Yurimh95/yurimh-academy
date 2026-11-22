// Pruebas del tiempo real: lo que hacen OTRAS personas aparece solo, sin pulsar nada,
// y nunca llega en directo lo que RLS no deja ver.
const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors=[]; let fails=0;
  const ok=(c,m)=>{ console.log((c?'OK   ':'FAIL ')+m); if(!c) fails++; };
  async function open(me, vp={width:1400,height:900}){
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
  const goto = async (p,s)=>{ await p.click(`.nav button[data-s=${s}]:visible, .tabbar button[data-s=${s}]:visible`); await p.waitForTimeout(150); };
  const ext = (p,fn,...a) => p.evaluate(([fn,a])=>window[fn](...a), [fn,a]);
  const wait = p => p.waitForTimeout(250);
  const navText = async p => (await p.locator('.nav button').allTextContents()).join('|');

  // ================= ALUMNA en el Feed =================
  const p = await open('s1');
  ok((await p.locator('[data-action=refresh]').count())===0, 'Ya no hay botón "Actualizar"');
  await goto(p,'feed');
  const before = await p.locator('.fpost').count();
  await ext(p,'__rtExternal','feed_posts',{id:'rt1',author_id:'s2',body:'Post en directo de Luis',link_url:null}); await wait(p);
  ok((await p.locator('.newposts').textContent()||'').includes('1 publicación nueva'), 'Llega una publicación de otro: aparece "↑ 1 publicación nueva"');
  ok((await p.locator('.fpost').count())===before, 'No se mete de golpe (la página no salta mientras lees)');
  await p.click('.newposts'); await wait(p);
  ok((await p.locator('.fpost:has-text("Post en directo de Luis")').count())===1 && (await p.locator('.newposts').count())===0, 'Al pulsar el botón aparece arriba');

  await ext(p,'__rtExternal','reactions',{target_type:'feed_post',target_id:'rt1',user_id:'s2',emoji:'love'}); await wait(p);
  ok((await p.textContent('.fpost:has-text("Post en directo") .rx-list')).includes('❤️1'), 'Reacción de otro aparece sola');
  await ext(p,'__rtExternal','feed_comments',{id:'rtc1',post_id:'rt1',author_id:'t1',body:'¡Muy bien!'}); await wait(p);
  ok((await p.textContent('.fpost:has-text("Post en directo")')).includes('1 comentario'), 'Comentario de otro: el contador se actualiza solo');
  await ext(p,'__rtExternalDelete','feed_posts','rt1'); await wait(p);
  ok((await p.locator('.fpost:has-text("Post en directo")').count())===0, 'Si el autor (o el profe) lo borra, desaparece solo');

  // Lo propio no se duplica cuando vuelve el eco del tiempo real
  await p.fill('#feedForm textarea','Mi post sin duplicados'); await p.click('#feedForm button[type=submit]'); await p.waitForTimeout(400);
  ok((await p.locator('.fpost:has-text("Mi post sin duplicados")').count())===1, 'Publicación propia: una sola vez (sin duplicado por el eco)');

  // Comentario abierto: llega un comentario de otro sin borrar lo que escribes
  await p.click('.fpost:has-text("Joe Pass") [data-action=open-fpost]'); await wait(p);
  await p.fill('.modal textarea','Estoy escribiendo…');
  await ext(p,'__rtExternal','feed_comments',{id:'rtc2',post_id:'f1',author_id:'s2',body:'Comentario en directo'}); await wait(p);
  ok((await p.textContent('.modal')).includes('Comentario en directo') && (await p.inputValue('.modal textarea'))==='Estoy escribiendo…', 'Comentario en directo dentro de la ventana, sin perder lo que escribes');
  await p.keyboard.press('Escape'); await wait(p);

  // ---- Avisos: privacidad en directo ----
  ok((await navText(p)).includes('Avisos2 nuevos'), 'Antes: 2 avisos nuevos');
  await ext(p,'__rtExternal','board_posts',{id:'rp1',author_id:'t1',title:'Solo para Luis (directo)',body:'x',audience:'selected',pinned:false,updated_at:new Date().toISOString()});
  await ext(p,'__rtExternal','board_recipients',{post_id:'rp1',student_id:'s2'}); await wait(p);
  ok((await navText(p)).includes('Avisos2 nuevos') && !(await p.evaluate(()=>JSON.stringify(S.posts))).includes('Solo para Luis'), 'Un aviso dirigido a OTRO alumno no llega en directo');
  await ext(p,'__rtExternal','board_posts',{id:'rp2',author_id:'t1',title:'Aviso para todos (directo)',body:'x',audience:'all',pinned:false,updated_at:new Date().toISOString()}); await wait(p);
  ok((await navText(p)).includes('Avisos3 nuevos'), 'Aviso para todos: el contador sube solo (3 nuevos)');
  await ext(p,'__rtExternal','board_posts',{id:'rp3',author_id:'t1',title:'Para Marta (directo)',body:'x',audience:'selected',pinned:false,updated_at:new Date().toISOString()});
  await ext(p,'__rtExternal','board_recipients',{post_id:'rp3',student_id:'s1'}); await wait(p); await wait(p);
  ok((await navText(p)).includes('Avisos4 nuevos'), 'Aviso dirigido a ella: llega en cuanto se la incluye (4 nuevos)');

  // Mientras escribe en el Feed, los cambios no le borran el texto
  await p.fill('#feedForm textarea','Texto a medias');
  await ext(p,'__rtExternal','board_posts',{id:'rp4',author_id:'t1',title:'Otro aviso',body:'x',audience:'all',pinned:false,updated_at:new Date().toISOString()}); await wait(p);
  ok((await p.inputValue('#feedForm textarea'))==='Texto a medias' && (await navText(p)).includes('Avisos5 nuevos'), 'Escribiendo: el texto se conserva y solo cambia el contador');
  await p.fill('#feedForm textarea','');

  // Escucha asignada en directo (llega sin su elemento: la app lo pide)
  await ext(p,'__rtExternal','listening_assignments',{id:'ra1',item_id:'i2',student_id:'s1',note:null,due_date:null,assigned_at:new Date().toISOString(),listened:false,listened_at:null,answers:{},updated_at:new Date().toISOString()}); await p.waitForTimeout(400);
  ok((await p.textContent('.rail')).includes('Cliffs of Dover'), 'Nueva escucha asignada: aparece sola en "Tus escuchas"');
  await p.screenshot({path:require('path').join(__dirname,'shots','rt_alumna.png')});

  // ================= PROFESOR =================
  const t = await open('t1');
  ok((await navText(t)).includes('1 por aprobar'), 'Profe: 1 alumno por aprobar');
  await ext(t,'__rtExternal','profiles',{id:'s4',display_name:'Recién llegado',email:'r@x.com',role:'student',approved:false,nickname:null,avatar:null}); await wait(t);
  ok((await navText(t)).includes('2 por aprobar'), 'Alguien se registra: "2 por aprobar" sin recargar');
  await ext(t,'__rtExternal','moderation_reports',{id:'rr1',reporter_id:'s1',target_type:'feed_post',target_id:'f2',reason:null,resolved:false}); await wait(t);
  ok((await navText(t)).includes('Feed3 denuncias'), 'Nueva denuncia: el contador del Feed sube solo');

  console.log('\nERRORES DE CONSOLA/PÁGINA:', errors.length? errors : 'ninguno');
  console.log(fails? `\n${fails} FALLOS`:'\nTODO OK');
  await browser.close();
  process.exit(fails?1:0);
})().catch(e=>{ console.error('CRASH',e); process.exit(1); });
