// Un aviso más alto que la pantalla del móvil también tiene que contar como leído.
const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors=[]; let fails=0;
  const ok=(c,m)=>{ console.log((c?'OK   ':'FAIL ')+m); if(!c) fails++; };
  const ctx = await browser.newContext({ viewport:{ width:390, height:700 } });
  const p = await ctx.newPage();
  p.on('pageerror',e=>errors.push('pageerror: '+e.message));
  await p.addInitScript(`window.__ME="s1"`);
  await p.goto(require('url').pathToFileURL(require('path').join(__dirname,'test.html')).href);
  await p.waitForTimeout(400);

  // Alarga el aviso p1 hasta que no quepa ni de lejos en la pantalla
  await p.evaluate(()=>{
    const long = Array.from({length:40}, (_,i)=>`Párrafo ${i+1} del aviso de bienvenida, con bastante texto para ocupar varias líneas en el móvil.`).join('\n\n');
    S.posts.find(x=>x.id==='p1').body = long;
    S.section = 'board'; render();
  });
  await p.waitForTimeout(300);
  const h = await p.evaluate(()=>document.querySelector('.card.post[data-post="p1"]').getBoundingClientRect().height);
  ok(h > 700/0.6, `El aviso mide ${Math.round(h)} px, más que la pantalla`);
  await p.evaluate(()=>document.querySelector('.card.post[data-post="p1"]').scrollIntoView({block:'start'}));
  await p.waitForTimeout(500);
  ok(await p.evaluate(()=>window.__DB.board_reads.some(r=>r.post_id==='p1'&&r.student_id==='s1')), 'Aviso largo: al leerlo en el móvil se guarda como leído');

  // Uno que solo asoma por abajo no cuenta
  await p.evaluate(()=>{ window.__DB.board_reads = window.__DB.board_reads.filter(r=>r.post_id!=='p2'); S.reads = S.reads.filter(r=>r.post_id!=='p2'); S.section='feed'; render(); S.section='board'; render(); });
  await p.evaluate(()=>{ const el=document.querySelector('.card.post[data-post="p2"]'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - innerHeight + 40); });
  await p.waitForTimeout(400);
  ok(!(await p.evaluate(()=>window.__DB.board_reads.some(r=>r.post_id==='p2'&&r.student_id==='s1'))), 'Un aviso que solo asoma 40 px no cuenta como leído');

  ok(errors.length===0, 'Sin errores en la página'+(errors.length?': '+errors.join(' | '):''));
  await browser.close();
  console.log(fails ? `\n${fails} FALLOS` : '\nTodo correcto');
  process.exit(fails?1:0);
})();
