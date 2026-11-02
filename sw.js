const V = 'pep-v2';   // changer ce numéro à chaque mise à jour du site
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'db.js', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())));

// Fichiers du site : cache d'abord, mise à jour en arrière-plan. L'API Apps Script n'est jamais interceptée.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    const net = fetch(e.request).then(r => { if (r.ok) caches.open(V).then(c => c.put(e.request, r.clone())); return r; })
      .catch(() => hit || caches.match('index.html'));
    return hit || net;
  }));
});

// Background Sync : demande à l'application d'envoyer la file d'attente
self.addEventListener('sync', e => {
  if (e.tag === 'sync-mvts') e.waitUntil(self.clients.matchAll().then(cs => cs.forEach(c => c.postMessage('sync'))));
});
