import test from "node:test";
import assert from "node:assert/strict";
import { deliveredStudentIds } from "../lib/parent-notice";

const students = [
  { id: "a", phone: "010-1111-2222" },
  { id: "b", phone: "01033334444" },
  { id: "c", phone: "01033334444" }, // b 와 형제 (같은 번호)
  { id: "d", phone: "0101234" }, // 형식이 틀려 서버가 버린 번호
  { id: "e", phone: "" },
];

test("실패 목록에 없는, 형식이 맞는 번호의 학생만 전송으로 센다", () => {
  assert.deepEqual(deliveredStudentIds(students, { failedList: [] }), ["a", "b", "c"]);
});

test("실패한 번호는 빼고, 같은 번호를 쓰는 형제도 함께 뺀다", () => {
  assert.deepEqual(
    deliveredStudentIds(students, { failedList: [{ to: "01033334444" }] }),
    ["a"]
  );
  // 요청 자체가 실패하면 원래 번호(하이픈 포함)가 실패 목록에 들어온다
  assert.deepEqual(
    deliveredStudentIds(students, { failedList: [{ to: "010-1111-2222" }] }),
    ["b", "c"]
  );
});

test("테스트 모드로 다른 번호에 보냈으면 아무도 전송으로 세지 않는다", () => {
  assert.deepEqual(
    deliveredStudentIds(students, { failedList: [], redirectedTo: "01099998888" }),
    []
  );
});
