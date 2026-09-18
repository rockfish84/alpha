import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db";
import { Student, Admin, Parent } from "@/lib/models";
import { getSession } from "@/lib/auth";
import { ensureParent } from "@/lib/parents";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { role, username, password } = await req.json().catch(() => ({}));

  if (
    !username ||
    !password ||
    (role !== "student" && role !== "admin" && role !== "parent")
  ) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  await dbConnect();
  const session = await getSession();

  if (role === "admin") {
    const admin = await Admin.findOne({ username }).lean();
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return NextResponse.json(
        { error: "관리자 정보가 일치하지 않습니다." },
        { status: 401 }
      );
    }
    session.user = { id: String(admin._id), role: "admin", name: "관리자" };
    await session.save();
    return NextResponse.json({ role: "admin", id: session.user.id, name: "관리자" });
  }

  if (role === "parent") {
    // 학부모 계정은 학생과 같은 아이디·비밀번호로 시작한다. 계정 문서가 아직
    // 없으면 학생 비밀번호가 맞을 때 그 자리에서 만들어 준다.
    const parent = await Parent.findOne({ username });
    if (parent && (await bcrypt.compare(password, parent.password))) {
      const child = await Student.findById(parent.student).lean();
      if (!child) {
        return NextResponse.json(
          { error: "연결된 학생 계정이 없습니다. 선생님께 문의하세요." },
          { status: 401 }
        );
      }
      session.user = {
        id: String(parent._id),
        role: "parent",
        name: child.name,
        studentId: String(child._id),
      };
      await session.save();
      return NextResponse.json({
        role: "parent",
        id: String(parent._id),
        name: child.name,
      });
    }
    if (!parent) {
      const child = await Student.findOne({ username });
      if (child && (await bcrypt.compare(password, child.password))) {
        const created = await ensureParent(child as any);
        session.user = {
          id: String(created._id),
          role: "parent",
          name: child.name,
          studentId: String(child._id),
        };
        await session.save();
        return NextResponse.json({
          role: "parent",
          id: String(created._id),
          name: child.name,
        });
      }
    }
    return NextResponse.json(
      { error: "아이디 또는 비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  // student (재원/퇴원 상태는 학기별 Enrollment 로 관리 → 로그인 자체는 계정 존재로 허용)
  const student = await Student.findOne({ username });
  if (!student || !(await bcrypt.compare(password, student.password))) {
    return NextResponse.json(
      { error: "아이디 또는 비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  session.user = { id: String(student._id), role: "student", name: student.name };
  await session.save();

  return NextResponse.json({ role: "student", id: String(student._id), name: student.name });
}
