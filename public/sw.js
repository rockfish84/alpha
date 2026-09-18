// 더브코 알파 클리닉 서비스워커
//
// 예전 버전은 화면(HTML)과 정적 파일을 캐시했는데, 서버를 다시 배포/재시작하면
// 옛 파일을 물고 있다가 화면이 빈 채로 뜨는 문제가 있었다.
// 지금은 캐시를 전혀 쓰지 않고, 남아 있는 옛 캐시를 지우는 일만 한다.
// (홈 화면에 추가(PWA) 기능은 그대로 동작한다)
const VERSION = "dubco-v2-nocache";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 예전 버전이 만들어 둔 캐시를 모두 지운다
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
      // 열려 있는 화면을 새 파일로 다시 불러온다
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) client.navigate(client.url).catch(() => {});
    })()
  );
});

// 설치 가능(PWA) 조건을 위해 fetch 핸들러는 두되, 항상 네트워크를 그대로 쓴다.
self.addEventListener("fetch", () => {});
