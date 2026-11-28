// Formato como WhatsApp: *negrita*, _cursiva_, __subrayado__, ~tachado~, `código`, ```bloque```, "# " títulos y "> " citas.
// Barrita flotante sobre lo seleccionado (ratón quieto encima; en el móvil, debajo al seleccionar) y atajos Ctrl+B/I/U.
const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors=[]; let fails=0;
  const ok=(c,m)=>{ console.log((c?'OK   ':'FAIL ')+m); if(!c) fails++; };
  const ctx = await browser.newContext({ viewport:{ width:1280, height:900 } });
  const p = await ctx.newPage();
  p.on('pageerror',e=>errors.push('pageerror: '+e.message));
  await p.addInitScript(`window.__ME="t1"`);
  await p.goto(require('url').pathToFileURL(require('path').join(__dirname,'test.html')).href);
  await p.waitForTimeout(400);

  // 1) Lo que se pinta
  const r = await p.evaluate(()=>({
    inl: richText('Hola *negrita*, _cursiva_, __sub__, ~tach~ y **md**'),
    safe: richText('mi_archivo_nuevo 2*3*4 y snake_case'),
    url: richText('mira *https://ex.com/a_b_c* ya'),
    code: richText('`co_de *x*`'),
    blocks: richText('# Título\ntexto\n## Sub\n> cita\n- a\n```\ne|--0--|\nB|--1--|\n```'),
    hashMention: richText('#Avisos sin espacio'),
    xss: richText('*<img src=x onerror=alert(1)>* _"a"_ 0'),
    dm: rtFormat(linkify('*hola*')),
  }));
  ok(r.inl.includes('<b>negrita</b>') && r.inl.includes('<i>cursiva</i>') && r.inl.includes('<u>sub</u>') && r.inl.includes('<s>tach</s>') && r.inl.includes('<b>md</b>'), 'Negrita, cursiva, subrayado, tachado y **md**');
  ok(!/<[bi]>/.test(r.safe), 'mi_archivo_nuevo y 2*3*4 no cambian');
  ok(/<b><a href="https:\/\/ex\.com\/a_b_c"/.test(r.url), 'Enlace en negrita sin romper la URL');
  ok(r.code === '<code class="rt-code">co_de *x*</code>', 'Dentro de `código` no se formatea');
  ok(r.blocks.includes('<div class="rt-h rt-h1">Título</div>') && r.blocks.includes('rt-h2') && r.blocks.includes('<blockquote class="rt-quote">cita</blockquote>') && r.blocks.includes('<pre class="rt-pre">e|--0--|\nB|--1--|</pre>') && r.blocks.includes('<li>a</li>'), 'Títulos, cita, lista y bloque monoespaciado');
  ok(!r.hashMention.includes('rt-h'), '"#Avisos" sin espacio no es un título');
  ok(!r.xss.includes('<img') && r.xss.includes('&lt;img') && !r.xss.includes(''), 'El texto se sigue escapando (sin HTML inyectado ni fichas sueltas)');
  ok(r.dm === '<b>hola</b>', 'También en los mensajes privados');

  // 2) Barrita flotante en un aviso nuevo (ordenador: ratón quieto encima de lo seleccionado)
  await p.evaluate(()=>{ S.section='board'; render(); postFormModal(); });
  await p.waitForTimeout(200);
  ok(await p.locator('.fmt-bar').count() === 0, 'Ya no hay barra fija');
  const ta = p.locator('#postForm textarea[name=body]');
  const sel = async (a,b)=>{ await ta.evaluate((t,[a,b])=>{ t.focus(); t.setSelectionRange(a,b); },[a,b]); await p.waitForTimeout(60); };
  const hover = async ()=>{ // pasa el ratón por el centro de lo seleccionado
    const r = await ta.evaluate(t=>{ const x=fmtRects(t)[0]; return x && {x:(x.left+x.right)/2, y:(x.top+x.bottom)/2}; });
    await p.mouse.move(r.x-20, r.y+30); await p.mouse.move(r.x, r.y); await p.waitForTimeout(400);
  };
  await ta.fill('Hola mundo');
  await sel(5,10);
  ok(!(await p.locator('#fmtPop').count()), 'Solo seleccionar no saca la barrita');
  await p.mouse.move(5,5); await p.waitForTimeout(350);
  ok(!(await p.locator('#fmtPop').count()), 'Con el ratón lejos tampoco');
  await hover();
  ok(await p.locator('#fmtPop [data-fmt]').count() === 8, 'Ratón quieto encima de lo seleccionado: sale la barrita con 8 botones');
  const pos = await p.evaluate(()=>{ const b=document.querySelector('#fmtPop').getBoundingClientRect(), r=fmtRects(document.querySelector('#postForm textarea'))[0]; return { above: b.bottom <= r.top + 1 }; });
  ok(pos.above, 'Sale justo encima de la selección');
  await p.click('#fmtPop [data-fmt=b]');
  ok(await ta.inputValue() === 'Hola *mundo*', 'B pone *…* en lo seleccionado');
  ok(await ta.evaluate(t=>t.value.slice(t.selectionStart,t.selectionEnd)) === 'mundo', 'Y deja la palabra seleccionada');
  await p.waitForTimeout(150);
  ok(await p.locator('#fmtPop').count() === 1, 'La barrita sigue abierta para poner más formatos');
  await p.click('#fmtPop [data-fmt=i]');
  ok(await ta.inputValue() === 'Hola *_mundo_*', 'Negrita y cursiva a la vez');
  await p.waitForTimeout(150);
  await p.click('#fmtPop [data-fmt=i]'); await p.waitForTimeout(150); await p.click('#fmtPop [data-fmt=b]');
  ok(await ta.inputValue() === 'Hola mundo', 'Pulsar otra vez lo quita');
  await p.waitForTimeout(150);
  await p.keyboard.press('Escape');
  ok(!(await p.locator('#fmtPop').count()) && await p.locator('#postForm').count() > 0, 'Esc cierra la barrita, no la ventana');
  await sel(0,4);
  await p.keyboard.press('Control+i');
  ok(await ta.inputValue() === '_Hola_ mundo', 'Ctrl+I pone cursiva');
  await ta.fill('Uno\nDos');
  await sel(0,7); await hover();
  await p.click('#fmtPop [data-fmt=h]');
  ok(await ta.inputValue() === '# Uno\n# Dos', 'H pone "# " a cada línea');
  await p.waitForTimeout(150);
  await p.click('#fmtPop [data-fmt=q]');
  ok(await ta.inputValue() === '> Uno\n> Dos', 'Cita sustituye al título');
  await ta.fill('e|--0--|\nB|--1--|');
  await sel(0,17); await hover();
  await p.click('#fmtPop [data-fmt=code]');
  ok(await ta.inputValue() === '```\ne|--0--|\nB|--1--|\n```', 'Monoespaciado de varias líneas usa ```');
  await p.waitForTimeout(150);
  await ta.focus(); await p.keyboard.press('End'); await p.keyboard.type('x');
  ok(!(await p.locator('#fmtPop').count()), 'Al escribir se cierra');

  // Publicarlo y verlo formateado
  await p.fill('#postForm input[name=title]', 'Aviso con formato');
  await ta.fill('# Importante\nTraed *la guitarra afinada* y _el cuaderno_.\n> Ojo con la cejilla');
  await p.click('#postForm button[type=submit]');
  await p.waitForTimeout(400);
  const card = p.locator('.card.post', { hasText: 'Aviso con formato' }).first();
  ok(await card.locator('.rt-h1').count() === 1 && await card.locator('b', { hasText: 'la guitarra afinada' }).count() === 1 && await card.locator('.rt-quote').count() === 1, 'El aviso publicado se ve con título, negrita y cita');

  // 3) Inicio: también en el cuadro de publicar
  await p.evaluate(()=>{ S.section='feed'; render(); });
  await p.waitForTimeout(200);
  await p.click('#feedForm textarea');
  await p.keyboard.type('Hoy toco ');
  await p.keyboard.press('Control+b'); await p.keyboard.type('Stairway');
  ok(await p.inputValue('#feedForm textarea') === 'Hoy toco *Stairway*', 'Ctrl+B en el Inicio');
  const fta = p.locator('#feedForm textarea');
  await fta.evaluate(t=>t.setSelectionRange(10,18)); await p.waitForTimeout(60);
  { const r = await fta.evaluate(t=>{ const x=fmtRects(t)[0]; return {x:(x.left+x.right)/2, y:(x.top+x.bottom)/2}; });
    await p.mouse.move(r.x+10, r.y+40); await p.mouse.move(r.x, r.y); await p.waitForTimeout(400); }
  ok(await p.locator('#fmtPop').count() === 1, 'Inicio: la barrita sale sobre lo seleccionado');
  await p.screenshot({ path: require('path').join(__dirname,'shots','formato-inicio.png'), clip: await p.evaluate(()=>{ const r=document.querySelector('#feedForm').getBoundingClientRect(); return {x:r.x, y:Math.max(0,r.y-50), width:r.width, height:r.height+50}; }) });

  // 4) Móvil: al terminar de seleccionar, debajo
  const mctx = await browser.newContext({ viewport:{ width:390, height:760 }, hasTouch:true, isMobile:true });
  const m = await mctx.newPage();
  m.on('pageerror',e=>errors.push('móvil: '+e.message));
  await m.addInitScript(`window.__ME="s1"`);
  await m.goto(require('url').pathToFileURL(require('path').join(__dirname,'test.html')).href);
  await m.waitForTimeout(400);
  await m.evaluate(()=>{ const t=document.querySelector('#feedForm textarea'); t.focus(); t.value='Practica la escala mayor'; t.setSelectionRange(9,19); });
  await m.waitForTimeout(700);
  ok(await m.locator('#fmtPop').count() === 1, 'Móvil: al seleccionar sale la barrita');
  ok(await m.evaluate(()=>{ const b=document.querySelector('#fmtPop').getBoundingClientRect(), r=fmtRects(document.querySelector('#feedForm textarea')).pop(); return b.top >= r.bottom + 10; }), 'Móvil: va debajo de la selección (encima queda el menú del móvil)');
  await m.screenshot({ path: require('path').join(__dirname,'shots','formato-movil.png') });
  await m.tap('#fmtPop [data-fmt=b]');
  ok(await m.inputValue('#feedForm textarea') === 'Practica *la escala* mayor', 'Móvil: el botón pone la negrita');
  await m.evaluate(()=>{ const t=document.querySelector('#feedForm textarea'); t.setSelectionRange(3,3); });
  await m.waitForTimeout(250);
  ok(!(await m.locator('#fmtPop').count()), 'Móvil: sin selección se va');
  await mctx.close();


  ok(errors.length===0, 'Sin errores en la página'+(errors.length?': '+errors.join(' | '):''));
  await browser.close();
  console.log(fails ? `\n${fails} FALLOS` : '\nTodo correcto');
  process.exit(fails?1:0);
})();
