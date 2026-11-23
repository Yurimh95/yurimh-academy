// Escucha analítica: duración en las tarjetas (Edge Function "media-info" simulada con __DUR_STUB).
// Seed: i1 "Kind of Blue" (álbum, 5 temas, 2756 s) e i2 "Cliffs of Dover" (canción, 431 s).
const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors=[]; let fails=0;
  const ok=(c,m)=>{ console.log((c?'OK   ':'FAIL ')+m); if(!c) fails++; };
  async function open(me, vp={width:1400,height:900}){
    const ctx = await browser.newContext({ viewport:vp });
    const page = await ctx.newPage();
    page.on('pageerror',e=>errors.push('pageerror: '+e.message));
    page.on('console',m=>{ if(m.type()==='error' && !/Failed to load resource/.test(m.text())) errors.push('console: '+m.text()); });
    await page.addInitScript(`window.__ME=${JSON.stringify(me)}`);
    await page.goto(require('url').pathToFileURL(require('path').join(__dirname,'test.html')).href);
    await page.waitForTimeout(450);
    return page;
  }
  const goto = async (p,s)=>{ await p.click(`.nav button[data-s=${s}]:visible, .tabbar button[data-s=${s}]:visible`); await p.waitForTimeout(200); };
  const wait = (p,ms=250) => p.waitForTimeout(ms);
  const item = (p,title) => p.evaluate(t=>window.__DB.listening_items.find(i=>i.title===t)||null, title);
  const shot = (p,n) => p.screenshot({path:require('path').join(__dirname,'shots',n)});
  const editItem = async (t,title) => { await t.click(`.track:has-text("${title}")`); await wait(t,300); await t.click('.modal [data-action=edit-item]'); await wait(t,300); };

  // Formato
  let t = await open('t1');
  const f = await t.evaluate(()=>({
    song: durText({kind:'song',duration_sec:213}), long: durText({kind:'song',duration_sec:3725}),
    album: durText({kind:'album',duration_sec:2756,track_count:12}), hours: durText({kind:'playlist',duration_sec:4320,track_count:30}),
    exactH: durText({kind:'playlist',duration_sec:7200,track_count:1}), partial: durText({kind:'playlist',duration_sec:21032,track_count:100,duration_partial:true}),
    ytPartial: durText({kind:'playlist',duration_sec:21032,track_count:182,duration_partial:true}), none: durText({kind:'album'}),
    parse: ['3:33','1:12:05','42','42 min','1 h 12 min','1h','','abc','3:'].map(parseDur)
  }));
  ok(f.song==='3:33' && f.long==='1:02:05', 'Canción: minutos:segundos (3:33, 1:02:05)');
  ok(f.album==='12 temas · 46 min' && f.hours==='30 temas · 1 h 12 min' && f.exactH==='1 tema · 2 h', 'Álbum/playlist: "12 temas · 46 min", "1 h 12 min", singular');
  ok(f.partial==='100+ temas · 5 h 51 min+' && f.ytPartial==='182 temas · 5 h 51 min+', 'Solo se sumaron 100 temas → se marca con "+"');
  ok(f.none==='', 'Sin datos no se muestra nada');
  ok(JSON.stringify(f.parse)===JSON.stringify([213,4325,2520,2520,4320,3600,null,null,null]), 'Lectura de lo escrito a mano (3:33, 1:12:05, 42, 42 min, 1 h 12 min, 1h) ' + JSON.stringify(f.parse));

  // Tarjetas del profesor
  await goto(t,'listening');
  ok((await t.textContent('.track:has-text("Kind of Blue") .tdur'))==='5 temas · 46 min', 'Profe: tarjeta del álbum con "5 temas · 46 min"');
  ok((await t.textContent('.track:has-text("Cliffs of Dover") .tdur'))==='7:11', 'Profe: tarjeta de la canción con "7:11"');
  await shot(t,'dur-teacher.png');

  // Nuevo elemento: duración automática
  await t.evaluate(()=>{
    window.__durCalls = 0;
    window.__META_STUB = async url => ({ title: url.includes('album/abc') ? 'Master of Puppets' : null, thumb: null });
    window.__DUR_STUB = async url => { window.__durCalls++; return url.includes('album/abc') ? { duration_sec: 3283, track_count: 8, partial: false } : { duration_sec: null, track_count: null, partial: false }; };
  });
  const calls = () => t.evaluate(()=>window.__durCalls);
  await t.click('[data-action=new-item]'); await wait(t);
  await t.fill('#itemForm [name=url]','open.spotify.com/album/abc'); await wait(t,600);
  await t.click('#itemForm button[type=submit]'); await wait(t,500);
  let mop = await item(t,'Master of Puppets');
  ok(mop && mop.duration_sec===3283 && mop.track_count===8 && mop.duration_partial===false, 'Nuevo elemento: la duración se rellena sola (8 temas, 3283 s)');
  ok((await t.textContent('.track:has-text("Master of Puppets") .tdur'))==='8 temas · 55 min', 'Y aparece en su tarjeta');

  // Editar sin tocar nada: no vuelve a preguntar
  const before = await calls();
  await editItem(t,'Master of Puppets');
  ok((await t.inputValue('#itemForm [name=duration]'))==='54:43' && (await t.inputValue('#itemForm [name=tracks]'))==='8', 'Editar: el formulario muestra la duración y los temas');
  await t.click('#itemForm button[type=submit]'); await wait(t,500);
  ok((await calls())===before, 'Guardar sin cambios no vuelve a buscar la duración');

  // Corregirla a mano
  await editItem(t,'Master of Puppets');
  await t.fill('#itemForm [name=duration]','1 h 2 min'); await t.click('#itemForm button[type=submit]'); await wait(t,500);
  mop = await item(t,'Master of Puppets');
  ok(mop.duration_sec===3720 && (await calls())===before, 'Corregida a mano: se guarda lo escrito (1 h 2 min) sin preguntar fuera');
  await editItem(t,'Master of Puppets');
  await t.fill('#itemForm [name=duration]','muy larga'); await t.click('#itemForm button[type=submit]'); await wait(t,400);
  ok((await t.locator('#itemForm').count())===1 && (await item(t,'Master of Puppets')).duration_sec===3720, 'Duración no válida: avisa y no guarda');
  // Cambiar el enlace vacía los campos y recalcula
  await t.fill('#itemForm [name=url]','open.spotify.com/track/zzz'); await wait(t,600);
  ok((await t.inputValue('#itemForm [name=duration]'))==='', 'Al cambiar el enlace se vacía la duración del anterior');
  await t.fill('#itemForm [name=title]','Orion'); await t.click('#itemForm button[type=submit]'); await wait(t,500);
  const orion = await item(t,'Orion');
  ok(orion && orion.duration_sec===null && (await calls())===before+1, 'Enlace nuevo sin duración disponible: se guarda vacía (y no rompe nada)');
  ok((await t.locator('.track:has-text("Orion") .tdur').count())===0, 'Sin duración, la tarjeta no enseña nada raro');

  // Alumna: lo ve en su tarjeta y en el detalle
  const p = await open('s1');
  await goto(p,'listening');
  ok((await p.textContent('.track:has-text("Kind of Blue") .tdur'))==='5 temas · 46 min', 'Alumna: su tarjeta muestra la duración');
  await shot(p,'dur-student.png');
  await p.click('.track:has-text("Kind of Blue")'); await wait(p,300);
  ok((await p.textContent('.modal .badge')).includes('5 temas · 46 min'), 'Alumna: también en la cabecera del detalle');
  const m = await open('s1',{width:390,height:844});
  await goto(m,'listening');
  ok(await m.locator('.track:has-text("Kind of Blue") .tdur').isVisible(), 'Móvil: la duración se ve');
  await shot(m,'dur-mobile.png');

  console.log('\nERRORES DE CONSOLA/PÁGINA:', errors.length? errors : 'ninguno');
  await browser.close();
  console.log(fails? `\n${fails} FALLOS` : '\nTODO OK');
  process.exit(fails?1:0);
})().catch(e=>{ console.error('CRASH',e); process.exit(1); });
