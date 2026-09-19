"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Download,
  Target,
  AlertTriangle,
  Star,
  Filter,
  ChevronDown,
  HelpCircle,
  FileDown,
  CheckSquare,
} from "lucide-react";
import { T, md } from "@/lib/constants";
import { ANSWER_ALT_SEPARATOR, SCORE_BUCKETS } from "@/lib/grading";
import { typeRank } from "@/lib/type-order";
import {
  FILE_KIND_LABEL,
  bookmarkKey,
  formatFileSize,
  type ChoiceShare,
  type QuestionAnalysis,
  type TestAnalysis,
} from "@/lib/analysis-types";
import { Btn, Card, Empty, Modal, Pill, SectionTitle, inputBase } from "./ui";
import { PdfRegionView, pickRegions } from "./PdfRegionView";
import type { FileMeta, RegionRect } from "@/lib/analysis-types";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 복수 정답("3|③")은 "3 또는 ③" 으로 보여준다. */
function displayAnswer(answer: string): string {
  return (answer || "")
    .split(ANSWER_ALT_SEPARATOR)
    .map((a) => a.trim())
    .filter(Boolean)
    .join(" 또는 ");
}

export function formatDay(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00.000Z`);
  return `${md(iso)}(${WEEKDAY[d.getUTCDay()]})`;
}

const th: React.CSSProperties = {
  padding: "10px 10px",
  fontSize: 12,
  fontWeight: 800,
  color: T.sub,
  background: "#F6F8FB",
  borderBottom: `1px solid ${T.line}`,
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "9px 10px",
  fontSize: 13.5,
  color: T.ink,
  borderBottom: `1px solid ${T.line}`,
  whiteSpace: "nowrap",
};

/** 난이도 색: 최상·상 = 빨강, 중 = 주황, 하·최하 = 초록. */
function difficultyTone(d: string): "bad" | "warn" | "ok" {
  if (d === "최상" || d === "상") return "bad";
  if (d === "중") return "warn";
  return "ok";
}

function scoreTone(pct: number | null): string {
  if (pct == null) return T.muted;
  if (pct >= 80) return T.ok;
  if (pct >= 60) return T.primary;
  if (pct >= 40) return T.warn;
  return T.bad;
}

function Stat({
  label,
  value,
  unit,
  tone,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <Card style={{ padding: 16, flex: 1, minWidth: 132 }}>
      <div style={{ fontSize: 12.5, color: T.sub, fontWeight: 700, marginBottom: 7 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: tone || T.ink, lineHeight: 1 }}>
        {value}
        {unit && (
          <span style={{ fontSize: 14, fontWeight: 700, color: T.muted, marginLeft: 3 }}>
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 6 }}>{hint}</div>
      )}
    </Card>
  );
}

/* ============================== 점수 분포 ============================== */
function Distribution({ test }: { test: TestAnalysis }) {
  const total = test.participants || 1;
  const myBucket =
    test.myPct == null
      ? -1
      : SCORE_BUCKETS.findIndex((b) => test.myPct! >= b.min && test.myPct! <= b.max);
  const maxCount = Math.max(1, ...test.distribution);

  return (
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: T.ink, marginBottom: 10 }}>
        점수 분포 (100점 환산 · 응시 {test.participants}명)
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {SCORE_BUCKETS.map((b, i) => {
          const count = test.distribution[i] ?? 0;
          const mine = i === myBucket;
          return (
            <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 62,
                  fontSize: 12.5,
                  fontWeight: mine ? 800 : 600,
                  color: mine ? T.primary : T.sub,
                  textAlign: "right",
                }}
              >
                {b.label}
              </div>
              <div
                style={{
                  flex: 1,
                  height: 20,
                  background: "#F1F4F9",
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.round((count / maxCount) * 100)}%`,
                    height: "100%",
                    background: mine ? T.primary : "#C7D2E4",
                    borderRadius: 6,
                    transition: "width .2s",
                  }}
                />
              </div>
              <div
                style={{
                  width: 118,
                  fontSize: 12.5,
                  color: mine ? T.primary : T.sub,
                  fontWeight: mine ? 800 : 600,
                  whiteSpace: "nowrap",
                }}
              >
                {count}명 ({Math.round((count / total) * 100)}%)
                {mine && " ←나"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================== 답안 분포 ============================== */
/** 분포 칸 전체 폭 (표가 옆으로 넘치지 않도록 고정) */
const DIST_WIDTH = 200;
const DIST_GAP = 3;
const BAR_AREA = 38; // 막대가 그려지는 높이 (이 영역 전체가 마우스 대상)

type HoverShare = { share: ChoiceShare; x: number; y: number; below: boolean };

/** 막대에 마우스를 올리면 뜨는 말풍선 */
function ShareTooltip({ hover }: { hover: HoverShare }) {
  const { share, x, y, below } = hover;
  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        transform: below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
        zIndex: 80,
        pointerEvents: "none",
        background: "#1E2B45",
        color: "#fff",
        borderRadius: 10,
        padding: "9px 12px",
        boxShadow: "0 10px 26px rgba(15,23,42,.28)",
        maxWidth: 280,
      }}
    >
      <div
        style={{
          fontSize: 13.5,
          fontWeight: 800,
          lineHeight: 1.35,
          wordBreak: "break-word",
        }}
      >
        {share.label || share.choice}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 5,
          fontSize: 12,
          color: "rgba(255,255,255,.75)",
        }}
      >
        <span>
          {share.count}명 · {share.ratio}%
        </span>
        {share.correct && (
          <span style={{ ...tipBadge, background: "rgba(46,158,107,.9)" }}>정답</span>
        )}
        {share.mine && (
          <span
            style={{
              ...tipBadge,
              // 내가 맞힌 답이면 초록으로 (틀렸을 때만 빨강)
              background: share.correct ? "rgba(46,158,107,.9)" : "rgba(210,84,63,.9)",
            }}
          >
            내 답안
          </span>
        )}
      </div>
      <span
        style={{
          position: "absolute",
          left: "50%",
          ...(below ? { top: -5 } : { bottom: -5 }),
          width: 10,
          height: 10,
          marginLeft: -5,
          background: "#1E2B45",
          transform: "rotate(45deg)",
          borderRadius: 2,
        }}
      />
    </div>
  );
}

const tipBadge: React.CSSProperties = {
  padding: "1px 6px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  color: "#fff",
};

