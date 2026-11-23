/* Yurimh Academy · Service worker
   · Permite instalar la web como app en el móvil.
   · Recibe las notificaciones push y las muestra aunque la app esté cerrada.
   No guarda copias de la web (sin caché): así siempre se carga la última versión publicada. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
// Sin caché: todo va directo a internet. Solo si no hay conexión al abrir la app, se muestra un aviso
// (en vez del dinosaurio de Chrome). Además, Chrome exige un fetch "real" para ofrecer "Instalar aplicación".
const OFFLINE = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Yurimh Academy</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#050b1c;color:#e9f1ff;font-family:system-ui,sans-serif;text-align:center;padding:24px">
<div><img src="icon-192.png" width="88" height="88" style="border-radius:22px;box-shadow:0 0 24px rgba(47,134,255,.5)" alt=""><h1 style="font-size:20px">Sin conexión</h1>
<p style="color:#9fb3dc">Yurimh Academy necesita internet. Comprueba tu conexión y vuelve a intentarlo.</p>
<button onclick="location.reload()" style="font:inherit;font-weight:600;border:0;border-radius:11px;padding:10px 18px;background:#2f86ff;color:#fff">Reintentar</button></div></body></html>`;
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return; // imágenes, datos, etc.: el navegador los gestiona como siempre
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Yurimh Academy', {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || undefined,          // avisos del mismo tema se agrupan en vez de amontonarse
    renotify: !!d.tag,
    data: { url: d.url || './' }
  }));
});

// Al tocar el aviso: si la app ya está abierta, la trae delante y le dice qué abrir; si no, la abre.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { c.postMessage({ type: 'open-notification', url }); return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
