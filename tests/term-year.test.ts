import test from "node:test";
import assert from "node:assert/strict";
import { termYear } from "../lib/term";

test("학년도는 지정값 > 이름 > 시작일 순으로 고른다", () => {
  assert.equal(termYear({ year: 2027, name: "2026 2학기" }), 2027);
  assert.equal(termYear({ name: "2026 2학기" }), 2026);
  assert.equal(termYear({ name: "여름특강", startDate: "2028-07-01" }), 2028);
  // 아무 단서도 없으면 올해로 본다 (진급 0년)
  assert.equal(termYear({ name: "특강" }), new Date().getFullYear());
});

test("학년도 차이가 곧 올릴 학년 수가 된다", () => {
  const from = termYear({ name: "2026 2학기" });
  const to = termYear({ name: "2028 1학기" });
  assert.equal(to - from, 2);
});
