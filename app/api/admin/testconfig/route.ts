import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { TestConfig } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { buildMaxMap } from "@/lib/testconfig";
import { resolveTerm } from "@/lib/term";
import { toDate } from "@/lib/date";

export const dynamic = "force-dynamic";

// GET /api/admin/testconfig?term=ID -> { "YYYY-MM-DD|과목": maxScore }
export async function GET(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const term = await resolveTerm(searchParams.get("term"));
  if (!term) return NextResponse.json({});
  return NextResponse.json(await buildMaxMap(String(term._id)));
}

// PUT /api/admin/testconfig -> 만점 설정. body.term 필요. maxScore=null 이면 삭제.
export async function PUT(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const { subject, date, maxScore } = body;
  if (!subject || !date) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  await dbConnect();
  const term = await resolveTerm(body.term);
  if (!term) return NextResponse.json({ error: "학기가 없습니다." }, { status: 400 });

  if (maxScore == null || maxScore === "") {
    await TestConfig.findOneAndDelete({ term: term._id, subject, date: toDate(date) });
    return NextResponse.json({ ok: true, removed: true });
  }

  await TestConfig.findOneAndUpdate(
    { term: term._id, subject, date: toDate(date) },
    { $set: { maxScore: Number(maxScore) } },
    { upsert: true, new: true }
  );
  return NextResponse.json({ ok: true });
}
