import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Term, Enrollment, Student } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { serializeTerm, termYear } from "@/lib/term";
import {
  mergeClinicDates,
  normalizeClinicDates,
  normalizeClinicDatesBySubject,
} from "@/lib/clinic-dates";
import { normalizeClosedSubjects } from "@/lib/subject-status";
import { advanceGrade } from "@/lib/grade";

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
  let clinicDates = normalizeClinicDates(body.clinicDates);
  let rawClinicDatesBySubject: unknown = body.clinicDatesBySubject;
  let copyRoster = false;
  let source: any = null;
  if (copyFrom) {
    source = await Term.findById(copyFrom).lean();
    if (source) {
      if (!subjects.length) subjects = source.subjects ?? [];
      if (!clinicDates.length) clinicDates = source.clinicDates ?? [];
      if (!Object.keys(normalizeClinicDatesBySubject(rawClinicDatesBySubject)).length) {
        rawClinicDatesBySubject = source.clinicDatesBySubject;
      }
      copyRoster = body.copyRoster !== false; // 기본 명단도 복사
    }
  }

  const clinicDatesBySubject = normalizeClinicDatesBySubject(
    rawClinicDatesBySubject,
    subjects
  );
  if (Object.keys(clinicDatesBySubject).length) {
    clinicDates = mergeClinicDates(clinicDatesBySubject);
  }

  const maxOrder = await Term.findOne().sort({ order: -1 }).lean();
  const order = (maxOrder?.order ?? 0) + 1;

  const rawYear = Math.floor(Number(body.year));
  const term = await Term.create({
    name,
    year: Number.isFinite(rawYear) && rawYear > 1900 && rawYear < 2200 ? rawYear : 0,
    startDate: startDate ?? "",
    endDate: endDate ?? "",
    subjects,
    clinicDates,
    clinicDatesBySubject,
    // 복사해 만든 학기라도 반은 모두 진행 상태로 시작한다.
    closedSubjects: normalizeClosedSubjects(body.closedSubjects, subjects),
    order,
    // 여름학기와 정규학기처럼 여러 학기를 동시에 운영할 수 있다.
    active: !!activate,
  });

  // 이전 학기 명단 복사. 체크박스가 아니라 학년도 차이만큼 자동 진급한다.
  const promotionYears = source
    ? Math.max(0, termYear(term.toObject()) - termYear(source))
    : 0;
  let copied = 0;
  let graduated: string[] = [];
  if (copyRoster && source) {
    const prev = await Enrollment.find({ term: source._id }).lean();
    const graduatedIds: unknown[] = [];
    for (const e of prev) {
      // 퇴원 이력은 상태와 당시 학년을 그대로 복사한다. 돌아오면 '학생 데려오기'에서
      // 학년도 차이에 맞춰 올린 학년으로 재등록할 수 있다.
      const grade =
        e.status === "재원" ? advanceGrade(e.grade, promotionYears) : String(e.grade ?? "");
      if (e.status === "재원" && grade === null) {
        graduatedIds.push(e.student);
        continue;
      }
      await Enrollment.updateOne(
        { term: term._id, student: e.student },
        {
          $setOnInsert: {
            grade,
            subjects: e.subjects,
            status: e.status,
          },
        },
        { upsert: true }
      );
      copied += 1;
    }
    if (graduatedIds.length) {
      const list = await Student.find({ _id: { $in: graduatedIds } })
        .select({ name: 1 })
        .lean();
      graduated = list.map((s) => s.name as string);
    }
  }

  return NextResponse.json(
    { ...serializeTerm(term.toObject()), copied, graduated, promotionYears },
    { status: 201 }
  );
}
