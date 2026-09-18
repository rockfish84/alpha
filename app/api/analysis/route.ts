import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Enrollment } from "@/lib/models";
import { requireViewer } from "@/lib/auth";
import { resolveTerm } from "@/lib/term";
import { buildTestAnalyses } from "@/lib/analysis";
import { normalizeTypeOrder } from "@/lib/type-order";

export const dynamic = "force-dynamic";

// GET /api/analysis?term=ID -> 학생·학부모용 회차별 테스트 분석
export async function GET(req: Request) {
  const g = await requireViewer();
  if (!g.ok) return g.res;

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const term = await resolveTerm(searchParams.get("term"));
  if (!term) return NextResponse.json({ tests: [], typeOrder: {} });

  const enr = await Enrollment.findOne({
    term: term._id,
    student: g.studentId,
  }).lean();
  if (!enr) return NextResponse.json({ tests: [], typeOrder: {} });

  const tests = await buildTestAnalyses(
    String(term._id),
    g.studentId,
    (enr.subjects ?? []) as string[]
  );
  return NextResponse.json({
    tests,
    typeOrder: normalizeTypeOrder(term.typeOrderBySubject, (term.subjects ?? []) as string[]),
  });
}
