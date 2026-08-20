import test from "node:test";
import assert from "node:assert/strict";
import {
  isSubjectClosed,
  normalizeClosedSubjects,
  openSubjects,
  visibleSubjects,
} from "../lib/subject-status";

test("종료된 반 목록은 중복·공백을 정리하고 학기에 없는 반은 버린다", () => {
  assert.deepEqual(
    normalizeClosedSubjects(
      [" 고2 확통 ", "고2 확통", "없는 반", "", 3],
      ["고1 공수2", "고2 확통"]
    ),
    ["고2 확통"]
  );
});

test("subjects 를 주지 않으면 그대로 정규화만 한다", () => {
  assert.deepEqual(normalizeClosedSubjects(["고2 확통"]), ["고2 확통"]);
  assert.deepEqual(normalizeClosedSubjects(undefined), []);
});

test("진행 중인 반만 원래 순서대로 남긴다", () => {
  const term = {
    subjects: ["고1 공수2", "고2 미적분1", "고2 확통"],
    closedSubjects: ["고2 미적분1"],
  };
  assert.deepEqual(openSubjects(term), ["고1 공수2", "고2 확통"]);
  assert.equal(isSubjectClosed(term, "고2 미적분1"), true);
  assert.equal(isSubjectClosed(term, "고2 확통"), false);
});

test("종료 표시가 없는 기존 학기는 모든 반이 진행중이다", () => {
  const term = { subjects: ["고1 공수2"] };
  assert.deepEqual(openSubjects(term), ["고1 공수2"]);
  assert.equal(isSubjectClosed(term, "고1 공수2"), false);
});

test("includeClosed 면 종료된 반까지 노출한다", () => {
  const term = { subjects: ["A", "B"], closedSubjects: ["B"] };
  assert.deepEqual(visibleSubjects(term, false), ["A"]);
  assert.deepEqual(visibleSubjects(term, true), ["A", "B"]);
  assert.deepEqual(visibleSubjects(null, false), []);
});
