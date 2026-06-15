// 最小限のService Worker
// 方針: HTML/アプリシェル・データとも「ネット優先（network-first）」。
//   更新が必ず反映され、オフライン時だけキャッシュにフォールバックする。
//   （v1 は cache-first で更新が反映されず白画面の原因になったため v2 で是正）
const CACHE = 'toyama-eats-app-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()) // 既存タブも即座に新SWの管理下へ
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return; // 同期API(PUT/POST)はそのまま通す
  // ネット優先：最新を取りに行き、成功したらキャッシュ更新。落ちたらキャッシュで代替。
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
