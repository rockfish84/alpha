"use client";

import React, { useEffect, useState } from "react";
import { T, FONT, type Me } from "@/lib/constants";
import { api } from "@/lib/api";
import { Login } from "@/components/Login";
import { StudentPortal } from "@/components/StudentPortal";
import { AdminPortal } from "@/components/AdminPortal";

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
      setAuth(me);
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
