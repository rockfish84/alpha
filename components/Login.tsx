"use client";

import React, { useState } from "react";
import { GraduationCap } from "lucide-react";
import { T, FONT } from "@/lib/constants";
import { Btn, inputBase } from "./ui";

export function Login({
  onLogin,
  error,
}: {
  onLogin: (role: "student" | "admin", u: string, p: string) => void;
  error: string;
}) {
  const [mode, setMode] = useState<"student" | "admin">("student");
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const submit = () => onLogin(mode, u, p);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(160deg, ${T.primary} 0%, #1d3560 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: FONT,
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 22, color: "#fff" }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "rgba(255,255,255,.14)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <GraduationCap size={28} color="#fff" />
          </div>
          <div style={{ fontSize: 23, fontWeight: 800 }}>
            더브코 <span style={{ color: T.accent }}>알파 클리닉</span>
          </div>
          <div
            style={{
              fontSize: 13.5,
              color: "rgba(255,255,255,.7)",
              marginTop: 4,
            }}
          >
            출결 · 질문 · 학습 관리 시스템
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            padding: 24,
            boxShadow: "0 20px 50px rgba(0,0,0,.25)",
          }}
        >
          <div
            style={{
              display: "flex",
              background: "#EEF1F6",
              borderRadius: 11,
              padding: 4,
              marginBottom: 18,
            }}
          >
            {(
              [
                ["student", "학생"],
                ["admin", "관리자"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: FONT,
                  fontSize: 14,
                  fontWeight: 700,
                  color: mode === k ? T.primary : T.sub,
                  background: mode === k ? "#fff" : "transparent",
                  boxShadow: mode === k ? "0 1px 3px rgba(0,0,0,.1)" : "none",
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <input
            style={{ ...inputBase, marginBottom: 10 }}
            placeholder="아이디"
            value={u}
            onChange={(e) => setU(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <input
            style={{ ...inputBase, marginBottom: 6 }}
            type="password"
            inputMode={mode === "student" ? "numeric" : undefined}
            placeholder="비밀번호"
            value={p}
            onChange={(e) => setP(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          {error && (
            <div
              style={{
                color: T.bad,
                fontSize: 13,
                margin: "4px 0 8px",
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}
          <Btn
            onClick={submit}
            style={{
              width: "100%",
              justifyContent: "center",
              marginTop: 10,
              padding: "11px 0",
            }}
          >
            로그인
          </Btn>
        </div>
        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "rgba(255,255,255,.5)",
            marginTop: 16,
          }}
        >
          더브코 알파 클리닉 · 출결/질문/학습 관리
        </div>
      </div>
    </div>
  );
}
