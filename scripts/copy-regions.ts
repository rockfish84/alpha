/**
 * 한 회차에서 잡아 둔 문항 위치를, 같은 PDF를 쓰는 다른 회차로 복사한다.
 * (예시 반처럼 모든 회차가 같은 시험지·해설지를 쓸 때)
 *
 *   npx tsx scripts/copy-regions.ts --subject="대수" --from=2026-08-15
 *   npx tsx scripts/copy-regions.ts --subject="대수" --from=2026-08-15 --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import { dbConnect } from "../lib/db";
import { TestConfig, Term } from "../lib/models";
import { isoDate, toDate } from "../lib/date";
import { FILE_BUCKET } from "../lib/files";
import { normalizeRegions } from "../lib/regions";

const arg = (k: string) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=") ?? "";
const APPLY = process.argv.includes("--apply");
const SUBJECT = arg("subject");
const FROM = arg("from");
const TERM_NAME = arg("term") || "2026 2학기";

async function main() {
  if (!SUBJECT || !FROM) throw new Error("--subject 와 --from 은 필수입니다.");
  await dbConnect();
  const term = await Term.findOne({ name: TERM_NAME });
  if (!term) throw new Error(`${TERM_NAME} 학기를 찾을 수 없습니다.`);

  const source = await TestConfig.findOne({
    term: term._id,
    subject: SUBJECT,
    date: toDate(FROM),
  }).lean();
  const regions = normalizeRegions(source?.questionRegions ?? []);
  if (!regions.length) throw new Error(`${FROM} 회차에 저장된 문항 위치가 없습니다.`);

  const db = mongoose.connection.db!;
  const files = await db
    .collection(`${FILE_BUCKET}.files`)
    .find({ "metadata.subject": SUBJECT })
    .toArray();
  const fileAt = (date: string, kind: string) =>
    files.find((f) => f.metadata?.date === date && f.metadata?.kind === kind);

  // 원본 회차에서 fileId → 종류 매핑
  const kindOfFile = new Map<string, string>();
  for (const f of files) kindOfFile.set(String(f._id), String(f.metadata?.kind ?? ""));

  const targets = await TestConfig.find({
    term: term._id,
    subject: SUBJECT,
    date: { $ne: toDate(FROM) },
  }).lean();

  let updated = 0;
  for (const t of targets) {
    const date = isoDate(t.date);
    const next = regions
      .map((r) => {
        const kind = kindOfFile.get(r.fileId) ?? (r.kind === "solution" ? "answer" : "paper");
        const file = fileAt(date, kind);
        return file ? { ...r, fileId: String(file._id) } : null;
      })
      .filter(Boolean);
    if (!next.length) continue;
    console.log(`  ${date} ← 문항 ${new Set(next.map((r: any) => r.no)).size}개 위치 복사`);
    if (APPLY) {
      await TestConfig.updateOne({ _id: t._id }, { $set: { questionRegions: next } });
    }
    updated += 1;
  }

  console.log(
    `${SUBJECT} · ${FROM} 의 위치 ${regions.length}건 → ${updated}개 회차${APPLY ? " 반영 완료" : " (DRY RUN)"}`
  );
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e.message ?? e);
  await mongoose.disconnect();
  process.exit(1);
});
