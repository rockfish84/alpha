import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db";
import { Student, Admin, Parent } from "@/lib/models";
import { getSession } from "@/lib/auth";
import { ensureParent } from "@/lib/parents";
import { blockedSeconds, clearFailures, clientIp, recordFailure } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  // 반드시 문자열로만 다룬다. (객체를 넣어 쿼리를 바꾸는 NoSQL 주입 차단)
  const role = typeof body?.role === "string" ? body.role : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (
    !username ||
    !password ||
    username.length > 100 ||
    password.length > 200 ||
    (role !== "student" && role !== "admin" && role !== "parent")
  ) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  // 무차별 대입 속도 제한 (아이디 + 접속 IP 기준)
  const rlKey = `${role}:${username}:${clientIp(req)}`;
  const wait = blockedSeconds(rlKey);
  if (wait > 0) {
    return NextResponse.json(
      { error: `로그인 시도가 너무 많습니다. ${Math.ceil(wait / 60)}분 뒤에 다시 시도해주세요.` },
      { status: 429 }
    );
  }
  const fail = (error: string, status = 401) => {
    recordFailure(rlKey);
    return NextResponse.json({ error }, { status });
  };

  await dbConnect();
  const session = await getSession();

  if (role === "admin") {
    const admin = await Admin.findOne({ username }).lean();
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return fail("관리자 정보가 일치하지 않습니다.");
    }
    clearFailures(rlKey);
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
        return fail("연결된 학생 계정이 없습니다. 선생님께 문의하세요.");
      }
      clearFailures(rlKey);
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
        clearFailures(rlKey);
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
    return fail("아이디 또는 비밀번호가 올바르지 않습니다.");
  }

  // student (재원/퇴원 상태는 학기별 Enrollment 로 관리 → 로그인 자체는 계정 존재로 허용)
  const student = await Student.findOne({ username });
  if (!student || !(await bcrypt.compare(password, student.password))) {
    return fail("아이디 또는 비밀번호가 올바르지 않습니다.");
  }

  clearFailures(rlKey);
  session.user = { id: String(student._id), role: "student", name: student.name };
  await session.save();

  return NextResponse.json({ role: "student", id: String(student._id), name: student.name });
}
