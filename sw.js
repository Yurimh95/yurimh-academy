/* Yurimh Academy · Service worker
   Permite instalar la web como app en el móvil y, más adelante, recibir notificaciones push.
   No guarda copias de la web (sin caché): así siempre se carga la última versión publicada. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* sin caché: todo va directo a internet */ });
