/**
 * 프로토타입 데모 데이터 제거.
 *   npx tsx scripts/remove-demo.ts
 * - 데모 학생(minjun/seoyeon/jiho/hayoon)과 그 세션 삭제
 * - 데모용 2025년 TestConfig 삭제 (실제 명단엔 2025 회차 없음)
 */
import "dotenv/config";
import mongoose from "mongoose";
import { dbConnect } from "../lib/db";
import { Student, Session, TestConfig } from "../lib/models";

const DEMO_USERNAMES = ["minjun", "seoyeon", "jiho", "hayoon"];

async function main() {
  await dbConnect();
  console.log("● MongoDB 연결됨");

  const demo = await Student.find({ username: { $in: DEMO_USERNAMES } }).lean();
  const ids = demo.map((s) => s._id);

  const sess = await Session.deleteMany({ student: { $in: ids } });
  const stud = await Student.deleteMany({ _id: { $in: ids } });
  // 데모 TestConfig 는 2025년 날짜였음
  const tc = await TestConfig.deleteMany({
    date: { $gte: new Date("2025-01-01T00:00:00Z"), $lt: new Date("2026-01-01T00:00:00Z") },
  });

  console.log(`● 데모 학생 ${stud.deletedCount}명, 세션 ${sess.deletedCount}건, TestConfig ${tc.deletedCount}건 삭제`);

  const remain = await Student.countDocuments();
  console.log(`● 남은 학생 ${remain}명`);
  await mongoose.disconnect();
  console.log("✔ 완료");
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});
