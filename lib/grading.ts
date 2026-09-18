// 테스트 답안 키·자동 채점·문항 분석 (서버 전용 모듈을 import 하지 않음 → 클라이언트 공용).

export const DEFAULT_QUESTION_COUNT = 10;
export const MAX_QUESTION_COUNT = 60;
export const MAX_PARTS_PER_QUESTION = 9;
/** 여러 정답을 허용할 때 구분자. (쉼표는 "1,3" 같은 복수 선택 답안이므로 쓰지 않는다) */
export const ANSWER_ALT_SEPARATOR = "|";

export type Difficulty = "최상" | "상" | "중" | "하" | "최하" | "";
export const DIFFICULTIES: Difficulty[] = ["최상", "상", "중", "하", "최하"];

/** 테스트는 항상 100점 만점으로 배점한다. */
export const FULL_SCORE = 100;

export interface TestQuestion {
  no: number; // 주 문항 번호 (1부터)
  part: number; // 0 = 부분문제 없음, 1 = (1), 2 = (2) …
  answer: string; // 정답. "|" 로 복수 정답 허용. 문자 답안 가능
  points: number; // 배점
  type: string; // 유형 / 출제 단원 (관리자 입력)
  difficulty: Difficulty;
  choices: number; // 보기 수 (0 = 단답형)
}

/** 객관식(보기 선택) 문항인지. choices 0 이면 단답형. */
export function isMultipleChoice(q: { choices: number }): boolean {
  return (q.choices ?? 0) > 0;
}

export const DEFAULT_CHOICES = 5;

/** 문항 표시 이름. 부분문제는 8-(1) 형태. 학생 답안 Map 의 키로도 쓴다. */
export function questionLabel(q: { no: number; part?: number }): string {
  return q.part ? `${q.no}-(${q.part})` : String(q.no);
}

export function blankQuestion(no: number, part = 0): TestQuestion {
  return {
    no,
    part,
    answer: "",
    points: 0,
    type: "",
    difficulty: "",
    choices: DEFAULT_CHOICES,
  };
}

/** 기본 문항 목록 (1..count, 부분문제 없음). 배점은 100점을 균등 배분한다. */
export function buildQuestions(count: number): TestQuestion[] {
  const n = Math.max(1, Math.min(MAX_QUESTION_COUNT, Math.floor(count) || 0));
  return distributePoints(
    Array.from({ length: n }, (_, i) => blankQuestion(i + 1))
  );
}

/** total 을 n 등분하되 소수점 둘째 자리까지 맞추고 합이 정확히 total 이 되게 한다. */
function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const rest = cents - base * n;
  // 나머지는 앞 문항부터 1전(0.01점)씩 더한다.
  return Array.from({ length: n }, (_, i) => (base + (i < rest ? 1 : 0)) / 100);
}

/**
 * 100점 만점 기준으로 배점을 자동 배분한다.
 * 주 문항 수로 100을 나누고, 부분문제가 있는 문항은 그 몫을 부분문제끼리 다시 나눈다.
 * 예) 1-(1), 1-(2), 2 … 10 (주 문항 10개) → 2~10번 각 10점, 1-(1)·1-(2) 각 5점.
 */
export function distributePoints(
  questions: TestQuestion[],
  total = FULL_SCORE
): TestQuestion[] {
  const sorted = sortQuestions(questions);
  const nos = [...new Set(sorted.map((q) => q.no))];
  if (!nos.length) return sorted;

  const mainShares = splitEvenly(total, nos.length);
  const out: TestQuestion[] = [];

  nos.forEach((no, i) => {
    const group = sorted.filter((q) => q.no === no);
    const parts = group.filter((q) => q.part);
    const share = mainShares[i];
    if (!parts.length) {
      out.push(...group.map((q) => ({ ...q, points: share })));
      return;
    }
    // 부분문제가 있으면 주 문항 행은 채점 대상이 아니므로 0점으로 둔다.
    const partShares = splitEvenly(share, parts.length);
    let pi = 0;
    for (const q of group) {
      out.push(q.part ? { ...q, points: partShares[pi++] } : { ...q, points: 0 });
    }
  });

  return sortQuestions(out);
}

export function sortQuestions(qs: TestQuestion[]): TestQuestion[] {
  return [...qs].sort((a, b) => a.no - b.no || a.part - b.part);
}

