/* Service worker — خمّن العلم (offline support) */
const VERSION = 'v1';
const SHELL_CACHE = 'flag-shell-' + VERSION;
const FLAG_CACHE = 'flag-images-v1';   // flags rarely change; keep across app versions
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-192.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'
];
const FLAG_CODES = ["ad", "ae", "af", "ag", "al", "am", "ao", "ar", "as", "at", "au", "aw", "az", "ba", "bb", "bd", "be", "bf", "bg", "bh", "bi", "bj", "bm", "bn", "bo", "br", "bs", "bt", "bw", "by", "bz", "ca", "cd", "cf", "cg", "ch", "ci", "ck", "cl", "cm", "cn", "co", "cr", "cu", "cv", "cw", "cy", "cz", "de", "dj", "dk", "dm", "do", "dz", "ec", "ee", "eg", "eh", "er", "es", "et", "fi", "fj", "fm", "fo", "fr", "ga", "gb", "gd", "ge", "gg", "gh", "gi", "gl", "gm", "gn", "gq", "gr", "gt", "gu", "gw", "gy", "hk", "hn", "hr", "ht", "hu", "id", "ie", "im", "in", "iq", "ir", "is", "it", "je", "jm", "jo", "jp", "ke", "kg", "kh", "ki", "km", "kn", "kp", "kr", "kw", "kz", "la", "lb", "lc", "li", "lk", "lr", "ls", "lt", "lu", "lv", "ly", "ma", "mc", "md", "me", "mg", "mh", "mk", "ml", "mm", "mn", "mo", "mr", "mt", "mu", "mv", "mw", "mx", "my", "mz", "na", "nc", "ne", "ng", "ni", "nl", "no", "np", "nr", "nu", "nz", "om", "pa", "pe", "pf", "pg", "ph", "pk", "pl", "pr", "ps", "pt", "pw", "py", "qa", "ro", "rs", "ru", "rw", "sa", "sb", "sc", "sd", "se", "sg", "si", "sk", "sl", "sm", "sn", "so", "sr", "ss", "st", "sv", "sx", "sy", "sz", "td", "tg", "th", "tj", "tl", "tm", "tn", "to", "tr", "tt", "tv", "tw", "tz", "ua", "ug", "us", "uy", "uz", "va", "vc", "ve", "vn", "vu", "ws", "xk", "ye", "za", "zm", "zw"];
const flagUrl = c => `https://flagcdn.com/w320/${c}.png`;
const flagUrlFallback = c => `https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.3/flags/4x3/${c}.svg`;

// Download any flags we don't have yet, a few at a time. Never throws.
async function cacheFlags() {
  const cache = await caches.open(FLAG_CACHE);
  const todo = [];
  for (const c of FLAG_CODES) if (!(await cache.match(flagUrl(c)))) todo.push(c);
  for (let i = 0; i < todo.length; i += 15) {
    await Promise.allSettled(todo.slice(i, i + 15).map(async c => {
      const r = await fetch(flagUrl(c));
      if (r.ok) await cache.put(flagUrl(c), r);
    }));
  }
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL);          // the game itself must be cached
    await cacheFlags().catch(() => {}); // flags are best-effort
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [SHELL_CACHE, FLAG_CACHE];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CACHE_FLAGS') e.waitUntil(cacheFlags().catch(() => {}));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Flag images (CDN): cache-first, fill the cache on the fly.
  if (url.hostname === 'flagcdn.com' || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith((async () => {
      const cache = await caches.open(FLAG_CACHE);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      try {
        const r = await fetch(req.url); // re-fetch with CORS so it is cacheable and canvas-safe
        if (r.ok) cache.put(req.url, r.clone());
        return r;
      } catch (err) {
        return Response.error(); // the game then falls back to its own placeholder
      }
    })());
    return;
  }

  if (url.origin !== location.origin) return;

  // Pages: network-first (so updates arrive when online), cached copy when offline.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) (await caches.open(SHELL_CACHE)).put('./index.html', r.clone());
        return r;
      } catch (err) {
        return (await caches.match('./index.html')) || (await caches.match('./'));
      }
    })());
    return;
  }

  // Everything else of ours (icons, manifest): cache-first.
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const r = await fetch(req);
    if (r.ok) (await caches.open(SHELL_CACHE)).put(req, r.clone());
    return r;
  })());
});
