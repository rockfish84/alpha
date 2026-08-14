import test from "node:test";
import assert from "node:assert/strict";
import {
  getClinicDatesForSubject,
  isClinicDate,
  mergeClinicDates,
  normalizeClinicDatesBySubject,
} from "../lib/clinic-dates";

test("과목별 날짜는 중복을 제거하고 정렬한다", () => {
  assert.deepEqual(
    normalizeClinicDatesBySubject({
      "고2 확통": ["2026-08-23", "2026-08-16", "2026-08-16", "invalid"],
    }),
    { "고2 확통": ["2026-08-16", "2026-08-23"] }
  );
});

test("과목 key가 있으면 빈 배열도 공통 날짜보다 우선한다", () => {
  const term = {
    clinicDates: ["2026-08-15", "2026-08-16"],
    clinicDatesBySubject: { "고2 확통": [] },
  };
  assert.deepEqual(getClinicDatesForSubject(term, "고2 확통"), []);
});

test("과목 key가 없는 기존 학기는 공통 날짜로 폴백한다", () => {
  const term = {
    clinicDates: ["2026-08-16", "2026-08-15"],
    clinicDatesBySubject: {},
  };
  assert.deepEqual(getClinicDatesForSubject(term, "고1 공수2"), [
    "2026-08-15",
    "2026-08-16",
  ]);
});

test("과목별 일정 모드에서 누락된 과목은 전체 union으로 폴백하지 않는다", () => {
  const term = {
    clinicDates: ["2026-08-15", "2026-08-16"],
    clinicDatesBySubject: { "고2 확통": ["2026-08-16"] },
  };
  assert.deepEqual(getClinicDatesForSubject(term, "고1 공수2"), []);
});

test("과목별 날짜 union을 정렬해 만든다", () => {
  assert.deepEqual(
    mergeClinicDates({
      A: ["2026-08-16"],
      B: ["2026-08-15", "2026-08-16"],
    }),
    ["2026-08-15", "2026-08-16"]
  );
});

test("실제로 존재하는 ISO 날짜만 허용한다", () => {
  assert.equal(isClinicDate("2026-02-28"), true);
  assert.equal(isClinicDate("2026-02-29"), false);
  assert.equal(isClinicDate("2026-8-15"), false);
  assert.equal(isClinicDate(20260815), false);
});
