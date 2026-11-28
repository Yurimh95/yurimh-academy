// Formato como WhatsApp: *negrita*, _cursiva_, __subrayado__, ~tachado~, `código`, ```bloque```, "# " títulos y "> " citas.
// Botones de formato en Avisos, al editar y en el Inicio, y atajos Ctrl+B/I/U.
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

  // 2) Botones en un aviso nuevo
  await p.evaluate(()=>{ S.section='board'; render(); postFormModal(); });
  await p.waitForTimeout(200);
  ok(await p.locator('#postForm .fmt-bar [data-fmt]').count() === 8, 'Avisos: barra con 8 botones');
  const ta = p.locator('#postForm textarea[name=body]');
  await ta.fill('Hola mundo');
  await ta.evaluate(t=>t.setSelectionRange(5,10));
  await p.click('#postForm [data-fmt=b]');
  ok(await ta.inputValue() === 'Hola *mundo*', 'B pone *…* en lo seleccionado');
  ok(await ta.evaluate(t=>t.value.slice(t.selectionStart,t.selectionEnd)) === 'mundo', 'Y deja la palabra seleccionada');
  await p.click('#postForm [data-fmt=b]');
  ok(await ta.inputValue() === 'Hola mundo', 'Pulsar B otra vez lo quita');
  await ta.evaluate(t=>t.setSelectionRange(0,4));
  await p.keyboard.press('Control+i');
  ok(await ta.inputValue() === '_Hola_ mundo', 'Ctrl+I pone cursiva');
  await ta.fill('Uno\nDos');
  await ta.evaluate(t=>t.setSelectionRange(0,7));
  await p.click('#postForm [data-fmt=h]');
  ok(await ta.inputValue() === '# Uno\n# Dos', 'H pone "# " a cada línea');
  await p.click('#postForm [data-fmt=q]');
  ok(await ta.inputValue() === '> Uno\n> Dos', 'Cita sustituye al título');
  await ta.fill('e|--0--|\nB|--1--|');
  await ta.evaluate(t=>t.setSelectionRange(0,t.value.length));
  await p.click('#postForm [data-fmt=code]');
  ok(await ta.inputValue() === '```\ne|--0--|\nB|--1--|\n```', 'Monoespaciado de varias líneas usa ```');
  await ta.fill('');
  await p.click('#postForm [data-fmt=u]');
  await p.keyboard.type('raya');
  ok(await ta.inputValue() === '__raya__', 'Sin selección: las marcas y el cursor en medio');

  // Publicarlo y verlo formateado
  await p.fill('#postForm input[name=title]', 'Aviso con formato');
  await ta.fill('# Importante\nTraed *la guitarra afinada* y _el cuaderno_.\n> Ojo con la cejilla');
  await p.click('#postForm button[type=submit]');
  await p.waitForTimeout(400);
  const card = p.locator('.card.post', { hasText: 'Aviso con formato' }).first();
  ok(await card.locator('.rt-h1').count() === 1 && await card.locator('b', { hasText: 'la guitarra afinada' }).count() === 1 && await card.locator('.rt-quote').count() === 1, 'El aviso publicado se ve con título, negrita y cita');
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: require('path').join(__dirname,'shots','formato-aviso.png') });

  // 3) Inicio: la barra sale al escribir, junto a Publicar
  await p.evaluate(()=>{ S.section='feed'; render(); });
  await p.waitForTimeout(200);
  ok(!(await p.locator('#feedForm .fmt-bar').isVisible()), 'Inicio: sin escribir no se ve la barra');
  await p.click('#feedForm textarea');
  await p.waitForTimeout(250);
  ok(await p.locator('#feedForm .fmt-bar').isVisible(), 'Inicio: al escribir aparece la barra');
  await p.keyboard.type('Hoy toco ');
  await p.keyboard.press('Control+b'); await p.keyboard.type('Stairway');
  ok(await p.inputValue('#feedForm textarea') === 'Hoy toco *Stairway*', 'Ctrl+B en el Inicio');
  await p.locator('#feedForm').screenshot({ path: require('path').join(__dirname,'shots','formato-inicio.png') });

  ok(errors.length===0, 'Sin errores en la página'+(errors.length?': '+errors.join(' | '):''));
  await browser.close();
  console.log(fails ? `\n${fails} FALLOS` : '\nTodo correcto');
  process.exit(fails?1:0);
})();