/** 서버/클라이언트 공용 입력 정규화. 잘못된 항목은 버린다. */
export function normalizeQuestions(raw: unknown): TestQuestion[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TestQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const src = item as Record<string, unknown>;
    const no = Math.floor(Number(src.no));
    if (!Number.isFinite(no) || no < 1 || no > MAX_QUESTION_COUNT) continue;
    const partRaw = Math.floor(Number(src.part ?? 0));
    const part =
      Number.isFinite(partRaw) && partRaw > 0
        ? Math.min(MAX_PARTS_PER_QUESTION, partRaw)
        : 0;
    const key = `${no}-${part}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pointsRaw = Number(src.points);
    const choicesRaw = Math.floor(Number(src.choices));
    const difficulty = String(src.difficulty ?? "") as Difficulty;
    out.push({
      no,
      part,
      answer: String(src.answer ?? "").slice(0, 120),
      points:
        Number.isFinite(pointsRaw) && pointsRaw >= 0
          ? Math.round(Math.min(1000, pointsRaw) * 100) / 100
          : 1,
      type: String(src.type ?? "").slice(0, 60),
      difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : "",
      choices:
        Number.isFinite(choicesRaw) && choicesRaw >= 0
          ? Math.min(9, choicesRaw)
          : DEFAULT_CHOICES,
    });
  }
  return sortQuestions(out);
}

/** 문항에 부분문제가 있으면 부분문제만 채점 대상. (8 과 8-(1) 이 같이 있으면 8 은 무시) */
export function gradableQuestions(questions: TestQuestion[]): TestQuestion[] {
  const hasParts = new Set<number>();
  for (const q of questions) if (q.part) hasParts.add(q.no);
  return sortQuestions(questions).filter((q) => q.part || !hasParts.has(q.no));
}

export function totalPoints(questions: TestQuestion[]): number {
  const sum = gradableQuestions(questions).reduce((a, q) => a + (q.points || 0), 0);
  return Math.round(sum * 100) / 100;
}

const FULLWIDTH_OFFSET = 0xfee0;

/**
 * 수식 기호는 입력 방식이 여러 가지라(≤ / <=) 비교 전에 한 가지 모양으로 맞춘다.
 * 답안 키와 학생 답안 모두 같은 규칙을 거치므로 어느 쪽으로 써도 같은 답으로 본다.
 */
const MATH_ALIASES: [RegExp, string][] = [
  [/[≤⩽]/g, "<="],
  [/[≥⩾]/g, ">="],
  [/[≠]/g, "!="],
  [/[−–—]/g, "-"],
  [/[×·]/g, "*"],
  [/[÷]/g, "/"],
  [/[∞]/g, "inf"],
  [/[√]/g, "sqrt"],
  [/[π]/g, "pi"],
  [/[°]/g, "deg"],
  [/[²]/g, "^2"],
  [/[³]/g, "^3"],
  [/[⇔↔]/g, "<->"],
  [/[⇒→]/g, "->"],
];

/** 답안 비교용 정규화: 공백 제거 · 소문자 · 전각→반각 · 수식 기호 통일. */
export function normalizeAnswer(value: unknown): string {
  if (value == null) return "";
  let out = String(value)
    .replace(/[！-～]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - FULLWIDTH_OFFSET)
    )
    .replace(/[①②③④⑤⑥⑦⑧⑨]/g, (c) => String("①②③④⑤⑥⑦⑧⑨".indexOf(c) + 1));
  for (const [pattern, replacement] of MATH_ALIASES) {
    out = out.replace(pattern, replacement);
  }
  return out
    .replace(/\s+/g, "")
    .replace(/[､、]/g, ",")
    .replace(/[.,]+$/, "")
    .toLowerCase();
}

/* ============================== 수식 입력 도우미 ============================== */
/** 답 입력칸 위에 두는 기호 팔레트 */
export const MATH_SYMBOLS: { group: string; items: string[] }[] = [
  { group: "부등호·연산", items: ["≤", "≥", "≠", "±", "√", "²", "³", "×", "÷", "∞"] },
  { group: "집합·기타", items: ["⊂", "⊆", "∈", "∉", "∪", "∩", "∅", "π", "°", "→"] },
];

/** 키보드로 빠르게 치는 약어 → 기호 (긴 것부터 검사) */
export const MATH_SHORTCUTS: [string, string][] = [
  ["<->", "⇔"],
  ["<=", "≤"],
  [">=", "≥"],
  ["!=", "≠"],
  ["/=", "≠"],
  ["+-", "±"],
  ["->", "→"],
  ["^2", "²"],
  ["^3", "³"],
  ["sqrt", "√"],
  ["inf", "∞"],
  ["pi", "π"],
  ["deg", "°"],
];

/**
 * 입력 중인 문자열 끝의 약어를 기호로 바꾼다. (예: "0<=a" → "0≤a")
 * 커서 앞부분만 검사하므로 붙여넣기한 뒷글자는 건드리지 않는다.
 */
export function applyMathShortcuts(
  value: string,
  caret?: number
): { value: string; caret: number } {
  const pos = caret == null ? value.length : caret;
  const head = value.slice(0, pos);
  for (const [from, to] of MATH_SHORTCUTS) {
    if (head.endsWith(from)) {
      const next = head.slice(0, head.length - from.length) + to + value.slice(pos);
      return { value: next, caret: pos - from.length + to.length };
    }
  }
  return { value, caret: pos };
}

/** 정답 키를 허용 답안 목록으로. */
export function acceptedAnswers(key: string): string[] {
  return String(key ?? "")
    .split(ANSWER_ALT_SEPARATOR)
    .map(normalizeAnswer)
    .filter((s) => s !== "");
}

export function isAnswerCorrect(given: unknown, key: string): boolean {
  const g = normalizeAnswer(given);
  if (!g) return false;
  const accepted = acceptedAnswers(key);
  if (!accepted.length) return false;
  return accepted.includes(g);
}

export type AnswerMap = Record<string, string>;

export interface QuestionResult {
  label: string;
  no: number;
  part: number;
  given: string;
  answered: boolean;
  correct: boolean;
  points: number;
  earned: number;
}

export type MarkSymbol = "O" | "X" | "△" | "-";

export interface GradeResult {
  score: number;
  max: number;
  pct: number;
  answeredCount: number;
  results: QuestionResult[];
  /** 주 문항 번호별 채점표 (부분문제가 섞이면 △) */
  marks: Record<number, MarkSymbol>;
}

/** 답안 키 + 학생 답안 → 점수·문항별 정오·채점표. */
export function gradeAnswers(
  questions: TestQuestion[],
  answers: AnswerMap | null | undefined
): GradeResult {
  const list = gradableQuestions(questions);
  const map = answers ?? {};
  const results: QuestionResult[] = list.map((q) => {
    const label = questionLabel(q);
    const given = String(map[label] ?? "");
    const answered = normalizeAnswer(given) !== "";
    const correct = isAnswerCorrect(given, q.answer);
    return {
      label,
      no: q.no,
      part: q.part,
      given,
      answered,
      correct,
      points: q.points || 0,
      earned: correct ? q.points || 0 : 0,
    };
  });

  const byNo = new Map<number, QuestionResult[]>();
  for (const r of results) {
    const arr = byNo.get(r.no) ?? [];
    arr.push(r);
    byNo.set(r.no, arr);
  }
  const marks: Record<number, MarkSymbol> = {};
  for (const [no, arr] of byNo) {
    const answered = arr.filter((r) => r.answered).length;
    const correct = arr.filter((r) => r.correct).length;
    if (!answered && !correct) marks[no] = "-";
    else if (correct === arr.length) marks[no] = "O";
    else if (correct === 0) marks[no] = "X";
    else marks[no] = "△";
  }

  const score = Math.round(results.reduce((a, r) => a + r.earned, 0) * 100) / 100;
  const max = totalPoints(questions);
  return {
    score,
    max,
    pct: max > 0 ? Math.round((score / max) * 100) : 0,
    answeredCount: results.filter((r) => r.answered).length,
    results,
    marks,
  };
}

/** 학생 답안 Map 정규화 (문항 키에 해당하는 값만, 길이 제한). */
export function normalizeAnswerMap(
  raw: unknown,
  questions: TestQuestion[]
): AnswerMap {
  const allowed = new Set(gradableQuestions(questions).map(questionLabel));
  const out: AnswerMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(k)) continue;
    const value = String(v ?? "").trim().slice(0, 120);
    if (value !== "") out[k] = value;
  }
  return out;
}

/** 답안이 하나라도 있는지 (있어야 응시자로 집계). */
export function hasAnyAnswer(answers: AnswerMap | null | undefined): boolean {
  if (!answers) return false;
  return Object.values(answers).some((v) => normalizeAnswer(v) !== "");
}

/* ============================== 점수 분포 ============================== */
export interface ScoreBucket {
  label: string;
  min: number;
  max: number;
}
export const SCORE_BUCKETS: ScoreBucket[] = [
  { label: "91~100", min: 91, max: 100 },
  { label: "71~90", min: 71, max: 90 },
  { label: "51~70", min: 51, max: 70 },
  { label: "31~50", min: 31, max: 50 },
  { label: "0~30", min: 0, max: 30 },
];

export function bucketIndex(pct: number): number {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const i = SCORE_BUCKETS.findIndex((b) => p >= b.min && p <= b.max);
  return i < 0 ? SCORE_BUCKETS.length - 1 : i;
}

export function buildDistribution(pcts: number[]): number[] {
  const counts = SCORE_BUCKETS.map(() => 0);
  for (const p of pcts) counts[bucketIndex(p)] += 1;
  return counts;
}
