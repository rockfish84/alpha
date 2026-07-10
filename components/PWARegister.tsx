"use client";

import { useEffect } from "react";

export function PWARegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* 등록 실패는 무시 (앱 동작에는 영향 없음) */
      });
    }
  }, []);
  return null;
}
