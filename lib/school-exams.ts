export const SCHOOL_EXAM_SUBJECTS = [
  "고1 공수2",
  "고2 미적분1",
  "고2 확통",
] as const;

export const SCHOOL_EXAM_GRADE_MAX_LENGTH = 20;
export const SCHOOL_EXAM_NAME_MAX_LENGTH = 50;
export const SCHOOL_EXAM_MAX_COUNT = 10;

export type SchoolExamSubject = (typeof SCHOOL_EXAM_SUBJECTS)[number];

export interface SchoolExamResult {
  schoolSubjectName: string;
  midtermScore: number | null;
  finalScore: number | null;
  grade: string;
}

export function isSchoolExamSubject(value: unknown): value is SchoolExamSubject {
  return (
    typeof value === "string" &&
    (SCHOOL_EXAM_SUBJECTS as readonly string[]).includes(value)
  );
}

type ValidationError = { ok: false; error: string };
type ValidationResult =
  | { ok: true; value: SchoolExamResult }
  | ValidationError;
type ValidationResults =
  | { ok: true; value: SchoolExamResult[] }
  | ValidationError;

function validateScore(
  value: unknown,
  label: string
): ValidationError | number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    return {
      ok: false,
      error: `${label}은(는) 0~100 사이의 숫자 또는 빈 값이어야 합니다.`,
    };
  }
  return value;
}

/** 학생이 보낸 학교 과목 한 행을 엄격하게 검사하고 정규화한다. */
export function validateSchoolExamResult(input: unknown): ValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "성적 입력 형식이 올바르지 않습니다." };
  }

  const body = input as Record<string, unknown>;
  if (typeof body.schoolSubjectName !== "string") {
    return { ok: false, error: "1학기 학교 과목명을 입력해 주세요." };
  }
  const schoolSubjectName = body.schoolSubjectName.trim();
  if (!schoolSubjectName) {
    return { ok: false, error: "1학기 학교 과목명을 입력해 주세요." };
  }
  if (schoolSubjectName.length > SCHOOL_EXAM_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `1학기 학교 과목명은 ${SCHOOL_EXAM_NAME_MAX_LENGTH}자 이내로 입력해 주세요.`,
    };
  }

  const midtermScore = validateScore(body.midtermScore, "중간고사 성적");
  if (typeof midtermScore === "object" && midtermScore !== null) {
    return midtermScore;
  }

  const finalScore = validateScore(body.finalScore, "기말고사 성적");
  if (typeof finalScore === "object" && finalScore !== null) {
    return finalScore;
  }

  if (typeof body.grade !== "string") {
    return { ok: false, error: "등급은 문자열이어야 합니다." };
  }
  const grade = body.grade.trim();
  if (grade.length > SCHOOL_EXAM_GRADE_MAX_LENGTH) {
    return {
      ok: false,
      error: `등급은 ${SCHOOL_EXAM_GRADE_MAX_LENGTH}자 이내로 입력해 주세요.`,
    };
  }

  return {
    ok: true,
    value: {
      schoolSubjectName,
      midtermScore,
      finalScore,
      grade,
    },
  };
}

/** 학생이 보낸 여러 학교 과목을 한 번에 검사한다. 빈 배열은 전체 삭제로 허용한다. */
export function validateSchoolExamResults(input: unknown): ValidationResults {
  if (!Array.isArray(input)) {
    return { ok: false, error: "학교 성적 목록 형식이 올바르지 않습니다." };
  }
  if (input.length > SCHOOL_EXAM_MAX_COUNT) {
    return {
      ok: false,
      error: `학교 과목은 최대 ${SCHOOL_EXAM_MAX_COUNT}개까지 입력할 수 있습니다.`,
    };
  }

  const value: SchoolExamResult[] = [];
  const names = new Set<string>();
  for (const row of input) {
    const validated = validateSchoolExamResult(row);
    if (!validated.ok) return validated;
    const duplicateKey = validated.value.schoolSubjectName.toLocaleLowerCase("ko");
    if (names.has(duplicateKey)) {
      return {
        ok: false,
        error: `같은 학교 과목을 중복해서 입력할 수 없습니다: ${validated.value.schoolSubjectName}`,
      };
    }
    names.add(duplicateKey);
    value.push(validated.value);
  }
  return { ok: true, value };
}

function safeStoredScore(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : null;
}

/**
 * 저장된 값을 클라이언트용으로 정규화한다.
 * 기존 저장값을 여러 학교 과목 목록으로 정규화한다.
 * 예전 현재-수강반 연결용 subject 필드는 읽되 클라이언트에는 노출하지 않는다.
 */
export function serializeSchoolExamResults(value: unknown): SchoolExamResult[] {
  const stored: SchoolExamResult[] = [];

  if (Array.isArray(value)) {
    for (const row of value) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const item = row as Record<string, unknown>;
      const schoolSubjectName =
        typeof item.schoolSubjectName === "string"
          ? item.schoolSubjectName.trim().slice(0, SCHOOL_EXAM_NAME_MAX_LENGTH)
          : "";
      const midtermScore = safeStoredScore(item.midtermScore);
      const finalScore = safeStoredScore(item.finalScore);
      const grade =
        typeof item.grade === "string"
          ? item.grade.trim().slice(0, SCHOOL_EXAM_GRADE_MAX_LENGTH)
          : "";
      // 기존에 저장된 점수는 과목명이 아직 비어 있어도 학생이 이름을 보완할 수 있게 보존한다.
      if (
        !schoolSubjectName &&
        midtermScore == null &&
        finalScore == null &&
        !grade
      ) {
        continue;
      }
      stored.push({
        schoolSubjectName,
        midtermScore,
        finalScore,
        grade,
      });
    }
  }
  return stored.slice(0, SCHOOL_EXAM_MAX_COUNT);
}
