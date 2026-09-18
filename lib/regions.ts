// 문항 위치(QuestionRegion) 정규화 — 서버 저장 전 검증용. 클라이언트 공용.
import type { QuestionRegion, RegionRect } from "./analysis-types";

export const MAX_REGIONS = 200;
export const MAX_RECTS_PER_REGION = 12;

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function normalizeRect(raw: unknown): RegionRect | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const page = Math.floor(Number(r.page));
  const x = num(r.x);
  const y = num(r.y);
  const w = num(r.w);
  const h = num(r.h);
  const pw = num(r.pw);
  const ph = num(r.ph);
  if (
    !Number.isFinite(page) ||
    page < 1 ||
    page > 500 ||
    x == null ||
    y == null ||
    w == null ||
    h == null ||
    pw == null ||
    ph == null ||
    w <= 0 ||
    h <= 0 ||
    pw <= 0 ||
    ph <= 0
  ) {
    return null;
  }
  return { page, x, y, w, h, pw, ph };
}

export function normalizeRegions(raw: unknown): QuestionRegion[] {
  if (!Array.isArray(raw)) return [];
  const out: QuestionRegion[] = [];
  for (const item of raw.slice(0, MAX_REGIONS)) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const no = Math.floor(Number(r.no));
    const kind = r.kind === "paper" || r.kind === "solution" ? r.kind : null;
    const fileId = String(r.fileId ?? "");
    if (!Number.isFinite(no) || no < 1 || no > 200 || !kind || !/^[0-9a-f]{24}$/.test(fileId)) {
      continue;
    }
    const rects = (Array.isArray(r.rects) ? r.rects : [])
      .slice(0, MAX_RECTS_PER_REGION)
      .map(normalizeRect)
      .filter((x): x is RegionRect => !!x);
    if (!rects.length) continue;
    const answerRect = Math.floor(Number(r.answerRect));
    const answerY = num(r.answerY);
    out.push({
      no,
      kind,
      fileId,
      rects,
      ...(Number.isFinite(answerRect) && answerRect >= 0 && answerRect < rects.length && answerY != null
        ? { answerRect, answerY }
        : {}),
    });
  }
  return out.sort((a, b) => a.no - b.no);
}

/** 그 파일에 속한 위치 정보만 골라낸다 / 제외한다. */
export function regionsExcludingFile(
  regions: QuestionRegion[],
  fileId: string
): QuestionRegion[] {
  return regions.filter((r) => r.fileId !== fileId);
}
