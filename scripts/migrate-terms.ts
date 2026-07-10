/**
 * 학기(Term) 도입 마이그레이션.
 *   npx tsx scripts/migrate-terms.ts ["학기이름"]
 *   기본 학기이름: "2026 여름특강"
 *
 * - 기존 Settings(subjects·clinicDates)를 새 Term 으로 옮김 (active)
 * - 모든 Student 를 이 학기에 Enrollment 로 등록 (legacy grade·subjects·status 사용)
 * - 모든 Session·TestConfig 에 term 부여
 * - 여러 번 실행해도 안전 (idempotent)
 */
import "dotenv/config";
import mongoose from "mongoose";
import { dbConnect } from "../lib/db";
import { Term, Student, Enrollment, Session, TestConfig } from "../lib/models";

async function main() {
  const termName = process.argv[2] || "2026 여름특강";
  await dbConnect();
  console.log("● 연결됨");

  // 1) 기존 Settings 읽기 (raw collection)
  const settings = await mongoose.connection
    .collection("settings")
    .findOne({ key: "app" });
  const subjects = (settings?.subjects as string[]) ?? [];
  const clinicDates = (settings?.clinicDates as string[]) ?? [];

  // 2) Term 생성/재사용
  let term = await Term.findOne({ name: termName });
  if (!term) {
    // 활성 학기가 없으면 이 학기를 활성으로
    const hasActive = await Term.exists({ active: true });
    term = await Term.create({
      name: termName,
      subjects,
      clinicDates,
      active: !hasActive,
      order: 1,
    });
    console.log(`● Term 생성: ${termName} (활성 ${term.active})`);
  } else {
    console.log(`● Term 재사용: ${termName}`);
  }
  const termId = term._id;

  // 3) 모든 Student → Enrollment
  const studentsAll = await Student.find().lean();
  let enrolled = 0;
  for (const s of studentsAll) {
    const res = await Enrollment.updateOne(
      { term: termId, student: s._id },
      {
        $setOnInsert: {
          grade: (s as any).grade ?? "",
          subjects: (s as any).subjects ?? [],
          status: (s as any).status ?? "재원",
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount) enrolled++;
  }
  console.log(`● Enrollment: 신규 ${enrolled} / 전체 ${studentsAll.length}`);

  // 4) term 없는 Session·TestConfig 에 term 부여
  const sres = await Session.updateMany(
    { term: { $exists: false } },
    { $set: { term: termId } }
  );
  const tres = await TestConfig.updateMany(
    { term: { $exists: false } },
    { $set: { term: termId } }
  );
  console.log(`● Session ${sres.modifiedCount}건 · TestConfig ${tres.modifiedCount}건 term 부여`);

  // 5) 인덱스 재동기화
  await Promise.all([
    Term.syncIndexes(),
    Enrollment.syncIndexes(),
    Session.syncIndexes(),
    TestConfig.syncIndexes(),
  ]);
  console.log("● 인덱스 동기화 완료");

  await mongoose.disconnect();
  console.log("✔ 마이그레이션 완료");
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});
