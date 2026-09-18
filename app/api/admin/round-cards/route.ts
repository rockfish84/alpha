import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Enrollment, Student } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { resolveTerm } from "@/lib/term";
import { isClinicDate } from "@/lib/clinic-dates";
import { buildTestAnalyses } from "@/lib/analysis";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/round-cards?term=ID&subject=..&date=..
 * 그 회차의 학생별 분석을 돌려준다. (문자에 붙일 "테스트 성적" 이미지용 —
 * 학생 화면의 테스트 성적 상세와 똑같은 데이터)
 */
export async function GET(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const term = await resolveTerm(searchParams.get("term"));
  const subject = searchParams.get("subject") ?? "";
  const date = searchParams.get("date") ?? "";
  if (!term || !subject || !isClinicDate(date)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const enrollments = await Enrollment.find({
    term: term._id,
    subjects: subject,
    status: "재원",
  }).lean();
  const students = await Student.find({
    _id: { $in: enrollments.map((e) => e.student) },
  }).lean();
  const stuById: Record<string, any> = {};
  for (const s of students) stuById[String(s._id)] = s;
  const gradeById: Record<string, string> = {};
  for (const e of enrollments) gradeById[String(e.student)] = (e.grade ?? "") as string;

  const rows = [];
  for (const enr of enrollments) {
    const studentId = String(enr.student);
    const stu = stuById[studentId];
    if (!stu) continue;
    const tests = await buildTestAnalyses(String(term._id), studentId, [subject]);
    const test = tests.find((t) => t.date === date);
    if (!test) continue;
    rows.push({
      studentId,
      name: stu.name as string,
      school: (stu.school ?? "") as string,
      grade: gradeById[studentId] ?? "",
      test,
    });
  }

  return NextResponse.json({ subject, date, students: rows });
}
