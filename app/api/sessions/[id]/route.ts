import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Session } from "@/lib/models";
import { requireStudent } from "@/lib/auth";
import { serializeSession } from "@/lib/serialize";
import { buildMaxMap } from "@/lib/testconfig";

export const dynamic = "force-dynamic";

// PATCH /api/sessions/:id -> 내 응답 수정 (학생 입력 필드만)
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const g = await requireStudent();
  if (!g.ok) return g.res;

  await dbConnect();
  const doc = await Session.findById(params.id);
  if (!doc) {
    return NextResponse.json({ error: "응답을 찾을 수 없습니다." }, { status: 404 });
  }
  // 소유권 검증: 본인 데이터만
  if (String(doc.student) !== g.user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const allowed = [
    "attendance",
    "lateTime",
    "absentReason",
    "sources",
    "sourcesEtc",
    "qNumbers",
    "qTypes",
    "qTypesEtc",
    "request",
  ] as const;
  for (const k of allowed) {
    if (k in body) (doc as any)[k] = body[k];
  }
  doc.submitted = true;
  await doc.save();

  const maxMap = await buildMaxMap(String(doc.term));
  return NextResponse.json(serializeSession(doc.toObject(), maxMap));
}

// DELETE /api/sessions/:id -> 내 응답 삭제
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const g = await requireStudent();
  if (!g.ok) return g.res;

  await dbConnect();
  const doc = await Session.findById(params.id);
  if (!doc) {
    return NextResponse.json({ error: "응답을 찾을 수 없습니다." }, { status: 404 });
  }
  if (String(doc.student) !== g.user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  await doc.deleteOne();
  return NextResponse.json({ ok: true });
}
