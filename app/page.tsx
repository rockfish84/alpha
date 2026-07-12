"use client";

import React, { useEffect, useState } from "react";
import { T, FONT, type Me } from "@/lib/constants";
import { api } from "@/lib/api";
import { Login } from "@/components/Login";
import { StudentPortal } from "@/components/StudentPortal";
import { AdminPortal } from "@/components/AdminPortal";

// 세션 쿠키가 실제로 인증 요청에 실릴 때까지 /api/me 로 확인(최대 3회, 짧게 재시도).
// 브라우저가 로그인 응답의 Set-Cookie 를 반영하기 전에 데이터 요청이 나가는 레이스를 막는다.
async function confirmSession(fallback: Me): Promise<Me> {
  for (let i = 0; i < 3; i++) {
    try {
      return (await api.get("/api/me")) as Me;
    } catch {
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  return fallback;
}

export default function Page() {
  // undefined = 로딩중, null = 미로그인
  const [auth, setAuth] = useState<Me | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/api/me")
      .then((me: Me) => setAuth(me))
      .catch(() => setAuth(null));
  }, []);

  const login = async (
    role: "student" | "admin",
    username: string,
    password: string
  ) => {
    setError("");
    try {
      const me: Me = await api.post("/api/auth/login", {
        role,
        username,
        password,
      });
      // 로그인 직후 세션 쿠키가 확실히 자리잡은 뒤 진입한다.
      // (쿠키 반영 전에 포털이 데이터를 요청해 "새로고침해야 뜨는" 버그 방지)
      const confirmed = await confirmSession(me);
      setAuth(confirmed);
    } catch (e: any) {
      setError(e.message || "로그인에 실패했습니다.");
    }
  };

  const logout = async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* ignore */
    }
    setAuth(null);
    setError("");
  };

  if (auth === undefined) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: T.bg,
          color: T.muted,
          fontFamily: FONT,
          fontSize: 15,
        }}
      >
        불러오는 중…
      </div>
    );
  }

  if (!auth) return <Login onLogin={login} error={error} />;

  if (auth.role === "student") {
    return <StudentPortal me={auth} onLogout={logout} />;
  }

  return <AdminPortal onLogout={logout} />;
}
