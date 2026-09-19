/**
 * 학생 아이디에 묻혀 있는 학교 이름을 school 필드로 옮긴다.
 *
 * 아이디는 "이름 + 학교" 규칙으로 만들어 왔다(예: 구연서둔산여고). 그래서 학교가
 * 문자열 안에만 있고 데이터로는 비어 있어, 전학 처리도 학교별 조회도 안 됐다.
 * 아이디는 로그인 열쇠이므로 건드리지 않고, 학교만 꺼내 채운다.
 *
 *   npx tsx scripts/backfill-school.ts            # DRY RUN
 *   npx tsx scripts/backfill-school.ts --apply
 *   npx tsx scripts/backfill-school.ts --apply --force   # 이미 있는 학교도 덮어쓰기
 */
import "dotenv/config";
import mongoose from "mongoose";
import { dbConnect } from "../lib/db";
import { Student } from "../lib/models";

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

/** 학교처럼 생겼는지 (초·중·고로 끝나면 학교로 본다) */
function looksLikeSchool(v: string): boolean {
  return /(초|중|고)$/.test(v) && v.length >= 2;
}

/** 아이디에서 학교를 뽑는다. 이름으로 시작하지 않으면 뽑지 않는다. */
export function schoolFromUsername(name: string, username: string): string {
  if (!name || !username.startsWith(name)) return "";
  const rest = username.slice(name.length).trim();
  return looksLikeSchool(rest) ? rest : "";
}

async function main() {
  await dbConnect();
  const students = await Student.find().sort({ name: 1 }).lean();

  const fill: { id: unknown; name: string; username: string; school: string }[] = [];
  const skip: string[] = [];
  const kept: string[] = [];

  for (const s of students) {
    const school = schoolFromUsername(s.name, s.username);
    if (!school) {
      skip.push(`${s.name}(${s.username})`);
      continue;
    }
    if (s.school && !FORCE) {
      if (s.school !== school) kept.push(`${s.name}: 그대로 "${s.school}" (아이디는 "${school}")`);
      continue;
    }
    if (s.school === school) continue;
    fill.push({ id: s._id, name: s.name, username: s.username, school });
  }

  const counts = new Map<string, number>();
  for (const f of fill) counts.set(f.school, (counts.get(f.school) ?? 0) + 1);

  console.log(`전체 ${students.length}명 · 채울 학생 ${fill.length}명 · 못 뽑은 학생 ${skip.length}명`);
  console.log(
    `\n학교 ${counts.size}곳: ` +
      [...counts]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}(${v})`)
        .join(", ")
  );
  if (kept.length) console.log(`\n이미 학교가 있어 건드리지 않음:\n  ${kept.join("\n  ")}`);
  if (skip.length) console.log(`\n아이디에서 학교를 못 뽑음: ${skip.join(", ")}`);

  if (!APPLY) {
    console.log("\nDRY RUN 입니다. 반영하려면 --apply 를 붙여 실행하세요.");
    await mongoose.disconnect();
    return;
  }

  for (const f of fill) {
    await Student.updateOne({ _id: f.id }, { $set: { school: f.school } });
  }
  const remain = await Student.countDocuments({ $or: [{ school: "" }, { school: null }] });
  console.log(`\n완료: ${fill.length}명 채움 · 학교가 아직 빈 학생 ${remain}명`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
