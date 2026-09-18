/**
 * 기존 학생 전원에게 학부모 계정을 만들어 준다 (아이디·비밀번호는 학생과 동일).
 * 이미 있는 학부모 계정은 건드리지 않는다. 여러 번 실행해도 안전(멱등).
 *
 *   npx tsx scripts/create-parents.ts            # DRY RUN (무엇이 생기는지만 출력)
 *   npx tsx scripts/create-parents.ts --apply    # 실제 생성
 */
import "dotenv/config";
import mongoose from "mongoose";
import { dbConnect } from "../lib/db";
import { Parent, Student } from "../lib/models";

const APPLY = process.argv.includes("--apply");

async function main() {
  await dbConnect();

  const students = await Student.find().sort({ name: 1 }).lean();
  const existing = await Parent.find({
    student: { $in: students.map((s) => s._id) },
  }).lean();
  const have = new Set(existing.map((p) => String(p.student)));

  const missing = students.filter((s) => !have.has(String(s._id)));

  console.log(`학생 ${students.length}명 · 학부모 계정 있음 ${have.size}명`);
  console.log(`새로 만들 학부모 계정: ${missing.length}명`);
  for (const s of missing) console.log(`  + ${s.name} (${s.username})`);

  if (!missing.length) {
    console.log("추가할 계정이 없습니다.");
  } else if (!APPLY) {
    console.log("\nDRY RUN 입니다. 실제로 만들려면 --apply 를 붙여 실행하세요.");
  } else {
    await Parent.insertMany(
      missing.map((s) => ({
        student: s._id,
        username: s.username,
        password: s.password, // 학생과 같은 해시 (= 같은 비밀번호)
        passwordPlain: s.passwordPlain ?? "",
        selfChanged: false,
      })),
      { ordered: false }
    );
    console.log(`\n${missing.length}개 학부모 계정을 만들었습니다.`);
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
