import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Bookmark, Enrollment } from "@/lib/models";
import { requireViewer } from "@/lib/auth";
import { resolveTerm } from "@/lib/term";
import { isoDate, toDate } from "@/lib/date";
import { isClinicDate } from "@/lib/clinic-dates";

export const dynamic = "force-dynamic";

const MAX_LABEL = 12;

// GET /api/bookmarks?term=ID -> 이 학기에 별표한 문항 목록
export async function GET(req: Request) {
  const g = await requireViewer();
  if (!g.ok) return g.res;

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const term = await resolveTerm(searchParams.get("term"));
  if (!term) return NextResponse.json([]);

  const rows = await Bookmark.find({
    student: g.studentId,
    term: term._id,
  }).lean();
  return NextResponse.json(
    rows.map((b) => ({
      subject: b.subject as string,
      date: isoDate(b.date),
      label: b.label as string,
    }))
  );
}

// PUT /api/bookmarks -> 별표 켜기/끄기 (학생 본인만)
export async function PUT(req: Request) {
  const g = await requireViewer();
  if (!g.ok) return g.res;
  if (g.isParent) {
    return NextResponse.json(
      { error: "별표는 학생 계정에서만 표시할 수 있습니다." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject ?? "");
  const date = String(body.date ?? "");
  const label = String(body.label ?? "").slice(0, MAX_LABEL);
  const on = !!body.on;
  if (!body.term || !subject || !label || !isClinicDate(date)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  await dbConnect();
  const term = await resolveTerm(body.term);
  if (!term) return NextResponse.json({ error: "학기가 없습니다." }, { status: 400 });

  const enrolled = await Enrollment.exists({
    term: term._id,
    student: g.studentId,
    subjects: subject,
  });
  if (!enrolled) {
    return NextResponse.json({ error: "수강 중인 반이 아닙니다." }, { status: 403 });
  }

  const key = {
    student: g.studentId,
    term: term._id,
    subject,
    date: toDate(date),
    label,
  };
  if (on) await Bookmark.updateOne(key, { $set: key }, { upsert: true });
  else await Bookmark.deleteOne(key);

  return NextResponse.json({ ok: true, on });
}
