// 더브코 알파 클리닉 서비스워커 (설치 가능 + 기본 오프라인 캐시)
const CACHE = "dubco-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // API 요청은 캐시하지 않고 항상 네트워크 (인증/실시간 데이터)
  if (url.pathname.startsWith("/api/")) return;
  // 다른 오리진(폰트/CDN 등)은 건드리지 않음
  if (url.origin !== self.location.origin) return;

  // network-first: 최신을 우선, 실패 시 캐시로 폴백
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
