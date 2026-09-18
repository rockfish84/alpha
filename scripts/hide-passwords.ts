/**
 * 평문 비밀번호 제거 마이그레이션.
 *
 *   npx tsx scripts/hide-passwords.ts            (미리보기)
 *   npx tsx scripts/hide-passwords.ts --apply    (실제 적용)
 *
 * 하는 일
 *  1) Student.passwordPlain 에 들어 있던 값(= 학부모 전화번호)을 Student.phone 으로 옮긴다.
 *  2) Student / Parent 의 passwordPlain 필드를 통째로 지운다. (해시만 남는다)
 * 비밀번호 자체는 건드리지 않으므로 학생·학부모는 쓰던 비밀번호로 그대로 로그인한다.
 */
import "dotenv/config";
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI 가 없습니다.");
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const students = db.collection("students");
  const parents = db.collection("parents");

  const withPlain = await students
    .find({ passwordPlain: { $exists: true, $ne: "" } })
    .project({ _id: 1, name: 1, username: 1, phone: 1, passwordPlain: 1 })
    .toArray();
  const needPhone = withPlain.filter((s: any) => !s.phone);
  const parentPlain = await parents.countDocuments({ passwordPlain: { $exists: true } });

  console.log(`학생 ${withPlain.length}명에 평문 비밀번호가 남아 있습니다.`);
  console.log(`  → 그중 ${needPhone.length}명은 phone 이 비어 있어 값을 옮깁니다.`);
  console.log(`학부모 ${parentPlain}개 문서에 평문 비밀번호가 남아 있습니다.`);
  for (const s of needPhone.slice(0, 5)) {
    console.log(`   예) ${s.name}(${s.username}) → phone = ${s.passwordPlain}`);
  }

  if (!APPLY) {
    console.log("\nDRY RUN 입니다. 실제로 적용하려면 --apply 를 붙이세요.");
    await mongoose.disconnect();
    return;
  }

  let moved = 0;
  for (const s of needPhone) {
    await students.updateOne({ _id: s._id }, { $set: { phone: String(s.passwordPlain) } });
    moved++;
  }
  const a = await students.updateMany({}, { $unset: { passwordPlain: "" } });
  const b = await parents.updateMany({}, { $unset: { passwordPlain: "" } });
  console.log(`\nphone 으로 옮긴 학생: ${moved}명`);
  console.log(`평문 제거 — 학생 ${a.modifiedCount}건 / 학부모 ${b.modifiedCount}건`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
