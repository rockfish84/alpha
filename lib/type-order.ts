// 반별 유형(출제 단원) 표시 순서. 관리자가 배우는 순서대로 정해 두면
// 학생 화면의 "유형별 강약점"을 단원 순으로 정렬할 수 있다.

export const MAX_TYPES = 200;
export const MAX_TYPE_LENGTH = 60;

export type TypeOrderBySubject = Record<string, string[]>;

function entries(value: unknown): [string, unknown][] {
  if (value instanceof Map) return [...value.entries()];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>);
}

/** 한 반의 유형 순서 정규화 (중복·공백 제거, 길이 제한). */
export function normalizeTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const name = raw.trim().slice(0, MAX_TYPE_LENGTH);
    if (!name || out.includes(name)) continue;
    out.push(name);
    if (out.length >= MAX_TYPES) break;
  }
  return out;
}

export function normalizeTypeOrder(
  value: unknown,
  subjects?: readonly string[]
): TypeOrderBySubject {
  const allowed = subjects ? new Set(subjects) : null;
  const out: TypeOrderBySubject = {};
  for (const [rawSubject, rawTypes] of entries(value)) {
    const subject = rawSubject.trim();
    if (!subject || (allowed && !allowed.has(subject))) continue;
    const types = normalizeTypes(rawTypes);
    if (types.length) out[subject] = types;
  }
  return out;
}

/** 정해진 순서 → 순위 맵. 목록에 없는 유형은 맨 뒤로 보낸다. */
export function typeRank(order: string[] | undefined): (type: string) => number {
  const map = new Map((order ?? []).map((t, i) => [t, i]));
  return (type: string) => map.get(type) ?? Number.MAX_SAFE_INTEGER;
}