function ChoiceBars({ q }: { q: QuestionAnalysis }) {
  const [hover, setHover] = useState<HoverShare | null>(null);
  if (!q.choiceShares.length) return <span style={{ color: T.muted }}>—</span>;

  const show = (share: ChoiceShare) => (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    // 화면 위쪽이면 말풍선을 아래로 내려 잘리지 않게 한다
    const below = r.top < 120;
    const x = Math.min(
      Math.max(r.left + r.width / 2, 150),
      window.innerWidth - 150
    );
    setHover({ share, x, y: below ? r.bottom + 8 : r.top - 8, below });
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: DIST_GAP,
          alignItems: "stretch",
          width: DIST_WIDTH,
          maxWidth: DIST_WIDTH,
          overflow: "hidden",
        }}
        onMouseLeave={() => setHover(null)}
      >
        {q.choiceShares.map((c) => {
          const label = c.label || c.choice;
          const on = hover?.share === c;
          return (
            // 막대가 짧아도 칸 전체가 마우스 대상이 되도록 감싼다
            <div
              key={c.choice}
              onMouseEnter={show(c)}
              onMouseMove={show(c)}
              onClick={show(c)}
              style={{
                // 칸을 넘지 않도록 남은 폭을 똑같이 나눠 쓴다
                flex: "1 1 0",
                minWidth: 0,
                textAlign: "center",
                padding: "3px 1px",
                borderRadius: 7,
                background: on ? "rgba(44,74,130,.08)" : "transparent",
                cursor: "default",
                transition: "background .12s",
              }}
            >
              <div
                style={{
                  height: BAR_AREA,
                  display: "flex",
                  alignItems: "flex-end",
                  marginBottom: 3,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: Math.max(3, Math.round((c.ratio / 100) * BAR_AREA)),
                    background: c.correct ? T.ok : c.mine ? T.bad : "#C7D2E4",
                    borderRadius: 4,
                    outline: on ? `2px solid rgba(44,74,130,.35)` : "none",
                    outlineOffset: 1,
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 9.5,
                  color: c.correct ? T.ok : c.mine ? T.bad : T.muted,
                  fontWeight: c.correct || c.mine ? 800 : 500,
                  lineHeight: 1.25,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {label}
              </div>
              <div style={{ fontSize: 9.5, color: T.muted }}>{c.ratio}%</div>
            </div>
          );
        })}
      </div>
      {hover && <ShareTooltip hover={hover} />}
    </>
  );
}

/** 긴 답이 표를 늘리지 않도록 잘라서 보여 준다 (마우스를 올리면 전체가 보인다). */
function Clamped({
  text,
  max = 130,
  style,
}: {
  text: string;
  max?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      title={text}
      style={{
        display: "inline-block",
        maxWidth: max,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        verticalAlign: "bottom",
        ...style,
      }}
    >
      {text}
    </span>
  );
}

