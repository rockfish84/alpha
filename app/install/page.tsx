"use client";

import React, { useEffect, useState } from "react";
import { T, FONT } from "@/lib/constants";

const APP_URL = "https://port-0-alpha-m7c8oc297ff7fd19.sel4.cloudtype.app/";

export default function InstallPage() {
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    document.title = "앱 설치 · 더브코 알파 클리닉";
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) setPlatform("ios");
    else if (/Android/i.test(ua)) setPlatform("android");

    const onBIP = (e: any) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia?.("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const doInstall = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  const card: React.CSSProperties = {
    background: "#fff",
    border: `1px solid ${T.line}`,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        fontFamily: FONT,
        padding: "28px 18px 60px",
      }}
    >
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        {/* 헤더 */}
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 15,
              background: T.primary,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
              <path d="M22 10v6" />
              <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
            </svg>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.ink }}>
            더브코 <span style={{ color: T.accent }}>알파 클리닉</span>
          </div>
          <div style={{ fontSize: 14, color: T.sub, marginTop: 4 }}>
            휴대폰에 앱으로 설치하기
          </div>
        </div>

        {installed ? (
          <div style={{ ...card, textAlign: "center", background: T.okSoft, border: `1px solid ${T.okSoft}` }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: T.ok }}>
              ✅ 이미 앱으로 실행 중이에요!
            </div>
            <a href={APP_URL} style={{ display: "block", marginTop: 12, color: T.primary, fontWeight: 700 }}>
              앱 열기 →
            </a>
          </div>
        ) : (
          <>
            {/* 안드로이드: 원탭 설치 버튼 */}
            {platform !== "ios" && deferred && (
              <div style={{ ...card, textAlign: "center" }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, marginBottom: 12 }}>
                  🤖 원탭 설치
                </div>
                <button
                  onClick={doInstall}
                  style={{
                    width: "100%",
                    padding: "15px 0",
                    background: T.primary,
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    fontSize: 16,
                    fontWeight: 800,
                    fontFamily: FONT,
                    cursor: "pointer",
                  }}
                >
                  📲 앱 설치하기
                </button>
              </div>
            )}

            {/* 아이폰 안내 (강조) */}
            {platform === "ios" && (
              <div style={{ ...card, border: `2px solid ${T.primary}` }}>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: T.primary, marginBottom: 10 }}>
                  🍎 아이폰 설치 (Safari)
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, color: T.ink, fontSize: 14.5, lineHeight: 2 }}>
                  <li>아래 <b>웹으로 열기</b> 탭 (반드시 Safari)</li>
                  <li>하단 <b>공유 버튼</b> <span style={{ fontSize: 17 }}>⬆️</span> 탭</li>
                  <li><b>홈 화면에 추가</b> 선택 → 추가</li>
                </ol>
              </div>
            )}

            {/* 웹으로 열기 (공통) */}
            <a
              href={APP_URL}
              style={{
                display: "block",
                textAlign: "center",
                padding: "14px 0",
                background: platform === "ios" ? T.primary : "#fff",
                color: platform === "ios" ? "#fff" : T.primary,
                border: `1.5px solid ${T.primary}`,
                borderRadius: 12,
                fontSize: 15.5,
                fontWeight: 800,
                textDecoration: "none",
                marginBottom: 16,
              }}
            >
              웹으로 열기 →
            </a>

            {/* 안드로이드 수동 안내 (설치 버튼이 안 뜰 때) */}
            {platform !== "ios" && (
              <div style={card}>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 10 }}>
                  🤖 안드로이드 (버튼이 안 보이면)
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, color: T.sub, fontSize: 14, lineHeight: 1.9 }}>
                  <li>Chrome으로 <b style={{ color: T.ink }}>웹으로 열기</b></li>
                  <li>메뉴 <b style={{ color: T.ink }}>⋮</b> → <b style={{ color: T.ink }}>앱 설치</b> / <b style={{ color: T.ink }}>홈 화면에 추가</b></li>
                </ol>
              </div>
            )}
          </>
        )}

        {/* 로그인 안내 */}
        <div style={{ ...card, background: T.primarySoft, border: `1px solid ${T.primarySoft}` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.primary, marginBottom: 10 }}>
            🔑 로그인 방법 (학생)
          </div>
          <div style={{ fontSize: 14, color: T.ink, lineHeight: 1.9 }}>
            <div>
              <b>아이디</b> : 이름 + 학교 (예: <code style={{ background: "#fff", padding: "1px 6px", borderRadius: 6 }}>이세돌알파고</code>)
            </div>
            <div>
              <b>비밀번호</b> : 부모님 전화번호 <b>숫자만</b> (예: <code style={{ background: "#fff", padding: "1px 6px", borderRadius: 6 }}>01012345678</code>)
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: T.sub, marginTop: 10 }}>
            로그인이 안 되면 선생님께 문의하세요.
          </div>
        </div>
      </div>
    </div>
  );
}
