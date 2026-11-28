// Ficha del alumno → abrir una de sus escuchas para editarla y volver a la ficha
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.addInitScript(`window.__ME="t1"`);
  await page.goto(require('url').pathToFileURL(path.join(__dirname, 'test.html')).href);
  await page.waitForTimeout(400);
  const t = page;
  const ficha = async () => { await t.evaluate(() => { S.section = 'students'; render(); studentDetailModal('s1'); }); await t.waitForTimeout(150); };

  await ficha();
  ok(await t.locator('.modal').count() === 0 && await t.locator('.stu-page [data-action=sdm-item][data-id=i1]').count() === 1, 'La ficha es una pantalla (sin ventana) y en ella, la escucha se puede pulsar');
  await t.screenshot({ path: path.join(__dirname, 'shots', 'ficha-escucha-1.png') });

  // El botón ▶ sigue abriendo el enlace, no la ventana
  await t.evaluate(() => { const a = document.querySelector('.stu-page .sdm-open .playbtn'); a.removeAttribute('href'); a.click(); });
  await t.waitForTimeout(100);
  ok(await t.locator('.modal').count() === 0, 'Pulsar ▶ no abre la ventana de la escucha');

  await t.click('.stu-page [data-action=sdm-item][data-id=i1] .tmain'); await t.waitForTimeout(150);
  ok(await t.locator('.modal #assignBox, .modal [data-action=assign-selected], .modal [data-action=edit-item]').count() > 0, 'Al pulsarla se abre la ventana de la escucha');
  ok(await t.locator('.modal [data-action=item-back]').count() === 1, 'Tiene el botón "Volver a la ficha"');
  await t.screenshot({ path: path.join(__dirname, 'shots', 'ficha-escucha-2.png') });

  // Cambiar la nota del alumno desde aquí mantiene el botón de volver
  await t.fill('.modal .arow[data-aid=a1] [data-f=note]', 'Nota nueva');
  await t.click('.modal [data-action=save-assign][data-id=a1]'); await t.waitForTimeout(200);
  ok(await t.evaluate(() => __DB.listening_assignments.find(a => a.id === 'a1').note) === 'Nota nueva', 'La nota se guarda');
  ok(await t.locator('.modal [data-action=item-back]').count() === 1, 'Tras guardar sigue el botón de volver');

  // Editar el elemento: Cancelar vuelve a la escucha; Guardar también
  await t.click('.modal [data-action=edit-item]'); await t.waitForTimeout(150);
  await t.click('#itemForm [data-action=open-item]'); await t.waitForTimeout(150);
  ok(await t.locator('.modal [data-action=item-back]').count() === 1, 'Cancelar la edición vuelve a la escucha (con el botón de volver)');
  await t.click('.modal [data-action=edit-item]'); await t.waitForTimeout(150);
  await t.fill('#itemForm [name=title]', 'Título cambiado');
  await t.click('#itemForm button[type=submit]'); await t.waitForTimeout(400);
  ok(await t.evaluate(() => __DB.listening_items.find(i => i.id === 'i1').title) === 'Título cambiado', 'El título se guarda');
  ok(await t.locator('.modal [data-action=item-back]').count() === 1, 'Tras guardar la edición vuelve a la escucha');

  await t.click('.modal [data-action=item-back]'); await t.waitForTimeout(150);
  ok(await t.locator('.modal').count() === 0 && await t.locator('.stu-page .sdm-head').count() === 1, '"Volver" lleva a la ficha del alumno');
  ok((await t.locator('.stu-page .sdm-open b').first().textContent()) === 'Título cambiado', 'La ficha muestra el título nuevo');

  // Cerrar del todo olvida el "volver": abrir la escucha desde Escucha analítica no lo enseña
  await t.evaluate(() => closeModal()); await t.waitForTimeout(100);
  await t.evaluate(() => { S.section = 'listening'; render(); actions['open-item']({ dataset: { id: 'i1' } }); }); await t.waitForTimeout(150);
  ok(await t.locator('.modal [data-action=item-back]').count() === 0, 'Desde Escucha analítica no sale "Volver a la ficha"');
  await t.evaluate(() => closeModal());

  // Eliminar la escucha desde la ficha vuelve a la ficha
  await ficha();
  await t.click('.stu-page [data-action=sdm-item][data-id=i1] .tmain'); await t.waitForTimeout(150);
  await t.click('.modal [data-action=delete-item]'); await t.waitForTimeout(300);
  ok(await t.locator('.modal').count() === 0 && await t.locator('.stu-page .sdm-head').count() === 1 && await t.locator('.stu-page [data-action=sdm-item][data-id=i1]').count() === 0, 'Al eliminarla vuelve a la ficha, ya sin esa escucha');

  console.log(errors.length ? 'ERRORES DE CONSOLA/PÁGINA:\n' + errors.join('\n') : 'ERRORES DE CONSOLA/PÁGINA: ninguno');
  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
