/* Service worker — holder selve appen i live uden net.
   Korttiles gemmes IKKE her; de ligger i IndexedDB, styret af app.js. */
const CACHE = 'arytmi-recon-20260731f';
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

/* Svar fra cachen med det samme, men hent altid en frisk kopi i baggrunden.
   Rent cache-først var forkert: med ignoreSearch matcher app.js?v=ny den gamle
   app.js, så ?v=-nummeret aldrig kunne trænge igennem. Nu bliver appen ved med
   at virke uden net OG opdaterer sig selv, når der er dækning. */
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if(e.request.method !== 'GET' || u.origin !== location.origin) return;
  if(u.pathname.endsWith('/sw.js')) return;   // browseren styrer selv min opdatering

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const traf = await cache.match(e.request, {ignoreSearch:true});
    const fraNet = fetch(e.request).then(svar => {
      if(svar.ok) cache.put(e.request, svar.clone());
      return svar;
    }).catch(() => null);
    if(traf){ e.waitUntil(fraNet); return traf; }
    return (await fraNet) || new Response('Offline — filen er ikke hentet endnu',
      {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
  })());
});
