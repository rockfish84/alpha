import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Term, Enrollment, Session, TestConfig } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { serializeTerm } from "@/lib/term";
import {
  mergeClinicDates,
  normalizeClinicDates,
  normalizeClinicDatesBySubject,
} from "@/lib/clinic-dates";
import { normalizeClosedSubjects } from "@/lib/subject-status";

export const dynamic = "force-dynamic";

// PATCH /api/admin/terms/:id -> 이름·기간·과목·날짜·활성 변경
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const term = await Term.findById(params.id);
  if (!term) {
    return NextResponse.json({ error: "학기를 찾을 수 없습니다." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  if (typeof body.name === "string" && body.name !== term.name) {
    const dup = await Term.findOne({ name: body.name }).lean();
    if (dup) {
      return NextResponse.json({ error: "같은 이름의 학기가 있습니다." }, { status: 409 });
    }
    term.name = body.name;
  }
  if (typeof body.startDate === "string") term.startDate = body.startDate;
  if (typeof body.endDate === "string") term.endDate = body.endDate;
  if (Array.isArray(body.subjects)) term.subjects = body.subjects;
  if (body.clinicDatesBySubject !== undefined) {
    const clinicDatesBySubject = normalizeClinicDatesBySubject(
      body.clinicDatesBySubject,
      term.subjects
    );
    term.clinicDatesBySubject = new Map(Object.entries(clinicDatesBySubject));
    // 과목별 일정이 있으면 공통 날짜는 항상 그 union으로부터 파생한다.
    term.clinicDates = mergeClinicDates(clinicDatesBySubject);
  } else {
    const clinicDatesBySubject = normalizeClinicDatesBySubject(
      term.clinicDatesBySubject,
      term.subjects
    );
    if (Array.isArray(body.subjects)) {
      // 반을 제거한 경우 사라진 반의 일정도 함께 제거한다.
      term.clinicDatesBySubject = new Map(
        Object.entries(clinicDatesBySubject)
      );
    }
    if (Object.keys(clinicDatesBySubject).length) {
      // 구형 화면이 clinicDates만 보내더라도 과목별 일정과 union이 어긋나지 않게 한다.
      term.clinicDates = mergeClinicDates(clinicDatesBySubject);
    } else if (Array.isArray(body.clinicDates)) {
      term.clinicDates = normalizeClinicDates(body.clinicDates);
    }
  }

  // 반별 종료. 학기가 진행중이어도 끝난 반만 먼저 닫을 수 있다.
  if (body.closedSubjects !== undefined) {
    term.closedSubjects = normalizeClosedSubjects(
      body.closedSubjects,
      term.subjects
    );
  } else if (Array.isArray(body.subjects)) {
    // 반이 사라졌으면 그 반의 종료 표시도 함께 정리한다.
    term.closedSubjects = normalizeClosedSubjects(
      term.closedSubjects,
      term.subjects
    );
  }

  // 진행 학기는 서로 배타적이지 않다. 학기별로 시작/종료한다.
  if (typeof body.active === "boolean") term.active = body.active;

  await term.save();
  return NextResponse.json(serializeTerm(term.toObject()));
}

// DELETE /api/admin/terms/:id -> 학기 + 소속 등록·세션·테스트설정 삭제
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const term = await Term.findById(params.id);
  if (!term) {
    return NextResponse.json({ error: "학기를 찾을 수 없습니다." }, { status: 404 });
  }

  await Promise.all([
    Enrollment.deleteMany({ term: term._id }),
    Session.deleteMany({ term: term._id }),
    TestConfig.deleteMany({ term: term._id }),
  ]);
  await term.deleteOne();

  // 진행 학기가 하나도 남지 않은 경우에만 가장 최신 학기를 진행 상태로 둔다.
  if (term.active) {
    const hasAnotherActive = await Term.exists({ active: true });
    if (!hasAnotherActive) {
      const next = await Term.findOne().sort({ order: -1, createdAt: -1 });
      if (next) {
        next.active = true;
        await next.save();
      }
    }
  }
  return NextResponse.json({ ok: true });
}
