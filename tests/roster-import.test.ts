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

const sheetRow = (sheet: string, line: number, name: string, phone: string, subject: string) => ({
  ...row(line, name, phone, subject),
  sheet,
});

test("같은 이름의 반이 공백만 다르게 둘 있으면 고른 반 그대로 저장한다", () => {
  const subjects = ["고2  확통", "고2 확통"];
  for (const chosen of subjects) {
    const result = consolidateRosterRecords([row(2, "김민수", "01012345678", chosen)], subjects);
    assert.deepEqual(result.candidates[0].subjects, [chosen]);
  }
});

test("엑셀 반 이름별로 학생 묶음을 만든다 (같은 학생은 한 번만 센다)", () => {
  const groups = rosterSubjectGroups([
    sheetRow("A", 2, "김민수", "01012345678", "[공수2]오현민T"),
    sheetRow("A", 3, "김 민수", "010-1234-5678", "[공수2]오현민T"),
    sheetRow("A", 4, "이영희", "01087654321", ""),
    sheetRow("B", 5, "박지민", "01011112222", "[확통]오현민T"),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.subject, g.sheet, g.students]),
    [
      ["[공수2]오현민T", "A", 1],
      ["", "A", 1],
      ["[확통]오현민T", "B", 1],
    ]
  );
});

test("반명이 없는 행은 시트마다 따로 묶는다", () => {
  const records = [
    sheetRow("공수2", 2, "김민수", "01012345678", ""),
    sheetRow("확통", 2, "이영희", "01087654321", ""),
  ];
  const groups = rosterSubjectGroups(records);
  assert.equal(groups.length, 2);
  const mapped = applyRosterSubjectMap(
    records,
    { [groups[0].key]: "공수2", [groups[1].key]: "확통" },
    ["공수2", "확통"]
  );
  assert.deepEqual(mapped.map((r) => [r.name, r.subject]), [
    ["김민수", "공수2"],
    ["이영희", "확통"],
  ]);
});

test("고른 반으로 바꾸고, 고르지 않았거나 가져오지 않는 묶음은 뺀다", () => {
  const records = [
    row(2, "김민수", "01012345678", "[공수2]오현민T"),
    row(3, "이영희", "01087654321", ""),
    row(4, "박지민", "01011112222", "[확통]오현민T"),
    row(5, "최유리", "01033334444", "[미적1]오현민T"),
  ];
  const keys = rosterSubjectGroups(records).map((g) => g.key);
  const mapped = applyRosterSubjectMap(
    records,
    { [keys[0]]: "공수2", [keys[1]]: "공수2", [keys[2]]: "skip", [keys[3]]: "" },
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
