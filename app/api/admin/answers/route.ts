import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Enrollment, TestConfig } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { resolveTerm } from "@/lib/term";
import { toDate } from "@/lib/date";
import { isClinicDate } from "@/lib/clinic-dates";
import {
  normalizeAnswerMap,
  normalizeExcluded,
  normalizeQuestions,
} from "@/lib/grading";
import { saveAndGrade } from "@/lib/testpaper";

export const dynamic = "force-dynamic";

/** PUT /api/admin/answers -> 한 학생의 답안 저장 + 자동 채점 */
export async function PUT(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const { studentId } = body;
  const subject = String(body.subject ?? "");
  const date = String(body.date ?? "");
  if (!body.term || !studentId || !subject || !date) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!isClinicDate(date)) {
    return NextResponse.json({ error: "날짜 형식이 잘못되었습니다." }, { status: 400 });
  }

  await dbConnect();
  const term = await resolveTerm(body.term);
  if (!term) return NextResponse.json({ error: "학기가 없습니다." }, { status: 400 });

  const enrolled = await Enrollment.exists({
    term: term._id,
    student: studentId,
    subjects: subject,
  });
  if (!enrolled) {
    return NextResponse.json(
      { error: "이 학기·수업에 등록된 학생이 아닙니다." },
      { status: 403 }
    );
  }

  const config = await TestConfig.findOne({
    term: term._id,
    subject,
    date: toDate(date),
  }).lean();
  const questions = normalizeQuestions(config?.questions ?? []);
  if (!questions.length) {
    return NextResponse.json(
      { error: "이 회차의 답안(정답)을 먼저 입력해주세요." },
      { status: 400 }
    );
  }

  const answers = normalizeAnswerMap(body.answers, questions);
  const excluded = normalizeExcluded(body.excluded, questions);
  const result = await saveAndGrade(
    String(term._id),
    String(studentId),
    subject,
    date,
    answers,
    questions,
    excluded
  );

  return NextResponse.json({
    studentId: String(studentId),
    answers,
    excluded,
    score: Object.keys(answers).length ? result.score : null,
    pct: Object.keys(answers).length ? result.pct : null,
    max: result.max,
    marks: result.marks,
  });
}
