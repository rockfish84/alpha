// 주간 성적 카드 이미지 (문자에 붙일 JPG) — 브라우저에서 캔버스로 그린다.
// 서버에 이미지 라이브러리·한글 폰트를 두지 않아도 되고, 학부모는 문자만 보면 된다.
import { FONT, T } from "./constants";

export const CARD_WIDTH = 1500; // 솔라피 MMS 가로 한도(1500)를 꽉 채워 최대 해상도
export const CARD_MAX_HEIGHT = 1440; // 솔라피 MMS 세로 한도(1440)
const MAX_BYTES = 200 * 1024;

export interface CardRound {
  date: string; // YYYY-MM-DD
  subject: string;
  /** 100점 환산 점수 (미응시면 null) */
  score: number | null;
  average: number | null;
  best: number | null;
  rank: number | null;
  participants: number | null;
  /** 과제: 1(O) 0.5(△) 0(X) null(없음) */
  hwDone: number | null;
  hwSsen: number | null;
}

export interface CardWho {
  studentName: string;
  school?: string;
  grade?: string;
  academy?: string;
}

export interface CardData extends CardWho {
  rounds: CardRound[];
  /** 점수 추이 (오래된 → 최근) */
  trend: { date: string; score: number; average: number | null }[];
}

/** 회차 한 장짜리 카드 (그날 테스트 결과) */
export interface RoundCardData extends CardWho {
  round: CardRound;
  /** 반 전체 점수 (분포 막대용) */
  classScores: number[];
}

/** 추이 한 장짜리 카드 */
export interface TrendCardData extends CardWho {
  subject: string;
  trend: { date: string; score: number; average: number | null }[];
}

const BUCKETS: [string, number, number][] = [
  ["91~100", 91, 100],
  ["71~90", 71, 90],
  ["51~70", 51, 70],
  ["31~50", 31, 50],
  ["0~30", 0, 30],
];

