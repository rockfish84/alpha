"use client";

import React, { useEffect, useRef, useState } from "react";
import { Download, TrendingUp, X } from "lucide-react";
import { T, FONT } from "@/lib/constants";
import { TestDetail, formatDay } from "@/components/StudentAnalysis";
import { drawTestDetailCard, drawTrendCard } from "@/lib/score-card";
import type { TestAnalysis } from "@/lib/analysis-types";

type Payload = {
  who: { name: string; school: string; grade: string };
  test: TestAnalysis;
  trend: { date: string; score: number; average: number | null }[];
  expiresAt: string;
};

/**
 * 만든 이미지를 화면 안에서 보여 주는 상자.
 * 새 창(팝업)은 사파리에서 막히는 경우가 있어 쓰지 않는다.
 *  - 아이폰/안드로이드: 이미지를 길게 눌러 "사진에 추가"
 *  - PC: 아래 "이미지 파일로 저장" 을 누르면 그대로 내려받는다
 */
function ImageSheet({
  shot,
  onClose,
}: {
  shot: { url: string; filename: string; title: string };
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.62)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 14,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 14,
          width: "100%",
          maxWidth: 560,
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{shot.title}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: T.sub,
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shot.url}
          alt={shot.title}
          style={{ width: "100%", height: "auto", borderRadius: 10, display: "block" }}
        />

        <div
          style={{
            marginTop: 12,
            fontSize: 13,
            color: T.sub,
            lineHeight: 1.7,
            background: T.bg,
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          <b style={{ color: T.ink }}>휴대폰</b> — 위 이미지를 <b>길게 눌러</b> &ldquo;사진에
          추가&rdquo;(아이폰) 또는 &ldquo;이미지 저장&rdquo;(안드로이드)을 선택하세요.
        </div>

        <a
          href={shot.url}
          download={shot.filename}
          style={{
            display: "block",
            marginTop: 10,
            textAlign: "center",
            padding: "11px 12px",
            borderRadius: 10,
            background: T.primary,
            color: "#fff",
            fontSize: 14,
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          이미지 파일로 저장
        </a>
      </div>
    </div>
  );
}

export default function SharePage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [trendImg, setTrendImg] = useState("");
  const [busy, setBusy] = useState("");
  const [shot, setShot] = useState<{ url: string; filename: string; title: string } | null>(
    null
  );
  const drawn = useRef(false);

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

  // 점수 추이는 그림으로 보여 준다 (그대로 저장해 두고 볼 수 있게)
  useEffect(() => {
    if (!data || drawn.current || data.trend.length < 2) return;
    drawn.current = true;
    try {
      setTrendImg(
        drawTrendCard(
          {
            studentName: data.who.name,
            school: data.who.school,
            grade: data.who.grade,
            subject: data.test.subject,
            trend: data.trend,
          },
          { forDownload: true }
        )
      );
    } catch {
      /* 캔버스를 못 쓰는 환경이면 그냥 넘어간다 */
    }
  }, [data]);

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
  const stamp = data.test.date.replace(/-/g, "").slice(4); // 0913

  const saveDetail = () => {
    setBusy("detail");
    // 캔버스 작업이 길어질 수 있어 버튼 상태를 먼저 그린다
    setTimeout(() => {
      try {
        const t = data.test;
        const url = drawTestDetailCard(
          {
            studentName: data.who.name,
            school: data.who.school,
            grade: data.who.grade,
            subject: t.subject,
            date: t.date,
            hwDone: t.myHwDone,
            hwSsen: t.myHwSsen,
            maxScore: t.maxScore,
            participants: t.participants,
            myScore: t.myScore,
            myPct: t.myPct,
            myRank: t.myRank,
            avg: t.avg,
            best: t.best,
            distribution: t.distribution,
            questions: [...t.questions]
              .sort((a, b) => a.no - b.no || a.part - b.part)
              .map((q) => ({
                label: q.label,
                type: q.type,
                points: q.points,
                answer: q.answer,
                myAnswer: q.myAnswer,
                myAnswered: q.myAnswered,
                myCorrect: q.myCorrect,
                correctRate: q.correctRate,
                wrongRank: q.wrongRank,
                choiceShares: q.choiceShares,
              })),
          },
          { forDownload: true }
        );
        setShot({
          url,
          filename: `${data.who.name}_${stamp}_${t.subject}_성적.png`,
          title: `${formatDay(t.date)} ${t.subject} 성적`,
        });
      } finally {
        setBusy("");
      }
    }, 30);
  };

  const saveTrend = () => {
    if (!trendImg) return;
    setShot({
      url: trendImg,
      filename: `${data.who.name}_${data.test.subject}_점수추이.png`,
      title: `${data.test.subject} 점수 추이`,
    });
  };

  const btn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 10,
    border: `1px solid ${T.line}`,
    background: "#fff",
    color: T.primary,
    fontSize: 13,
    fontWeight: 800,
    fontFamily: FONT,
    cursor: "pointer",
  };

  return (
    <div style={wrap}>
      {shot && <ImageSheet shot={shot} onClose={() => setShot(null)} />}
      <div style={inner}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 6,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: T.ink }}>
              {data.who.name}
              {info && (
                <span
                  style={{ fontSize: 14, fontWeight: 600, color: T.sub, marginLeft: 10 }}
                >
                  {info}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13.5, color: T.sub, marginTop: 4 }}>
              더브코 알파 클리닉 · {formatDay(data.test.date)} {data.test.subject} 테스트 성적
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={btn} onClick={saveDetail} disabled={!!busy}>
              <Download size={14} />
              {busy === "detail" ? "만드는 중…" : "성적 이미지"}
            </button>
            {trendImg && (
              <button style={btn} onClick={saveTrend}>
                <TrendingUp size={14} />
                추이 이미지
              </button>
            )}
          </div>
        </div>

        <TestDetail test={data.test} hideFiles order="no" />

        {trendImg && (
          <div
            style={{
              marginTop: 14,
              background: "#fff",
              border: `1px solid ${T.line}`,
              borderRadius: 14,
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: T.ink,
                marginBottom: 8,
              }}
            >
              점수 추이 (최근 {data.trend.length}회)
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={trendImg}
              alt="점수 추이"
              style={{ width: "100%", height: "auto", borderRadius: 10 }}
            />
          </div>
        )}

        <div style={{ marginTop: 18, fontSize: 12.5, color: T.muted, lineHeight: 1.7 }}>
          이 링크는 {new Date(data.expiresAt).toLocaleDateString("ko-KR")} 까지만 열립니다.
          링크에는 이 학생의 해당 회차 성적만 담겨 있습니다. 다른 회차·오답 노트·문항별 분석은
          클리닉 사이트에 로그인하시면 모두 보실 수 있습니다.
        </div>
      </div>
    </div>
  );
}
