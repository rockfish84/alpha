export type ClinicDatesBySubject = Record<string, string[]>;

type TermClinicDates = {
  clinicDates?: unknown;
  clinicDatesBySubject?: unknown;
};

/** API와 DB에 저장할 수 있는 실제 YYYY-MM-DD 날짜인지 확인한다. */
export function isClinicDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function normalizeClinicDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isClinicDate))].sort();
}

function clinicDateEntries(value: unknown): [string, unknown][] {
  if (value instanceof Map) return [...value.entries()];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>);
}

/** Mongoose Map 또는 일반 객체를 API용 일반 객체로 정규화한다. */
export function normalizeClinicDatesBySubject(
  value: unknown,
  subjects?: readonly string[]
): ClinicDatesBySubject {
  const allowed = subjects ? new Set(subjects) : null;
  const normalized: ClinicDatesBySubject = {};

  for (const [rawSubject, rawDates] of clinicDateEntries(value)) {
    const subject = rawSubject.trim();
    if (!subject || (allowed && !allowed.has(subject))) continue;
    normalized[subject] = normalizeClinicDates(rawDates);
  }

  return normalized;
}

/**
 * 과목별 날짜가 명시된 경우(빈 배열 포함) 그 값을 사용한다.
 * map 전체가 비어 있는 기존 학기만 학기 공통 clinicDates를 사용한다.
 */
export function getClinicDatesForSubject(
  term: TermClinicDates | null | undefined,
  subject: string
): string[] {
  if (!term) return [];

  const bySubject = normalizeClinicDatesBySubject(term.clinicDatesBySubject);
  if (Object.prototype.hasOwnProperty.call(bySubject, subject)) {
    return bySubject[subject];
  }
  // 하나라도 과목별 일정이 있으면 해당 학기는 과목별 모드다. 누락된 과목에
  // 전체 union을 폴백하면 다른 반의 요일까지 열리므로 안전하게 일정 없음으로 둔다.
  if (Object.keys(bySubject).length) return [];
  return normalizeClinicDates(term.clinicDates);
}

export function mergeClinicDates(bySubject: ClinicDatesBySubject): string[] {
  return normalizeClinicDates(Object.values(bySubject).flat());
}

/** 한 번에 만들 수 있는 최대 일수 (실수로 몇 년치를 만들지 않도록) */
const MAX_RANGE_DAYS = 400;

/**
 * 기간 안에서 고른 요일에 해당하는 날짜를 모두 만든다. (0=일 … 6=토)
 * 클리닉은 보통 매주 같은 요일이라, 날짜를 하나씩 넣는 대신 이걸로 한 번에 넣는다.
 */
export function datesInRange(
  from: string,
  to: string,
  days: Iterable<number>
): string[] {
  const wanted = new Set([...days].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  if (!isClinicDate(from) || !isClinicDate(to) || !wanted.size || from > to) return [];

  const out: string[] = [];
  const cur = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  for (let i = 0; cur <= end && i < MAX_RANGE_DAYS; i++) {
    if (wanted.has(cur.getUTCDay())) out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
