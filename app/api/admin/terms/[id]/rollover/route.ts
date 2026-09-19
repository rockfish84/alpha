import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Enrollment, Student, Term } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { advanceGrade } from "@/lib/grade";
import { termYear } from "@/lib/term";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/terms/:id/rollover?from=이전학기ID
 *   -> 이월 후보: 이전 학기 재원 학생 + 그 학생이 듣던 반 + 진급 후 학년
 *
 * 새 학기는 반을 새로 짜는 경우가 많아서(중등 공수 개념 → 고1 공수2), 명단을 통째로
 * 복사하는 대신 "지난 반 → 새 반" 으로 옮기고 일부만 데려온다.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const target = await Term.findById(params.id).lean();
  if (!target) {
    return NextResponse.json({ error: "학기를 찾을 수 없습니다." }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "";
  const source = from ? await Term.findById(from).lean() : null;
  if (!source) {
    return NextResponse.json({ error: "이전 학기를 고르세요." }, { status: 400 });
  }

  // 퇴원 학생도 후보에 넣는다 (쉬었다 돌아오는 경우가 흔하다). 화면에서 표시만 다르게 한다.
  const [prev, already] = await Promise.all([
    Enrollment.find({ term: source._id }).lean(),
    Enrollment.find({ term: target._id }).lean(),
  ]);
  const enrolled = new Set(already.map((e) => String(e.student)));
  const students = await Student.find({
    _id: { $in: prev.map((e) => e.student) },
  })
    .select({ name: 1, school: 1 })
    .lean();
  const byId = new Map(students.map((s) => [String(s._id), s]));

  // 학년도 차이만큼 학년을 올린다 (2년 만에 돌아오면 두 학년)
  const years = Math.max(0, termYear(target) - termYear(source));

  const rows = prev
    .map((e) => {
      const stu = byId.get(String(e.student));
      if (!stu) return null;
      const promoted = advanceGrade(e.grade, years);
      return {
        studentId: String(e.student),
        name: stu.name as string,
        school: (stu.school ?? "") as string,
        fromSubjects: (e.subjects ?? []) as string[],
        grade: (e.grade ?? "") as string,
        nextGrade: promoted ?? (e.grade ?? ""),
        graduating: promoted === null,
        // 지난 학기에 퇴원한 학생 (돌아오는 경우 여기서 다시 데려온다)
        left: e.status === "퇴원",
        // 이미 새 학기에 등록된 학생은 다시 데려올 필요가 없다
        already: enrolled.has(String(e.student)),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.name.localeCompare(b.name, "ko"));

  return NextResponse.json({
    source: {
      id: String(source._id),
      name: source.name,
      subjects: source.subjects ?? [],
      year: termYear(source),
    },
    target: {
      id: String(target._id),
      name: target.name,
      subjects: target.subjects ?? [],
      year: termYear(target),
    },
    /** 학년을 몇 칸 올릴지 (학년도 차이) */
    years,
    rows,
  });
}

/**
 * POST /api/admin/terms/:id/rollover
 * body: { assignments: [{ studentId, subjects: string[], grade?: string }] }
 *   -> 고른 학생만 새 학기에 등록한다. 반은 새 학기 반 목록 안에서만 받는다.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const target = await Term.findById(params.id).lean();
  if (!target) {
    return NextResponse.json({ error: "학기를 찾을 수 없습니다." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const raw = Array.isArray(body?.assignments) ? body.assignments : [];
  const allowed = new Set(target.subjects ?? []);

  const items = raw
    .filter((a: any) => a && typeof a.studentId === "string")
    .map((a: any) => ({
      studentId: String(a.studentId),
      grade: typeof a.grade === "string" ? a.grade : "",
      subjects: (Array.isArray(a.subjects) ? a.subjects : [])
        .filter((s: unknown) => typeof s === "string" && allowed.has(s as string)),
    }))
    .filter((a: { subjects: string[] }) => a.subjects.length > 0);

  if (!items.length) {
    return NextResponse.json(
      { error: "데려올 학생과 반을 고르세요. (새 학기에 있는 반만 배정할 수 있습니다)" },
      { status: 400 }
    );
  }

  let created = 0;
  let updated = 0;
  for (const item of items) {
    const existing = await Enrollment.findOne({
      term: target._id,
      student: item.studentId,
    });
    if (existing) {
      // 이미 있으면 반만 합치고 재원으로 되돌린다 (학년은 건드리지 않는다)
      existing.subjects = [...new Set([...(existing.subjects ?? []), ...item.subjects])];
      existing.status = "재원";
      await existing.save();
      updated += 1;
      continue;
    }
    await Enrollment.create({
      term: target._id,
      student: item.studentId,
      grade: item.grade,
      subjects: item.subjects,
      status: "재원",
    });
    created += 1;
  }

  return NextResponse.json({ created, updated, total: created + updated });
}
