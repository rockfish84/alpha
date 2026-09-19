import test from "node:test";
import assert from "node:assert/strict";
import {
  findHeader,
  gradeOf,
  parseRoster,
  pickParentPhone,
} from "../lib/roster-excel";

/* 실제 쓰는 엑셀 3종의 머리행 모양 (제목 줄 수·열 순서가 제각각이다) */
const 특강명단 = [
  ["7.10 기준 특강 수강신청 명단", "", "", "", "", "", ""],
  ["NO", "반명", "학생명", "학교명", "학년", "부모핸드폰", "학생핸드폰"],
  ["1", "중등 공수 개념", "공유원", "문정중", "1 ", "010-9361-6280(모)\r\n010-7166-6280(부)", "010-4487-6280"],
  ["2", "중등 공수 개념", "김가연", "삼천중", "2 ", "010-7749-3382", "010-9759-3382"],
];

const 신청명단 = [
  ["[공수2]오현민T(토/일)P5-8(8/15)", "", "", "", ""],
  ["", "", "", "", ""],
  ["성명", "부모핸드폰", "학생핸드폰", "학교", "학년"],
  ["고준표", "010-2933-0450", "010-4626-0450", "서대전고", "1"],
];

test("제목 줄이 몇 줄이든 머리행을 찾는다", () => {
  assert.equal(findHeader(특강명단).index, 1);
  assert.equal(findHeader(신청명단).index, 2);
  // 열 순서가 달라도 이름으로 찾는다
  assert.equal(findHeader(특강명단).columns.name, 2);
  assert.equal(findHeader(신청명단).columns.name, 0);
  assert.equal(findHeader(특강명단).columns.subject, 1);
});

test("반명이 있는 양식과 없는 양식을 모두 읽는다", () => {
  const a = parseRoster(특강명단);
  assert.equal(a.records.length, 2);
  assert.deepEqual(
    { ...a.records[0], line: 0 },
    {
      line: 0,
      name: "공유원",
      school: "문정중",
      grade: "중1",
      subject: "중등 공수 개념",
      phone: "01093616280",
      note: "번호 2개 중 모 선택",
    }
  );

  const b = parseRoster(신청명단);
  assert.equal(b.records.length, 1);
  assert.equal(b.records[0].name, "고준표");
  assert.equal(b.records[0].grade, "고1");
  // 반명 열이 없어도 머리행 위의 반 제목을 이어받는다
  assert.equal(b.records[0].subject, "[공수2]오현민T(토/일)P5-8(8/15)");
});

test("한 시트 안에서 반 제목이 바뀌면 아래 학생에게 새 반을 붙인다", () => {
  const rows = [
    ["[공수2]오현민T(토/일)P5-8(8/15)"],
    ["성명", "부모핸드폰", "학생핸드폰", "학교", "학년"],
    ["고준표", "010-2933-0450", "", "서대전고", "1"],
    ["[확통]오현민T(일)A10-1(8/16)"],
    ["김민솔", "010-3384-7353", "", "대덕고", "1"],
  ];
  const r = parseRoster(rows);
  assert.equal(r.records.length, 2);
  assert.equal(r.records[0].subject, "[공수2]오현민T(토/일)P5-8(8/15)");
  assert.equal(r.records[1].subject, "[확통]오현민T(일)A10-1(8/16)");
  assert.equal(r.errors.length, 0);
});

test("학부모 번호는 모(母) 를 먼저 쓴다", () => {
  assert.equal(pickParentPhone("010-1111-2222(모)\n010-3333-4444(부)").phone, "01011112222");
  assert.equal(pickParentPhone("010-3333-4444(부)\n010-1111-2222(모)").phone, "01011112222");
  // 표기가 없으면 첫 번호
  assert.equal(pickParentPhone("010-5555-6666").phone, "01055556666");
  // 부 번호만 있으면 쓰되 표시를 남긴다
  const only = pickParentPhone("010-7777-8888(부)");
  assert.equal(only.phone, "01077778888");
  assert.match(only.note, /부 번호/);
  assert.equal(pickParentPhone("").phone, "");
  assert.equal(pickParentPhone("없음").phone, "");
});

test("학년은 학교 끝 글자로 급을 붙인다", () => {
  assert.equal(gradeOf("문정중", "1"), "중1");
  assert.equal(gradeOf("서대전고", "2 "), "고2");
  assert.equal(gradeOf("한밭초", "6"), "초6");
  // 학교를 모르면 숫자만 남긴다 (사람이 고치게)
  assert.equal(gradeOf("", "3"), "3");
  assert.equal(gradeOf("문정중", ""), "");
});

test("번호가 없는 줄은 오류로 모아 알려 준다", () => {
  const rows = [
    ["성명", "부모핸드폰", "학교", "학년"],
    ["김철수", "", "문정중", "1"],
    ["", "", "", ""],
    ["이영희", "010-1234-5678", "삼천중", "2"],
  ];
  const r = parseRoster(rows);
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].name, "이영희");
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].reason, "번호 없음");
  assert.match(r.errors[0].raw, /김철수/);
});

test("머리행을 못 찾으면 그렇게 알려 준다", () => {
  const r = parseRoster([["아무", "의미", "없는"], ["값", "들", ""]]);
  assert.equal(r.records.length, 0);
  assert.match(r.errors[0].reason, /머리행/);
});
