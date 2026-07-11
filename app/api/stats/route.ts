import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Session } from "@/lib/models";
import { requireStudent } from "@/lib/auth";
import { buildMaxMap } from "@/lib/testconfig";
import { resolveTerm } from "@/lib/term";
import { isoDate } from "@/lib/date";
import { md } from "@/lib/constants";

export const dynamic = "force-dynamic";

// GET /api/stats?term=ID -> 그 학기 과제 완료율·테스트 평균·추이
export async function GET(req: Request) {
  const g = await requireStudent();
  if (!g.ok) return g.res;

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const term = await resolveTerm(searchParams.get("term"));
  const empty = {
    hwRate: 0,
    testAvg: 0,
    submittedCnt: 0,
    attendedCnt: 0,
    hwFullCnt: 0,
    hwHalfCnt: 0,
    hwMissCnt: 0,
    testRows: [],
  };
  if (!term) return NextResponse.json(empty);

  const [docs, maxMap] = await Promise.all([
    Session.find({ student: g.user.id, term: term._id }).lean(),
    buildMaxMap(String(term._id)),
  ]);

  const graded = docs.filter((s) => s.hwDone !== null && s.hwDone !== undefined);
  const hwSum = graded.reduce((a, s) => a + Number(s.hwDone), 0);
  const hwFullCnt = graded.filter((s) => Number(s.hwDone) === 1).length;
  const hwHalfCnt = graded.filter((s) => Number(s.hwDone) === 0.5).length;
  const hwMissCnt = graded.filter((s) => Number(s.hwDone) === 0).length;
  const hwRate = graded.length ? Math.round((hwSum / graded.length) * 100) : 0;

  const testRows = docs
    .filter((s) => s.testScore != null)
    .sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)))
    .map((s) => {
      const iso = isoDate(s.date);
      const max = s.testMaxOverride ?? maxMap[`${iso}|${s.subject}`] ?? 10;
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
    (s) => (s.submitted || s.attnAdmin) && s.attendance === "출석"
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
