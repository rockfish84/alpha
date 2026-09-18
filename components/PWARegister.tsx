"use client";

import { useEffect } from "react";

/**
 * PWA 서비스워커 등록.
 * 개발(localhost)에서는 등록하지 않고, 이미 등록돼 있으면 해제한다.
 * 서버를 다시 띄우면 빌드 파일 이름이 바뀌는데, 예전 캐시를 물고 있으면
 * 화면이 빈 채로 뜨는 일이 생기기 때문이다.
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const host = window.location.hostname;
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");

    if (isLocal) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      if (typeof caches !== "undefined") {
        caches
          .keys()
          .then((keys) => keys.forEach((k) => caches.delete(k)))
          .catch(() => {});
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* 등록 실패는 무시 (앱 동작에는 영향 없음) */
    });
  }, []);
  return null;
}
