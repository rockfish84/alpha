import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db";
import { Student, Enrollment, Session } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { serializeRoster } from "@/lib/serialize";

export const dynamic = "force-dynamic";

// PATCH /api/admin/roster/:enrollmentId -> 등록(학년·과목·상태) + 계정(이름·비번) 수정
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const enr = await Enrollment.findById(params.id);
  if (!enr) {
    return NextResponse.json({ error: "등록을 찾을 수 없습니다." }, { status: 404 });
  }
  const student = await Student.findById(enr.student);
  if (!student) {
    return NextResponse.json({ error: "학생 계정이 없습니다." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  // 등록(학기별) 필드
  if (typeof body.grade === "string") enr.grade = body.grade;
  if (Array.isArray(body.subjects)) enr.subjects = body.subjects;
  if (body.status === "재원" || body.status === "퇴원") enr.status = body.status;
  await enr.save();

  // 계정(정체성) 필드
  let stuChanged = false;
  if (typeof body.name === "string" && body.name) {
    student.name = body.name;
    stuChanged = true;
  }
  if (typeof body.password === "string" && body.password.trim() !== "") {
    student.password = await bcrypt.hash(body.password, 10);
    student.passwordPlain = body.password;
    stuChanged = true;
  }
  if (stuChanged) await student.save();

  return NextResponse.json(serializeRoster(enr.toObject(), student.toObject()));
}

// DELETE /api/admin/roster/:enrollmentId       -> 이 학기에서만 제외
// DELETE /api/admin/roster/:enrollmentId?account=1 -> 계정 완전 삭제(모든 학기·기록)
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const enr = await Enrollment.findById(params.id);
  if (!enr) {
    return NextResponse.json({ error: "등록을 찾을 수 없습니다." }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  if (searchParams.get("account") === "1") {
    const studentId = enr.student;
    await Promise.all([
      Enrollment.deleteMany({ student: studentId }),
      Session.deleteMany({ student: studentId }),
      Student.findByIdAndDelete(studentId),
    ]);
    return NextResponse.json({ ok: true, account: true });
  }

  await enr.deleteOne();
  return NextResponse.json({ ok: true });
}
