import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { ShareLink, Student, Enrollment } from "@/lib/models";
import { buildTestAnalyses } from "@/lib/analysis";

export const dynamic = "force-dynamic";

/**
 * GET /api/share/[token] -> 로그인 없이 그 회차 성적만 돌려준다.
 * 토큰이 열어 주는 범위: 그 학생 · 그 반 · 그 날짜 하나. 만료·폐기되면 410.
 */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  await dbConnect();
  const link = await ShareLink.findOne({ token: params.token });
  if (!link) {
    return NextResponse.json({ error: "없는 링크입니다." }, { status: 404 });
  }
  if (link.revoked || link.expiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "만료된 링크입니다. 담당 선생님께 문의해 주세요." },
      { status: 410 }
    );
  }

  const student = await Student.findById(link.student).lean();
  if (!student) {
    return NextResponse.json({ error: "없는 링크입니다." }, { status: 404 });
  }
  const enr = await Enrollment.findOne({
    term: link.term,
    student: link.student,
  }).lean();

  const iso = link.date.toISOString().slice(0, 10);
  const tests = await buildTestAnalyses(String(link.term), String(link.student), [
    link.subject,
  ]);
  const test = tests.find((t) => t.date === iso);
  // 점수 추이 (같은 반, 이 회차까지 최근 6회)
  const trend = tests
    .filter((t) => t.myPct != null && t.date <= iso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-6)
    .map((t) => ({ date: t.date, score: t.myPct as number, average: t.avg }));
  if (!test) {
    return NextResponse.json(
      { error: "아직 성적이 등록되지 않았습니다." },
      { status: 404 }
    );
  }

  // 열람 기록 (링크가 실제로 열렸는지 관리자가 확인할 수 있게)
  await ShareLink.updateOne(
    { _id: link._id },
    { $inc: { views: 1 }, $set: { lastViewedAt: new Date() } }
  );

  return NextResponse.json(
    {
      who: {
        name: student.name as string,
        school: (student.school ?? "") as string,
        grade: (enr?.grade ?? "") as string,
      },
      test,
      trend,
      expiresAt: link.expiresAt.toISOString(),
    },
    { headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } }
  );
}
