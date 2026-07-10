import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db";
import { Student, Admin } from "@/lib/models";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { role, username, password } = await req.json().catch(() => ({}));

  if (!username || !password || (role !== "student" && role !== "admin")) {
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
