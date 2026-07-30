// 工程师工作台 Service Worker
// 网络优先策略：保证已安装的 PWA 应用总能拿到最新版
const CACHE_NAME = 'engineer-workbench-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-180.png'
];

// 安装：预缓存核心资源，跳过等待立即激活
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧版本缓存，接管所有客户端
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // 通知所有客户端：SW 已更新
        return self.clients.matchAll({ type: 'window' });
      })
      .then(clients => {
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' }));
      })
  );
});

// 请求拦截：网络优先，失败回退缓存
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML 文档：网络优先（保证拿到最新版），离线回退缓存
  if (req.destination === 'document' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(req).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // 其他资源（JS/CSS/图片/JSON）：缓存优先，网络回退
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // 后台静默更新缓存
        fetch(req).then(resp => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {});
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => {
        if (req.destination === 'document') return caches.match('./index.html');
      });
    })
  );
});
