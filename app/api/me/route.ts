import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Student } from "@/lib/models";
import { getSession } from "@/lib/auth";

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
    // 계정이 삭제된 경우 세션 정리
    session.destroy();
    return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 401 });
  }
  if (student.status === "퇴원") {
    session.destroy();
    return NextResponse.json({ error: "퇴원 처리된 계정입니다." }, { status: 403 });
  }

  return NextResponse.json({
    role: "student",
    id: String(student._id),
    name: student.name,
    grade: student.grade,
    subjects: student.subjects,
  });
}
