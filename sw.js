// Mode hors connexion de "Carte reseau HTB".
// - La page (et ses donnees : pylones, lignes, postes) est gardee en memoire : elle s'ouvre tout de suite,
//   meme sans reseau ou si le site en ligne disparait. Quand il y a du reseau, la nouvelle version est
//   recuperee en arriere-plan et servie a l'ouverture suivante.
// - Les morceaux de fond de carte (IGN, OpenStreetMap) deja affiches sont gardes (3000 au plus, ~90 Mo) :
//   hors reseau, le fond reste visible la ou l'on est deja passe.
const VERSION = 'v1';
const APP = 'carte-htb-app-' + VERSION;
const TILES = 'carte-htb-tuiles';
const MAX_TILES = 3000;
const APP_FILES = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP)
    .then(c => Promise.all(APP_FILES.map(f => c.add(f).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('carte-htb-app-') && k !== APP).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isTile = u => u.hostname === 'data.geopf.fr' || u.hostname.endsWith('tile.openstreetmap.org');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isTile(url)) { e.respondWith(tile(req)); return; }
  if (url.origin === self.location.origin) e.respondWith(page(req, url, e));
});

// Fichiers du site : servis depuis la memoire, mis a jour en arriere-plan
async function page(req, url, e) {
  const cache = await caches.open(APP);
  const key = url.pathname.endsWith('/') ? new URL('./', self.registration.scope).href : url.origin + url.pathname;
  const cached = await cache.match(key);
  const net = fetch(req).then(r => { if (r && r.ok && r.type === 'basic') cache.put(key, r.clone()); return r; }).catch(() => null);
  if (cached) { e.waitUntil(net); return cached; }
  return (await net) || new Response('Carte indisponible hors connexion (jamais ouverte sur cet appareil).', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// Fond de carte : memoire d'abord, sinon reseau (et on garde le morceau)
async function tile(req) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r.ok) cache.put(req, r.clone()).then(trim).catch(() => {});
    return r;
  } catch (err) {
    return Response.error();
  }
}

let trimming = false;
async function trim() {
  if (trimming) return;
  trimming = true;
  try {
    const c = await caches.open(TILES);
    const ks = await c.keys();
    if (ks.length > MAX_TILES) for (const k of ks.slice(0, ks.length - MAX_TILES)) await c.delete(k);
  } finally { trimming = false; }
}
