import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db";
import { Student, Enrollment, Session, Parent } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { serializeRoster } from "@/lib/serialize";
import { ensureParent, reissueParentPassword } from "@/lib/parents";

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
  if (typeof body.school === "string") {
    student.school = body.school;
    stuChanged = true;
  }
  if (typeof body.phone === "string") {
    student.phone = body.phone;
    stuChanged = true;
  }
  // 비밀번호 재설정 (관리자용). 평문은 저장하지 않고, 응답으로도 돌려주지 않는다.
  const newPassword =
    typeof body.password === "string" && body.password.trim() !== ""
      ? body.password.trim()
      : "";
  if (newPassword) {
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "비밀번호는 6자 이상이어야 합니다." },
        { status: 400 }
      );
    }
    student.password = await bcrypt.hash(newPassword, 10);
    stuChanged = true;
  }
  if (stuChanged) await student.save();
  // 학부모 계정은 학생 계정과 별개다 (아이디 user001 · 숫자 10자리 비밀번호).
  const ensured = await ensureParent(student as any);
  // resetParent=true 면 새 비밀번호를 발급한다 (잊었을 때). 평문은 이때 한 번만 나간다.
  const reissued = body.resetParent ? await reissueParentPassword(student._id) : null;

  const parent = await Parent.findOne({ student: student._id }).lean();
  return NextResponse.json({
    ...serializeRoster(enr.toObject(), student.toObject(), parent),
    // 새로 만들었거나 재발급했을 때만 내려간다 (다시 볼 수 없으니 바로 안내할 것)
    parentPassword: reissued?.password ?? ensured.password ?? null,
  });
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
      Parent.deleteMany({ student: studentId }),
      Student.findByIdAndDelete(studentId),
    ]);
    return NextResponse.json({ ok: true, account: true });
  }

  await enr.deleteOne();
  return NextResponse.json({ ok: true });
}
