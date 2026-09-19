import test from "node:test";
import assert from "node:assert/strict";
import { datesInRange } from "../lib/clinic-dates";

test("기간 안의 고른 요일을 모두 만든다", () => {
  // 2026-09-01(화) ~ 09-14(월) 사이의 토·일
  const got = datesInRange("2026-09-01", "2026-09-14", [0, 6]);
  assert.deepEqual(got, [
    "2026-09-05",
    "2026-09-06",
    "2026-09-12",
    "2026-09-13",
  ]);
});

test("시작·끝 날짜도 요일이 맞으면 포함한다", () => {
  const got = datesInRange("2026-09-05", "2026-09-06", [0, 6]);
  assert.deepEqual(got, ["2026-09-05", "2026-09-06"]);
});

test("요일을 안 고르거나 기간이 거꾸로면 만들지 않는다", () => {
  assert.deepEqual(datesInRange("2026-09-01", "2026-09-30", []), []);
  assert.deepEqual(datesInRange("2026-09-30", "2026-09-01", [6]), []);
  assert.deepEqual(datesInRange("", "2026-09-30", [6]), []);
  assert.deepEqual(datesInRange("2026-09-01", "안녕", [6]), []);
});

test("이상한 요일 값은 걸러낸다", () => {
  assert.deepEqual(datesInRange("2026-09-05", "2026-09-06", [6, 9, -1, 1.5]), [
    "2026-09-05",
  ]);
});

test("한 번에 400일까지만 만든다 (실수로 몇 년치를 넣지 않도록)", () => {
  const got = datesInRange("2026-01-01", "2030-12-31", [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(got.length, 400);
});
