import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireStudent } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Enrollment, Term } from "@/lib/models";
import {
  SCHOOL_EXAM_SUBJECTS,
  serializeSchoolExamResults,
  validateSchoolExamResults,
} from "@/lib/school-exams";

export const dynamic = "force-dynamic";

async function findActiveSchoolExamTerm(termId: unknown) {
  if (typeof termId !== "string" || !Types.ObjectId.isValid(termId)) return null;
  return Term.findOne({
    _id: termId,
    schoolExamInput: true,
    active: true,
  }).lean();
}

// GET /api/school-exams?term=ID -> 본인이 추가한 1학기 학교 과목별 성적
export async function GET(req: Request) {
  const g = await requireStudent();
  if (!g.ok) return g.res;

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const term = await findActiveSchoolExamTerm(searchParams.get("term"));
  if (!term) {
    return NextResponse.json(
      { error: "현재 성적 입력이 가능한 2026 2학기가 아닙니다." },
      { status: 403 }
    );
  }
  const eligibleSubjects = SCHOOL_EXAM_SUBJECTS.filter((subject) =>
    (term.subjects ?? []).includes(subject)
  );

  const enrollment = await Enrollment.findOne({
    term: term._id,
    student: g.user.id,
    status: "재원",
    subjects: { $in: eligibleSubjects },
  }).lean();
  if (!enrollment) {
    return NextResponse.json(
      { error: "이 학기의 재원 등록을 찾을 수 없습니다." },
      { status: 403 }
    );
  }

  return NextResponse.json({
    termId: String(term._id),
    results: serializeSchoolExamResults(enrollment.schoolExamResults),
  });
}

// PUT /api/school-exams -> 본인의 1학기 학교 과목 목록 전체 저장
export async function PUT(req: Request) {
  const g = await requireStudent();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "성적 입력 형식이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  const validation = validateSchoolExamResults(
    (body as Record<string, unknown>).results
  );
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  await dbConnect();
  const term = await findActiveSchoolExamTerm(
    (body as Record<string, unknown>).term
  );
  if (!term) {
    return NextResponse.json(
      { error: "현재 성적 입력이 가능한 2026 2학기가 아닙니다." },
      { status: 403 }
    );
  }
  const eligibleSubjects = SCHOOL_EXAM_SUBJECTS.filter((subject) =>
    (term.subjects ?? []).includes(subject)
  );

  const results = validation.value;
  const enrollment = await Enrollment.findOneAndUpdate(
    {
      term: term._id,
      student: g.user.id,
      status: "재원",
      subjects: { $in: eligibleSubjects },
    },
    [
      {
        $set: {
          schoolExamResults: {
            // 사용자 문자열이 "$필드" 형태여도 집계식으로 해석되지 않게 한다.
            $literal: results,
          },
        },
      },
    ],
    { new: true }
  ).lean();

  if (!enrollment) {
    return NextResponse.json(
      { error: "재원 중이며 실제 수강 중인 수업만 입력할 수 있습니다." },
      { status: 403 }
    );
  }

  // 검증·정규화된 학교 과목 목록만 반환해 내부 등록 정보는 노출하지 않는다.
  return NextResponse.json(results);
}
