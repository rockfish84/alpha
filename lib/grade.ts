// 학년 표기("중3", "고1")를 다루는 규칙. (서버·클라이언트 공용)
//
// 학년은 Enrollment 에 학기별 문자열로 들어 있다. 스키마를 바꾸지 않고, 읽고 올리는
// 규칙만 여기 모아 둔다. 새 학기를 만들 때 "학년 한 칸 올리기"에 쓰인다.

/** 학교급과 그 급의 마지막 학년 */
export const SCHOOL_LEVELS = [
  { level: "초", last: 6 },
  { level: "중", last: 3 },
  { level: "고", last: 3 },
] as const;

export type SchoolLevel = (typeof SCHOOL_LEVELS)[number]["level"];

export interface ParsedGrade {
  level: SchoolLevel;
  year: number;
}

/** 졸업(고3 다음)을 나타내는 값 */
export const GRADUATED = "졸업";

const levelInfo = (level: string) =>
  SCHOOL_LEVELS.find((l) => l.level === level);

/** "중3" → { level: "중", year: 3 }. 규칙에 안 맞으면 null. */
export function parseGrade(raw: unknown): ParsedGrade | null {
  const text = String(raw ?? "").trim();
  const m = /^(초|중|고)\s*(\d)$/.exec(text);
  if (!m) return null;
  const level = m[1] as SchoolLevel;
  const year = Number(m[2]);
  const info = levelInfo(level);
  if (!info || year < 1 || year > info.last) return null;
  return { level, year };
}

export function formatGrade(g: ParsedGrade): string {
  return `${g.level}${g.year}`;
}

/**
 * 한 학년 올린다.
 *   초6 → 중1 · 중3 → 고1 · 고3 → null(졸업)
 * 읽을 수 없는 값(빈칸·"예비고1" 등)은 그대로 둔다.
 */
export function nextGrade(raw: unknown): string | null {
  const parsed = parseGrade(raw);
  if (!parsed) return String(raw ?? "");

  const info = levelInfo(parsed.level)!;
  if (parsed.year < info.last) {
    return formatGrade({ level: parsed.level, year: parsed.year + 1 });
  }
  // 그 급의 마지막 학년이면 다음 급의 1학년으로
  const index = SCHOOL_LEVELS.findIndex((l) => l.level === parsed.level);
  const upper = SCHOOL_LEVELS[index + 1];
  return upper ? `${upper.level}1` : null; // 고3 다음은 졸업
}

/**
 * 여러 해를 한 번에 올린다. (2년 만에 돌아온 학생은 2학년 올라가 있어야 한다)
 * 도중에 졸업하면 null.
 */
export function advanceGrade(raw: unknown, years: number): string | null {
  let cur = String(raw ?? "");
  const steps = Math.max(0, Math.floor(years));
  for (let i = 0; i < steps; i++) {
    const next = nextGrade(cur);
    if (next === null) return null; // 졸업
    if (next === cur) return cur; // 읽을 수 없는 값은 그대로 둔다
    cur = next;
  }
  return cur;
}

/** 이 학년이 한 칸 올라가면 졸업인지 (고3) */
export function graduatesNext(raw: unknown): boolean {
  return nextGrade(raw) === null;
}

/** 학년 정렬용 값 (초1=1 … 고3=12). 못 읽으면 맨 뒤. */
export function gradeOrder(raw: unknown): number {
  const parsed = parseGrade(raw);
  if (!parsed) return 999;
  let base = 0;
  for (const l of SCHOOL_LEVELS) {
    if (l.level === parsed.level) break;
    base += l.last;
  }
  return base + parsed.year;
}
