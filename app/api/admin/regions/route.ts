import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { TestConfig } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { resolveTerm } from "@/lib/term";
import { toDate } from "@/lib/date";
import { isClinicDate } from "@/lib/clinic-dates";
import { normalizeRegions, regionsExcludingFile } from "@/lib/regions";

export const dynamic = "force-dynamic";

/**
 * PUT /api/admin/regions
 * 업로드한 시험지·해설지에서 뽑은 문항 위치를 저장한다.
 * 같은 파일(fileId)에 대한 기존 위치는 교체된다.
 */
export async function PUT(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject ?? "");
  const date = String(body.date ?? "");
  const fileId = String(body.fileId ?? "");
  if (!body.term || !subject || !date || !/^[0-9a-f]{24}$/.test(fileId)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!isClinicDate(date)) {
    return NextResponse.json({ error: "날짜 형식이 잘못되었습니다." }, { status: 400 });
  }

  await dbConnect();
  const term = await resolveTerm(body.term);
  if (!term) return NextResponse.json({ error: "학기가 없습니다." }, { status: 400 });

  const key = { term: term._id, subject, date: toDate(date) };
  const config = await TestConfig.findOne(key).lean();
  if (!config) {
    return NextResponse.json(
      { error: "이 회차의 테스트 설정이 없습니다. 답안을 먼저 저장해주세요." },
      { status: 400 }
    );
  }

  const incoming = normalizeRegions(body.regions).map((r) => ({ ...r, fileId }));
  const kept = regionsExcludingFile(
    (config.questionRegions ?? []) as any,
    fileId
  );
  const questionRegions = [...kept, ...incoming];

  await TestConfig.updateOne(key, { $set: { questionRegions } });
  return NextResponse.json({
    ok: true,
    saved: incoming.length,
    total: questionRegions.length,
  });
}
