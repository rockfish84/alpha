import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceGrade,
  GRADUATED,
  gradeOrder,
  graduatesNext,
  nextGrade,
  parseGrade,
} from "../lib/grade";

test("학년 문자열을 급과 학년으로 읽는다", () => {
  assert.deepEqual(parseGrade("중3"), { level: "중", year: 3 });
  assert.deepEqual(parseGrade("고1"), { level: "고", year: 1 });
  assert.deepEqual(parseGrade(" 초6 "), { level: "초", year: 6 });
  // 그 급에 없는 학년은 읽지 않는다
  assert.equal(parseGrade("중4"), null);
  assert.equal(parseGrade("초7"), null);
  assert.equal(parseGrade("예비고1"), null);
  assert.equal(parseGrade(""), null);
});

test("한 학년 올리면 급이 바뀌는 지점이 맞다", () => {
  assert.equal(nextGrade("중1"), "중2");
  assert.equal(nextGrade("중2"), "중3");
  assert.equal(nextGrade("중3"), "고1"); // 중학교 → 고등학교
  assert.equal(nextGrade("초6"), "중1"); // 초등학교 → 중학교
  assert.equal(nextGrade("고1"), "고2");
  assert.equal(nextGrade("고2"), "고3");
});

test("고3은 올리면 졸업이다", () => {
  assert.equal(nextGrade("고3"), null);
  assert.equal(graduatesNext("고3"), true);
  assert.equal(graduatesNext("고2"), false);
  assert.equal(GRADUATED, "졸업");
});

test("읽을 수 없는 학년은 그대로 둔다 (마음대로 바꾸지 않는다)", () => {
  assert.equal(nextGrade("예비고1"), "예비고1");
  assert.equal(nextGrade(""), "");
  assert.equal(nextGrade(null), "");
  assert.equal(graduatesNext("예비고1"), false);
});

test("학년 정렬은 초1부터 고3까지 이어진다", () => {
  const order = ["고2", "중1", "초6", "고1", "중3"].sort(
    (a, b) => gradeOrder(a) - gradeOrder(b)
  );
  assert.deepEqual(order, ["초6", "중1", "중3", "고1", "고2"]);
  assert.equal(gradeOrder("초1"), 1);
  assert.equal(gradeOrder("중1"), 7);
  assert.equal(gradeOrder("고3"), 12);
  assert.ok(gradeOrder("알수없음") > gradeOrder("고3"));
});

test("여러 해를 한 번에 올린다 (몇 년 만에 돌아온 학생)", () => {
  assert.equal(advanceGrade("중1", 0), "중1"); // 같은 학년도면 그대로
  assert.equal(advanceGrade("중1", 1), "중2");
  assert.equal(advanceGrade("중2", 2), "고1"); // 중2 → 중3 → 고1
  assert.equal(advanceGrade("중3", 2), "고2");
  assert.equal(advanceGrade("초6", 3), "중3");
  // 도중에 고3을 넘어가면 졸업
  assert.equal(advanceGrade("고2", 2), null);
  assert.equal(advanceGrade("고3", 1), null);
  // 읽을 수 없는 값은 몇 해가 지나도 그대로
  assert.equal(advanceGrade("예비고1", 3), "예비고1");
});
