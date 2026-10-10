import test from "node:test";
import assert from "node:assert/strict";
import {
  deliveredStudentIds,
  noticeSentAtFor,
  noticeUnknown,
  planNoticeRecords,
} from "../lib/parent-notice";

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

test("학부모 번호가 바뀌면 새 번호로는 미전송이다", () => {
  const parent = { noticeSentAt: new Date("2026-10-10T03:00:00Z"), noticeSentTo: "01011112222" };
  assert.equal(noticeSentAtFor(parent, "010-1111-2222"), "2026-10-10T03:00:00.000Z");
  assert.equal(noticeSentAtFor(parent, "01099998888"), "");
  // 받은 번호가 없는 예전 기록은 그대로 인정한다
  assert.equal(
    noticeSentAtFor({ noticeSentAt: "2026-10-10T03:00:00Z", noticeSentTo: "" }, "01099998888"),
    "2026-10-10T03:00:00.000Z"
  );
  assert.equal(noticeSentAtFor({ noticeSentAt: null }, "01011112222"), "");
  assert.equal(noticeSentAtFor(null, "01011112222"), "");
});

test("화면에 보인 비밀번호·번호가 지금 값과 다르면 전송으로 기록하지 않는다", () => {
  const plan = planNoticeRecords(
    new Map([
      ["a", { password: "1234", phone: "01011112222" }],
      ["b", { password: "1111", phone: "01033334444" }], // 그 사이 재발급됨
      ["c", { password: "2222", phone: "01055556666" }], // 계정 없음
      ["d", { password: "3333", phone: "0101234" }], // 번호 형식 오류
      ["e", { password: "4444", phone: "01077778888" }], // 그 사이 번호가 바뀜
    ]),
    [
      { student: "a", password: "1234" },
      { student: "b", password: "5678" },
      { student: "d", password: "3333" },
      { student: "e", password: "4444" },
    ],
    new Map([
      ["a", "010-1111-2222"],
      ["b", "01033334444"],
      ["c", "01055556666"],
      ["d", "0101234"],
      ["e", "01099990000"],
    ])
  );
  assert.deepEqual(plan.recorded, [{ id: "a", sentTo: "01011112222" }]);
  assert.deepEqual(plan.skipped, [
    { id: "b", reason: "password" },
    { id: "c", reason: "account" },
    { id: "d", reason: "phone" },
    { id: "e", reason: "phone" },
  ]);
});

test("기록을 남기기 전에 만든 계정은 '기록 없음'이다", () => {
  // 예전 계정: noticeTracked 가 없고 보낸 기록도 없다
  assert.equal(noticeUnknown({ noticeSentAt: null }), true);
  assert.equal(noticeUnknown({}), true);
  // 새 계정·재발급·직접 정리한 계정은 기록을 믿을 수 있다
  assert.equal(noticeUnknown({ noticeSentAt: null, noticeTracked: true }), false);
  // 보낸 기록이 있으면 알 수 있다
  assert.equal(noticeUnknown({ noticeSentAt: new Date() }), false);
  assert.equal(noticeUnknown(null), false);
});
