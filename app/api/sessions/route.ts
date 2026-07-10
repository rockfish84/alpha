import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Session } from "@/lib/models";
import { requireStudent } from "@/lib/auth";
import { serializeSession } from "@/lib/serialize";
import { buildMaxMap } from "@/lib/testconfig";
import { toDate } from "@/lib/date";

export const dynamic = "force-dynamic";

// GET /api/sessions?subject=&from=&to=  -> 내 클리닉 이력
export async function GET(req: Request) {
  const g = await requireStudent();
  if (!g.ok) return g.res;

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const subject = searchParams.get("subject");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const query: Record<string, any> = { student: g.user.id };
  if (subject) query.subject = subject;
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = toDate(from);
    if (to) query.date.$lte = toDate(to);
  }

  const [docs, maxMap] = await Promise.all([
    Session.find(query).sort({ date: 1 }).lean(),
    buildMaxMap(),
  ]);

  return NextResponse.json(docs.map((d) => serializeSession(d, maxMap)));
}

// POST /api/sessions -> 출결·질문 제출 (upsert). 학생 입력 필드만 갱신.
export async function POST(req: Request) {
  const g = await requireStudent();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const { date, subject } = body;
  if (!date || !subject) {
    return NextResponse.json(
      { error: "날짜와 과목은 필수입니다." },
      { status: 400 }
    );
  }

  await dbConnect();

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
    { student: g.user.id, subject, date: toDate(date) },
    { $set: studentFields },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  const maxMap = await buildMaxMap();
  return NextResponse.json(serializeSession(doc, maxMap));
}
