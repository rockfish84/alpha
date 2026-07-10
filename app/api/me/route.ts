import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Student, Enrollment, Term } from "@/lib/models";
import { getSession } from "@/lib/auth";
import { serializeTerm } from "@/lib/term";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (session.user.role === "admin") {
    return NextResponse.json({ role: "admin", id: session.user.id, name: "관리자" });
  }

  await dbConnect();
  const student = await Student.findById(session.user.id).lean();
  if (!student) {
    session.destroy();
    return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 401 });
  }

  // 이 학생이 등록된 학기들 (퇴원 아닌 등록만)
  const enrollments = await Enrollment.find({
    student: student._id,
    status: { $ne: "퇴원" },
  }).lean();
  const termIds = enrollments.map((e) => e.term);
  const terms = await Term.find({ _id: { $in: termIds } })
    .sort({ order: -1, createdAt: -1 })
    .lean();

  const enrByTerm: Record<string, any> = {};
  for (const e of enrollments) enrByTerm[String(e.term)] = e;

  const termList = terms.map((t) => {
    const st = serializeTerm(t);
    const enr = enrByTerm[st.id];
    return {
      id: st.id,
      name: st.name,
      active: st.active,
      clinicDates: st.clinicDates,
      grade: (enr?.grade ?? "") as string,
      subjects: (enr?.subjects ?? []) as string[],
    };
  });

  return NextResponse.json({
    role: "student",
    id: String(student._id),
    name: student.name,
    terms: termList,
  });
}
