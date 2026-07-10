import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Term, Enrollment } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { serializeTerm } from "@/lib/term";

export const dynamic = "force-dynamic";

// GET /api/admin/terms -> 전체 학기 (상세)
export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const terms = await Term.find().sort({ order: -1, createdAt: -1 }).lean();
  return NextResponse.json(terms.map(serializeTerm));
}

// POST /api/admin/terms -> 학기 생성 (copyFrom 으로 반·날짜·명단 복사 가능)
export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const { name, startDate, endDate, copyFrom, activate } = body;
  if (!name) {
    return NextResponse.json({ error: "학기 이름은 필수입니다." }, { status: 400 });
  }

  await dbConnect();
  const dup = await Term.findOne({ name }).lean();
  if (dup) {
    return NextResponse.json({ error: "같은 이름의 학기가 있습니다." }, { status: 409 });
  }

  let subjects: string[] = Array.isArray(body.subjects) ? body.subjects : [];
  let clinicDates: string[] = Array.isArray(body.clinicDates) ? body.clinicDates : [];
  let copyRoster = false;
  let source: any = null;
  if (copyFrom) {
    source = await Term.findById(copyFrom).lean();
    if (source) {
      if (!subjects.length) subjects = source.subjects ?? [];
      if (!clinicDates.length) clinicDates = source.clinicDates ?? [];
      copyRoster = body.copyRoster !== false; // 기본 명단도 복사
    }
  }

  const maxOrder = await Term.findOne().sort({ order: -1 }).lean();
  const order = (maxOrder?.order ?? 0) + 1;

  if (activate) await Term.updateMany({}, { $set: { active: false } });
  const term = await Term.create({
    name,
    startDate: startDate ?? "",
    endDate: endDate ?? "",
    subjects,
    clinicDates,
    order,
    active: !!activate,
  });

  // 이전 학기 명단 복사
  if (copyRoster && source) {
    const prev = await Enrollment.find({ term: source._id }).lean();
    for (const e of prev) {
      await Enrollment.updateOne(
        { term: term._id, student: e.student },
        { $setOnInsert: { grade: e.grade, subjects: e.subjects, status: e.status } },
        { upsert: true }
      );
    }
  }

  return NextResponse.json(serializeTerm(term.toObject()), { status: 201 });
}
