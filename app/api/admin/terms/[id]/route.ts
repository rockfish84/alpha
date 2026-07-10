import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Term, Enrollment, Session, TestConfig } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { serializeTerm } from "@/lib/term";

export const dynamic = "force-dynamic";

// PATCH /api/admin/terms/:id -> 이름·기간·과목·날짜·활성 변경
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const term = await Term.findById(params.id);
  if (!term) {
    return NextResponse.json({ error: "학기를 찾을 수 없습니다." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  if (typeof body.name === "string" && body.name !== term.name) {
    const dup = await Term.findOne({ name: body.name }).lean();
    if (dup) {
      return NextResponse.json({ error: "같은 이름의 학기가 있습니다." }, { status: 409 });
    }
    term.name = body.name;
  }
  if (typeof body.startDate === "string") term.startDate = body.startDate;
  if (typeof body.endDate === "string") term.endDate = body.endDate;
  if (Array.isArray(body.subjects)) term.subjects = body.subjects;
  if (Array.isArray(body.clinicDates))
    term.clinicDates = [...new Set(body.clinicDates as string[])].sort();

  if (body.active === true) {
    await Term.updateMany({ _id: { $ne: term._id } }, { $set: { active: false } });
    term.active = true;
  }

  await term.save();
  return NextResponse.json(serializeTerm(term.toObject()));
}

// DELETE /api/admin/terms/:id -> 학기 + 소속 등록·세션·테스트설정 삭제
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const term = await Term.findById(params.id);
  if (!term) {
    return NextResponse.json({ error: "학기를 찾을 수 없습니다." }, { status: 404 });
  }

  await Promise.all([
    Enrollment.deleteMany({ term: term._id }),
    Session.deleteMany({ term: term._id }),
    TestConfig.deleteMany({ term: term._id }),
  ]);
  await term.deleteOne();

  // 활성 학기가 사라졌으면 가장 최신 학기를 활성으로
  if (term.active) {
    const next = await Term.findOne().sort({ order: -1, createdAt: -1 });
    if (next) {
      next.active = true;
      await next.save();
    }
  }
  return NextResponse.json({ ok: true });
}
