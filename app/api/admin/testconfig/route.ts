import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { TestConfig } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { buildTestMaps } from "@/lib/testconfig";
import { resolveTerm } from "@/lib/term";
import { toDate } from "@/lib/date";
import { getClinicDatesForSubject, isClinicDate } from "@/lib/clinic-dates";

export const dynamic = "force-dynamic";

// GET /api/admin/testconfig?term=ID -> 만점/문항/주간 추가 메시지 맵
export async function GET(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const term = await resolveTerm(searchParams.get("term"));
  if (!term) {
    return NextResponse.json({ max: {}, detail: {}, additionalMessage: {} });
  }
  return NextResponse.json(await buildTestMaps(String(term._id)));
}

// PUT /api/admin/testconfig -> 만점/문항/추가 메시지 설정 (반 공통). body.term 필요.
export async function PUT(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const { subject, date } = body;
  if (!body.term || !subject || !date) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!isClinicDate(date)) {
    return NextResponse.json({ error: "날짜 형식이 잘못되었습니다." }, { status: 400 });
  }

  await dbConnect();
  const term = await resolveTerm(body.term);
  if (!term) return NextResponse.json({ error: "학기가 없습니다." }, { status: 400 });

  const configKey = { term: term._id, subject, date: toDate(date) };
  const existing = await TestConfig.exists(configKey);
  // 반 목록에 없는 legacy 설정은 계속 수정할 수 있지만 새로 만들 수는 없다.
  if (!(term.subjects ?? []).includes(subject) && !existing) {
    return NextResponse.json(
      { error: "이 학기의 수업이 아닙니다." },
      { status: 400 }
    );
  }
  // 일정에서 빠진 과거 설정은 유지·수정 가능하되 새 설정은 실제 수업일에만 만든다.
  if (!existing && !getClinicDatesForSubject(term, subject).includes(date)) {
    return NextResponse.json(
      { error: "이 수업에 등록된 클리닉 날짜가 아닙니다." },
      { status: 400 }
    );
  }

  const set: Record<string, any> = {};
  if ("maxScore" in body) {
    set.maxScore = body.maxScore == null || body.maxScore === "" ? 10 : Number(body.maxScore);
  }
  if ("detail" in body) set.detail = body.detail ?? "";
  if ("additionalMessage" in body) {
    set.additionalMessage =
      typeof body.additionalMessage === "string" ? body.additionalMessage : "";
  }

  await TestConfig.findOneAndUpdate(
    configKey,
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return NextResponse.json({ ok: true });
}
