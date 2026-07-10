import type { Metadata } from "next";
import { T, FONT } from "@/lib/constants";

export const metadata: Metadata = {
  title: "앱 설치 · 더브코 알파 클리닉",
  description: "QR을 찍어 홈 화면에 추가하세요",
};

const APP_URL = "https://port-0-alpha-m7c8oc297ff7fd19.sel4.cloudtype.app/";

export default function InstallPage() {
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
            {/* 졸업모자 (인라인 SVG) */}
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

        {/* QR */}
        <div style={{ ...card, textAlign: "center" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, marginBottom: 12 }}>
            📷 QR 스캔 또는 아래 버튼
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/qr.png"
            alt="앱 주소 QR"
            width={220}
            height={220}
            style={{ borderRadius: 12, border: `1px solid ${T.line}` }}
          />
          <a
            href={APP_URL}
            style={{
              display: "block",
              marginTop: 14,
              padding: "13px 0",
              background: T.primary,
              color: "#fff",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            지금 웹으로 열기 →
          </a>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 10, wordBreak: "break-all" }}>
            {APP_URL}
          </div>
        </div>

        {/* 안드로이드 */}
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 10 }}>
            🤖 안드로이드 (Chrome)
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, color: T.sub, fontSize: 14, lineHeight: 1.9 }}>
            <li>위 버튼으로 사이트 열기</li>
            <li>하단 <b style={{ color: T.ink }}>"앱 설치"</b> 배너 탭 (또는 메뉴 ⋮ → <b style={{ color: T.ink }}>홈 화면에 추가</b>)</li>
            <li>홈 화면 아이콘으로 앱처럼 실행</li>
          </ol>
        </div>

        {/* 아이폰 */}
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 10 }}>
            🍎 아이폰 (Safari)
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, color: T.sub, fontSize: 14, lineHeight: 1.9 }}>
            <li>위 버튼으로 사이트 열기 (꼭 Safari)</li>
            <li>하단 <b style={{ color: T.ink }}>공유 버튼</b> (⬆️) 탭</li>
            <li><b style={{ color: T.ink }}>홈 화면에 추가</b> 선택 → 추가</li>
          </ol>
        </div>

        {/* 로그인 안내 */}
        <div style={{ ...card, background: T.primarySoft, border: `1px solid ${T.primarySoft}` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.primary, marginBottom: 10 }}>
            🔑 로그인 방법 (학생)
          </div>
          <div style={{ fontSize: 14, color: T.ink, lineHeight: 1.9 }}>
            <div>
              <b>아이디</b> : 이름 + 학교 (예: <code style={{ background: "#fff", padding: "1px 6px", borderRadius: 6 }}>최호준지족고</code>)
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
