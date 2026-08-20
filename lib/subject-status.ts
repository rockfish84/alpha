// 반(수업) 단위 진행/종료 상태. 학기 전체를 종료하지 않고 일부 반만 먼저 종료할 수 있다.
// 서버 전용 모듈을 import 하지 않으므로 클라이언트에서도 그대로 쓴다.

export type TermSubjectStatus = {
  subjects?: readonly string[] | null;
  closedSubjects?: unknown;
};

/** 종료 처리된 반 목록 정규화. subjects 를 주면 그 학기에 없는 반은 버린다. */
export function normalizeClosedSubjects(
  value: unknown,
  subjects?: readonly string[] | null
): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = subjects ? new Set(subjects) : null;
  const names = value
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => !!s && (!allowed || allowed.has(s)));
  return [...new Set(names)].sort();
}

/** 이 반이 종료 처리되었는지. */
export function isSubjectClosed(
  term: TermSubjectStatus | null | undefined,
  subject: string
): boolean {
  if (!term || !subject) return false;
  return normalizeClosedSubjects(term.closedSubjects).includes(subject);
}

/** 진행 중인 반만 (종료된 반 제외). 원래 순서를 유지한다. */
export function openSubjects(
  term: TermSubjectStatus | null | undefined
): string[] {
  const subjects = [...(term?.subjects ?? [])];
  const closed = new Set(normalizeClosedSubjects(term?.closedSubjects));
  return subjects.filter((s) => !closed.has(s));
}

/** 화면에 노출할 반 목록. includeClosed 가 참이면 종료된 반까지 포함한다. */
export function visibleSubjects(
  term: TermSubjectStatus | null | undefined,
  includeClosed: boolean
): string[] {
  return includeClosed ? [...(term?.subjects ?? [])] : openSubjects(term);
}
