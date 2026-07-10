/**
 * 엑셀 명단 → 학생 계정 일괄 생성/갱신.
 *   DRY=1 npx tsx scripts/import-students.ts   # 파싱만 출력(쓰기 안 함)
 *   npx tsx scripts/import-students.ts          # 실제 DB 반영
 *
 * 규칙:
 *  - 아이디  = 이름 + 학교        (예: 최호준 + 지족고 = 최호준지족고)
 *  - 비밀번호 = 부모핸드폰(모 우선, 부 후순위) 숫자만 (예: 01012345678)
 *  - 과목    = 반명. 여러 반이면 배열로 합침. 이름+학교로 1인 1계정 중복 제거.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import xlsx from "xlsx";
import { dbConnect } from "../lib/db";
import { Term, Student, Enrollment } from "../lib/models";

const FILE1 = "공수1.2 심화반 명단 .xlsx";
const FILE2 = "7.10 기준 특강 수강신청 명단.xlsx";
const FILE1_SUBJECT = "공수1,2 심화";

type Rec = { name: string; school: string; grade: string; subject: string; parentRaw: string };

function pickParentPhone(raw: string): { digits: string | null; note: string } {
  if (!raw) return { digits: null, note: "빈값" };
  const segs = String(raw).split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
  const parsed = segs
    .map((seg) => {
      const m = seg.match(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/);
      if (!m) return null;
      let label: "모" | "부" | null = null;
      if (/모/.test(seg)) label = "모";
      else if (/부/.test(seg)) label = "부";
      return { digits: m[0].replace(/\D/g, ""), label };
    })
    .filter(Boolean) as { digits: string; label: "모" | "부" | null }[];
  if (!parsed.length) return { digits: null, note: `파싱실패: ${raw}` };
  const chosen =
    parsed.find((p) => p.label === "모") ||
    parsed.find((p) => p.label === null) ||
    parsed[0];
  const note =
    parsed.length > 1
      ? `${parsed.length}개 중 ${chosen.label ?? "무표기"} 선택`
      : chosen.label === "부"
      ? "부 번호(모 없음)"
      : "";
  return { digits: chosen.digits, note };
}

function gradeFrom(school: string, num: string): string {
  const s = String(school).trim();
  const lvl = s.endsWith("고") ? "고" : s.endsWith("중") ? "중" : s.endsWith("초") ? "초" : "";
  const n = String(num).trim();
  return lvl ? lvl + n : n;
}

function readRecords(): Rec[] {
  const recs: Rec[] = [];

  // FILE1: SMS발송 시트 — [성명, 부모핸드폰, 학생핸드폰, 학교, 학년, 반명]
  const wb1 = xlsx.readFile(FILE1);
  const ws1 = wb1.Sheets["SMS발송"];
  const rows1 = xlsx.utils.sheet_to_json<string[]>(ws1, { header: 1, defval: "", raw: false });
  for (const r of rows1) {
    const name = String(r[0] ?? "").trim();
    const school = String(r[3] ?? "").trim();
    if (!name || !school || name === "성명") continue;
    if (!/^01/.test(String(r[1] ?? ""))) continue; // 헤더/제목 행 스킵
    recs.push({ name, school, grade: String(r[4] ?? "").trim(), subject: FILE1_SUBJECT, parentRaw: String(r[1] ?? "") });
  }

  // FILE2: 현원 시트 — [NO, 반명, 학생명, 학교명, 학년, 부모핸드폰, 학생핸드폰]
  const wb2 = xlsx.readFile(FILE2);
  const ws2 = wb2.Sheets["현원"];
  const rows2 = xlsx.utils.sheet_to_json<string[]>(ws2, { header: 1, defval: "", raw: false });
  for (const r of rows2) {
    const subject = String(r[1] ?? "").trim();
    const name = String(r[2] ?? "").trim();
    const school = String(r[3] ?? "").trim();
    if (!name || !school || name === "학생명" || subject === "반명") continue;
    recs.push({ name, school, grade: String(r[4] ?? "").trim(), subject, parentRaw: String(r[5] ?? "") });
  }
  return recs;
}

type Acct = { username: string; name: string; school: string; grade: string; subjects: string[]; password: string; notes: string[] };

function buildAccounts(recs: Rec[]) {
  const byUser = new Map<string, Acct>();
  const warnings: string[] = [];
  for (const rec of recs) {
    const username = (rec.name + rec.school).replace(/\s+/g, "");
    const { digits, note } = pickParentPhone(rec.parentRaw);
    let acct = byUser.get(username);
    if (!acct) {
      acct = { username, name: rec.name, school: rec.school, grade: gradeFrom(rec.school, rec.grade), subjects: [], password: digits ?? "", notes: [] };
      byUser.set(username, acct);
    }
    if (!acct.subjects.includes(rec.subject)) acct.subjects.push(rec.subject);
    if (!acct.password && digits) acct.password = digits;
    if (note) acct.notes.push(`${rec.subject}: ${note}`);
    if (!digits) warnings.push(`⚠ ${username} (${rec.subject}) 전화 파싱 실패: "${rec.parentRaw}"`);
  }
  return { accounts: [...byUser.values()], warnings };
}

async function main() {
  const dry = process.env.DRY === "1";
  const recs = readRecords();
  const { accounts, warnings } = buildAccounts(recs);

  const allSubjects = [...new Set(accounts.flatMap((a) => a.subjects))];

  console.log(`\n총 레코드 ${recs.length}건 → 계정 ${accounts.length}명 (이름+학교 중복 제거)`);
  console.log(`과목(반명) ${allSubjects.length}종: ${allSubjects.join(" / ")}\n`);
  for (const a of accounts) {
    const pw = a.password ? a.password.slice(0, 3) + "****" + a.password.slice(-2) : "❌없음";
    console.log(`${a.username.padEnd(14)} | ${a.grade.padEnd(4)} | pw ${pw} | ${a.subjects.join(", ")}${a.notes.length ? "   [" + a.notes.join("; ") + "]" : ""}`);
  }
  if (warnings.length) {
    console.log("\n--- 경고 ---");
    warnings.forEach((w) => console.log(w));
  }
  const noPw = accounts.filter((a) => !a.password);
  if (noPw.length) console.log(`\n❌ 비번 없는 계정 ${noPw.length}명: ${noPw.map((a) => a.username).join(", ")}`);

  if (dry) {
    console.log("\n[DRY RUN] DB에 쓰지 않았습니다.");
    return;
  }

  await dbConnect();
  console.log("\n● MongoDB 연결됨");

  // 대상 학기: --term="이름" 또는 TERM 환경변수, 없으면 활성 학기
  const termArg =
    process.argv.find((x) => x.startsWith("--term="))?.slice(7) || process.env.TERM;
  const term = termArg
    ? await Term.findOne({ name: termArg })
    : await Term.findOne({ active: true });
  if (!term) {
    console.error(
      `대상 학기를 찾을 수 없습니다. --term="학기이름" 지정 또는 활성 학기 필요.`
    );
    process.exit(1);
  }
  console.log(`● 대상 학기: ${term.name}`);

  let created = 0;
  for (const a of accounts) {
    if (!a.password) {
      console.log(`  건너뜀(비번없음): ${a.username}`);
      continue;
    }
    const hash = await bcrypt.hash(a.password, 10);
    // 계정(정체성): 새로 만들 때만 비번 설정, 이름은 항상 갱신
    const student = await Student.findOneAndUpdate(
      { username: a.username },
      {
        $set: { name: a.name },
        $setOnInsert: { password: hash, passwordPlain: a.password },
      },
      { upsert: true, new: true }
    );
    // 이 학기 등록
    await Enrollment.updateOne(
      { term: term._id, student: student!._id },
      { $set: { grade: a.grade, subjects: a.subjects, status: "재원" } },
      { upsert: true }
    );
    created++;
  }

  // 이 학기 반 목록에 반영 (합집합)
  term.subjects = [...new Set([...(term.subjects ?? []), ...allSubjects])];
  await term.save();

  await Enrollment.syncIndexes();
  console.log(
    `● '${term.name}'에 ${created}명 등록 완료, 반 ${term.subjects.length}종`
  );
  await mongoose.disconnect();
  console.log("✔ 완료");
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});
