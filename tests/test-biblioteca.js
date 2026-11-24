// Escucha analítica: carpetas, géneros, artista, buscador y filtros (catálogo del profesor y lista del alumno)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  const open = async (me, width = 1100) => {
    const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
    page.on('pageerror', e => errors.push(me + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(me + ' console: ' + m.text()); });
    page.on('dialog', d => d.accept());
    await page.addInitScript(`window.__ME="${me}"`);
    return page;
  };
  // Estado común: 4 escuchas, 2 carpetas, géneros con subgéneros
  const extra = () => {
    const D = window.__DB;
    D.listening_items.push(
      { id: 'i3', title: 'Judas Priest Essentials', url: 'https://open.spotify.com/playlist/y', kind: 'playlist', brief: null, created_at: '2026-01-03', artist: 'Judas Priest', folder_id: 'fo1' },
      { id: 'i4', title: 'Catchy Ultimate', url: 'https://open.spotify.com/playlist/z', kind: 'playlist', brief: null, created_at: '2026-01-04', artist: '', folder_id: 'fo2' });
    const i1 = D.listening_items.find(i => i.id === 'i1'); i1.folder_id = 'fo1'; i1.artist = 'Miles Davis';
    D.listening_folders.push({ id: 'fo1', name: 'Essentials', position: 0 }, { id: 'fo2', name: 'Yuri Nichos', position: 1 });
    D.listening_genres.push({ id: 'g1', name: 'Metal', parent_id: null, position: 1 }, { id: 'g11', name: 'Heavy metal', parent_id: 'g1', position: 1 },
      { id: 'g2', name: 'Jazz', parent_id: null, position: 2 }, { id: 'g3', name: 'Pop', parent_id: null, position: 3 });
    D.listening_item_genres.push({ item_id: 'i3', genre_id: 'g11' }, { item_id: 'i1', genre_id: 'g2' }, { item_id: 'i4', genre_id: 'g3' }, { item_id: 'i4', genre_id: 'g1' });
  };
  const start = async (me, width) => {
    const p = await open(me, width);
    await p.goto(require('url').pathToFileURL(path.join(__dirname, 'test.html')).href);
    await p.waitForTimeout(300);
    await p.evaluate(extra);
    await p.evaluate(async () => { await loadData(); S.section = 'listening'; render(); });
    await p.waitForTimeout(150);
    return p;
  };

  /* ---------- Profesor ---------- */
  const t = await start('t1');
  const rows = () => t.$$eval('#catList .track', els => els.map(e => e.querySelector('.tmain b').textContent));
  const groups = () => t.$$eval('#catList details.fold summary .fold-name', els => els.map(e => e.textContent.trim()));
  ok(JSON.stringify(await groups()) === JSON.stringify(['Essentials', 'Yuri Nichos', 'Sin carpeta']), 'El catálogo sale agrupado por carpetas, en su orden, y "Sin carpeta" al final');
  ok((await rows()).length === 4, 'Salen las 4 escuchas');
  ok((await t.textContent('#catList')).includes('Miles Davis') && (await t.textContent('#catList')).includes('Heavy metal'), 'Cada fila enseña el artista y sus géneros');

  await t.fill('#catQ', 'judas'); await t.waitForTimeout(80);
  ok(JSON.stringify(await rows()) === '["Judas Priest Essentials"]', 'El buscador filtra por título');
  ok(await t.evaluate(() => document.activeElement && document.activeElement.id === 'catQ'), 'Al escribir no se pierde el cursor del buscador');
  await t.fill('#catQ', 'miles'); await t.waitForTimeout(80);
  ok(JSON.stringify(await rows()) === '["Kind of Blue"]', 'Busca también por artista');
  await t.fill('#catQ', 'nichos'); await t.waitForTimeout(80);
  ok(JSON.stringify(await rows()) === '["Catchy Ultimate"]', 'Busca también por carpeta');
  await t.fill('#catQ', ''); await t.waitForTimeout(80);

  await t.selectOption('[data-cat=genre]', 'g1'); await t.waitForTimeout(80);
  ok(JSON.stringify((await rows()).sort()) === JSON.stringify(['Catchy Ultimate', 'Judas Priest Essentials']), 'Filtrar por "Metal" incluye a la que solo tiene el subgénero "Heavy metal"');
  await t.selectOption('[data-cat=genre]', 'g11'); await t.waitForTimeout(80);
  ok(JSON.stringify(await rows()) === '["Judas Priest Essentials"]', 'Filtrar por subgénero');
  await t.selectOption('[data-cat=genre]', ''); await t.selectOption('[data-cat=folder]', '__none'); await t.waitForTimeout(80);
  ok(JSON.stringify(await rows()) === '["Cliffs of Dover"]', 'Filtro "Sin carpeta"');
  await t.click('[data-action=cat-clear]'); await t.waitForTimeout(80);
  ok((await rows()).length === 4 && await t.inputValue('[data-cat=folder]') === '', '"Quitar filtros" lo deja todo como al principio');

  // Por alumno
  await t.selectOption('[data-cat=status]', 'unassigned'); await t.waitForTimeout(80);
  ok(JSON.stringify((await rows()).sort()) === JSON.stringify(['Catchy Ultimate', 'Judas Priest Essentials']), 'Sin alumno: "Sin asignar a nadie"');
  await t.selectOption('[data-cat=student]', 's2'); await t.waitForTimeout(80);
  ok(await t.inputValue('[data-cat=status]') === '', 'Al elegir alumno, el estado vuelve a "Todas las suyas"');
  ok(JSON.stringify((await rows()).sort()) === JSON.stringify(['Cliffs of Dover', 'Kind of Blue']), 'Luis: todas las suyas');
  await t.selectOption('[data-cat=status]', 'done'); await t.waitForTimeout(80);
  ok(JSON.stringify(await rows()) === '["Kind of Blue"]', 'Luis: escuchadas');
  await t.selectOption('[data-cat=status]', 'pend'); await t.waitForTimeout(80);
  ok(JSON.stringify(await rows()) === '["Cliffs of Dover"]', 'Luis: pendientes');
  await t.selectOption('[data-cat=status]', 'none'); await t.waitForTimeout(80);
  ok(JSON.stringify((await rows()).sort()) === JSON.stringify(['Catchy Ultimate', 'Judas Priest Essentials']), 'Luis: las que aún no tiene');
  await t.screenshot({ path: path.join(__dirname, 'shots', 'biblioteca-alumno-filtro.png') });
  await t.click('#catList .track:has-text("Catchy Ultimate") .tans [data-action=cat-assign]'); await t.waitForTimeout(250);
  ok(await t.evaluate(() => __DB.listening_assignments.some(a => a.item_id === 'i4' && a.student_id === 's2')), '"+ Asignar" se la asigna a Luis sin abrir la escucha');
  ok(JSON.stringify(await rows()) === '["Judas Priest Essentials"]', 'Y desaparece de "Aún no la tiene"');
  ok(await t.evaluate(() => __DB.notifications.some(n => n.user_id === 's2' && n.kind === 'assignment' && n.target_id === 'i4')), 'Luis recibe el aviso de la escucha');
  await t.click('[data-action=cat-clear]'); await t.waitForTimeout(80);

  // Plegar una carpeta se recuerda
  await t.click('#catList details.fold[data-fold=fo1] summary'); await t.waitForTimeout(80);
  await t.evaluate(() => render()); await t.waitForTimeout(80);
  ok(!(await t.$eval('details.fold[data-fold=fo1]', d => d.open)), 'Una carpeta plegada sigue plegada al repintar');
  await t.click('#catList details.fold[data-fold=fo1] summary'); await t.waitForTimeout(80);

  // Carpetas: crear, renombrar, ordenar y borrar
  await t.click('[data-action=folders-edit]'); await t.waitForTimeout(120);
  await t.fill('#folderForm [name=name]', "Yuri's Tops"); await t.press('#folderForm [name=name]', 'Enter'); await t.waitForTimeout(150);
  ok(await t.evaluate(() => __DB.listening_folders.some(f => f.name === "Yuri's Tops" && f.position === 2)), 'Crear carpeta (va al final)');
  await t.fill('#folderForm [name=name]', 'essentials'); await t.press('#folderForm [name=name]', 'Enter'); await t.waitForTimeout(150);
  ok(await t.evaluate(() => __DB.listening_folders.length) === 3, 'No deja dos carpetas con el mismo nombre');
  const ren = t.locator('[data-lib-rename=folder][data-id=fo2]');
  await ren.fill('Nichos'); await ren.press('Tab'); await t.waitForTimeout(150);
  ok(await t.evaluate(() => __DB.listening_folders.find(f => f.id === 'fo2').name) === 'Nichos', 'Renombrar al salir del campo');
  await t.click('[data-action=folder-move][data-id=fo2][data-d="-1"]'); await t.waitForTimeout(150);
  ok(await t.evaluate(() => __DB.listening_folders.slice().sort((a, b) => a.position - b.position).map(f => f.id).join()) .then(x => x.startsWith('fo2,fo1')), 'Subir una carpeta cambia el orden');
  await t.click('[data-action=folder-del][data-id=fo1]'); await t.waitForTimeout(150);
  ok(await t.evaluate(() => !__DB.listening_folders.some(f => f.id === 'fo1') && __DB.listening_items.filter(i => ['i1', 'i3'].includes(i.id)).every(i => i.folder_id === null)), 'Borrar carpeta: sus escuchas pasan a "Sin carpeta" y no se borra ninguna');
  ok(await t.evaluate(() => __DB.listening_items.length) === 4, 'Siguen las 4 escuchas');
  await t.click('#modalRoot [data-action=close]'); await t.waitForTimeout(120);
  ok(JSON.stringify(await groups()) === JSON.stringify(['Nichos', 'Sin carpeta']), 'Al cerrar, el catálogo se repinta con las carpetas nuevas');

  // Géneros: crear subgénero, no más de dos niveles, borrar
  await t.click('[data-action=genres-edit]'); await t.waitForTimeout(120);
  await t.fill('#genreForm [name=name]', 'Power metal'); await t.selectOption('#genreForm [name=parent]', 'g1'); await t.press('#genreForm [name=name]', 'Enter'); await t.waitForTimeout(150);
  const pm = await t.evaluate(() => __DB.listening_genres.find(g => g.name === 'Power metal'));
  ok(pm && pm.parent_id === 'g1', 'Crear subgénero dentro de Metal');
  ok(await t.inputValue('#genreForm [name=parent]') === 'g1', 'Se queda elegido "Dentro de Metal" para añadir otro seguido');
  ok(await t.evaluate(id => { try { return !__DB.listening_genres.some(g => g.parent_id === id); } catch { return false; } }, pm.id), 'Los subgéneros no tienen hijos');
  const deep = await t.evaluate(async id => (await sb.from('listening_genres').insert({ name: 'Nivel 3', parent_id: id, position: 0 })).error, pm.id);
  ok(!!deep, 'La base de datos no deja un tercer nivel');
  await t.click('[data-action=genre-del][data-id=g1]'); await t.waitForTimeout(150);
  ok(await t.evaluate(() => !__DB.listening_genres.some(g => g.id === 'g1' || g.parent_id === 'g1') && !__DB.listening_item_genres.some(x => ['g1', 'g11'].includes(x.genre_id))), 'Borrar un género borra sus subgéneros y lo quita de las escuchas');
  await t.click('#modalRoot [data-action=close]'); await t.waitForTimeout(120);

  // Formulario: carpeta, artista y géneros
  await t.click('#catList .track:has-text("Cliffs of Dover")'); await t.waitForTimeout(150);
  await t.click('[data-action=edit-item]'); await t.waitForTimeout(150);
  ok(await t.locator('#itemForm [name=folder]').count() === 1 && await t.locator('#itemForm input[name=genre]').count() === 2, 'El formulario tiene carpeta y las casillas de géneros');
  await t.fill('#itemForm [name=artist]', 'Eric Johnson');
  await t.selectOption('#itemForm [name=folder]', 'fo2');
  await t.check('#itemForm input[name=genre][value=g2]');
  await t.screenshot({ path: path.join(__dirname, 'shots', 'biblioteca-form.png') });
  await t.click('#itemForm button[type=submit]'); await t.waitForTimeout(300);
  const i2 = await t.evaluate(() => __DB.listening_items.find(i => i.id === 'i2'));
  ok(i2.artist === 'Eric Johnson' && i2.folder_id === 'fo2', 'Se guardan el artista y la carpeta');
  ok(await t.evaluate(() => __DB.listening_item_genres.some(x => x.item_id === 'i2' && x.genre_id === 'g2')), 'Se guarda el género');
  await t.click('#catList .track:has-text("Cliffs of Dover")'); await t.waitForTimeout(150);
  ok((await t.textContent('#modalRoot .imeta')).includes('Eric Johnson') && (await t.textContent('#modalRoot .imeta')).includes('Nichos'), 'La ficha de la escucha enseña artista, carpeta y géneros');
  await t.click('[data-action=edit-item]'); await t.waitForTimeout(150);
  await t.uncheck('#itemForm input[name=genre][value=g2]');
  await t.click('#itemForm button[type=submit]'); await t.waitForTimeout(300);
  ok(await t.evaluate(() => !__DB.listening_item_genres.some(x => x.item_id === 'i2')), 'Desmarcar un género lo quita');

  // Artista automático al crear (YouTube: canal de oEmbed sin "VEVO"/"Official")
  await t.evaluate(() => { window.__META_STUB = u => ({ title: 'Black Betty', thumb: null, artist: ytArtist('Ram Jam VEVO') }); window.__DUR_STUB = () => ({ duration_sec: 240, track_count: null, partial: false, artist: null }); });
  await t.click('[data-action=new-item]'); await t.waitForTimeout(150);
  await t.fill('#itemForm [name=url]', 'https://www.youtube.com/watch?v=I_2D8Eo15wE'); await t.waitForTimeout(100);
  await t.click('#itemForm button[type=submit]'); await t.waitForTimeout(400);
  const bb = await t.evaluate(() => __DB.listening_items.find(i => i.title === 'Black Betty'));
  ok(bb && bb.artist === 'Ram Jam', 'Al crear, el artista sale solo del canal de YouTube (sin "VEVO")');
  ok(await t.evaluate(() => ytArtist('TEARS OF TRAGEDY Official') === 'TEARS OF TRAGEDY' && ytArtist('Muse - Topic') === 'Muse'), 'Limpia "Official" y " - Topic"');
  await t.screenshot({ path: path.join(__dirname, 'shots', 'biblioteca-catalogo.png'), fullPage: true });

  /* ---------- Alumno ---------- */
  const s = await start('s2');
  const srows = () => s.$$eval('#slList .track', els => els.map(e => e.querySelector('.tmain b').textContent));
  await s.click('[data-action=filter][data-f=all]'); await s.waitForTimeout(100);
  ok(await s.evaluate(() => S.folders.map(f => f.id).join()) === 'fo1', 'El alumno solo recibe las carpetas de sus escuchas');
  ok(await s.evaluate(() => S.itemGenres.every(x => ['i1', 'i2'].includes(x.item_id))), 'Y solo los géneros de sus escuchas');
  ok((await s.textContent('#slList')).includes('Essentials') && (await s.textContent('#slList')).includes('Jazz'), 'En su lista ve la carpeta y los géneros');
  // Le asignan 2 más para que salga el buscador (más de 3)
  await s.evaluate(async () => {
    __DB.listening_assignments.push({ id: 'a8', item_id: 'i3', student_id: 's2', note: null, due_date: null, assigned_at: '2026-11-03', listened: false, listened_at: null, answers: {}, updated_at: '2026-11-03T10:00:00Z' },
      { id: 'a9', item_id: 'i4', student_id: 's2', note: null, due_date: null, assigned_at: '2026-11-03', listened: false, listened_at: null, answers: {}, updated_at: '2026-11-03T10:00:00Z' });
    await loadData(); render();
  });
  await s.waitForTimeout(150);
  ok(await s.locator('#slQ').count() === 1 && await s.locator('[data-sl=folder]').count() === 1 && await s.locator('[data-sl=genre]').count() === 1, 'Con más de 3 escuchas salen el buscador y los filtros');
  await s.fill('#slQ', 'judas'); await s.waitForTimeout(80);
  ok(JSON.stringify(await srows()) === '["Judas Priest Essentials"]', 'El buscador del alumno funciona');
  await s.fill('#slQ', ''); await s.selectOption('[data-sl=genre]', 'g1'); await s.waitForTimeout(80);
  ok(JSON.stringify((await srows()).sort()) === JSON.stringify(['Catchy Ultimate', 'Judas Priest Essentials']), 'Filtro por género (con subgéneros) en la lista del alumno');
  await s.screenshot({ path: path.join(__dirname, 'shots', 'biblioteca-alumno.png'), fullPage: true });
  // No puede tocar carpetas ni géneros
  const w = await s.evaluate(async () => [(await sb.from('listening_folders').insert({ name: 'Hack', position: 9 })).error, (await sb.from('listening_item_genres').insert({ item_id: 'i1', genre_id: 'g3' })).error]);
  ok(w.every(Boolean), 'El alumno no puede crear carpetas ni etiquetar escuchas');

  // Móvil
  const m = await start('t1', 390);
  await m.selectOption('[data-cat=student]', 's1'); await m.waitForTimeout(100);
  ok(await m.locator('#catList .tstat-m:visible').count() > 0, 'En el móvil, con alumno elegido, el estado se ve en cada fila');
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'En el móvil no hay scroll horizontal');
  await m.screenshot({ path: path.join(__dirname, 'shots', 'biblioteca-movil.png'), fullPage: true });

  ok(errors.length === 0, 'Sin errores en consola' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n${fails} FALLOS` : '\nTodo OK');
  process.exit(fails ? 1 : 0);
})();
