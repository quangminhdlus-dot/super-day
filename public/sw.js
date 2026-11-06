const CACHE = 'super-day-shell-dev';
const ROOT = new URL('./', self.location.href);
const SHELL = ['./', './index.html', './src/app.js', './src/styles.css', './src/lib/domain.js', './src/lib/api.js', './src/lib/push.js', './vendor/supabase.js', './config.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(p => new URL(p, ROOT).href)))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('super-day-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname) || url.pathname.includes('/push/')) return;
  // Only cache public application files. Supabase API and personal records never pass this filter.
  if (url.pathname.endsWith('/config.js')) { event.respondWith(fetch(req).then(async response => { if (response.ok) { const cache = await caches.open(CACHE); await cache.put(req, response.clone()); } return response; }).catch(() => caches.match(req))); return; }
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(async response => { if (response.ok) { const cache = await caches.open(CACHE); await cache.put(ROOT.href, response.clone()); } return response; }).catch(() => caches.match(ROOT.href))); return;
  }
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(async response => { if (response.ok) { const cache = await caches.open(CACHE); await cache.put(req, response.clone()); } return response; })));
});
