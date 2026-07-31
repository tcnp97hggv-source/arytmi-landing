/* Service worker — holder selve appen i live uden net.
   Korttiles gemmes IKKE her; de ligger i IndexedDB, styret af app.js. */
const CACHE = 'arytmi-recon-20260731b';
const SKAL = [
  './', './index.html', './app.css', './app.js', './rute.js',
  './turplan.html',
  './vendor/leaflet.js', './vendor/leaflet.css',
  './manifest.webmanifest', './favicon-32.png', './apple-touch-icon-180.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SKAL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(n => Promise.all(n.filter(x => x !== CACHE).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if(e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, {ignoreSearch:true}).then(traf =>
      traf || fetch(e.request).then(svar => {
        if(svar.ok){
          const kopi = svar.clone();
          caches.open(CACHE).then(c => c.put(e.request, kopi));
        }
        return svar;
      }).catch(() => traf)
    )
  );
});
