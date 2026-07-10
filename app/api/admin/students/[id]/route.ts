import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db";
import { Student } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { serializeStudent } from "@/lib/serialize";

export const dynamic = "force-dynamic";

// PATCH /api/admin/students/:id -> 계정 수정 / 재원·퇴원 토글
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const doc = await Student.findById(params.id);
  if (!doc) {
    return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  if (typeof body.name === "string") doc.name = body.name;
  if (typeof body.grade === "string") doc.grade = body.grade;
  if (Array.isArray(body.subjects)) doc.subjects = body.subjects;
  if (body.status === "재원" || body.status === "퇴원") doc.status = body.status;

  if (typeof body.username === "string" && body.username !== doc.username) {
    const dup = await Student.findOne({ username: body.username }).lean();
    if (dup) {
      return NextResponse.json(
        { error: "이미 사용 중인 아이디입니다." },
        { status: 409 }
      );
    }
    doc.username = body.username;
  }

  // 비밀번호는 값이 있을 때만 재설정 (빈 값이면 기존 유지)
  if (typeof body.password === "string" && body.password.trim() !== "") {
    doc.password = await bcrypt.hash(body.password, 10);
    doc.passwordPlain = body.password;
  }

  await doc.save();
  return NextResponse.json(serializeStudent(doc.toObject()));
}

// DELETE /api/admin/students/:id -> 계정 삭제
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const doc = await Student.findByIdAndDelete(params.id);
  if (!doc) {
    return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
