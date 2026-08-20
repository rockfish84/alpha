import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Session, Enrollment } from "@/lib/models";
import { requireStudent } from "@/lib/auth";
import { serializeSession } from "@/lib/serialize";
import { buildMaxMap } from "@/lib/testconfig";
import { resolveTerm } from "@/lib/term";
import { toDate } from "@/lib/date";
import { getClinicDatesForSubject } from "@/lib/clinic-dates";
import { isSubjectClosed } from "@/lib/subject-status";

export const dynamic = "force-dynamic";

// GET /api/sessions?term=ID&subject=&from=&to=  -> 그 학기 내 클리닉 이력
export async function GET(req: Request) {
  const g = await requireStudent();
  if (!g.ok) return g.res;

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const term = await resolveTerm(searchParams.get("term"));
  if (!term) return NextResponse.json([]);

  const query: Record<string, any> = { student: g.user.id, term: term._id };
  const subject = searchParams.get("subject");
  if (subject) query.subject = subject;

  const [docs, maxMap] = await Promise.all([
    Session.find(query).sort({ date: 1 }).lean(),
    buildMaxMap(String(term._id)),
  ]);

  return NextResponse.json(docs.map((d) => serializeSession(d, maxMap)));
}

// POST /api/sessions -> 출결·질문 제출 (upsert, 학생 입력 필드만)
export async function POST(req: Request) {
  const g = await requireStudent();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const { date, subject } = body;
  if (!body.term || !date || !subject) {
    return NextResponse.json(
      { error: "학기·날짜·과목은 필수입니다." },
      { status: 400 }
    );
  }

  await dbConnect();
  const term = await resolveTerm(body.term);
  if (!term) return NextResponse.json({ error: "학기가 없습니다." }, { status: 400 });

  // 이 학기에 등록된 학생만 제출 가능
  const enr = await Enrollment.findOne({
    term: term._id,
    student: g.user.id,
    status: "재원",
  }).lean();
  if (!enr) {
    return NextResponse.json(
      { error: "이 학기에 재원 상태로 등록되어 있지 않습니다." },
      { status: 403 }
    );
  }
  if (!term.active) {
    return NextResponse.json(
      { error: "종료된 학기에는 새 응답을 제출할 수 없습니다." },
      { status: 403 }
    );
  }
  if (
    !(enr.subjects ?? []).includes(subject) ||
    !(term.subjects ?? []).includes(subject)
  ) {
    return NextResponse.json(
      { error: "이 학기에 수강 중인 수업이 아닙니다." },
      { status: 403 }
    );
  }
  if (isSubjectClosed(term, subject)) {
    return NextResponse.json(
      { error: "종료된 수업에는 새 응답을 제출할 수 없습니다." },
      { status: 403 }
    );
  }
  if (!getClinicDatesForSubject(term, subject).includes(date)) {
    return NextResponse.json(
      { error: "이 수업에 등록된 클리닉 날짜가 아닙니다." },
      { status: 400 }
    );
  }

  const studentFields = {
    submitted: true,
    attendance: body.attendance ?? "출석",
    lateTime: body.lateTime ?? "",
    absentReason: body.absentReason ?? "",
    sources: Array.isArray(body.sources) ? body.sources : [],
    sourcesEtc: body.sourcesEtc ?? "",
    qNumbers: body.qNumbers ?? "",
    qTypes: Array.isArray(body.qTypes) ? body.qTypes : [],
    qTypesEtc: body.qTypesEtc ?? "",
    request: body.request ?? "",
  };

  const doc = await Session.findOneAndUpdate(
    { term: term._id, student: g.user.id, subject, date: toDate(date) },
    { $set: studentFields },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  const maxMap = await buildMaxMap(String(term._id));
  return NextResponse.json(serializeSession(doc, maxMap));
}
