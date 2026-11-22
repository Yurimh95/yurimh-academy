/* Yurimh Academy · Service worker
   · Permite instalar la web como app en el móvil.
   · Recibe las notificaciones push y las muestra aunque la app esté cerrada.
   No guarda copias de la web (sin caché): así siempre se carga la última versión publicada. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* sin caché: todo va directo a internet */ });

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
