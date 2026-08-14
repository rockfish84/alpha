/**
 * 2026 여름특강/2학기의 과목별 클리닉 날짜를 설정한다.
 *
 * 기본은 읽기 전용 DRY RUN이며, 실제 반영은 --apply가 있어야 한다.
 * Enrollment, Session, TestConfig는 수정하거나 삭제하지 않는다.
 * 기존 Session/TestConfig가 있는 과거 날짜는 각 과목 일정에 합쳐 보존한다.
 *
 *   npx tsx scripts/setup-subject-clinic-dates.ts
 *   npx tsx scripts/setup-subject-clinic-dates.ts --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import { dbConnect } from "../lib/db";
import { Session, Term, TestConfig } from "../lib/models";
import { isoDate } from "../lib/date";
import {
  mergeClinicDates,
  normalizeClinicDates,
  normalizeClinicDatesBySubject,
  type ClinicDatesBySubject,
} from "../lib/clinic-dates";

type RequestedSchedule = {
  start: string;
  end: string;
  weekdays: readonly number[]; // UTC: 일=0, 토=6
};

const REQUESTS: Record<string, Record<string, RequestedSchedule>> = {
  "2026 여름특강": {
    "공수1,2 심화": { start: "2026-08-15", end: "2026-11-08", weekdays: [6] },
    "중등 대수미적 개념": {
      start: "2026-08-15",
      end: "2026-11-08",
      weekdays: [0],
    },
    "중등 공수 개념": {
      start: "2026-08-15",
      end: "2026-09-27",
      weekdays: [0, 6],
    },
  },
  "2026 2학기": {
    "고1 공수2": { start: "2026-08-15", end: "2026-10-11", weekdays: [0, 6] },
    "고2 미적분1": {
      start: "2026-08-15",
      end: "2026-10-11",
      weekdays: [0, 6],
    },
    "고2 확통": { start: "2026-08-16", end: "2026-10-11", weekdays: [0] },
  },
};

function datesFor({ start, end, weekdays }: RequestedSchedule): string[] {
  const dates: string[] = [];
  const current = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (current <= last) {
    if (weekdays.includes(current.getUTCDay())) dates.push(isoDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function sameDates(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((date, i) => date === right[i]);
}

function sameSchedule(
  left: ClinicDatesBySubject,
  right: ClinicDatesBySubject,
  subjects: readonly string[]
): boolean {
  return subjects.every((subject) =>
    sameDates(left[subject] ?? [], right[subject] ?? [])
  );
}

async function buildSchedule(
  term: any
): Promise<{ schedule: ClinicDatesBySubject; usedDates: ClinicDatesBySubject }> {
  const subjects = [...new Set((term.subjects ?? []) as string[])];
  const usedDates: ClinicDatesBySubject = Object.fromEntries(
    subjects.map((subject) => [subject, []])
  );
  const existingMap = normalizeClinicDatesBySubject(
    term.clinicDatesBySubject,
    subjects
  );

  const [sessions, configs] = await Promise.all([
    Session.find({ term: term._id }, { subject: 1, date: 1, _id: 0 }).lean(),
    TestConfig.find({ term: term._id }, { subject: 1, date: 1, _id: 0 }).lean(),
  ]);

  for (const record of [...sessions, ...configs]) {
    if (!usedDates[record.subject]) usedDates[record.subject] = [];
    usedDates[record.subject].push(isoDate(record.date));
  }

  const requested = REQUESTS[term.name];
  const schedule: ClinicDatesBySubject = {};
  for (const subject of subjects) {
    const future = requested[subject] ? datesFor(requested[subject]) : [];
    // 과목별 설정 전의 공통 날짜 자체는 과거 수업의 증거가 아니다.
    // 실제 기록 날짜만 보존해 여름 고등반이 2학기와 중복 운영되지 않게 한다.
    schedule[subject] = [
      ...new Set([
        ...(existingMap[subject] ?? []),
        ...(usedDates[subject] ?? []),
        ...future,
      ]),
    ].sort();
  }
  return { schedule, usedDates };
}

function validateRequestedSchedules(): void {
  const second = REQUESTS["2026 2학기"];
  const summer = REQUESTS["2026 여름특강"];
  const expectations: Array<[string, string[], number, string, string]> = [
    ["2학기 공수2", datesFor(second["고1 공수2"]), 18, "2026-08-15", "2026-10-11"],
    ["2학기 미적분1", datesFor(second["고2 미적분1"]), 18, "2026-08-15", "2026-10-11"],
    ["2학기 확통", datesFor(second["고2 확통"]), 9, "2026-08-16", "2026-10-11"],
    ["여름 공수 심화", datesFor(summer["공수1,2 심화"]), 13, "2026-08-15", "2026-11-07"],
    ["여름 대수미적", datesFor(summer["중등 대수미적 개념"]), 13, "2026-08-16", "2026-11-08"],
    ["여름 공수", datesFor(summer["중등 공수 개념"]), 14, "2026-08-15", "2026-09-27"],
  ];

  for (const [label, dates, count, first, last] of expectations) {
    if (dates.length !== count || dates[0] !== first || dates.at(-1) !== last) {
      throw new Error(`${label} 날짜 생성 검증 실패`);
    }
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  validateRequestedSchedules();
  await dbConnect();

  const names = Object.keys(REQUESTS);
  const terms = await Term.find({ name: { $in: names } }).sort({ name: 1 }).lean();
  if (terms.length !== names.length) {
    const found = new Set(terms.map((term) => term.name));
    throw new Error(`학기를 찾을 수 없습니다: ${names.filter((name) => !found.has(name)).join(", ")}`);
  }

  const updates: Array<{
    term: (typeof terms)[number];
    beforeMap: ClinicDatesBySubject;
    afterMap: ClinicDatesBySubject;
    afterUnion: string[];
  }> = [];

  for (const term of terms) {
    const requestedSubjects = Object.keys(REQUESTS[term.name]);
    const missingSubjects = requestedSubjects.filter(
      (subject) => !(term.subjects ?? []).includes(subject)
    );
    if (missingSubjects.length) {
      throw new Error(`${term.name}에 수업이 없습니다: ${missingSubjects.join(", ")}`);
    }

    const subjects = (term.subjects ?? []) as string[];
    const beforeMap = normalizeClinicDatesBySubject(
      term.clinicDatesBySubject,
      subjects
    );
    const { schedule: afterMap, usedDates } = await buildSchedule(term);
    const afterUnion = mergeClinicDates(afterMap);
    const legacyWarnings: string[] = [];

    if (term.name === "2026 여름특강") {
      const requested = REQUESTS[term.name];
      for (const subject of subjects.filter((item) => !requested[item])) {
        const overlappingDates = (afterMap[subject] ?? []).filter(
          (date) => date >= "2026-08-15"
        );
        if (overlappingDates.length) {
          throw new Error(
            `${term.name} 비대상 고등반 ${subject}에 8/15 이후 날짜가 남음: ${overlappingDates.join(", ")}`
          );
        }
      }
    }

    // 데이터는 삭제하지 않으므로 모든 기존 기록 날짜가 새 과목 일정에도 보여야 한다.
    for (const [subject, dates] of Object.entries(usedDates)) {
      if (!(term.subjects ?? []).includes(subject)) {
        const missingFromUnion = dates.filter((date) => !afterUnion.includes(date));
        if (missingFromUnion.length) {
          throw new Error(
            `${term.name} legacy 과목 ${subject} 날짜가 union에서 누락됨: ${missingFromUnion.join(", ")}`
          );
        }
        legacyWarnings.push(
          `- 경고: 반 목록 밖 legacy 과목 '${subject}' 기록 ${dates.length}개 날짜는 이동·삭제하지 않고 union으로 보존`
        );
        continue;
      }
      const missingDates = dates.filter(
        (date) => !(afterMap[subject] ?? []).includes(date)
      );
      if (missingDates.length) {
        throw new Error(
          `${term.name} ${subject} 기존 기록 날짜 누락: ${missingDates.join(", ")}`
        );
      }
    }
    const removedCommonDates = normalizeClinicDates(term.clinicDates).filter(
      (date) => !afterUnion.includes(date)
    );
    if (removedCommonDates.length) {
      throw new Error(
        `${term.name} 기존 공통 날짜가 union에서 제거됨: ${removedCommonDates.join(", ")}`
      );
    }
    updates.push({ term, beforeMap, afterMap, afterUnion });

    const unchanged =
      sameSchedule(beforeMap, afterMap, subjects) &&
      sameDates([...(term.clinicDates ?? [])].sort(), afterUnion);
    console.log(`\n[${term.name}] ${unchanged ? "변경 없음" : "변경 예정"}`);
    for (const subject of subjects) {
      const dates = afterMap[subject] ?? [];
      console.log(
        `- ${subject}: ${dates.length}일${dates.length ? ` (${dates[0]} ~ ${dates.at(-1)})` : ""}`
      );
    }
    for (const warning of legacyWarnings) console.log(warning);
    console.log(`- 학기 전체 union: ${afterUnion.length}일`);
    console.log("- 기존 Session/TestConfig 날짜와 학기 전체 공통 날짜: 모두 보존");
  }

  if (!apply) {
    console.log("\nDRY RUN — DB를 변경하지 않았습니다. 반영하려면 --apply를 사용하세요.");
    return;
  }

  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      for (const { term, afterMap, afterUnion } of updates) {
        const result = await Term.updateOne(
          { _id: term._id, updatedAt: term.updatedAt },
          { $set: { clinicDatesBySubject: afterMap, clinicDates: afterUnion } },
          { session: dbSession }
        );
        if (result.matchedCount !== 1) {
          throw new Error(
            `${term.name}이 DRY RUN 이후 변경되었습니다. 다시 실행하세요.`
          );
        }
      }
    });
  } finally {
    await dbSession.endSession();
  }

  // 저장된 두 필드만 다시 읽어 정확히 반영됐는지 검증한다.
  for (const { term, afterMap, afterUnion } of updates) {
    const saved = await Term.findById(term._id).lean();
    if (!saved) throw new Error(`${term.name} 저장 후 조회 실패`);
    const subjects = (saved.subjects ?? []) as string[];
    const savedMap = normalizeClinicDatesBySubject(
      saved.clinicDatesBySubject,
      subjects
    );
    if (
      !sameSchedule(savedMap, afterMap, subjects) ||
      !sameDates([...(saved.clinicDates ?? [])].sort(), afterUnion)
    ) {
      throw new Error(`${term.name} 저장 검증 실패`);
    }
    const rebuilt = await buildSchedule(saved);
    if (!sameSchedule(rebuilt.schedule, afterMap, subjects)) {
      throw new Error(
        `${term.name} 적용 중 새 Session/TestConfig가 감지되었습니다. 다시 실행하세요.`
      );
    }
  }
  console.log("\n적용 및 재조회 검증 완료 (Session/Enrollment/TestConfig 변경 없음)");
}

main()
  .catch((error) => {
    console.error("실패:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
