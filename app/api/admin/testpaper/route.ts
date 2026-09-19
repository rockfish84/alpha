import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Enrollment, Session, Student, TestConfig } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { resolveTerm } from "@/lib/term";
import { isoDate, toDate } from "@/lib/date";
import { isClinicDate } from "@/lib/clinic-dates";
import { gradeAnswers, normalizeQuestions } from "@/lib/grading";
import {
  saveQuestions,
  serializeTestPaper,
  toAnswerMap,
  toExcludedList,
} from "@/lib/testpaper";
import { listTestFiles } from "@/lib/files";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/testpaper?term=ID                      -> 학기 전체 회차 요약
 * GET /api/admin/testpaper?term=ID&subject=..&date=..    -> 한 회차의 답안 키 + 학생 답안
 */
export async function GET(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const term = await resolveTerm(searchParams.get("term"));
  if (!term) return NextResponse.json({ papers: [] });

  const subject = searchParams.get("subject") ?? "";
  const date = searchParams.get("date") ?? "";
  const termId = String(term._id);

  if (!subject || !date) {
    const docs = await TestConfig.find({ term: term._id }).lean();
    return NextResponse.json({
      papers: docs.map((d) => {
        const p = serializeTestPaper(d);
        return {
          subject: p.subject,
          date: p.date,
          questionCount: p.questions.length,
          maxScore: p.maxScore,
          answersPublished: p.answersPublished,
        };
      }),
    });
  }

  if (!isClinicDate(date)) {
    return NextResponse.json({ error: "날짜 형식이 잘못되었습니다." }, { status: 400 });
  }

  const [config, enrollments, sessions, files] = await Promise.all([
    TestConfig.findOne({ term: term._id, subject, date: toDate(date) }).lean(),
    Enrollment.find({ term: term._id, subjects: subject }).lean(),
    Session.find({ term: term._id, subject, date: toDate(date) }).lean(),
    listTestFiles({ termId, subject, date }),
  ]);

  const paper = serializeTestPaper(
    config ?? { subject, date: toDate(date), questions: [] }
  );
  const students = await Student.find({
    _id: { $in: enrollments.map((e) => e.student) },
  }).lean();
  const stuById: Record<string, any> = {};
  for (const s of students) stuById[String(s._id)] = s;
  const sessionByStudent: Record<string, any> = {};
  for (const s of sessions) sessionByStudent[String(s.student)] = s;

  const roster = enrollments
    .map((e) => {
      const stu = stuById[String(e.student)];
      if (!stu) return null;
      const doc = sessionByStudent[String(e.student)];
      const answers = toAnswerMap(doc?.testAnswers);
      const excluded = toExcludedList(doc?.testExcluded);
      const graded = gradeAnswers(paper.questions, answers, excluded);
      return {
        studentId: String(stu._id),
        name: stu.name as string,
        grade: (e.grade ?? "") as string,
        status: (e.status ?? "재원") as string,
        attendance: doc ? (doc.attendance as string) : "",
        attended: !!doc && (doc.submitted || doc.attnAdmin),
        answers,
        excluded,
        score: Object.keys(answers).length ? graded.score : null,
        pct: Object.keys(answers).length ? graded.pct : null,
        manualScore: (doc?.testScore ?? null) as number | null,
        auto: !!doc?.testAuto,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.name.localeCompare(b.name, "ko"));

  return NextResponse.json({ paper, roster, files });
}

/** PUT /api/admin/testpaper -> 답안 키 저장 (+ 그 회차 전체 재채점) */
export async function PUT(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject ?? "");
  const date = String(body.date ?? "");
  if (!body.term || !subject || !date) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!isClinicDate(date)) {
    return NextResponse.json({ error: "날짜 형식이 잘못되었습니다." }, { status: 400 });
  }

  await dbConnect();
  const term = await resolveTerm(body.term);
  if (!term) return NextResponse.json({ error: "학기가 없습니다." }, { status: 400 });
  if (!(term.subjects ?? []).includes(subject)) {
    const existing = await TestConfig.exists({
      term: term._id,
      subject,
      date: toDate(date),
    });
    if (!existing) {
      return NextResponse.json({ error: "이 학기의 수업이 아닙니다." }, { status: 400 });
    }
  }

  const questions = normalizeQuestions(body.questions);
  if (!questions.length && body.questions) {
    // 문항을 모두 지우는 것도 허용하지만, 형식이 깨진 입력은 막는다.
    if (Array.isArray(body.questions) && body.questions.length) {
      return NextResponse.json(
        { error: "문항 정보를 읽을 수 없습니다." },
        { status: 400 }
      );
    }
  }

  const { paper, regraded } = await saveQuestions(
    String(term._id),
    subject,
    date,
    questions,
    {
      answersPublished: body.answersPublished,
      pastExam: body.pastExam,
      pastExamSchool: body.pastExamSchool,
    }
  );
  return NextResponse.json({ paper, regraded, date: isoDate(toDate(date)) });
}
