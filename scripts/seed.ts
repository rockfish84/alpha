/**
 * 최초 1회 시드 스크립트.
 *   실행: npm run seed   (내부적으로 tsx scripts/seed.ts)
 *   Cloudtype web 터미널에서도 동일하게 `npm run seed` 로 실행.
 *
 * - 관리자 계정 1개 (bcrypt 해시)
 * - 앱 설정(과목 '수학', 클리닉 날짜)
 * - 데모 학생 / 세션 / 테스트 만점 (프로토타입과 동일한 예시 데이터)
 * - 끝에서 syncIndexes() 로 인덱스 확정
 *
 * 모두 upsert 방식이라 여러 번 실행해도 안전합니다.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { dbConnect } from "../lib/db";
import { Admin, Student, Session, TestConfig, Term, Enrollment } from "../lib/models";
import { toDate } from "../lib/date";

const CLINIC_DATES = [
  "2025-03-08", "2025-03-15", "2025-03-21", "2025-03-28", "2025-03-29",
  "2025-04-05", "2025-04-11", "2025-04-12", "2025-04-19", "2025-04-25",
  "2025-05-10", "2025-05-16", "2025-05-23", "2025-05-24", "2025-05-30",
  "2025-05-31", "2025-06-06", "2025-06-13", "2025-06-14", "2025-06-20", "2025-06-21",
];
const SUBJECTS = ["수학"];

const demoStudents = [
  { name: "김민준", username: "minjun", password: "1234", grade: "고2", subjects: ["수학"], status: "재원" },
  { name: "이서연", username: "seoyeon", password: "1234", grade: "고2", subjects: ["수학"], status: "재원" },
  { name: "박지호", username: "jiho", password: "1234", grade: "고3", subjects: ["수학"], status: "재원" },
  { name: "정하윤", username: "hayoon", password: "1234", grade: "고1", subjects: ["수학"], status: "퇴원" },
];

// "YYYY-MM-DD|과목": maxScore
const seedTestMax: Record<string, number> = {
  "2025-03-08|수학": 10, "2025-03-29|수학": 10, "2025-04-05|수학": 10,
  "2025-04-11|수학": 10, "2025-05-16|수학": 10, "2025-05-23|수학": 10,
  "2025-05-30|수학": 10, "2025-05-31|수학": 10, "2025-06-13|수학": 10,
  "2025-06-14|수학": 10, "2025-06-20|수학": 5,
};

type SeedSession = {
  username: string;
  date: string;
  subject: string;
  submitted: boolean;
  attendance: string;
  lateTime: string;
  absentReason: string;
  sources: string[];
  sourcesEtc: string;
  qNumbers: string;
  qTypes: string[];
  qTypesEtc: string;
  request: string;
  hwDone: boolean | null;
  testScore: number | null;
  solved: string;
  adminNote: string;
};

const mk = (o: Partial<SeedSession> & { username: string; date: string }): SeedSession => ({
  subject: "수학",
  submitted: true,
  attendance: "출석",
  lateTime: "",
  absentReason: "",
  sources: ["교재"],
  sourcesEtc: "",
  qNumbers: "",
  qTypes: [],
  qTypesEtc: "",
  request: "",
  hwDone: null,
  testScore: null,
  solved: "",
  adminNote: "",
  ...o,
});

const seedSessions: SeedSession[] = [
  // 김민준
  mk({ username: "minjun", date: "2025-03-08", hwDone: true, testScore: 9 }),
  mk({ username: "minjun", date: "2025-03-15", sources: ["쎈"], qNumbers: "쎈 20번", qTypes: ["풀어보았지만 답에 도달하지 못함"], solved: "20번", hwDone: true }),
  mk({ username: "minjun", date: "2025-03-21", hwDone: true }),
  mk({ username: "minjun", date: "2025-03-29", hwDone: true, testScore: 10 }),
  mk({ username: "minjun", date: "2025-04-05", sources: ["학교 프린트"], qNumbers: "프린트 5,7번", qTypes: ["개념이 부족한 것 같음"], hwDone: true, testScore: 8 }),
  mk({ username: "minjun", date: "2025-04-11", hwDone: true, testScore: 8 }),
  mk({ username: "minjun", date: "2025-05-10", hwDone: true }),
  mk({ username: "minjun", date: "2025-05-16", hwDone: true, testScore: 2 }),
  mk({ username: "minjun", date: "2025-05-23", hwDone: true, testScore: 7 }),
  mk({ username: "minjun", date: "2025-05-30", hwDone: true, testScore: 5 }),
  mk({ username: "minjun", date: "2025-05-31", testScore: 9, hwDone: false }),
  mk({ username: "minjun", date: "2025-06-13", hwDone: true, testScore: 3 }),
  mk({ username: "minjun", date: "2025-06-14", testScore: 9, hwDone: true }),
  mk({ username: "minjun", date: "2025-06-20", sources: ["개인 교재(수특 등)"], qNumbers: "올림포스 22, 23, 26", qTypes: ["접근법이 떠오르지 않아 시도하지 못함", "개념이 부족한 것 같음"], request: "유사 문제 추천 부탁드려요", hwDone: true, testScore: 4, solved: "22, 23번" }),
  mk({ username: "minjun", date: "2025-04-19", submitted: false, sources: [] }),
  mk({ username: "minjun", date: "2025-06-21", submitted: false, sources: [] }),

  // 이서연
  mk({ username: "seoyeon", date: "2025-03-08", attendance: "지각", lateTime: "10분", hwDone: true, testScore: 7 }),
  mk({ username: "seoyeon", date: "2025-03-29", hwDone: true, testScore: 9 }),
  mk({ username: "seoyeon", date: "2025-04-05", sources: ["교재", "쎈"], qNumbers: "교재 45번, 쎈 12번", qTypes: ["풀었지만 다른 해법이 있는지 궁금함"], hwDone: true, testScore: 9 }),
  mk({ username: "seoyeon", date: "2025-04-11", hwDone: false, testScore: 6 }),
  mk({ username: "seoyeon", date: "2025-05-16", hwDone: true, testScore: 8 }),
  mk({ username: "seoyeon", date: "2025-05-23", hwDone: true, testScore: 9 }),
  mk({ username: "seoyeon", date: "2025-05-30", hwDone: true, testScore: 4 }),
  mk({ username: "seoyeon", date: "2025-06-13", hwDone: true, testScore: 8 }),
  mk({ username: "seoyeon", date: "2025-06-20", sources: ["없음"], hwDone: true, testScore: 5 }),

  // 박지호
  mk({ username: "jiho", date: "2025-03-29", attendance: "결석", absentReason: "몸살", sources: ["없음"], hwDone: false }),
  mk({ username: "jiho", date: "2025-05-16", hwDone: true, testScore: 6 }),
  mk({ username: "jiho", date: "2025-06-13", hwDone: false, testScore: 3 }),
];

async function main() {
  await dbConnect();
  console.log("● MongoDB 연결됨");

  // 1) 관리자
  const adminU = process.env.SEED_ADMIN_USERNAME || "admin";
  const adminP = process.env.SEED_ADMIN_PASSWORD || "admin1234";
  const adminHash = await bcrypt.hash(adminP, 10);
  await Admin.findOneAndUpdate(
    { username: adminU },
    { $set: { password: adminHash } },
    { upsert: true, new: true }
  );
  console.log(`● 관리자 계정: ${adminU} (비밀번호: ${adminP})`);

  // 2) 학기 (데모)
  const term = await Term.findOneAndUpdate(
    { name: "데모 학기" },
    {
      $set: { subjects: SUBJECTS, clinicDates: CLINIC_DATES, active: true, order: 1 },
    },
    { upsert: true, new: true }
  );
  console.log(`● 학기: ${term!.name} · 과목 ${SUBJECTS.join(", ")} · 클리닉 ${CLINIC_DATES.length}일`);

  // 3) 데모 학생 + 등록
  for (const s of demoStudents) {
    const hash = await bcrypt.hash(s.password, 10);
    const student = await Student.findOneAndUpdate(
      { username: s.username },
      { $set: { name: s.name }, $setOnInsert: { password: hash, passwordPlain: s.password } },
      { upsert: true, new: true }
    );
    await Enrollment.updateOne(
      { term: term!._id, student: student!._id },
      { $set: { grade: s.grade, subjects: s.subjects, status: s.status } },
      { upsert: true }
    );
  }
  const students = await Student.find().lean();
  const idByUser: Record<string, mongoose.Types.ObjectId> = {};
  for (const st of students) idByUser[st.username] = st._id as mongoose.Types.ObjectId;
  console.log(`● 데모 학생 ${demoStudents.length}명 등록`);

  // 4) 테스트 만점 개수
  for (const [key, maxScore] of Object.entries(seedTestMax)) {
    const [date, subject] = key.split("|");
    await TestConfig.findOneAndUpdate(
      { term: term!._id, subject, date: toDate(date) },
      { $set: { maxScore } },
      { upsert: true, new: true }
    );
  }
  console.log(`● TestConfig ${Object.keys(seedTestMax).length}건`);

  // 5) 데모 세션
  let cnt = 0;
  for (const ss of seedSessions) {
    const student = idByUser[ss.username];
    if (!student) continue;
    const { username, subject, date, ...rest } = ss;
    await Session.findOneAndUpdate(
      { term: term!._id, student, subject, date: toDate(date) },
      { $set: rest },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    cnt++;
  }
  console.log(`● 데모 세션 ${cnt}건`);

  // 6) 인덱스 확정
  await Promise.all([
    Term.syncIndexes(),
    Enrollment.syncIndexes(),
    Student.syncIndexes(),
    Session.syncIndexes(),
    TestConfig.syncIndexes(),
    Admin.syncIndexes(),
  ]);
  console.log("● 인덱스 동기화 완료");

  await mongoose.disconnect();
  console.log("✔ 시드 완료");
}

main().catch((e) => {
  console.error("시드 실패:", e);
  process.exit(1);
});
