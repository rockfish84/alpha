import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Parent } from "@/lib/models";

export const dynamic = "force-dynamic";

// POST /api/admin/parent-notice -> 학부모 계정 안내 전송 기록
// body: { students: string[] (학생 id), sent: boolean }
//   sent=true:  지금 보낸 것으로 기록 (문자 보내기 성공 후, 또는 다른 프로그램으로 보냈을 때)
//   sent=false: 기록을 지워 다시 '미전송'으로 되돌린다
export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.students)
    ? [
        ...new Set<string>(
          body.students.filter(
            (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id)
          )
        ),
      ]
    : [];
  if (!ids.length || typeof body?.sent !== "boolean") {
    return NextResponse.json({ error: "학생과 전송 여부가 필요합니다." }, { status: 400 });
  }
  if (ids.length > 5000) {
    return NextResponse.json({ error: "한 번에 최대 5,000명까지 기록할 수 있습니다." }, { status: 400 });
  }

  await dbConnect();
  const sentAt = body.sent ? new Date() : null;
  const res = await Parent.updateMany(
    { student: { $in: ids } },
    { $set: { noticeSentAt: sentAt } }
  );
  return NextResponse.json({
    ok: true,
    updated: res.matchedCount,
    sentAt: sentAt ? sentAt.toISOString() : "",
  });
}
