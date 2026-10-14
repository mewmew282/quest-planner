const CACHE_NAME = 'quest-planner-v26';
const ASSETS = [
  './index.html',
  './manifest.json',
  './social.js',
  './calendar.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/badge-192.png',
  './icons/ui/nav-home.png',
  './icons/ui/nav-quest.png',
  './icons/ui/nav-diary.png',
  './icons/ui/nav-explore.png',
  './icons/ui/nav-more.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // 앱 본체(HTML/JS/JSON)는 네트워크를 먼저 시도하고, 오프라인일 때만 캐시를 쓴다.
  // (캐시 우선이면 새 버전을 올려도 폰이 옛 화면을 계속 보여줘서 새 기능이 안 보인다)
  const isShell = url.origin === self.location.origin &&
    (event.request.mode === 'navigate' || /\.(html|js|json)$/.test(url.pathname));
  if (isShell) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then(async (cache) => {
              await cache.put(event.request, clone);
              // 같은 파일의 다른 버전(?v=...)은 지운다: 오프라인에서 옛 버전이 나가거나 캐시가 계속 늘어나지 않게
              const keys = await cache.keys();
              await Promise.all(keys.filter((k) => { const u = new URL(k.url); return u.pathname === url.pathname && u.search !== url.search; }).map((k) => cache.delete(k)));
            }).catch(() => {});
          }
          return networkRes;
        })
        .catch(() => caches.match(event.request)
          .then((c) => c || caches.match(event.request, { ignoreSearch: true }))
          .then((c) => c || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkRes;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});

function nlogAdd(entry) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('qp-notif-log', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('log', { keyPath: 'id', autoIncrement: true }); };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('log', 'readwrite');
        tx.objectStore('log').add(entry);
        tx.oncomplete = () => {
          const tx2 = db.transaction('log', 'readwrite');
          const store = tx2.objectStore('log');
          const keysReq = store.getAllKeys();
          keysReq.onsuccess = () => {
            const keys = keysReq.result;
            if (keys.length > 50) keys.slice(0, keys.length - 50).forEach((k) => store.delete(k));
            resolve();
          };
          keysReq.onerror = () => resolve();
        };
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    } catch (e) { resolve(); }
  });
}
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) {}
  event.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Quest Planner', {
      body: d.body || '', tag: d.tag, renotify: !!d.tag,
      icon: 'icons/icon-192.png', badge: 'icons/badge-192.png'
    }),
    nlogAdd({ title: d.title || 'Quest Planner', body: d.body || '', tag: d.tag || '', at: Date.now() })
  ]));
});
