import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db";
import { Student } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { serializeStudent } from "@/lib/serialize";

export const dynamic = "force-dynamic";

// GET /api/admin/students -> 전체 학생
export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const docs = await Student.find().sort({ createdAt: 1 }).lean();
  return NextResponse.json(docs.map(serializeStudent));
}

// POST /api/admin/students -> 계정 생성
export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const { name, username, password, grade, subjects, status } = body;
  if (!name || !username || !password) {
    return NextResponse.json(
      { error: "이름·아이디·비밀번호는 필수입니다." },
      { status: 400 }
    );
  }

  await dbConnect();
  const exists = await Student.findOne({ username }).lean();
  if (exists) {
    return NextResponse.json(
      { error: "이미 사용 중인 아이디입니다." },
      { status: 409 }
    );
  }

  const hash = await bcrypt.hash(password, 10);
  const doc = await Student.create({
    name,
    username,
    password: hash,
    passwordPlain: password,
    grade: grade ?? "",
    subjects: Array.isArray(subjects) ? subjects : [],
    status: status === "퇴원" ? "퇴원" : "재원",
  });

  return NextResponse.json(serializeStudent(doc.toObject()), { status: 201 });
}
