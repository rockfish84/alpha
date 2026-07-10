import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Session } from "@/lib/models";
import { requireStudent } from "@/lib/auth";
import { buildMaxMap } from "@/lib/testconfig";
import { isoDate } from "@/lib/date";
import { md } from "@/lib/constants";

export const dynamic = "force-dynamic";

// GET /api/stats -> 과제 완료율·테스트 평균·추이
export async function GET() {
  const g = await requireStudent();
  if (!g.ok) return g.res;

  await dbConnect();
  const [docs, maxMap] = await Promise.all([
    Session.find({ student: g.user.id }).lean(),
    buildMaxMap(),
  ]);

  // 과제 미입력(null)은 그날 과제를 안 받은 것 → 통계 제외. 1(O)/0.5(△)/0(X)만 반영.
  const graded = docs.filter((s) => s.hwDone !== null && s.hwDone !== undefined);
  const hwSum = graded.reduce((a, s) => a + Number(s.hwDone), 0);
  const hwFullCnt = graded.filter((s) => Number(s.hwDone) === 1).length;
  const hwHalfCnt = graded.filter((s) => Number(s.hwDone) === 0.5).length;
  const hwMissCnt = graded.filter((s) => Number(s.hwDone) === 0).length;
  const hwRate = graded.length ? Math.round((hwSum / graded.length) * 100) : 0;

  // 테스트 미입력(null)은 그날 테스트를 안 본 것 → 통계 제외. 만점 기본 10.
  const testRows = docs
    .filter((s) => s.testScore != null)
    .sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)))
    .map((s) => {
      const iso = isoDate(s.date);
      const max = maxMap[`${iso}|${s.subject}`] ?? 10;
      return {
        date: md(iso),
        pct: Math.round((Number(s.testScore) / max) * 100),
        raw: Number(s.testScore),
        max,
      };
    });

  const testAvg = testRows.length
    ? Math.round(testRows.reduce((a, r) => a + r.pct, 0) / testRows.length)
    : 0;

  const submittedCnt = docs.filter((s) => s.submitted).length;
  const attendedCnt = docs.filter(
    (s) => s.submitted && s.attendance === "출석"
  ).length;

  return NextResponse.json({
    hwRate,
    testAvg,
    submittedCnt,
    attendedCnt,
    hwFullCnt,
    hwHalfCnt,
    hwMissCnt,
    testRows,
  });
}
