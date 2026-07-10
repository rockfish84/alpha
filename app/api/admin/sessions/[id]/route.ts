import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Session } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/admin/sessions/:id -> 응답 삭제
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const doc = await Session.findByIdAndDelete(params.id);
  if (!doc) {
    return NextResponse.json({ error: "응답을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