const md = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${+m}/${+d}`;
};

const hwText = (v: number | null) =>
  v == null ? "—" : v === 1 ? "O" : v === 0.5 ? "△" : "X";

const scoreColor = (v: number | null) =>
  v == null ? T.muted : v >= 80 ? T.ok : v >= 60 ? T.primary : v >= 40 ? T.warn : T.bad;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 점수 추이 꺾은선 (내 점수 + 반 평균) */
function drawTrend(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  trend: CardData["trend"]
) {
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = T.line;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = T.ink;
  ctx.font = `bold 32px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("점수 추이 (100점 환산)", x + 28, y + 50);

  const padL = x + 90;
  const padR = x + w - 34;
  const top = y + 92;
  const bottom = y + h - 64;

  // 가로 눈금 0/50/100
  ctx.font = `24px ${FONT}`;
  ctx.textAlign = "right";
  for (const v of [0, 50, 100]) {
    const gy = bottom - (v / 100) * (bottom - top);
    ctx.strokeStyle = "#EDF0F5";
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(padR, gy);
    ctx.stroke();
    ctx.fillStyle = T.muted;
    ctx.fillText(String(v), padL - 12, gy + 8);
  }

  if (!trend.length) return;
  // 첫·마지막 점의 숫자가 눈금·테두리와 겹치지 않도록 안쪽으로 조금 들인다.
  const innerL = padL + 36;
  const innerR = padR - 36;
  const stepX = trend.length > 1 ? (innerR - innerL) / (trend.length - 1) : 0;
  const px = (i: number) => (trend.length > 1 ? innerL + stepX * i : (innerL + innerR) / 2);
  const py = (v: number) => bottom - (Math.max(0, Math.min(100, v)) / 100) * (bottom - top);

  // 반 평균 (회색 점선)
  if (trend.some((t) => t.average != null)) {
    ctx.strokeStyle = "#B9C3D4";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    trend.forEach((t, i) => {
      if (t.average == null) return;
      const X = px(i);
      const Y = py(t.average);
      i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 내 점수 (파란 실선 + 점 + 숫자)
  ctx.strokeStyle = T.primary;
  ctx.lineWidth = 4;
  ctx.beginPath();
  trend.forEach((t, i) => {
    const X = px(i);
    const Y = py(t.score);
    i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
  });
  ctx.stroke();

  ctx.textAlign = "center";
  trend.forEach((t, i) => {
    const X = px(i);
    const Y = py(t.score);
    ctx.fillStyle = T.primary;
    ctx.beginPath();
    ctx.arc(X, Y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `bold 28px ${FONT}`;
    ctx.fillText(String(t.score), X, Y - 22);
    ctx.fillStyle = T.muted;
    ctx.font = `24px ${FONT}`;
    ctx.fillText(md(t.date), X, bottom + 40);
  });
}

/** 회차 한 칸 (날짜·반·점수·평균·등수·과제) */
function drawRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: CardRound
) {
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = T.line;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = T.ink;
  ctx.font = `bold 24px ${FONT}`;
  ctx.fillText(`${md(r.date)} ${r.subject}`, x + 24, y + 42);

  // 점수
  ctx.textAlign = "right";
  ctx.fillStyle = scoreColor(r.score);
  ctx.font = `bold 46px ${FONT}`;
  ctx.fillText(r.score == null ? "미응시" : String(r.score), x + w - 24, y + 50);
  if (r.score != null) {
    ctx.fillStyle = T.muted;
    ctx.font = `18px ${FONT}`;
    ctx.fillText("점", x + w - 24, y + 76);
  }

  // 보조 정보
  ctx.textAlign = "left";
  ctx.fillStyle = T.sub;
  ctx.font = `19px ${FONT}`;
  const bits: string[] = [];
  if (r.average != null) bits.push(`반 평균 ${r.average}점`);
  if (r.best != null) bits.push(`최고 ${r.best}점`);
  if (r.rank && r.participants) bits.push(`${r.rank}등 / ${r.participants}명`);
  ctx.fillText(bits.join("   ·   "), x + 24, y + 78);

  if (r.hwDone != null || r.hwSsen != null) {
    const parts: string[] = [];
    if (r.hwDone != null) parts.push(`과제(프린트) ${hwText(r.hwDone)}`);
    if (r.hwSsen != null) parts.push(`과제(부교재) ${hwText(r.hwSsen)}`);
    ctx.fillStyle = T.sub;
    ctx.font = `19px ${FONT}`;
    ctx.fillText(parts.join("   ·   "), x + 24, y + 110);
  }
}

/** 성적 카드를 그려 JPEG data URL 로 돌려준다 (200KB 이하로 자동 압축). */
export function drawScoreCard(data: CardData): string {
  const pad = 28;
  const headerH = 96;
  const roundH = data.rounds.some((r) => r.hwDone != null || r.hwSsen != null)
    ? 132
    : 104;
  const trendH = data.trend.length >= 2 ? 300 : 0;
  const footerH = 54;
  const height = Math.min(
    CARD_MAX_HEIGHT,
    headerH + data.rounds.length * (roundH + 14) + (trendH ? trendH + 14 : 0) + footerH + pad
  );

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 만들 수 없습니다.");

  // 배경
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, CARD_WIDTH, height);

  // 머리말
  ctx.fillStyle = T.primary;
  ctx.fillRect(0, 0, CARD_WIDTH, headerH - 18);
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.font = `bold 30px ${FONT}`;
  ctx.fillText(`${data.studentName} 학생 성적`, pad, 52);
  ctx.font = `19px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,.82)";
  ctx.textAlign = "right";
  ctx.fillText(data.academy ?? "더브코 알파 클리닉", CARD_WIDTH - pad, 52);

  let y = headerH;
  const w = CARD_WIDTH - pad * 2;
  for (const r of data.rounds) {
    if (y + roundH > height - footerH) break;
    drawRound(ctx, pad, y, w, roundH, r);
    y += roundH + 14;
  }

  if (trendH && y + trendH <= height - footerH + 10) {
    drawTrend(ctx, pad, y, w, trendH, data.trend);
    y += trendH + 14;
  }

  ctx.fillStyle = T.muted;
  ctx.font = `17px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(
    "문항별 분석·오답 노트는 클리닉 사이트에서 확인하실 수 있습니다.",
    CARD_WIDTH / 2,
    height - 20
  );

  return toJpeg(canvas);
}

/* ============================== 문자용 카드 2종 ============================== */

function header(
  ctx: CanvasRenderingContext2D,
  who: CardWho,
  subtitle: string,
  width: number
) {
  ctx.fillStyle = T.primary;
  ctx.fillRect(0, 0, width, 112);
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 44px ${FONT}`;
  ctx.fillText(who.studentName, 32, 56);
  ctx.font = `26px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,.88)";
  const info = [who.school, who.grade].filter(Boolean).join(" · ");
  if (info) ctx.fillText(info, 32, 90);
  ctx.textAlign = "right";
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(subtitle, width - 32, 56);
  ctx.font = `23px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.fillText(who.academy ?? "더브코 알파 클리닉", width - 32, 90);
}

/** 200KB 한도 안에서 가능한 가장 높은 화질로 인코딩한다. */
function toJpeg(canvas: HTMLCanvasElement): string {
  for (const q of [0.96, 0.94, 0.92, 0.9, 0.86, 0.8, 0.74, 0.66, 0.56, 0.46]) {
    const url = canvas.toDataURL("image/jpeg", q);
    const bytes = Math.floor(((url.length - url.indexOf(",") - 1) * 3) / 4);
    if (bytes <= MAX_BYTES) return url;
  }
  return canvas.toDataURL("image/jpeg", 0.35);
}

/** 그날의 테스트 결과 카드 (점수 · 반 평균/최고/등수 · 점수 분포 · 과제) */
export function drawRoundCard(data: RoundCardData): string {
  const W = CARD_WIDTH;
  const H = 700;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 만들 수 없습니다.");
  const r = data.round;

  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);
  header(ctx, data, `${md(r.date)} ${r.subject} 테스트`, W);

  // 점수 카드
  const pad = 30;
  const cardY = 126;
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, pad, cardY, W - pad * 2, 168, 16);
  ctx.fill();
  ctx.strokeStyle = T.line;
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = T.sub;
  ctx.font = `25px ${FONT}`;
  ctx.fillText("내 점수", pad + 30, cardY + 52);
  ctx.fillStyle = scoreColor(r.score);
  ctx.font = `bold 74px ${FONT}`;
  ctx.fillText(r.score == null ? "미응시" : String(r.score), pad + 30, cardY + 128);
  if (r.score != null) {
    ctx.fillStyle = T.muted;
    ctx.font = `29px ${FONT}`;
    ctx.fillText("점 / 100", pad + 30 + 150, cardY + 128);
  }

  const stats: [string, string][] = [
    ["반 평균", r.average == null ? "—" : `${r.average}점`],
    ["최고점", r.best == null ? "—" : `${r.best}점`],
    ["등수", r.rank && r.participants ? `${r.rank} / ${r.participants}명` : "—"],
  ];
  stats.forEach(([label, value], i) => {
    const x = pad + 440 + i * 210;
    ctx.textAlign = "center";
    ctx.fillStyle = T.sub;
    ctx.font = `24px ${FONT}`;
    ctx.fillText(label, x, cardY + 60);
    ctx.fillStyle = T.ink;
    ctx.font = `bold 37px ${FONT}`;
    ctx.fillText(value, x, cardY + 112);
  });

  // 점수 분포
  const distY = cardY + 194;
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, pad, distY, W - pad * 2, 282, 16);
  ctx.fill();
  ctx.strokeStyle = T.line;
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = T.ink;
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillText(
    `반 점수 분포 (응시 ${data.classScores.length}명)`,
    pad + 26,
    distY + 44
  );

  const counts = BUCKETS.map(
    ([, lo, hi]) => data.classScores.filter((v) => v >= lo && v <= hi).length
  );
  const maxCount = Math.max(1, ...counts);
  const barL = pad + 150;
  const barR = W - pad - 190;
  BUCKETS.forEach(([label, lo, hi], i) => {
    const y = distY + 84 + i * 38;
    const mine = r.score != null && r.score >= lo && r.score <= hi;
    ctx.textAlign = "right";
    ctx.fillStyle = mine ? T.primary : T.sub;
    ctx.font = `${mine ? "bold " : ""}23px ${FONT}`;
    ctx.fillText(label, barL - 14, y + 20);
    ctx.fillStyle = "#EDF0F5";
    roundRect(ctx, barL, y, barR - barL, 26, 8);
    ctx.fill();
    const w = ((barR - barL) * counts[i]) / maxCount;
    ctx.fillStyle = mine ? T.primary : "#C7D2E4";
    roundRect(ctx, barL, y, Math.max(4, w), 26, 8);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = mine ? T.primary : T.muted;
    ctx.font = `${mine ? "bold " : ""}22px ${FONT}`;
    ctx.fillText(`${counts[i]}명${mine ? "  ← 나" : ""}`, barR + 14, y + 21);
  });

  // 과제
  if (r.hwDone != null || r.hwSsen != null) {
    const parts: string[] = [];
    if (r.hwDone != null) parts.push(`과제(프린트) ${hwText(r.hwDone)}`);
    if (r.hwSsen != null) parts.push(`과제(부교재) ${hwText(r.hwSsen)}`);
    ctx.textAlign = "left";
    ctx.fillStyle = T.sub;
    ctx.font = `25px ${FONT}`;
    ctx.fillText(parts.join("     "), pad + 6, distY + 324);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = T.muted;
  ctx.font = `21px ${FONT}`;
  ctx.fillText(
    "문항별 분석과 오답 노트는 클리닉 사이트에서 확인하실 수 있습니다.",
    W / 2,
    H - 18
  );
  return toJpeg(canvas);
}

/** 점수 추이 카드 (최근 회차 기준 한 장) */
export function drawTrendCard(data: TrendCardData): string {
  const W = CARD_WIDTH;
  const H = 820;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 만들 수 없습니다.");

  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);
  header(ctx, data, `${data.subject} 점수 추이`, W);

  const pad = 32;
  drawTrend(ctx, pad, 132, W - pad * 2, 560, data.trend);

  const scores = data.trend.map((t) => t.score);
  const avg = scores.length
    ? Math.round(scores.reduce((a, v) => a + v, 0) / scores.length)
    : null;
  ctx.textAlign = "left";
  ctx.fillStyle = T.sub;
  ctx.font = `29px ${FONT}`;
  const bits = [
    `최근 ${scores.length}회 평균 ${avg ?? "—"}점`,
    scores.length ? `최고 ${Math.max(...scores)}점` : "",
  ].filter(Boolean);
  ctx.fillText(bits.join("     ·     "), pad + 8, 750);

  ctx.textAlign = "center";
  ctx.fillStyle = T.muted;
  ctx.font = `23px ${FONT}`;
  ctx.fillText("파란 선 = 내 점수 · 회색 점선 = 반 평균", W / 2, H - 26);
  return toJpeg(canvas);
}

/* ============================== 테스트 성적 상세 카드 ==============================
   학생 화면의 "테스트 성적 → 회차 상세"를 그대로 옮긴 이미지.
   솔라피 MMS 한도(가로 1500 · 세로 1440 · 200KB) 안에서 최대한 크게 그린다. */

const DETAIL_W = 1500;
const DETAIL_MAX_H = 1440;

export interface DetailShare {
  choice: string;
  label: string;
  ratio: number;
  mine: boolean;
  correct: boolean;
}
export interface DetailQuestion {
  label: string;
  type: string;
  points: number;
  answer: string;
  myAnswer: string;
  myAnswered: boolean;
  myCorrect: boolean;
  correctRate: number;
  wrongRank: number;
  choiceShares: DetailShare[];
}
export interface DetailCardData extends CardWho {
  subject: string;
  date: string;
  /** 그날 과제 수행 (1=O, 0.5=△, 0=X, null=입력 없음) */
  hwDone?: number | null;
  hwSsen?: number | null;
  maxScore: number;
  participants: number;
  myScore: number | null;
  myPct: number | null;
  myRank: number | null;
  avg: number | null;
  best: number | null;
  distribution: number[];
  questions: DetailQuestion[];
}

const cut = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
};

export function drawTestDetailCard(d: DetailCardData): string {
  const pad = 32;
  const rows = d.questions.length;
  const headerH = 112;
  const hwItems: [string, number][] = [];
  if (d.hwDone != null) hwItems.push(["과제(프린트)", d.hwDone]);
  if (d.hwSsen != null) hwItems.push(["과제(부교재)", d.hwSsen]);

  // 요약 + 점수 분포 (과제 줄이 있으면 조금 더 높게)
  const statH = 92;
  const statGap = hwItems.length ? 100 : 106;
  const hwH = 68;
  const topH = (hwItems.length ? 3 * statGap + hwH : 3 * statGap) + 22;
  const tableHeadH = 54;
  const footerH = 46;
  const avail = DETAIL_MAX_H - headerH - topH - tableHeadH - footerH - 26;
  const rowH = rows ? Math.max(46, Math.min(96, Math.floor(avail / rows))) : 0;
  const height = Math.min(
    DETAIL_MAX_H,
    headerH + topH + (rows ? tableHeadH + rows * rowH + 18 : 0) + footerH
  );

  const canvas = document.createElement("canvas");
  canvas.width = DETAIL_W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 만들 수 없습니다.");

  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, DETAIL_W, height);

  /* 머리말 */
  ctx.fillStyle = T.primary;
  ctx.fillRect(0, 0, DETAIL_W, headerH - 16);
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 44px ${FONT}`;
  ctx.fillText(d.studentName, pad, 54);
  ctx.font = `26px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,.88)";
  const info = [d.school, d.grade].filter(Boolean).join(" · ");
  if (info) ctx.fillText(info, pad, 88);
  ctx.textAlign = "right";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillText(`${md(d.date)} ${d.subject} 테스트`, DETAIL_W - pad, 54);
  ctx.font = `23px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.fillText(d.academy ?? "더브코 알파 클리닉", DETAIL_W - pad, 88);

  /* 점수 분포 (왼쪽) + 요약 (오른쪽) */
  const topY = headerH;
  const leftW = 840;
  const leftH = topH - 22;
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, pad, topY, leftW, leftH, 18);
  ctx.fill();
  ctx.strokeStyle = T.line;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = T.ink;
  ctx.font = `bold 29px ${FONT}`;
  ctx.fillText(
    `점수 분포 (100점 환산 · 응시 ${d.participants}명)`,
    pad + 28,
    topY + 50
  );

  const step = Math.max(42, Math.min(60, Math.floor((leftH - 96) / 5)));
  const maxCount = Math.max(1, ...d.distribution);
  const barL = pad + 168;
  const barR = pad + leftW - 216; // "n명 (nn%) ← 나" 가 카드 밖으로 나가지 않도록
  BUCKETS.forEach(([label, lo, hi], i) => {
    const y = topY + 82 + i * step;
    const mine = d.myPct != null && d.myPct >= lo && d.myPct <= hi;
    const count = d.distribution[i] ?? 0;
    const barH = Math.max(24, Math.min(32, step - 14));
    ctx.textAlign = "right";
    ctx.fillStyle = mine ? T.primary : T.sub;
    ctx.font = `${mine ? "bold " : ""}24px ${FONT}`;
    ctx.fillText(label, barL - 16, y + barH - 6);
    ctx.fillStyle = "#EDF0F5";
    roundRect(ctx, barL, y, barR - barL, barH, 8);
    ctx.fill();
    ctx.fillStyle = mine ? T.primary : "#C7D2E4";
    roundRect(ctx, barL, y, Math.max(6, ((barR - barL) * count) / maxCount), barH, 8);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = mine ? T.primary : T.muted;
    ctx.font = `${mine ? "bold " : ""}23px ${FONT}`;
    const pct = d.participants ? Math.round((count / d.participants) * 100) : 0;
    ctx.fillText(`${count}명 (${pct}%)${mine ? "  ← 나" : ""}`, barR + 16, y + barH - 6);
  });

  const stats: [string, string, string][] = [
    [
      "내 점수",
      d.myPct == null ? "—" : `${d.myPct}점`,
      d.myScore == null ? "미응시" : `원점수 ${d.myScore}/${d.maxScore}`,
    ],
    ["전체 평균", d.avg == null ? "—" : `${d.avg}점`, ""],
    [
      "최고점 · 등수",
      d.best == null ? "—" : `${d.best}점`,
      d.myRank ? `${d.myRank}등 / ${d.participants}명` : "",
    ],
  ];
  const statX = pad + leftW + 22;
  const statW = DETAIL_W - pad - statX;

  stats.forEach(([label, value, sub], i) => {
    const y = topY + i * statGap;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, statX, y, statW, statH, 16);
    ctx.fill();
    ctx.strokeStyle = T.line;
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = T.sub;
    ctx.font = `23px ${FONT}`;
    ctx.fillText(label, statX + 24, y + 34);
    ctx.fillStyle = i === 0 ? scoreColor(d.myPct) : T.ink;
    ctx.font = `bold 42px ${FONT}`;
    ctx.fillText(value, statX + 24, y + 78);
    if (sub) {
      ctx.textAlign = "right";
      ctx.fillStyle = T.muted;
      ctx.font = `22px ${FONT}`;
      ctx.fillText(sub, statX + statW - 22, y + 76);
    }
  });

  // 과제 진행 (점수 카드 아래)
  if (hwItems.length) {
    const y = topY + stats.length * statGap;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, statX, y, statW, hwH, 16);
    ctx.fill();
    ctx.strokeStyle = T.line;
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = T.sub;
    ctx.font = `bold 23px ${FONT}`;
    ctx.fillText("과제 진행", statX + 24, y + 43);
    let hx = statX + 150;
    for (const [label, v] of hwItems) {
      ctx.fillStyle = T.sub;
      ctx.font = `22px ${FONT}`;
      ctx.fillText(label, hx, y + 43);
      hx += ctx.measureText(label).width + 12;
      const color = v === 1 ? T.ok : v === 0.5 ? T.warn : T.bad;
      const soft = v === 1 ? T.okSoft : v === 0.5 ? T.warnSoft : T.badSoft;
      ctx.fillStyle = soft;
      roundRect(ctx, hx, y + 17, 38, 34, 10);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = `bold 24px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(v === 1 ? "O" : v === 0.5 ? "△" : "X", hx + 19, y + 43);
      ctx.textAlign = "left";
      hx += 56;
    }
  }

  /* 문항 표 — 문자 이미지는 작게 보이므로 글씨를 키우고 열을 줄였다.
     (답안 분포 등 세부 내용은 사이트에서 본다) */
  if (rows) {
    const tableY = topY + topH - 10;
    const cols = [
      { label: "문번", w: 112 },
      { label: "유형", w: 368 },
      { label: "배점", w: 96 },
      { label: "정답", w: 224 },
      { label: "나의 답안", w: 224 },
      { label: "정오", w: 96 },
      { label: "전체 정답률", w: 244 },
    ];
    const tableW = cols.reduce((a, c) => a + c.w, 0);
    const startX = pad + Math.max(0, (DETAIL_W - pad * 2 - tableW) / 2);

    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, pad, tableY, DETAIL_W - pad * 2, height - tableY - footerH + 10, 18);
    ctx.fill();
    ctx.strokeStyle = T.line;
    ctx.stroke();

    ctx.fillStyle = "#F6F8FB";
    roundRect(ctx, pad + 1, tableY + 1, DETAIL_W - pad * 2 - 2, tableHeadH, 16);
    ctx.fill();

    ctx.font = `bold 24px ${FONT}`;
    ctx.fillStyle = T.sub;
    ctx.textAlign = "center";
    let x = startX;
    for (const c of cols) {
      ctx.fillText(c.label, x + c.w / 2, tableY + 36);
      x += c.w;
    }

    const fs = Math.max(22, Math.min(30, Math.round(rowH * 0.36)));
    d.questions.forEach((q, i) => {
      const y = tableY + tableHeadH + i * rowH;
      if (i > 0) {
        ctx.strokeStyle = "#E7ECF3";
        ctx.beginPath();
        ctx.moveTo(pad + 14, y);
        ctx.lineTo(DETAIL_W - pad - 14, y);
        ctx.stroke();
      }
      const mid = y + rowH / 2;
      const base = mid + fs / 3;
      let cx = startX;
      const cell = (w: number, fn: (cxx: number) => void) => {
        fn(cx);
        cx += w;
      };

      ctx.textAlign = "center";
      cell(cols[0].w, (c) => {
        ctx.fillStyle = T.ink;
        ctx.font = `bold ${fs + 2}px ${FONT}`;
        ctx.fillText(q.label, c + cols[0].w / 2, base);
      });
      cell(cols[1].w, (c) => {
        ctx.fillStyle = q.type ? T.ink : T.muted;
        ctx.font = `${fs}px ${FONT}`;
        ctx.textAlign = "left";
        ctx.fillText(cut(ctx, q.type || "—", cols[1].w - 20), c + 10, base);
        ctx.textAlign = "center";
      });
      cell(cols[2].w, (c) => {
        ctx.fillStyle = T.sub;
        ctx.font = `${fs}px ${FONT}`;
        ctx.fillText(String(q.points), c + cols[2].w / 2, base);
      });
      cell(cols[3].w, (c) => {
        ctx.fillStyle = T.ok;
        ctx.font = `bold ${fs}px ${FONT}`;
        ctx.fillText(cut(ctx, q.answer || "—", cols[3].w - 16), c + cols[3].w / 2, base);
      });
      cell(cols[4].w, (c) => {
        ctx.fillStyle = q.myAnswered ? (q.myCorrect ? T.ink : T.bad) : T.muted;
        ctx.font = `bold ${fs}px ${FONT}`;
        ctx.fillText(
          cut(ctx, q.myAnswered ? q.myAnswer : "미제출", cols[4].w - 16),
          c + cols[4].w / 2,
          base
        );
      });
      cell(cols[5].w, (c) => {
        ctx.fillStyle = q.myCorrect ? T.ok : T.bad;
        ctx.font = `bold ${fs + 6}px ${FONT}`;
        ctx.fillText(q.myCorrect ? "O" : "X", c + cols[5].w / 2, base);
      });
      cell(cols[6].w, (c) => {
        const bw = cols[6].w - 110;
        const by = mid - 7;
        ctx.fillStyle = T.badSoft;
        roundRect(ctx, c + 12, by, bw, 14, 7);
        ctx.fill();
        ctx.fillStyle =
          q.correctRate >= 70 ? T.ok : q.correctRate >= 40 ? T.warn : T.bad;
        roundRect(ctx, c + 12, by, Math.max(4, (bw * q.correctRate) / 100), 14, 7);
        ctx.fill();
        ctx.fillStyle = T.sub;
        ctx.font = `bold ${fs}px ${FONT}`;
        ctx.textAlign = "right";
        ctx.fillText(`${q.correctRate}%`, c + cols[6].w - 10, base);
        ctx.textAlign = "center";
      });
    });
  } else {
    ctx.textAlign = "center";
    ctx.fillStyle = T.sub;
    ctx.font = `26px ${FONT}`;
    ctx.fillText(
      "이 회차는 문항별 답안이 등록되지 않아 점수 통계만 제공됩니다.",
      DETAIL_W / 2,
      topY + topH + 36
    );
  }

  ctx.textAlign = "center";
  ctx.fillStyle = T.muted;
  ctx.font = `22px ${FONT}`;
  ctx.fillText(
    "답안 분포 · 오답 노트 · 문항별 분석은 클리닉 사이트에서 확인하실 수 있습니다.",
    DETAIL_W / 2,
    height - 16
  );

  return toJpeg(canvas);
}
