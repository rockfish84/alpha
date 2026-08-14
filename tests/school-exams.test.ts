import test from "node:test";
import assert from "node:assert/strict";
import {
  SCHOOL_EXAM_SUBJECTS,
  isSchoolExamSubject,
  serializeSchoolExamResults,
  validateSchoolExamResult,
  validateSchoolExamResults,
} from "../lib/school-exams";

test("성적 입력 대상은 지정된 세 수업뿐이다", () => {
  for (const subject of SCHOOL_EXAM_SUBJECTS) {
    assert.equal(isSchoolExamSubject(subject), true);
  }
  assert.equal(isSchoolExamSubject("공수1,2 심화"), false);
  assert.equal(isSchoolExamSubject("고2 미적분2"), false);
});

test("유효한 점수와 등급을 정규화한다", () => {
  const result = validateSchoolExamResult({
    schoolSubjectName: " 수학Ⅱ ",
    midtermScore: 91.5,
    finalScore: null,
    grade: " 2등급 ",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, {
      schoolSubjectName: "수학Ⅱ",
      midtermScore: 91.5,
      finalScore: null,
      grade: "2등급",
    });
  }
});

test("범위를 벗어나거나 숫자가 아닌 점수를 거부한다", () => {
  for (const score of [-1, 101, Number.NaN, "90"]) {
    const result = validateSchoolExamResult({
      schoolSubjectName: "수학Ⅰ",
      midtermScore: score,
      finalScore: null,
      grade: "",
    });
    assert.equal(result.ok, false);
  }
});

test("미입력 상태는 빈 학교 과목 목록으로 반환한다", () => {
  assert.deepEqual(serializeSchoolExamResults([]), []);
});

test("학생이 입력한 여러 학교 과목을 모두 직렬화한다", () => {
  const stored = [
    {
      schoolSubjectName: "수학Ⅱ",
      midtermScore: 88,
      finalScore: 92,
      grade: "2",
    },
    {
      schoolSubjectName: "확률과 통계",
      midtermScore: 76,
      finalScore: 81,
      grade: "3",
    },
  ];

  assert.deepEqual(serializeSchoolExamResults(stored), stored);
});

test("1학기 학교 과목명은 필수이며 공백을 정리한다", () => {
  const missing = validateSchoolExamResult({
    schoolSubjectName: "   ",
    midtermScore: 90,
    finalScore: 95,
    grade: "1",
  });
  assert.equal(missing.ok, false);

  const valid = validateSchoolExamResult({
    schoolSubjectName: "  수학Ⅱ  ",
    midtermScore: 90,
    finalScore: 95,
    grade: "1",
  });
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.value.schoolSubjectName, "수학Ⅱ");
});

test("여러 학교 과목을 한 번에 검증하고 중복 과목명을 거부한다", () => {
  const valid = validateSchoolExamResults([
    {
      schoolSubjectName: "수학Ⅰ",
      midtermScore: 90,
      finalScore: 95,
      grade: "1",
    },
    {
      schoolSubjectName: "확률과 통계",
      midtermScore: 88,
      finalScore: 92,
      grade: "2",
    },
  ]);
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.value.length, 2);

  const duplicate = validateSchoolExamResults([
    {
      schoolSubjectName: "수학Ⅰ",
      midtermScore: null,
      finalScore: null,
      grade: "",
    },
    {
      schoolSubjectName: " 수학Ⅰ ",
      midtermScore: null,
      finalScore: null,
      grade: "",
    },
  ]);
  assert.equal(duplicate.ok, false);

  const tooMany = validateSchoolExamResults(
    Array.from({ length: 11 }, (_, index) => ({
      schoolSubjectName: `과목 ${index + 1}`,
      midtermScore: null,
      finalScore: null,
      grade: "",
    }))
  );
  assert.equal(tooMany.ok, false);
});
