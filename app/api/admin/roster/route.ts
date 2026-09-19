import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db";
import { Student, Enrollment, Parent } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { resolveTerm } from "@/lib/term";
import { serializeRoster } from "@/lib/serialize";
import { ensureParent } from "@/lib/parents";

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
  const studentIds = enrollments.map((e) => e.student);
  const [students, parents] = await Promise.all([
    Student.find({ _id: { $in: studentIds } }).lean(),
    Parent.find({ student: { $in: studentIds } }).lean(),
  ]);
  const stuById: Record<string, any> = {};
  for (const s of students) stuById[String(s._id)] = s;
  const parentByStudent: Record<string, any> = {};
  for (const p of parents) parentByStudent[String(p.student)] = p;

  const rows = enrollments
    .map((e) => {
      const stu = stuById[String(e.student)];
      return stu
        ? serializeRoster(e, stu, parentByStudent[String(e.student)])
        : null;
    })
    .filter(Boolean);

  return NextResponse.json(rows);
}

// POST /api/admin/roster -> 이 학기에 학생 등록 (계정 없으면 생성)
export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const { name, username, password, phone, grade, subjects, status, school } = body;
  if (!body.term || !name || !username) {
    return NextResponse.json(
      { error: "학기·이름·아이디는 필수입니다." },
      { status: 400 }
    );
  }

  await dbConnect();
  const term = await resolveTerm(body.term);
  if (!term) return NextResponse.json({ error: "학기가 없습니다." }, { status: 400 });

  // 학부모 계정을 새로 만들면 그 비밀번호는 여기서 한 번만 내려보낸다.
  let issued: string | null = null;
  let student = await Student.findOne({ username });
  if (!student) {
    // 비밀번호를 따로 주지 않으면 전화번호를 첫 비밀번호로 쓴다(기존 운영 방식).
    const initial = String(password || phone || "").trim();
    if (initial && initial.length < 6) {
      return NextResponse.json(
        { error: "비밀번호는 6자 이상이어야 합니다." },
        { status: 400 }
      );
    }
    if (!initial) {
      return NextResponse.json(
        { error: "새 계정은 비밀번호(또는 전화번호)가 필요합니다." },
        { status: 400 }
      );
    }
    student = await Student.create({
      name,
      username,
      school: typeof school === "string" ? school : "",
      phone: typeof phone === "string" ? phone : "",
      password: await bcrypt.hash(initial, 10),
    });
    issued = (await ensureParent(student as any)).password ?? null;
  } else {
    // 기존 계정: 이름/학교/비번 갱신 (선택)
    if (name) student.name = name;
    if (typeof school === "string") student.school = school;
    if (typeof phone === "string") student.phone = phone;
    if (password && String(password).trim() !== "") {
      if (String(password).trim().length < 6) {
        return NextResponse.json(
          { error: "비밀번호는 6자 이상이어야 합니다." },
          { status: 400 }
        );
      }
      student.password = await bcrypt.hash(password, 10);
    }
    await student.save();
    // 학부모 계정은 학생 비밀번호와 연동되지 않는다 (없을 때만 새로 발급).
    issued = (await ensureParent(student as any)).password ?? null;
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

  const parent = await Parent.findOne({ student: student._id }).lean();
  return NextResponse.json(
    { ...serializeRoster(enr, student.toObject(), parent), parentPassword: issued },
    { status: 201 }
  );
}
