import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db";
import { Student, Enrollment } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { resolveTerm } from "@/lib/term";
import { serializeRoster } from "@/lib/serialize";

export const dynamic = "force-dynamic";

// GET /api/admin/roster?term=ID -> 이 학기 명단 (Enrollment + Student)
export async function GET(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const term = await resolveTerm(searchParams.get("term"));
  if (!term) return NextResponse.json([]);

  const enrollments = await Enrollment.find({ term: term._id }).lean();
  const students = await Student.find({
    _id: { $in: enrollments.map((e) => e.student) },
  }).lean();
  const stuById: Record<string, any> = {};
  for (const s of students) stuById[String(s._id)] = s;

  const rows = enrollments
    .map((e) => {
      const stu = stuById[String(e.student)];
      return stu ? serializeRoster(e, stu) : null;
    })
    .filter(Boolean);

  return NextResponse.json(rows);
}

// POST /api/admin/roster -> 이 학기에 학생 등록 (계정 없으면 생성)
export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const { name, username, password, grade, subjects, status } = body;
  if (!body.term || !name || !username) {
    return NextResponse.json(
      { error: "학기·이름·아이디는 필수입니다." },
      { status: 400 }
    );
  }

  await dbConnect();
  const term = await resolveTerm(body.term);
  if (!term) return NextResponse.json({ error: "학기가 없습니다." }, { status: 400 });

  let student = await Student.findOne({ username });
  if (!student) {
    if (!password) {
      return NextResponse.json(
        { error: "새 계정은 비밀번호가 필요합니다." },
        { status: 400 }
      );
    }
    student = await Student.create({
      name,
      username,
      password: await bcrypt.hash(password, 10),
      passwordPlain: password,
    });
  } else {
    // 기존 계정: 이름/비번 갱신 (선택)
    if (name) student.name = name;
    if (password && String(password).trim() !== "") {
      student.password = await bcrypt.hash(password, 10);
      student.passwordPlain = password;
    }
    await student.save();
  }

  const enr = await Enrollment.findOneAndUpdate(
    { term: term._id, student: student._id },
    {
      $set: {
        grade: grade ?? "",
        subjects: Array.isArray(subjects) ? subjects : [],
        status: status === "퇴원" ? "퇴원" : "재원",
      },
    },
    { upsert: true, new: true }
  ).lean();

  return NextResponse.json(serializeRoster(enr, student.toObject()), { status: 201 });
}
