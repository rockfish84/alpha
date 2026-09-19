import test from "node:test";
import assert from "node:assert/strict";
import {
  consolidateRosterRecords,
  nextRosterUsername,
  rosterIdentityKey,
} from "../lib/roster-import";

test("이름+학부모 번호가 같은 여러 반 행을 한 학생으로 합친다", () => {
  const result = consolidateRosterRecords([
    { line: 4, sheet: "A반", name: "김 민수", phone: "010-1234-5678", school: "둔산중", grade: "중2", subject: "공수1", note: "" },
    { line: 9, sheet: "B반", name: "김민수", phone: "01012345678", school: "둔산중", grade: "중2", subject: "공수2", note: "" },
  ]);
  assert.equal(result.errors.length, 0);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.candidates[0].subjects, ["공수1", "공수2"]);
  assert.deepEqual(result.candidates[0].sources, ["A반 4행", "B반 9행"]);
});

test("반명이나 번호가 없는 행은 반영 후보에서 제외한다", () => {
  const result = consolidateRosterRecords([
    { line: 2, name: "김철수", phone: "01012345678", school: "", grade: "", subject: "", note: "" },
    { line: 3, name: "이영희", phone: "123", school: "", grade: "", subject: "수학", note: "" },
  ]);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.errors.length, 2);
});

test("매칭 키는 이름 공백과 번호 기호를 무시한다", () => {
  assert.equal(
    rosterIdentityKey("김 민수", "010-1234-5678"),
    rosterIdentityKey("김민수", "01012345678")
  );
});

test("새 아이디가 겹치면 숫자 접미사를 붙인다", () => {
  const taken = new Set(["김민수둔산중", "김민수둔산중2"]);
  assert.equal(nextRosterUsername("김민수둔산중", taken), "김민수둔산중3");
});
