/**
 * 기존에 "맞은 개수"로 저장된 테스트 점수를 100점 만점으로 환산한다.
 *   예) 10문항 중 7개 → 70점,  20문항 중 3개 → 15점
 *
 * - 자동 채점(testAuto) 기록은 이미 100점 환산이므로 건드리지 않는다.
 * - 그 회차의 원래 문항 수는 (학생별 만점 override) > (답안 키의 주 문항 수) >
 *   (TestConfig.maxScore) > 10 순으로 찾는다.
 * - 환산 후 모든 회차 만점은 100점이 된다. 두 번 실행해도 안전하다.
 *
 *   npx tsx scripts/rescale-scores-100.ts            # DRY RUN
 *   npx tsx scripts/rescale-scores-100.ts --apply    # 실제 반영
 */
import "dotenv/config";
import mongoose from "mongoose";
import { dbConnect } from "../lib/db";
import { Session, TestConfig, Term } from "../lib/models";
import { isoDate } from "../lib/date";
import { FULL_SCORE, normalizeQuestions, totalPoints } from "../lib/grading";

const APPLY = process.argv.includes("--apply");

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

async function main() {
  await dbConnect();

  const [terms, configs, sessions] = await Promise.all([
    Term.find().lean(),
    TestConfig.find().lean(),
    Session.find({ testScore: { $ne: null } }).lean(),
  ]);
  const termName: Record<string, string> = {};
  for (const t of terms) termName[String(t._id)] = t.name;

  // 회차별 "원래 문항 수" 와 새 만점
  const origMax: Record<string, number> = {};
  const configUpdates: any[] = [];
  for (const c of configs) {
    const key = `${String(c.term)}|${c.subject}|${isoDate(c.date)}`;
    const questions = normalizeQuestions(c.questions ?? []);
    if (questions.length) {
      // 답안 키가 있으면 만점은 배점 합(=100)이고, 옛 만점은 주 문항 수였다.
      origMax[key] = new Set(questions.map((q) => q.no)).size;
      const sum = totalPoints(questions);
      if (sum && c.maxScore !== sum) {
        configUpdates.push({ _id: c._id, maxScore: sum, from: c.maxScore });
      }
    } else {
      origMax[key] = (c.maxScore ?? 10) || 10;
      if (c.maxScore !== FULL_SCORE) {
        configUpdates.push({ _id: c._id, maxScore: FULL_SCORE, from: c.maxScore });
      }
    }
  }

  const sessionOps: any[] = [];
  const preview: string[] = [];
  let skippedAuto = 0;
  let skippedAlready = 0;

  for (const s of sessions as any[]) {
    if (s.testAuto || s.testScale100) {
      skippedAuto += 1;
      continue;
    }
    const key = `${String(s.term)}|${s.subject}|${isoDate(s.date)}`;
    const max = s.testMaxOverride ?? origMax[key] ?? 10;
    const score = Number(s.testScore);
    // 이미 100점 환산된 값(맞은 개수보다 큰 점수)은 다시 건드리지 않는다.
    if (!max || max === FULL_SCORE || score > max) {
      skippedAlready += 1;
      continue;
    }
    const next = round2((score * FULL_SCORE) / max);
    sessionOps.push({
      updateOne: {
        filter: { _id: s._id },
        update: {
        $set: { testScore: next, testMaxOverride: null, testScale100: true },
      },
      },
    });
    preview.push(
      `${termName[String(s.term)] ?? "?"} | ${s.subject} | ${isoDate(s.date)} | ${score}/${max} → ${next}/100`
    );
  }

  // 점수는 있는데 회차 설정이 없으면 만점 100점짜리 설정을 만들어 준다.
  const cfgKeys = new Set(
    configs.map((c) => `${String(c.term)}|${c.subject}|${isoDate(c.date)}`)
  );
  const newConfigs: any[] = [];
  const seen = new Set<string>();
  for (const s of sessions as any[]) {
    const key = `${String(s.term)}|${s.subject}|${isoDate(s.date)}`;
    if (cfgKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    newConfigs.push({ term: s.term, subject: s.subject, date: s.date, maxScore: FULL_SCORE });
  }

  console.log(`테스트 점수 기록 ${sessions.length}건`);
  console.log(`  환산 대상 ${sessionOps.length}건 · 환산 불필요(자동채점·완료) ${skippedAuto}건 · 만점 확인 후 제외 ${skippedAlready}건`);
  console.log(`  회차 설정 새로 생성 ${newConfigs.length}건`);
  console.log(`  회차 만점(TestConfig) 갱신 ${configUpdates.length}건`);
  const sample = preview.slice(0, 15);
  for (const line of sample) console.log("   " + line);
  if (preview.length > sample.length) console.log(`   … 외 ${preview.length - sample.length}건`);

  if (!APPLY) {
    console.log("\nDRY RUN 입니다. 실제로 바꾸려면 --apply 를 붙여 실행하세요.");
  } else {
    if (sessionOps.length) await Session.bulkWrite(sessionOps as any);
    if (newConfigs.length) await TestConfig.insertMany(newConfigs, { ordered: false });
    for (const u of configUpdates) {
      await TestConfig.updateOne({ _id: u._id }, { $set: { maxScore: u.maxScore } });
    }
    console.log("\n반영 완료.");
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
