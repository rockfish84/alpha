import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Enrollment, Session } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { serializeSession } from "@/lib/serialize";
import { buildMaxMap } from "@/lib/testconfig";
import { resolveTerm } from "@/lib/term";
import { toDate } from "@/lib/date";
import { getClinicDatesForSubject, isClinicDate } from "@/lib/clinic-dates";

export const dynamic = "force-dynamic";

// GET /api/admin/sessions?term=ID -> 그 학기 전체 세션
export async function GET(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const term = await resolveTerm(searchParams.get("term"));
  if (!term) return NextResponse.json([]);

  const [docs, maxMap] = await Promise.all([
    Session.find({ term: term._id }).sort({ date: -1 }).lean(),
    buildMaxMap(String(term._id)),
  ]);
  return NextResponse.json(docs.map((d) => serializeSession(d, maxMap)));
}

// PATCH /api/admin/sessions -> 채점(upsert). body.term 필요.
export async function PATCH(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const { studentId, date, subject, patch } = body;
  if (
    !body.term ||
    !studentId ||
    !date ||
    !subject ||
    typeof patch !== "object"
  ) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!isClinicDate(date)) {
    return NextResponse.json({ error: "날짜 형식이 잘못되었습니다." }, { status: 400 });
  }

  await dbConnect();
  const term = await resolveTerm(body.term);
  if (!term) return NextResponse.json({ error: "학기가 없습니다." }, { status: 400 });

  const sessionKey = {
    term: term._id,
    student: studentId,
    subject,
    date: toDate(date),
  };
  const existing = await Session.exists(sessionKey);
  if (!existing) {
    const enrollment = await Enrollment.exists({
      term: term._id,
      student: studentId,
      status: "재원",
      subjects: subject,
    });
    if (!enrollment) {
      return NextResponse.json(
        { error: "이 학기·수업에 재원 상태로 등록된 학생이 아닙니다." },
        { status: 403 }
      );
    }
  }
  // 반 목록에 없는 legacy 기록은 계속 수정할 수 있지만 새로 만들 수는 없다.
  if (!(term.subjects ?? []).includes(subject) && !existing) {
    return NextResponse.json(
      { error: "이 학기의 수업이 아닙니다." },
      { status: 400 }
    );
  }
  // 기존 기록은 일정 변경 후에도 수정할 수 있지만, 새 기록은 해당 수업일에만 만든다.
  if (!existing && !getClinicDatesForSubject(term, subject).includes(date)) {
    return NextResponse.json(
      { error: "이 수업에 등록된 클리닉 날짜가 아닙니다." },
      { status: 400 }
    );
  }

  const set: Record<string, any> = {};
  if ("attnAdmin" in patch) set.attnAdmin = !!patch.attnAdmin;
  if ("attendance" in patch) set.attendance = patch.attendance;
  if ("submitted" in patch) set.submitted = !!patch.submitted;
  if ("lateTime" in patch) set.lateTime = patch.lateTime ?? "";
  if ("absentReason" in patch) set.absentReason = patch.absentReason ?? "";
  if ("hwDone" in patch) set.hwDone = patch.hwDone;
  if ("hwSsen" in patch) set.hwSsen = patch.hwSsen;
  if ("testScore" in patch) set.testScore = patch.testScore;
  if ("testMaxOverride" in patch) set.testMaxOverride = patch.testMaxOverride;
  if ("testDetail" in patch) set.testDetail = patch.testDetail ?? "";
  if ("solved" in patch) set.solved = patch.solved ?? "";
  if ("adminNote" in patch) set.adminNote = patch.adminNote ?? "";

  const doc = await Session.findOneAndUpdate(
    sessionKey,
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  const maxMap = await buildMaxMap(String(term._id));
  return NextResponse.json(serializeSession(doc, maxMap));
}
