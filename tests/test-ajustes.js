// Ajustes en el PC: dos columnas independientes; cada panel justo debajo del anterior de su columna.
const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  let fails=0; const errors=[];
  const ok=(c,m)=>{ console.log((c?'OK   ':'FAIL ')+m); if(!c) fails++; };
  const url = require('url').pathToFileURL(require('path').join(__dirname,'test.html')).href;
  const shot = n => require('path').join(__dirname,'shots',n);
  for (const [me, vw] of [['s1',1280],['t1',1280],['s1',390]]) {
    const ctx = await browser.newContext({ viewport:{ width:vw, height:860 } });
    const p = await ctx.newPage(); p.on('pageerror',e=>errors.push(e.message));
    await p.addInitScript(`window.__ME="${me}"`);
    await p.goto(url); await p.waitForTimeout(400);
    await p.evaluate(()=>{ S.section='settings'; render(); }); await p.waitForTimeout(200);
    const cols = await p.$$eval('.set-cols > .set-col', cs=>cs.map(c=>[...c.children].map(x=>{ const r=x.getBoundingClientRect(); return {l:Math.round(r.left), t:Math.round(r.top), b:Math.round(r.bottom), h:x.querySelector('h2')?.textContent.trim()}; })));
    ok(cols.length===2, `${me} ${vw}px: dos columnas de paneles`);
    let gapsOk = true;
    for (const c of cols) for (let i=1;i<c.length;i++) if (Math.abs(c[i].t - c[i-1].b - 16) > 1) gapsOk=false;
    ok(gapsOk, `${me} ${vw}px: cada panel va 16px debajo del anterior, sin huecos`);
    if (vw>900) ok(cols[0][0].l !== cols[1][0].l && Math.abs(cols[0][0].t-cols[1][0].t)<2, `${me}: las dos columnas empiezan arriba, una al lado de la otra`);
    else ok(cols[1][0].t > cols[0][cols[0].length-1].b, `${me} móvil: una sola columna`);
    const left = cols[0].map(x=>x.h).join(' | ');
    ok(/Seguridad/.test(left) && /Cuenta/.test(left), `${me} ${vw}px: Seguridad y Cuenta en la primera columna (${left})`);
    await p.screenshot({ path: shot(`ajustes-${me}-${vw}.png`), fullPage: true });
    await ctx.close();
  }
  ok(!errors.length, 'Sin errores de página '+errors.join('; '));
  await browser.close();
  console.log(fails ? `\n${fails} FALLOS` : '\nTodo OK'); process.exit(fails?1:0);
})();
