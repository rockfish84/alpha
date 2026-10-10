import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRosterSubjectMap,
  consolidateRosterRecords,
  nextRosterUsername,
  rosterIdentityKey,
  rosterSubjectGroups,
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

const row = (line: number, name: string, phone: string, subject: string) => ({
  line,
  name,
  phone,
  subject,
  school: "",
  grade: "",
  note: "",
});

test("기존 반 목록을 주면 목록에 없는 반은 반영하지 않는다", () => {
  const result = consolidateRosterRecords(
    [row(2, "김민수", "01012345678", "공수2"), row(3, "이영희", "01087654321", "[확통]오현민T")],
    ["공수2", "확통"]
  );
  assert.deepEqual(result.candidates.map((c) => c.name), ["김민수"]);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].reason, /기존 반이 아닙니다/);
});

test("기존 반 이름은 공백까지 원래대로 저장한다", () => {
  const result = consolidateRosterRecords(
    [row(2, "김민수", "01012345678", "공수1,2 심화")],
    ["공수1,2  심화"]
  );
  assert.deepEqual(result.candidates[0].subjects, ["공수1,2  심화"]);
});

test("엑셀 반 이름별로 학생 묶음을 만든다 (같은 학생은 한 번만 센다)", () => {
  const groups = rosterSubjectGroups([
    row(2, "김민수", "01012345678", "[공수2]오현민T"),
    row(3, "김 민수", "010-1234-5678", "[공수2]오현민T"),
    row(4, "이영희", "01087654321", ""),
    row(5, "박지민", "01011112222", "[확통]오현민T"),
  ]);
  assert.deepEqual(groups, [
    { name: "[공수2]오현민T", students: 1 },
    { name: "", students: 1 },
    { name: "[확통]오현민T", students: 1 },
  ]);
});

test("고른 반으로 바꾸고, 고르지 않았거나 가져오지 않는 묶음은 뺀다", () => {
  const records = [
    row(2, "김민수", "01012345678", "[공수2]오현민T"),
    row(3, "이영희", "01087654321", ""),
    row(4, "박지민", "01011112222", "[확통]오현민T"),
    row(5, "최유리", "01033334444", "[미적1]오현민T"),
  ];
  const mapped = applyRosterSubjectMap(
    records,
    { "[공수2]오현민T": "공수2", "": "공수2", "[확통]오현민T": "skip", "[미적1]오현민T": "" },
    ["공수2", "확통"]
  );
  assert.deepEqual(
    mapped.map((r) => [r.name, r.subject]),
    [
      ["김민수", "공수2"],
      ["이영희", "공수2"],
    ]
  );
});
