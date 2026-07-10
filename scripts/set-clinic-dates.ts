/**
 * 클리닉 날짜(Settings.clinicDates) 설정.
 *
 *   # 인자로 날짜 지정 (기존 목록에 추가/병합)
 *   npx tsx scripts/set-clinic-dates.ts 2026-09-05 2026-09-06
 *
 *   # 인자 없으면: 오늘부터 END 까지의 주말(토/일)로 채움
 *   npx tsx scripts/set-clinic-dates.ts
 *
 *   # 기존 목록을 무시하고 완전히 교체
 *   REPLACE=1 npx tsx scripts/set-clinic-dates.ts 2026-07-11 2026-07-12
 */
import "dotenv/config";
import mongoose from "mongoose";
import { dbConnect } from "../lib/db";
import { Settings } from "../lib/models";

const END = "2026-08-31"; // 기본 주말 생성 종료일

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekendsUntil(endIso: string): string[] {
  const out: string[] = [];
  const start = new Date();
  const cur = new Date(`${iso(start)}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  while (cur <= end) {
    const day = cur.getUTCDay(); // 0=일, 6=토
    if (day === 0 || day === 6) out.push(iso(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const replace = process.env.REPLACE === "1";

  const incoming = args.length ? args : weekendsUntil(END);

  await dbConnect();
  const settings = await Settings.findOne({ key: "app" }).lean();
  const existing = replace ? [] : settings?.clinicDates ?? [];

  const merged = [...new Set([...existing, ...incoming])].sort();

  await Settings.findOneAndUpdate(
    { key: "app" },
    { $set: { clinicDates: merged } },
    { upsert: true, new: true }
  );

  console.log(`● 클리닉 날짜 ${merged.length}일 ${replace ? "(교체)" : "(병합)"}:`);
  console.log("  " + merged.join(", "));
  await mongoose.disconnect();
  console.log("✔ 완료");
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});
