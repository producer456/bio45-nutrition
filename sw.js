// Offline support, scoped to this directory only.
//
// ⚠ SHARED ORIGIN. producer456.github.io hosts several other study sites. A worker
// cannot claim a scope above its own path, and this one additionally refuses any
// request outside its own directory, and deletes only caches it owns. Do not move
// this file to the origin root and do not widen the scope.
//
// Navigations are network-first on purpose. Bumping ?v= inside index.html does
// nothing if the browser is serving a stale index.html, which is exactly what
// happened during development: the page kept loading old CSS and JS because the
// document pointing at them was itself cached.

const VERSION = 'b45-v1';
const BASE = new URL('./', self.location).pathname;

const SHELL = [
  './', './index.html', './course.json', './icon.svg',
  './manifest.webmanifest?v=1', './icon-180.png', './icon-192.png', './icon-512.png',
  './assets/base.css?v=1', './assets/theme.css?v=1', './assets/polish.css?v=1',
  './assets/study.css?v=1', './assets/reading.css?v=1', './assets/appearance.css?v=1',
  './assets/learning.css?v=1', './assets/shell.css?v=5',
  './assets/course-app.js?v=6',
  './assets/course-store.js', './assets/state-merge.js', './assets/state.js',
  './assets/grading.js', './assets/deadlines.js', './assets/diary.js',
  './content/week-01.json',
  './content/week-02.json',
  './content/week-03.json',
  './content/week-04.json',
  './content/week-05.json',
  './content/week-06.json',
  './content/week-07.json',
  './content/week-08.json',
  './content/week-09.json',
  './content/week-10.json',
  './content/week-11.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== VERSION && k.startsWith('b45-')).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf(BASE) !== 0) return;

  // Data is network-first; versioned assets are cache-first.
  //
  // course.json, calendar.json and the week files carry no ?v=, so cache-first would
  // pin them to whatever was cached at install and no edit would ever arrive. That
  // matters most for calendar.json, which is republished from Canvas every 30
  // minutes — serving it from cache would make the feed permanently stale.
  const isData = url.pathname.endsWith('.json') || url.pathname.endsWith('.webmanifest');

  if (e.request.mode === 'navigate' || isData) {
    e.respondWith(
      fetch(e.request)
        .then(res => { if (res.status === 200) caches.open(VERSION).then(c => c.put(e.request, res.clone())); return res; })
        .catch(() => caches.match(e.request).then(r => {
          if (r) return r;
          // Only a navigation falls back to the shell; a missing data file must
          // fail honestly rather than being served an HTML page as JSON.
          return e.request.mode === 'navigate'
            ? caches.match(BASE + 'index.html').then(x => x ?? caches.match('./'))
            : undefined;
        }))
    );
    return;
  }

  e.respondWith(caches.match(e.request).then(hit => hit ?? fetch(e.request).then(res => {
    if (res.status === 200) caches.open(VERSION).then(c => c.put(e.request, res.clone()));
    return res;
  })));
});
