import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Session } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { serializeSession } from "@/lib/serialize";
import { buildMaxMap } from "@/lib/testconfig";
import { toDate } from "@/lib/date";

export const dynamic = "force-dynamic";

// GET /api/admin/sessions -> 전체 세션 (현황판·응답관리 공용)
export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const [docs, maxMap] = await Promise.all([
    Session.find().sort({ date: -1 }).lean(),
    buildMaxMap(),
  ]);
  return NextResponse.json(docs.map((d) => serializeSession(d, maxMap)));
}

// PATCH /api/admin/sessions -> 과제 O/X·테스트 점수·해결문제 입력 (upsert)
export async function PATCH(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const { studentId, date, subject, patch } = body;
  if (!studentId || !date || !subject || typeof patch !== "object") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  await dbConnect();

  const set: Record<string, any> = {};
  if ("hwDone" in patch) set.hwDone = patch.hwDone;
  if ("testScore" in patch) set.testScore = patch.testScore;
  if ("testDetail" in patch) set.testDetail = patch.testDetail ?? "";
  if ("solved" in patch) set.solved = patch.solved ?? "";
  if ("adminNote" in patch) set.adminNote = patch.adminNote ?? "";

  const doc = await Session.findOneAndUpdate(
    { student: studentId, subject, date: toDate(date) },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  const maxMap = await buildMaxMap();
  return NextResponse.json(serializeSession(doc, maxMap));
}
