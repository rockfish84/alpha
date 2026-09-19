/**
 * 학부모 계정을 user001 · user002 … 로 새로 발급한다.
 *
 * - 대상: 진행 중인 학기에 재원인 학생 (원하면 --exclude 로 특정 반 제외)
 * - 아이디: user001 부터 이름 가나다순
 * - 비밀번호: 숫자 10자리 무작위 (DB 에는 해시만 저장 → 이 스크립트가 만드는
 *   CSV 가 비밀번호를 볼 수 있는 유일한 기회다)
 * - 이미 있는 학부모 계정도 새 아이디·비밀번호로 덮어쓴다.
 *
 *   npx tsx scripts/issue-parent-accounts.ts                      # DRY RUN
 *   npx tsx scripts/issue-parent-accounts.ts --apply              # 전체 재발급
 *   npx tsx scripts/issue-parent-accounts.ts --apply --exclude=대수
 *
 * --fill 을 붙이면 계정이 없는 학생에게만 발급한다 (이미 나눠 준 계정은 그대로 둔다).
 * --only=이름,이름 으로 특정 학생만 고를 수 있다.
 *   npx tsx scripts/issue-parent-accounts.ts --apply --fill --only=김정훈,오현민
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { dbConnect } from "../lib/db";
import { Enrollment, Parent, Student, Term } from "../lib/models";
import { nextParentUsername, randomParentPassword, readParentPassword } from "../lib/parents";
import { seal } from "../lib/secret-box";

const APPLY = process.argv.includes("--apply");
/** 계정이 없는 학생에게만 발급 (기존 계정은 건드리지 않는다) */
const FILL = process.argv.includes("--fill");
const ONLY = process.argv
  .filter((a) => a.startsWith("--only="))
  .flatMap((a) => a.slice("--only=".length).split(",").map((s) => s.trim()))
  .filter(Boolean);
const EXCLUDED = process.argv
  .filter((a) => a.startsWith("--exclude="))
  .flatMap((a) => a.slice("--exclude=".length).split(",").map((s) => s.trim()))
  .filter(Boolean);

const OUT = path.join(
  process.cwd(),
  FILL ? "학부모 계정 발급(추가).csv" : "학부모 계정 발급.csv"
);

async function main() {
  await dbConnect();

  const terms = await Term.find({ active: true }).lean();
  if (!terms.length) throw new Error("진행 중인 학기가 없습니다.");

  const enrollments = await Enrollment.find({
    term: { $in: terms.map((t) => t._id) },
    status: "재원",
  }).lean();

  // 학생별 수강 반을 모으고, 제외할 반만 듣는 학생은 대상에서 뺀다.
  const subjectsOf = new Map<string, Set<string>>();
  for (const e of enrollments) {
    const key = String(e.student);
    const set = subjectsOf.get(key) ?? new Set<string>();
    for (const s of e.subjects ?? []) set.add(s);
    subjectsOf.set(key, set);
  }
  const targetIds = [...subjectsOf.entries()]
    .filter(([, subs]) => [...subs].some((s) => !EXCLUDED.includes(s)))
    .map(([id]) => id);

  let students = await Student.find({ _id: { $in: targetIds } }).lean();
  if (ONLY.length) students = students.filter((s) => ONLY.includes(s.name));
  students.sort((a, b) => a.name.localeCompare(b.name, "ko"));

  if (FILL) {
    // 이미 쓸 수 있는 계정이 있는 학생은 건드리지 않는다.
    const parents = await Parent.find({
      student: { $in: students.map((s) => s._id) },
    }).lean();
    const has = new Set(
      parents
        .filter((p) => readParentPassword(p))
        .map((p) => String(p.student))
    );
    students = students.filter((s) => !has.has(String(s._id)));
  }

  console.log(`진행 중 학기: ${terms.map((t) => t.name).join(", ")}`);
  if (EXCLUDED.length) console.log(`제외한 반: ${EXCLUDED.join(", ")}`);
  console.log(`대상 학생 ${students.length}명 (전체 재원 ${subjectsOf.size}명)\n`);

  // --fill 이면 기존 마지막 번호 다음부터 이어 붙인다.
  const startNo = FILL
    ? Number((await nextParentUsername()).replace(/\D/g, "")) || 1
    : 1;

  const rows: {
    no: number;
    name: string;
    school: string;
    studentId: string;
    subjects: string;
    username: string;
    password: string;
  }[] = [];

  students.forEach((stu, i) => {
    const subs = [...(subjectsOf.get(String(stu._id)) ?? [])].filter(
      (s) => !EXCLUDED.includes(s)
    );
    rows.push({
      no: startNo + i,
      name: stu.name,
      school: stu.school ?? "",
      studentId: stu.username,
      subjects: subs.join(" / "),
      username: `user${String(startNo + i).padStart(3, "0")}`,
      password: randomParentPassword(),
    });
  });

  for (const r of rows) {
    console.log(
      `${String(r.no).padStart(3)} ${r.name.padEnd(5)} ${r.username}  ${r.password}  ${r.studentId}`
    );
  }

  if (!APPLY) {
    console.log("\nDRY RUN 입니다. 실제로 발급하려면 --apply 를 붙여 실행하세요.");
    await mongoose.disconnect();
    return;
  }

  // 아이디가 겹치지 않도록 대상 학생의 기존 계정을 먼저 비운다.
  // (--fill 은 계정이 없는 학생만 골라 왔으므로 지울 게 거의 없다)
  const studentIds = students.map((s) => s._id);
  await Parent.deleteMany({ student: { $in: studentIds } });

  for (const [i, stu] of students.entries()) {
    const r = rows[i];
    await Parent.create({
      student: stu._id,
      username: r.username,
      password: await bcrypt.hash(r.password, 10),
      // 관리자 화면에서 다시 볼 수 있도록 사본도 함께 저장한다
      passwordSealed: seal(r.password),
      selfChanged: true, // 학생 계정과 연동하지 않는다
    });
  }

  const csv =
    "﻿" + // 엑셀에서 한글이 깨지지 않도록 BOM
    "번호,학생 이름,학교,수강 반,학생 아이디,학부모 아이디,학부모 비밀번호\n" +
    rows
      .map((r) =>
        [r.no, r.name, r.school, r.subjects, r.studentId, r.username, r.password]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
  fs.writeFileSync(OUT, csv, "utf8");

  console.log(`\n발급 완료 ${rows.length}건 → ${OUT}`);
  console.log("비밀번호는 DB 에 해시로만 남으므로 이 파일을 잘 보관하세요.");
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
