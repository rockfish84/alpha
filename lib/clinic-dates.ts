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
