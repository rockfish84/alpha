/**
 * 학기의 클리닉 날짜 설정.
 *   # 활성 학기에 날짜 추가(병합)
 *   npx tsx scripts/set-clinic-dates.ts 2026-09-05 2026-09-06
 *   # 특정 학기 지정
 *   npx tsx scripts/set-clinic-dates.ts --term="2026 가을" 2026-09-05
 *   # 인자 없으면 오늘~END 주말 자동
 *   npx tsx scripts/set-clinic-dates.ts
 *   # 기존 목록 무시하고 교체
 *   REPLACE=1 npx tsx scripts/set-clinic-dates.ts 2026-07-11 2026-07-12
 */
import "dotenv/config";
import mongoose from "mongoose";
import { dbConnect } from "../lib/db";
import { Term } from "../lib/models";

const END = "2026-08-31";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function weekendsUntil(endIso: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${iso(new Date())}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  while (cur <= end) {
    const day = cur.getUTCDay();
    if (day === 0 || day === 6) out.push(iso(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function main() {
  const termArg =
    process.argv.find((x) => x.startsWith("--term="))?.slice(7) || process.env.TERM;
  const args = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const replace = process.env.REPLACE === "1";
  const incoming = args.length ? args : weekendsUntil(END);

  await dbConnect();
  const term = termArg
    ? await Term.findOne({ name: termArg })
    : await Term.findOne({ active: true });
  if (!term) {
    console.error(`대상 학기 없음. --term="이름" 지정 또는 활성 학기 필요.`);
    process.exit(1);
  }

  const existing = replace ? [] : term.clinicDates ?? [];
  term.clinicDates = [...new Set([...existing, ...incoming])].sort();
  await term.save();

  console.log(
    `● '${term.name}' 클리닉 날짜 ${term.clinicDates.length}일 ${replace ? "(교체)" : "(병합)"}:`
  );
  console.log("  " + term.clinicDates.join(", "));
  await mongoose.disconnect();
  console.log("✔ 완료");
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});
