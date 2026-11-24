// Deberes en el móvil: la página no se desborda a los lados y la barra inferior se ve sin hacer scroll.
const { chromium } = require('playwright');
const path = require('path'), url = require('url');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = [];
  async function open(me) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.addInitScript(`window.__ME=${JSON.stringify(me)}`);
    await page.goto(url.pathToFileURL(path.join(__dirname, 'test.html')).href);
    await page.waitForTimeout(450);
    return page;
  }
  const check = async (p, quien) => {
    await p.click('.tabbar button[data-s=homework]');
    await p.waitForTimeout(300);
    const m = await p.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const tb = document.querySelector('.tabbar'), r = tb && tb.getBoundingClientRect();
      return { W, sw: document.documentElement.scrollWidth, scrollY: window.scrollY,
        tabbar: r ? { top: r.top, bottom: r.bottom, vis: getComputedStyle(tb).display !== 'none' } : null, vh: window.innerHeight };
    });
    ok(m.sw <= m.W, `${quien}: sin scroll lateral (ancho ${m.sw} de ${m.W})`);
    ok(m.tabbar && m.tabbar.vis && m.tabbar.bottom <= m.vh + 1 && m.tabbar.top < m.vh, `${quien}: la barra de abajo se ve al abrir Deberes`);
    ok(m.scrollY === 0, `${quien}: la página se abre arriba del todo`);
    await p.screenshot({ path: path.join(__dirname, 'shots', `deberes-movil-${quien}.png`) });
  };
  const t = await open('t1'); await check(t, 'profesor');
  const s = await open('s1'); await check(s, 'alumna');
  ok(!errors.length, 'Sin errores de JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} correctas, ${fail} fallidas`);
  process.exit(fail ? 1 : 0);
})();
