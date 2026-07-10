import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { TestConfig } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { buildMaxMap } from "@/lib/testconfig";
import { toDate } from "@/lib/date";

export const dynamic = "force-dynamic";

// GET /api/admin/testconfig -> { "YYYY-MM-DD|과목": maxScore }
export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const map = await buildMaxMap();
  return NextResponse.json(map);
}

// PUT /api/admin/testconfig -> 테스트 만점 개수 설정 (maxScore=null 이면 삭제)
export async function PUT(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const { subject, date, maxScore } = body;
  if (!subject || !date) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  await dbConnect();

  if (maxScore == null || maxScore === "") {
    await TestConfig.findOneAndDelete({ subject, date: toDate(date) });
    return NextResponse.json({ ok: true, removed: true });
  }

  await TestConfig.findOneAndUpdate(
    { subject, date: toDate(date) },
    { $set: { maxScore: Number(maxScore) } },
    { upsert: true, new: true }
  );

  return NextResponse.json({ ok: true });
}
