import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Student, Enrollment, Term, Parent } from "@/lib/models";
import { getSession } from "@/lib/auth";
import { serializeTerm } from "@/lib/term";
import { serializeSchoolExamResults } from "@/lib/school-exams";

export const dynamic = "force-dynamic";

/** 이 학생이 등록된 학기 목록 (퇴원 등록 제외, 최신순). */
async function termsForStudent(studentId: string) {
  const enrollments = await Enrollment.find({
    student: studentId,
    status: { $ne: "퇴원" },
  }).lean();
  const termIds = enrollments.map((e) => e.term);
  const terms = await Term.find({ _id: { $in: termIds } })
    .sort({ order: -1, createdAt: -1 })
    .lean();

  const enrByTerm: Record<string, any> = {};
  for (const e of enrollments) enrByTerm[String(e.term)] = e;

  return terms.map((t) => {
    const st = serializeTerm(t);
    const enr = enrByTerm[st.id];
    return {
      id: st.id,
      name: st.name,
      active: st.active,
      schoolExamInput: st.schoolExamInput,
      clinicDates: st.clinicDates,
      clinicDatesBySubject: st.clinicDatesBySubject,
      closedSubjects: st.closedSubjects,
      grade: (enr?.grade ?? "") as string,
      subjects: (enr?.subjects ?? []) as string[],
      schoolExamResults: st.schoolExamInput
        ? serializeSchoolExamResults(enr?.schoolExamResults)
        : [],
    };
  });
}

export async function GET() {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (session.user.role === "admin") {
    return NextResponse.json({ role: "admin", id: session.user.id, name: "관리자" });
  }

  await dbConnect();

  if (session.user.role === "parent") {
    const parent = await Parent.findById(session.user.id).lean();
    const child = parent ? await Student.findById(parent.student).lean() : null;
    if (!parent || !child) {
      session.destroy();
      return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 401 });
    }
    return NextResponse.json({
      role: "parent",
      id: String(parent._id),
      name: child.name,
      username: parent.username,
      studentId: String(child._id),
      studentName: child.name,
      school: (child.school ?? "") as string,
      terms: await termsForStudent(String(child._id)),
    });
  }

  const student = await Student.findById(session.user.id).lean();
  if (!student) {
    session.destroy();
    return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 401 });
  }

  return NextResponse.json({
    role: "student",
    id: String(student._id),
    name: student.name,
    username: student.username,
    studentId: String(student._id),
    studentName: student.name,
    school: (student.school ?? "") as string,
    terms: await termsForStudent(String(student._id)),
  });
}
