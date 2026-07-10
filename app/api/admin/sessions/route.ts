import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Session } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { serializeSession } from "@/lib/serialize";
import { buildMaxMap } from "@/lib/testconfig";
import { resolveTerm } from "@/lib/term";
import { toDate } from "@/lib/date";

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
  if (!studentId || !date || !subject || typeof patch !== "object") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  await dbConnect();
  const term = await resolveTerm(body.term);
  if (!term) return NextResponse.json({ error: "학기가 없습니다." }, { status: 400 });

  const set: Record<string, any> = {};
  if ("hwDone" in patch) set.hwDone = patch.hwDone;
  if ("testScore" in patch) set.testScore = patch.testScore;
  if ("testMaxOverride" in patch) set.testMaxOverride = patch.testMaxOverride;
  if ("testDetail" in patch) set.testDetail = patch.testDetail ?? "";
  if ("solved" in patch) set.solved = patch.solved ?? "";
  if ("adminNote" in patch) set.adminNote = patch.adminNote ?? "";

  const doc = await Session.findOneAndUpdate(
    { term: term._id, student: studentId, subject, date: toDate(date) },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  const maxMap = await buildMaxMap(String(term._id));
  return NextResponse.json(serializeSession(doc, maxMap));
}