function FileLinks({ test }: { test: TestAnalysis }) {
  if (!test.files.length) {
    return <span style={{ color: T.muted, fontSize: 12.5 }}>—</span>;
  }
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {test.files.map((f) => (
        <a
          key={f.id}
          href={`/api/files/${f.id}`}
          target="_blank"
          rel="noreferrer"
          title={`${f.filename} · ${formatFileSize(f.size)}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "5px 10px",
            borderRadius: 999,
            border: `1px solid ${T.line}`,
            background: "#fff",
            color: T.primary,
            fontSize: 12.5,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <Download size={13} />
          {FILE_KIND_LABEL[f.kind]}
        </a>
      ))}
    </div>
  );
}

/** 과제 수행 (O/△/X) — 점수 카드 아래에 붙는다 */
function HomeworkRow({
  hwDone,
  hwSsen,
}: {
  hwDone: number | null;
  hwSsen: number | null;
}) {
  const items: [string, number][] = [];
  if (hwDone != null) items.push(["과제(프린트)", hwDone]);
  if (hwSsen != null) items.push(["과제(부교재)", hwSsen]);
  if (!items.length) return null;

  const mark = (v: number) => (v === 1 ? "O" : v === 0.5 ? "△" : "X");
  const tone = (v: number) => (v === 1 ? T.ok : v === 0.5 ? T.warn : T.bad);
  const soft = (v: number) => (v === 1 ? T.okSoft : v === 0.5 ? T.warnSoft : T.badSoft);

  return (
    <Card style={{ padding: "12px 16px", marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.sub }}>과제 진행</span>
        {items.map(([label, v]) => (
          <span
            key={label}
            style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
          >
            <span style={{ fontSize: 13.5, color: T.sub }}>{label}</span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 26,
                height: 26,
                borderRadius: 8,
                background: soft(v),
                color: tone(v),
                fontWeight: 900,
                fontSize: 14,
              }}
            >
              {mark(v)}
            </span>
          </span>
        ))}
      </div>
    </Card>
  );
}

/* ============================== 회차 상세 ============================== */
/** 좁은 화면(휴대폰)인지. 문자로 받은 링크는 대부분 휴대폰에서 열린다. */
function useNarrow(maxWidth = 720): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [maxWidth]);
  return narrow;
}

/** 휴대폰에서 보는 문항 목록 — 가로 스크롤 대신 문항마다 카드 한 장. */
function QuestionCards({ rows }: { rows: QuestionAnalysis[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((q) => (
        <div
          key={q.label}
          style={{
            border: `1px solid ${T.line}`,
            borderRadius: 12,
            padding: "11px 12px",
            background: "#fff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 900, color: T.ink }}>{q.label}번</span>
            <span
              style={{
                fontSize: 15,
                fontWeight: 900,
                color: q.myCorrect ? T.ok : T.bad,
              }}
            >
              {q.myCorrect ? "O" : "X"}
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: T.muted }}>배점 {q.points}</span>
          </div>

          <div style={{ fontSize: 13.5, color: q.type ? T.ink : T.muted, marginTop: 4 }}>
            {q.type || "유형 미입력"}
          </div>

          <div
            style={{
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              fontSize: 13,
              marginTop: 8,
            }}
          >
            <span style={{ color: T.sub }}>
              정답{" "}
              <b style={{ color: T.ok }}>{displayAnswer(q.answer) || "—"}</b>
            </span>
            <span style={{ color: T.sub }}>
              나의 답안{" "}
              <b style={{ color: q.myAnswered ? (q.myCorrect ? T.ink : T.bad) : T.muted }}>
                {q.myExcluded ? "시험 제외" : q.myAnswered ? q.myAnswer : "무응답"}
              </b>
            </span>
          </div>

          <div
            style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}
          >
            <span style={{ fontSize: 12, color: T.sub, whiteSpace: "nowrap" }}>
              전체 정답률
            </span>
            <div
              style={{
                flex: 1,
                height: 8,
                background: T.badSoft,
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${q.correctRate}%`,
                  height: "100%",
                  background:
                    q.correctRate >= 70 ? T.ok : q.correctRate >= 40 ? T.warn : T.bad,
                }}
              />
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: T.sub }}>
              {q.correctRate}%
            </span>
          </div>

          {!!q.choiceShares.length && (
            <div style={{ marginTop: 9 }}>
              <div style={{ fontSize: 12, color: T.sub, marginBottom: 5 }}>답안 분포</div>
              <ChoiceBars q={q} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function TestDetail({
  test,
  hideFiles = false,
  order = "no",
}: {
  test: TestAnalysis;
  /** 공유 링크 화면처럼 로그인 없이 보는 곳에서는 시험지·답지 내려받기를 감춘다. */
  hideFiles?: boolean;
  /** 문항 순서: 문번 순(기본) 또는 정답률 낮은 순 */
  order?: "wrongRank" | "no";
}) {
  const rows = useMemo(
    () =>
      [...test.questions].sort((a, b) =>
        order === "no"
          ? a.no - b.no || a.part - b.part
          : a.wrongRank - b.wrongRank || a.no - b.no
      ),
    [test.questions, order]
  );
  const narrow = useNarrow();

  return (
    <Card style={{ padding: 18, marginTop: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>
          {formatDay(test.date)} {test.subject}
        </span>
        {test.pastExam && (
          <span title="학교 기출로 본 회차입니다. 유형별 강약점 집계에는 들어가지 않습니다.">
            <Pill tone="warn">기출</Pill>
          </span>
        )}
        {test.myPct != null && (
          <Pill tone={test.myPct >= 80 ? "ok" : test.myPct >= 50 ? "primary" : "bad"}>
            내 점수 {test.myScore}/{test.maxScore} ({test.myPct}점)
          </Pill>
        )}
        {test.myRank && (
          <Pill tone="muted">
            {test.myRank}등 / {test.participants}명
          </Pill>
        )}
        {test.detail && <Pill tone="muted">{test.detail}</Pill>}
        <div style={{ flex: 1 }} />
        {!hideFiles && <FileLinks test={test} />}
      </div>

      <div
        style={{
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          alignItems: "flex-start",
          marginBottom: 18,
        }}
      >
        <div style={{ flex: 1, minWidth: 280 }}>
          <Distribution test={test} />
        </div>
        <div style={{ minWidth: 260, flex: 1 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Stat
              label="내 점수"
              value={test.myPct ?? "—"}
              unit={test.myPct == null ? "" : "점"}
              tone={scoreTone(test.myPct)}
              hint={test.myPct == null ? "미응시" : `원점수 ${test.myScore}/${test.maxScore}`}
            />
            <Stat label="전체 평균" value={test.avg ?? "—"} unit="점" tone={T.sub} />
            <Stat label="최고점" value={test.best ?? "—"} unit="점" tone={T.ok} />
          </div>
          <HomeworkRow hwDone={test.myHwDone} hwSsen={test.myHwSsen} />
        </div>
      </div>

      {!test.hasKey ? (
        <div
          style={{
            padding: "14px 16px",
            background: "#F6F8FB",
            borderRadius: 10,
            fontSize: 13,
            color: T.sub,
          }}
        >
          이 회차는 문항별 답안이 등록되지 않아 점수 통계만 제공됩니다.
        </div>
      ) : narrow ? (
        <QuestionCards rows={rows} />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
            <thead>
              <tr>
                {[
                  "문번",
                  "유형",
                  "배점",
                  "정답",
                  "나의 답안",
                  "정오",
                  "전체 정답률",
                  "답안 분포",
                ].map((h) => (
                  <th key={h} style={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.label}>
                  <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>{q.label}</td>
                  <td
                    style={{
                      ...td,
                      whiteSpace: "normal",
                      minWidth: 120,
                      color: q.type ? T.ink : T.muted,
                    }}
                  >
                    {q.type || "—"}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>{q.points}</td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 700, color: T.ok }}>
                    <Clamped text={displayAnswer(q.answer) || "—"} />
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: "center",
                      fontWeight: 700,
                      color: q.myAnswered ? (q.myCorrect ? T.ink : T.bad) : T.muted,
                    }}
                  >
                    {q.myExcluded ? "시험 제외" : q.myAnswered ? q.myAnswer : "무응답"}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <span
                      style={{
                        fontWeight: 900,
                        fontSize: 15,
                        color: q.myExcluded ? T.muted : q.myCorrect ? T.ok : T.bad,
                      }}
                    >
                      {q.myExcluded ? "/" : q.myCorrect ? "O" : "X"}
                    </span>
                  </td>
                  <td style={{ ...td, minWidth: 128 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div
                        style={{
                          flex: 1,
                          height: 8,
                          background: T.badSoft,
                          borderRadius: 999,
                          overflow: "hidden",
                          minWidth: 52,
                        }}
                      >
                        <div
                          style={{
                            width: `${q.correctRate}%`,
                            height: "100%",
                            background:
                              q.correctRate >= 70 ? T.ok : q.correctRate >= 40 ? T.warn : T.bad,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.sub }}>
                        {q.correctRate}%
                      </span>
                    </div>
                  </td>
                  <td style={td}>
                    <ChoiceBars q={q} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ============================== 탭 1: 테스트별 성적 ============================== */
export function TestScoresTab({
  tests,
  subject,
  setSubject,
  subjects,
  date,
  setDate,
  who,
}: {
  tests: TestAnalysis[];
  subject: string;
  setSubject: (s: string) => void;
  subjects: string[];
  date: string;
  setDate: (d: string) => void;
  /** 화면 상단에 보여줄 "이름 · 학교 · 학년" */
  who?: { name: string; school?: string; grade?: string };
}) {
  const rows = useMemo(
    () => tests.filter((t) => t.subject === subject),
    [tests, subject]
  );

  const selected = rows.find((t) => t.date === date) ?? rows[rows.length - 1] ?? null;
  const myPcts = rows.filter((t) => t.myPct != null).map((t) => t.myPct as number);
  const avgMine = myPcts.length
    ? Math.round(myPcts.reduce((a, p) => a + p, 0) / myPcts.length)
    : null;
  const classAvgs = rows.filter((t) => t.avg != null).map((t) => t.avg as number);
  const avgClass = classAvgs.length
    ? Math.round(classAvgs.reduce((a, p) => a + p, 0) / classAvgs.length)
    : null;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <SectionTitle noMargin>테스트 성적</SectionTitle>
        {who?.name && (
          <span style={{ fontSize: 15, fontWeight: 700, color: T.sub }}>
            {[who.name, who.school, who.grade].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <Card style={{ padding: 8 }}>
          <Empty icon={<BarChart3 size={28} />} text="아직 등록된 테스트 결과가 없습니다" />
        </Card>
      ) : (
        <>
          {/* 고른 회차의 상세 결과 (위) */}
          {selected && <TestDetail test={selected} />}

          {/* 지금까지의 성적 (아래) */}
          <div style={{ marginTop: 26 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>
                지금까지의 테스트 성적
              </span>
              <span style={{ fontSize: 12.5, color: T.muted }}>
                {subject} · 전체 {rows.length}회
              </span>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <Stat label="응시 회차" value={myPcts.length} unit="회" />
              <Stat
                label="내 평균"
                value={avgMine ?? "—"}
                unit={avgMine == null ? "" : "점"}
                tone={scoreTone(avgMine)}
              />
              <Stat label="반 평균" value={avgClass ?? "—"} unit="점" tone={T.sub} />
              <Stat
                label="최고 점수"
                value={myPcts.length ? Math.max(...myPcts) : "—"}
                unit={myPcts.length ? "점" : ""}
                tone={T.ok}
              />
            </div>

            <Card style={{ overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                  <thead>
                    <tr>
                      {[
                        "실시일",
                        "내 점수",
                        "100점 환산",
                        "클리닉 출결",
                        "전체 평균",
                        "최고점",
                        "등수",
                        "시험지 · 답지",
                      ].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows].reverse().map((t) => {
                      const on = selected?.date === t.date;
                      return (
                        <tr
                          key={t.date}
                          onClick={() => setDate(t.date)}
                          title="이 회차 결과 보기"
                          style={{
                            background: on ? T.primarySoft : undefined,
                            cursor: "pointer",
                          }}
                        >
                          <td
                            style={{
                              ...td,
                              fontWeight: 800,
                              color: on ? T.primary : T.ink,
                            }}
                          >
                            {formatDay(t.date)}
                            {t.pastExam && (
                              <span
                                style={{
                                  marginLeft: 6,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: T.warn,
                                }}
                                title="학교 기출 회차"
                              >
                                기출
                              </span>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: "center" }}>
                            {t.myScore == null ? (
                              <span style={{ color: T.muted }}>미응시</span>
                            ) : (
                              <>
                                {t.myScore}
                                <span style={{ color: T.muted }}> / {t.maxScore}</span>
                              </>
                            )}
                          </td>
                          <td
                            style={{
                              ...td,
                              textAlign: "center",
                              fontWeight: 800,
                              color: scoreTone(t.myPct),
                            }}
                          >
                            {t.myPct == null ? "—" : `${t.myPct}점`}
                          </td>
                          <td style={{ ...td, textAlign: "center" }}>
                            {t.myAttendance ? (
                              <Pill
                                tone={
                                  t.myAttendance === "출석"
                                    ? "ok"
                                    : t.myAttendance === "지각"
                                    ? "warn"
                                    : "bad"
                                }
                              >
                                {t.myAttendance}
                              </Pill>
                            ) : (
                              <span style={{ color: T.muted }}>—</span>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: "center", color: T.sub }}>
                            {t.avg}점
                          </td>
                          <td
                            style={{ ...td, textAlign: "center", color: T.ok, fontWeight: 700 }}
                          >
                            {t.best}점
                          </td>
                          <td style={{ ...td, textAlign: "center", color: T.sub }}>
                            {t.myRank ? `${t.myRank} / ${t.participants}` : "—"}
                          </td>
                          <td style={td} onClick={(e) => e.stopPropagation()}>
                            <FileLinks test={t} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: "10px 14px", fontSize: 12, color: T.muted }}>
                회차를 누르면 위에서 그 회차의 자세한 결과를 볼 수 있습니다.
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================== 탭 2: 문항별 분석 ============================== */
export function QuestionAnalysisTab({
  tests,
  subject,
  date,
  setDate,
  typeOrder = [],
  bookmarks,
  onToggleBookmark,
  canBookmark,
}: {
  tests: TestAnalysis[];
  subject: string;
  /** 회차는 "테스트 성적" 탭과 마찬가지로 화면 맨 위(학기 줄)에서 고른다. */
  date: string;
  setDate: (d: string) => void;
  typeOrder?: string[];
  bookmarks: Set<string>;
  onToggleBookmark: (row: { subject: string; date: string; label: string }, on: boolean) => void;
  canBookmark: boolean;
}) {
  const [viewer, setViewer] = useState<{
    title: string;
    fileId: string;
    rects: RegionRect[];
  } | null>(null);
  // 유형별 강약점 표 정렬 (머리글 클릭)
  const { sort: typeSort, onSort: onTypeSort } = useSort("mine", "asc", {
    count: "desc",
    cls: "asc",
    gap: "asc",
  });
  const rows = useMemo(
    () => tests.filter((t) => t.subject === subject && t.hasKey),
    [tests, subject]
  );
  const test = rows.find((t) => t.date === date) ?? rows[rows.length - 1] ?? null;

  // 유형별 강약점 (이 반 전 회차 통합)
  const byType = useMemo(() => {
    const map = new Map<
      string,
      { type: string; count: number; mineCorrect: number; classRate: number[] }
    >();
    for (const t of rows) {
      // 기출 회차는 유형이 단원이 아니라 "OO고 기출" 이라 강약점 집계에 넣지 않는다.
      if (t.pastExam) continue;
      for (const q of t.questions) {
        if (t.myPct == null || q.myExcluded) continue;
        const key = q.type || "미분류";
        const cur = map.get(key) ?? { type: key, count: 0, mineCorrect: 0, classRate: [] };
        cur.count += 1;
        if (q.myCorrect) cur.mineCorrect += 1;
        cur.classRate.push(q.correctRate);
        map.set(key, cur);
      }
    }
    const rank = typeRank(typeOrder);
    const sign = dirSign(typeSort.dir);
    return [...map.values()]
      .map((v) => {
        const mine = Math.round((v.mineCorrect / v.count) * 100);
        const cls = Math.round(v.classRate.reduce((a, r) => a + r, 0) / v.classRate.length);
        return { type: v.type, count: v.count, mine, cls, gap: mine - cls };
      })
      .sort((a, b) => {
        const by =
          typeSort.key === "type"
            ? rank(a.type) - rank(b.type) || a.type.localeCompare(b.type, "ko")
            : typeSort.key === "count"
            ? a.count - b.count
            : typeSort.key === "cls"
            ? a.cls - b.cls
            : typeSort.key === "gap"
            ? a.gap - b.gap
            : a.mine - b.mine;
        return by * sign || a.type.localeCompare(b.type, "ko");
      });
  }, [rows, typeSort, typeOrder]);

  const marks = test?.myMarks ?? {};
  const starred = (label: string) =>
    !!test && bookmarks.has(bookmarkKey({ subject, date: test.date, label }));

  return (
    <div>
      <SectionTitle>문항별 분석</SectionTitle>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 14,
          alignItems: "center",
        }}
      >
        {test && <FileLinks test={test} />}
      </div>

      {!test ? (
        <Card style={{ padding: 8 }}>
          <Empty icon={<Target size={28} />} text="문항 정보가 등록된 테스트가 없습니다" />
        </Card>
      ) : (
        <>
          <Card style={{ overflow: "hidden", marginBottom: 16 }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: 34 }} />
                    {[
                      "문번",
                      "출제 단원 (유형)",
                      "채점표",
                      "배점",
                      "난이도",
                      "전체 정답률",
                      "문제 · 해설",
                    ].map((h) => (
                      <th key={h} style={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {test.questions.map((q) => {
                    // 부분문제 행은 그 문항 자체의 정오, 주 문항은 O/△/X 채점표를 쓴다.
                    const mark = q.myExcluded
                      ? "/"
                      : q.part
                      ? q.myCorrect
                        ? "O"
                        : "X"
                      : marks[q.no] ?? (q.myCorrect ? "O" : "X");
                    const markColor =
                      mark === "O"
                        ? T.ok
                        : mark === "△"
                        ? T.warn
                        : mark === "-" || mark === "/"
                        ? T.muted
                        : T.bad;
                    return (
                      <tr key={q.label}>
                        <td style={{ ...td, textAlign: "center", width: 34 }}>
                          <StarButton
                            on={starred(q.label)}
                            canBookmark={canBookmark}
                            onToggle={() =>
                              onToggleBookmark(
                                { subject, date: test.date, label: q.label },
                                !starred(q.label)
                              )
                            }
                          />
                        </td>
                        <td style={{ ...td, fontWeight: 800 }}>{q.label}</td>
                        <td style={{ ...td, whiteSpace: "normal", minWidth: 150 }}>
                          {q.type || <span style={{ color: T.muted }}>—</span>}
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <span style={{ fontWeight: 900, fontSize: 16, color: markColor }}>
                            {mark}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>{q.points}</td>
                        <td style={{ ...td, textAlign: "center" }}>
                          {q.difficulty ? (
                            <Pill tone={difficultyTone(q.difficulty)}>
                              {q.difficulty}
                            </Pill>
                          ) : (
                            <span style={{ color: T.muted }}>—</span>
                          )}
                        </td>
                        <td style={{ ...td, minWidth: 140 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <div
                              style={{
                                flex: 1,
                                height: 8,
                                background: T.badSoft,
                                borderRadius: 999,
                                overflow: "hidden",
                                minWidth: 56,
                              }}
                            >
                              <div
                                style={{
                                  width: `${q.correctRate}%`,
                                  height: "100%",
                                  background:
                                    q.correctRate >= 70
                                      ? T.ok
                                      : q.correctRate >= 40
                                      ? T.warn
                                      : T.bad,
                                }}
                              />
                            </div>
                            <span style={{ fontSize: 12.5, fontWeight: 800, color: T.sub }}>
                              {q.correctRate}%
                            </span>
                          </div>
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          <WrongNoteActions
                            wrong={{ ...q, date: test.date, files: test.files }}
                            onOpen={(title, fileId, rects) =>
                              setViewer({ title, fileId, rects })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 14px", fontSize: 12, color: T.muted }}>
              채점표 O = 정답 · △ = 부분문제 일부 정답 · X = 오답 · − = 미응시 ·
              ★ 를 누르면 오답 노트의 <b>별표만</b> 보기에 모입니다.
            </div>
          </Card>

          <Modal
            open={!!viewer}
            onClose={() => setViewer(null)}
            title={viewer?.title ?? ""}
            width={760}
          >
            {viewer && (
              <PdfRegionView fileId={viewer.fileId} rects={viewer.rects} width={700} />
            )}
          </Modal>

          {byType.length > 0 && (
            <Card style={{ padding: 18 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 14.5, fontWeight: 800, color: T.ink }}>
                  유형별 강약점 ({subject} · 전 회차 누적)
                </span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: T.muted }}>
                  표 상단을 누르면 해당 기준으로 정렬됩니다 (한 번 더 누르면 반대 순서)
                </span>
              </div>
              {typeSort.key === "type" && typeOrder.length === 0 && (
                <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 8 }}>
                  단원 순서가 아직 설정되지 않아 이름순으로 보여 줍니다.
                </div>
              )}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                  <thead>
                    <tr>
                      <SortTh
                        label="출제 단원 (유형)"
                        sortKey="type"
                        sort={typeSort}
                        onSort={onTypeSort}
                        align="left"
                        hint="단원 순서(관리자 설정)대로 정렬"
                      />
                      <SortTh label="문항 수" sortKey="count" sort={typeSort} onSort={onTypeSort} />
                      <SortTh label="내 정답률" sortKey="mine" sort={typeSort} onSort={onTypeSort} />
                      <SortTh label="전체 정답률" sortKey="cls" sort={typeSort} onSort={onTypeSort} />
                      <SortTh label="차이" sortKey="gap" sort={typeSort} onSort={onTypeSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {byType.map((r) => (
                      <tr key={r.type}>
                        <td style={{ ...td, whiteSpace: "normal" }}>{r.type}</td>
                        <td style={{ ...td, textAlign: "center", color: T.sub }}>{r.count}</td>
                        <td
                          style={{
                            ...td,
                            textAlign: "center",
                            fontWeight: 800,
                            color: scoreTone(r.mine),
                          }}
                        >
                          {r.mine}%
                        </td>
                        <td style={{ ...td, textAlign: "center", color: T.sub }}>{r.cls}%</td>
                        <td
                          style={{
                            ...td,
                            textAlign: "center",
                            fontWeight: 700,
                            color: r.gap >= 0 ? T.ok : T.bad,
                          }}
                        >
                          {r.gap > 0 ? `+${r.gap}` : r.gap}%p
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ============================== 공통: 정렬 가능한 표 머리글 ============================== */
export type SortDir = "asc" | "desc";

/** 머리글을 누르면 그 기준으로 정렬하고, 다시 누르면 오름/내림이 바뀐다. */
function SortTh({
  label,
  sortKey,
  sort,
  onSort,
  align = "center",
  width,
  hint,
}: {
  label: string;
  sortKey: string;
  sort: { key: string; dir: SortDir };
  onSort: (key: string) => void;
  align?: "left" | "center";
  width?: number;
  hint?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th style={{ ...th, padding: 0, width }}>
      <button
        onClick={() => onSort(sortKey)}
        title={hint ?? `${label} 기준으로 정렬`}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: align === "left" ? "flex-start" : "center",
          gap: 4,
          padding: "10px 10px",
          border: "none",
          background: active ? T.primarySoft : "transparent",
          color: active ? T.primary : T.sub,
          font: "inherit",
          fontSize: 12,
          fontWeight: 800,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {label}
        <span
          style={{
            display: "inline-flex",
            flexDirection: "column",
            lineHeight: 0.62,
            fontSize: 8.5,
            color: active ? T.primary : "#B9C3D4",
          }}
        >
          <span style={{ opacity: !active || sort.dir === "asc" ? 1 : 0.25 }}>▲</span>
          <span style={{ opacity: !active || sort.dir === "desc" ? 1 : 0.25 }}>▼</span>
        </span>
      </button>
    </th>
  );
}

/** 머리글 클릭 → 같은 기준이면 방향 전환, 다른 기준이면 기본 방향으로. */
function useSort(initialKey: string, initialDir: SortDir, defaultDirs: Record<string, SortDir> = {}) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({
    key: initialKey,
    dir: initialDir,
  });
  const onSort = (key: string) =>
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultDirs[key] ?? "asc" }
    );
  return { sort, onSort, setSort };
}

const dirSign = (dir: SortDir) => (dir === "asc" ? 1 : -1);

const filterLabel: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 800,
  color: T.sub,
  marginRight: 2,
};

/** 과목이 여러 개일 때만 나오는 과목 전환기. */
function SubjectSwitch({
  subjects,
  value,
  onChange,
}: {
  subjects: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (subjects.length <= 1) return null;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={filterLabel}>과목</span>
      <SubjectPicker subjects={subjects} value={value} onChange={onChange} />
    </div>
  );
}

/* ============================== 공통: 유형 선택 ============================== */
/** 유형이 10~20개가 되어도 고르기 쉬운 검색형 다중 선택. */
function TypeFilter({
  counts,
  selected,
  onChange,
}: {
  counts: { type: string; count: number }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = counts.filter((c) => !q || c.type.includes(q.trim()));

  const toggle = (type: string) => {
    const next = new Set(selected);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange(next);
  };

  const label = selected.size === 0 ? "전체 유형" : `유형 ${selected.size}개 선택`;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          ...inputBase,
          width: "auto",
          minWidth: 148,
          padding: "8px 12px",
          textAlign: "left",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontWeight: selected.size ? 800 : 500,
          color: selected.size ? T.primary : T.ink,
          borderColor: selected.size ? T.primary : T.line,
        }}
      >
        <Filter size={14} />
        {label}
        <ChevronDown size={14} style={{ marginLeft: "auto" }} />
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              zIndex: 41,
              width: 268,
              background: "#fff",
              border: `1px solid ${T.line}`,
              borderRadius: 12,
              boxShadow: "0 12px 30px rgba(20,28,45,.16)",
              padding: 10,
            }}
          >
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="유형 검색"
              style={{ ...inputBase, padding: "8px 10px", marginBottom: 8 }}
            />
            <div style={{ maxHeight: 250, overflowY: "auto" }}>
              {shown.length === 0 && (
                <div style={{ padding: 10, fontSize: 13, color: T.muted }}>
                  검색 결과가 없습니다
                </div>
              )}
              {shown.map((c) => {
                const on = selected.has(c.type);
                return (
                  <label
                    key={c.type}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 8px",
                      borderRadius: 8,
                      cursor: "pointer",
                      background: on ? T.primarySoft : "transparent",
                      fontSize: 13.5,
                      color: T.ink,
                    }}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggle(c.type)} />
                    <span
                      style={{
                        flex: 1,
                        fontWeight: on ? 700 : 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.type}
                    </span>
                    <span style={{ color: T.muted, fontSize: 12 }}>{c.count}</span>
                  </label>
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                justifyContent: "space-between",
                marginTop: 8,
                paddingTop: 8,
                borderTop: `1px solid ${T.line}`,
              }}
            >
              <Btn variant="ghost" size="xs" onClick={() => onChange(new Set())}>
                전체 해제
              </Btn>
              <Btn variant="soft" size="xs" onClick={() => setOpen(false)}>
                닫기
              </Btn>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================== 공통: 페이지 넘김 ============================== */
function Pager({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  const window = 5;
  let from = Math.max(1, page - Math.floor(window / 2));
  const to = Math.min(pageCount, from + window - 1);
  from = Math.max(1, to - window + 1);
  const nums = Array.from({ length: to - from + 1 }, (_, i) => from + i);

  const cell = (active: boolean): React.CSSProperties => ({
    minWidth: 34,
    height: 34,
    padding: "0 9px",
    borderRadius: 9,
    border: `1px solid ${active ? T.primary : T.line}`,
    background: active ? T.primary : "#fff",
    color: active ? "#fff" : T.sub,
    fontWeight: 800,
    fontSize: 13.5,
    cursor: "pointer",
  });

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        justifyContent: "center",
        alignItems: "center",
        padding: "14px 0 4px",
        flexWrap: "wrap",
      }}
    >
      <button style={cell(false)} disabled={page === 1} onClick={() => onPage(page - 1)}>
        ‹
      </button>
      {from > 1 && (
        <>
          <button style={cell(false)} onClick={() => onPage(1)}>
            1
          </button>
          {from > 2 && <span style={{ color: T.muted }}>…</span>}
        </>
      )}
      {nums.map((n) => (
        <button key={n} style={cell(n === page)} onClick={() => onPage(n)}>
          {n}
        </button>
      ))}
      {to < pageCount && (
        <>
          {to < pageCount - 1 && <span style={{ color: T.muted }}>…</span>}
          <button style={cell(false)} onClick={() => onPage(pageCount)}>
            {pageCount}
          </button>
        </>
      )}
      <button
        style={cell(false)}
        disabled={page === pageCount}
        onClick={() => onPage(page + 1)}
      >
        ›
      </button>
    </div>
  );
}

/** 문항 별표 버튼 (오답 노트·문항 분석에서 함께 쓴다) */
function StarButton({
  on,
  canBookmark,
  onToggle,
}: {
  on: boolean;
  canBookmark: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={() => canBookmark && onToggle()}
      disabled={!canBookmark}
      title={
        canBookmark
          ? on
            ? "별표 해제"
            : "다시 볼 문항으로 표시"
          : "별표는 학생 계정에서 표시합니다"
      }
      style={{
        border: "none",
        background: "transparent",
        cursor: canBookmark ? "pointer" : "default",
        padding: 2,
        lineHeight: 1,
        color: on ? T.accent : T.muted,
        opacity: canBookmark || on ? 1 : 0.45,
      }}
    >
      <Star size={17} fill={on ? T.accent : "none"} />
    </button>
  );
}

/* ============================== 탭 3: 오답 노트 ============================== */
const WRONG_PAGE_SIZE = 15;

type WrongRow = QuestionAnalysis & { date: string; files: FileMeta[]; pastExam?: boolean };

/** 난이도 정렬 기준 (쉬운 것 → 어려운 것) */
const DIFFICULTY_RANK: Record<string, number> = {
  최하: 0,
  하: 1,
  중: 2,
  상: 3,
  최상: 4,
};

export function WrongNoteTab({
  tests,
  subject,
  setSubject,
  subjects,
  termId,
  bookmarks,
  onToggleBookmark,
  canBookmark,
  typeOrder = [],
  studentName = "",
}: {
  tests: TestAnalysis[];
  subject: string;
  setSubject: (s: string) => void;
  subjects: string[];
  termId: string;
  typeOrder?: string[];
  studentName?: string;
  bookmarks: Set<string>;
  onToggleBookmark: (row: { subject: string; date: string; label: string }, on: boolean) => void;
  canBookmark: boolean;
}) {
  const [types, setTypes] = useState<Set<string>>(new Set());
  // 표 머리글을 눌러 정렬 (기본: 최신 회차부터)
  const { sort, onSort } = useSort("date", "desc", {
    rate: "asc",
    difficulty: "desc",
    points: "desc",
  });
  const [starredOnly, setStarredOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [help, setHelp] = useState(false);
  // 오답 PDF 만들기
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfKind, setPdfKind] = useState<"question" | "answer" | "both">("both");
  const [pdfBusy, setPdfBusy] = useState("");
  // 왼쪽 체크로 고른 문항 (비어 있으면 화면에 보이는 전체가 대상)
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const rowKey = (w: WrongRow) => `${w.date}|${w.label}`;
  const [viewer, setViewer] = useState<{
    title: string;
    fileId: string;
    rects: RegionRect[];
  } | null>(null);

  // 과목이 바뀌면 필터를 초기화한다 (오답 노트는 과목별로 따로 본다)
  useEffect(() => {
    setTypes(new Set());
    setStarredOnly(false);
    setPicked(new Set());
    setPage(1);
  }, [subject, termId]);

  // 이 과목의 모든 문항 (별표 보기에서는 맞힌 문항도 함께 볼 수 있다)
  const allRows = useMemo(() => {
    const out: WrongRow[] = [];
    for (const t of tests) {
      if (t.subject !== subject || !t.hasKey || t.myPct == null) continue;
      for (const q of t.questions) {
        if (q.myExcluded) continue; // 이 학생이 안 푸는 문항은 오답 노트에 담지 않는다
        out.push({ ...q, date: t.date, files: t.files, pastExam: t.pastExam });
      }
    }
    return out;
  }, [tests, subject]);

  const wrongs = useMemo(() => allRows.filter((r) => !r.myCorrect), [allRows]);
  const starred = useMemo(
    () => allRows.filter((r) => bookmarks.has(bookmarkKey({ ...r, subject }))),
    [allRows, bookmarks, subject]
  );
  const pool = starredOnly ? starred : wrongs;

  const typeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of pool) {
      const key = w.type || "미분류";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type, "ko"));
  }, [pool]);

  const starCount = starred.length;

  const filtered = useMemo(() => {
    const rows = pool.filter(
      (w) => !types.size || types.has(w.type || "미분류")
    );
    const byNo = (a: WrongRow, b: WrongRow) => a.no - b.no || a.part - b.part;
    const rank = typeRank(typeOrder);
    const sign = dirSign(sort.dir);
    return rows.sort((a, b) => {
      const by =
        sort.key === "no"
          ? byNo(a, b)
          : sort.key === "type"
          ? rank(a.type || "미분류") - rank(b.type || "미분류") ||
            (a.type || "미분류").localeCompare(b.type || "미분류", "ko")
          : sort.key === "difficulty"
          ? (DIFFICULTY_RANK[a.difficulty] ?? -1) - (DIFFICULTY_RANK[b.difficulty] ?? -1)
          : sort.key === "rate"
          ? a.correctRate - b.correctRate
          : sort.key === "points"
          ? a.points - b.points
          : a.date.localeCompare(b.date);
      return by * sign || b.date.localeCompare(a.date) || byNo(a, b);
    });
  }, [pool, types, sort, subject, typeOrder]);

  const allPicked =
    filtered.length > 0 && filtered.every((w) => picked.has(rowKey(w)));

  // PDF 대상: 체크한 문항이 있으면 그것만, 없으면 조건에 걸린 전체
  const pdfTargets = useMemo(
    () => (picked.size ? filtered.filter((w) => picked.has(rowKey(w))) : filtered),
    [filtered, picked]
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / WRONG_PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice(
    (current - 1) * WRONG_PAGE_SIZE,
    current * WRONG_PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [types, sort, starredOnly]);

  const star = (w: WrongRow) => {
    const on = bookmarks.has(bookmarkKey({ subject, date: w.date, label: w.label }));
    return (
      <StarButton
        on={on}
        canBookmark={canBookmark}
        onToggle={() =>
          onToggleBookmark({ subject, date: w.date, label: w.label }, !on)
        }
      />
    );
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <SectionTitle noMargin>오답 노트</SectionTitle>
        <span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>
          {subject} · {starredOnly ? `별표 ${starred.length}문항` : `틀린 문항 ${wrongs.length}개`}
        </span>
        <div style={{ flex: 1 }} />
        <Btn
          variant="outline"
          size="sm"
          disabled={filtered.length === 0}
          onClick={() => setPdfOpen(true)}
          title="지금 화면에 걸린 조건대로 오답만 모아 PDF 로 만듭니다"
        >
          <FileDown size={14} /> 오답 PDF
        </Btn>
        <Btn variant="outline" size="sm" onClick={() => setHelp(true)}>
          <HelpCircle size={14} /> 오답 노트란?
        </Btn>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <SubjectSwitch subjects={subjects} value={subject} onChange={setSubject} />
        <TypeFilter counts={typeCounts} selected={types} onChange={setTypes} />
        <Btn
          variant={starredOnly ? "primary" : "outline"}
          size="sm"
          onClick={() => setStarredOnly((v) => !v)}
        >
          <Star size={14} fill={starredOnly ? "#fff" : "none"} />
          별표만 {starCount > 0 && `(${starCount})`}
        </Btn>
        {(types.size > 0 || starredOnly) && (
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => {
              setTypes(new Set());
              setStarredOnly(false);
            }}
          >
            필터 해제
          </Btn>
        )}
        <Btn
          variant={allPicked ? "primary" : "outline"}
          size="sm"
          disabled={filtered.length === 0}
          onClick={() =>
            setPicked(allPicked ? new Set() : new Set(filtered.map(rowKey)))
          }
          title="쪽을 넘기지 않아도 지금 조건의 문항을 한 번에 고릅니다"
        >
          <CheckSquare size={14} />
          {allPicked ? "전체 해제" : "전체 선택"}
          {picked.size > 0 && ` (${picked.size})`}
        </Btn>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: T.muted }}>
          표 상단을 누르면 해당 기준으로 정렬됩니다
        </span>
        <span style={{ fontSize: 12.5, color: T.sub, fontWeight: 700 }}>
          {filtered.length}문항
          {pageCount > 1 && ` · ${current}/${pageCount} 쪽`}
        </span>
      </div>

      {filtered.length === 0 ? (
        <Card style={{ padding: 8 }}>
          <Empty
            icon={<AlertTriangle size={28} />}
            text={
              starredOnly
                ? "별표한 문항이 없습니다"
                : wrongs.length
                ? "조건에 맞는 오답이 없습니다"
                : "틀린 문항이 없습니다"
            }
          />
        </Card>
      ) : (
        <>
          <Card style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: 36 }} />
                    <th style={{ ...th, width: 34 }} />
                    <SortTh label="회차" sortKey="date" sort={sort} onSort={onSort} align="left" />
                    <SortTh label="문번" sortKey="no" sort={sort} onSort={onSort} />
                    <SortTh
                      label="출제 단원 (유형)"
                      sortKey="type"
                      sort={sort}
                      onSort={onSort}
                      align="left"
                      hint="단원 순서(관리자 설정)대로 정렬"
                    />
                    <SortTh label="난이도" sortKey="difficulty" sort={sort} onSort={onSort} />
                    <th style={th}>정답</th>
                    <th style={th}>나의 답안</th>
                    <SortTh label="전체 정답률" sortKey="rate" sort={sort} onSort={onSort} />
                    <SortTh label="배점" sortKey="points" sort={sort} onSort={onSort} />
                    <th style={th}>문제 · 해설</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((w) => (
                    <tr
                      key={`${w.date}-${w.label}`}
                      style={{
                        background: picked.has(rowKey(w)) ? T.primarySoft : undefined,
                      }}
                    >
                      <td style={{ ...td, textAlign: "center", width: 36 }}>
                        <input
                          type="checkbox"
                          checked={picked.has(rowKey(w))}
                          onChange={() =>
                            setPicked((prev) => {
                              const next = new Set(prev);
                              const k = rowKey(w);
                              next.has(k) ? next.delete(k) : next.add(k);
                              return next;
                            })
                          }
                          style={{ width: 16, height: 16, cursor: "pointer" }}
                        />
                      </td>
                      <td style={{ ...td, textAlign: "center", width: 34 }}>{star(w)}</td>
                      <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {formatDay(w.date)}
                        {w.pastExam && (
                          <span
                            style={{ marginLeft: 5, fontSize: 11, fontWeight: 700, color: T.warn }}
                            title="학교 기출 회차"
                          >
                            기출
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, fontWeight: 800 }}>{w.label}</td>
                      <td style={{ ...td, whiteSpace: "normal", minWidth: 140 }}>
                        {w.type || <span style={{ color: T.muted }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: "center", color: T.sub }}>
                        {w.difficulty || "—"}
                      </td>
                      <td style={{ ...td, textAlign: "center", fontWeight: 800, color: T.ok }}>
                        <Clamped text={displayAnswer(w.answer)} max={120} />
                      </td>
                      <td
                        style={{
                          ...td,
                          textAlign: "center",
                          fontWeight: 700,
                          color: w.myCorrect ? T.ok : T.bad,
                        }}
                      >
                        <Clamped text={w.myAnswered ? w.myAnswer : "미제출"} max={120} />
                      </td>
                      <td
                        style={{
                          ...td,
                          textAlign: "center",
                          fontWeight: 700,
                          color: w.correctRate >= 70 ? T.bad : T.sub,
                        }}
                      >
                        {w.correctRate}%
                      </td>
                      <td style={{ ...td, textAlign: "center", color: T.sub }}>{w.points}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <WrongNoteActions
                          wrong={w}
                          onOpen={(title, fileId, rects) =>
                            setViewer({ title, fileId, rects })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Pager page={current} pageCount={pageCount} onPage={setPage} />
        </>
      )}

      <Modal
        open={pdfOpen}
        onClose={() => !pdfBusy && setPdfOpen(false)}
        title="오답 PDF 만들기"
        width={540}
      >
        <div style={{ fontSize: 14, color: T.ink, lineHeight: 1.75, marginBottom: 16 }}>
          선택한 문항을 모아 PDF 파일로 만듭니다.
          <br />
          왼쪽 칸을 체크해두면 체크한 문항만 담고, 아무것도 체크하지 않으면 조건에 해당하는
          문항 전체를 담습니다.
          <div
            style={{
              marginTop: 10,
              padding: "9px 12px",
              background: T.primarySoft,
              borderRadius: 9,
              fontSize: 13.5,
              fontWeight: 700,
              color: T.primary,
            }}
          >
            이번에 담길 문항 {pdfTargets.length}개
            {picked.size > 0 ? " (체크한 문항)" : " (조건에 해당하는 전체)"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {(
            [
              ["both", "문제지 + 해설지 (파일 2개)", "문제지와 해설지를 따로 받습니다."],
              ["question", "문제지만", ""],
              ["answer", "해설지만", ""],
            ] as const
          ).map(([k, title, desc]) => (
            <label
              key={k}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "11px 13px",
                borderRadius: 11,
                border: `1px solid ${pdfKind === k ? T.primary : T.line}`,
                background: pdfKind === k ? T.primarySoft : "#fff",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="pdfKind"
                checked={pdfKind === k}
                onChange={() => setPdfKind(k)}
                style={{ marginTop: 3 }}
              />
              <span>
                <span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{title}</span>
                {desc && (
                  <>
                    <br />
                    <span style={{ fontSize: 12.5, color: T.sub }}>{desc}</span>
                  </>
                )}
              </span>
            </label>
          ))}
        </div>

        {pdfBusy && (
          <div style={{ fontSize: 13, color: T.primary, fontWeight: 700, marginBottom: 10 }}>
            {pdfBusy}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="outline" size="sm" disabled={!!pdfBusy} onClick={() => setPdfOpen(false)}>
            취소
          </Btn>
          <Btn
            size="sm"
            disabled={!!pdfBusy || pdfTargets.length === 0}
            onClick={async () => {
              try {
                const { buildWrongNotePdf } = await import("@/lib/wrong-pdf");
                const items = pdfTargets.map((w) => {
                  const { question, answer } = pickRegions(w.regions);
                  return {
                    title: `${formatDay(w.date)} ${w.label}번${w.type ? ` · ${w.type}` : ""}`,
                    question: question ?? undefined,
                    answer: answer ?? undefined,
                  };
                });
                const kinds: ("question" | "answer")[] =
                  pdfKind === "both" ? ["question", "answer"] : [pdfKind];
                const missing = new Set<string>();
                for (const mode of kinds) {
                  setPdfBusy(
                    `${mode === "question" ? "문제지" : "해설지"} 만드는 중… 0/${items.length}`
                  );
                  const res = await buildWrongNotePdf(items, {
                    subject,
                    studentName,
                    mode,
                    onProgress: (d, t) =>
                      setPdfBusy(
                        `${mode === "question" ? "문제지" : "해설지"} 만드는 중… ${d}/${t}`
                      ),
                  });
                  res.skipped.forEach((x) => missing.add(x));
                }
                setPdfBusy("");
                setPdfOpen(false);
                if (missing.size) {
                  alert(
                    `자료가 없어 빠진 문항 ${missing.size}개:\n` +
                      [...missing].slice(0, 10).join("\n")
                  );
                }
              } catch (e: any) {
                setPdfBusy("");
                alert(e?.message || "PDF 를 만들지 못했습니다.");
              }
            }}
          >
            <FileDown size={14} /> {pdfBusy ? "만드는 중…" : "PDF 받기"}
          </Btn>
        </div>
      </Modal>

      <Modal open={help} onClose={() => setHelp(false)} title="오답 노트 사용법" width={560}>
        <div style={{ fontSize: 14, color: T.ink, lineHeight: 1.8 }}>
          <p style={{ marginTop: 0, fontWeight: 700 }}>틀린 문항만 모아 놓은 곳입니다.</p>
          <ul style={{ paddingLeft: 18, margin: "10px 0 0" }}>
            <li>
              <b>유형 선택</b> — 출제 단원을 골라 그 유형만 볼 수 있습니다(여러 개 선택 가능).
            </li>
            <li>
              <b>정렬</b> — 표 상단(회차·문번·단원·난이도·정답률·배점)을 누르면 해당 기준으로
              정렬되고, 한 번 더 누르면 오름/내림이 바뀝니다.
            </li>
            <li>
              <b>별표(★)</b> — 다시 볼 문항을 표시해 두면 <b>별표만</b> 버튼으로 모아 볼 수
              있습니다. 문항 분석 탭에서도 별표를 찍을 수 있고, 별표 보기에서는 맞힌 문항도
              함께 보입니다.
            </li>
            <li>
              <b>문제 · 답·해설</b> — 틀렸던 문제의 문제 / 해설을 볼 수 있습니다.
            </li>
            <li>
              <b>오답 PDF</b> — 왼쪽 칸을 체크해 고른 문항(또는 화면에 걸린 조건 전체)으로
              <b> 문제지</b>와 <b>해설지</b>를 만들어 받습니다.
            </li>
          </ul>
        </div>
      </Modal>

      <Modal
        open={!!viewer}
        onClose={() => setViewer(null)}
        title={viewer?.title ?? ""}
        width={760}
      >
        {viewer && (
          <PdfRegionView fileId={viewer.fileId} rects={viewer.rects} width={700} />
        )}
      </Modal>
    </div>
  );
}

/**
 * 오답 노트 행의 자료 버튼.
 * 문항 위치가 저장돼 있으면 그 문항만 잘라서 보여 주고,
 * 없으면 그 회차 시험지·해설지를 통째로 열 수 있게 한다.
 */
function WrongNoteActions({
  wrong,
  onOpen,
}: {
  wrong: WrongRow;
  onOpen: (title: string, fileId: string, rects: RegionRect[]) => void;
}) {
  const { question, answer } = pickRegions(wrong.regions);
  const paperFile = wrong.files?.find((f) => f.kind === "paper");
  const answerFile = wrong.files?.find((f) => f.kind === "answer");

  if (!question && !answer && !paperFile && !answerFile) {
    return <span style={{ color: T.muted, fontSize: 12 }}>—</span>;
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {question ? (
        <Btn
          size="xs"
          variant="soft"
          onClick={() =>
            onOpen(
              `${formatDay(wrong.date)} ${wrong.label}번 문제`,
              question.fileId,
              question.rects
            )
          }
        >
          문제
        </Btn>
      ) : (
        paperFile && (
          <a
            href={`/api/files/${paperFile.id}`}
            target="_blank"
            rel="noreferrer"
            title="이 회차 시험지 전체 보기"
            style={linkChip}
          >
            <Download size={12} /> 시험지
          </a>
        )
      )}
      {answer ? (
        <Btn
          size="xs"
          variant="outline"
          onClick={() =>
            onOpen(
              `${formatDay(wrong.date)} ${wrong.label}번 답 · 해설`,
              answer.fileId,
              answer.rects
            )
          }
        >
          답·해설
        </Btn>
      ) : (
        answerFile && (
          <a
            href={`/api/files/${answerFile.id}`}
            target="_blank"
            rel="noreferrer"
            title="이 회차 해설지 전체 보기"
            style={linkChip}
          >
            <Download size={12} /> 해설지
          </a>
        )
      )}
    </div>
  );
}

const pdfOptionRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  fontSize: 14,
  fontWeight: 700,
  color: T.ink,
  cursor: "pointer",
};

const linkChip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 9px",
  borderRadius: 999,
  border: `1px solid ${T.line}`,
  background: "#fff",
  color: T.primary,
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

/* ============================== 공통: 과목 선택 ============================== */
function SubjectPicker({
  subjects,
  value,
  onChange,
}: {
  subjects: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      style={{ ...inputBase, width: "auto", minWidth: 150, padding: "8px 12px" }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {subjects.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
