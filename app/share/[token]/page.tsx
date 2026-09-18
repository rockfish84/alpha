"use client";

import React, { useEffect, useState } from "react";
import { T, FONT } from "@/lib/constants";
import { TestDetail, formatDay } from "@/components/StudentAnalysis";
import type { TestAnalysis } from "@/lib/analysis-types";

type Payload = {
  who: { name: string; school: string; grade: string };
  test: TestAnalysis;
  expiresAt: string;
};

/** 문자로 받은 링크로 열리는 화면. 로그인 없이 그 회차 성적 하나만 보여 준다. */
export default function SharePage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/share/${params.token}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || "링크를 열 수 없습니다.");
        return d as Payload;
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [params.token]);

  const wrap: React.CSSProperties = {
    fontFamily: FONT,
    background: T.bg,
    minHeight: "100vh",
    padding: "20px 14px 48px",
  };
  const inner: React.CSSProperties = { maxWidth: 960, margin: "0 auto" };

  if (error) {
    return (
      <div style={wrap}>
        <div style={{ ...inner, textAlign: "center", paddingTop: 80, color: T.sub }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, marginBottom: 8 }}>
            {error}
          </div>
          <div style={{ fontSize: 13.5 }}>
            링크는 일정 기간이 지나면 만료됩니다. 클리닉 사이트에 로그인하시면 계속 보실 수 있습니다.
          </div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={wrap}>
        <div style={{ ...inner, textAlign: "center", paddingTop: 80, color: T.muted }}>
          불러오는 중…
        </div>
      </div>
    );
  }

  const info = [data.who.school, data.who.grade].filter(Boolean).join(" · ");
  return (
    <div style={wrap}>
      <div style={inner}>
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: T.ink }}>
            {data.who.name}
            {info && (
              <span style={{ fontSize: 14, fontWeight: 600, color: T.sub, marginLeft: 10 }}>
                {info}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13.5, color: T.sub, marginTop: 4 }}>
            더브코 알파 클리닉 · {formatDay(data.test.date)} {data.test.subject} 테스트 성적
          </div>
        </div>

        <TestDetail test={data.test} hideFiles />

        <div style={{ marginTop: 18, fontSize: 12.5, color: T.muted, lineHeight: 1.7 }}>
          이 링크는 {new Date(data.expiresAt).toLocaleDateString("ko-KR")} 까지만 열립니다.
          링크에는 이 학생의 해당 회차 성적만 담겨 있습니다. 다른 회차·오답 노트·문항별 분석은
          클리닉 사이트에 로그인하시면 모두 보실 수 있습니다.
        </div>
      </div>
    </div>
  );
}
