import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Parent, Student } from "@/lib/models";
import { readParentPassword } from "@/lib/parents";
import { planNoticeRecords, type NoticeSkipReason } from "@/lib/parent-notice";

export const dynamic = "force-dynamic";

// POST /api/admin/parent-notice -> 학부모 계정 안내 전송 기록
// body: { students: [{ id, password, phone }], sent: boolean }
//   password·phone 은 화면에 보였던(= 문자로 보낸) 학부모 비밀번호와 번호.
//   sent=true:  보낸 것으로 기록 (문자 보내기 성공 후, 또는 다른 프로그램으로 보냈을 때).
//               그 사이 비밀번호가 재발급됐거나 번호가 바뀐 계정은 기록하지 않고 skipped 로 돌려준다.
//   sent=false: 기록을 지워 '미전송'으로 표시한다.
export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const shown = new Map<string, { password: string; phone: string }>();
  for (const item of Array.isArray(body?.students) ? body.students : []) {
    const id = typeof item?.id === "string" ? item.id : "";
    if (!mongoose.isValidObjectId(id)) continue;
    shown.set(id, {
      password: typeof item?.password === "string" ? item.password : "",
      phone: typeof item?.phone === "string" ? item.phone : "",
    });
  }
  if (!shown.size || typeof body?.sent !== "boolean") {
    return NextResponse.json({ error: "학생과 전송 여부가 필요합니다." }, { status: 400 });
  }
  if (shown.size > 5000) {
    return NextResponse.json({ error: "한 번에 최대 5,000명까지 기록할 수 있습니다." }, { status: 400 });
  }

  await dbConnect();
  const ids = [...shown.keys()];

  if (!body.sent) {
    const parents = await Parent.find({ student: { $in: ids } }).select({ student: 1 }).lean();
    await Parent.updateMany(
      { student: { $in: ids } },
      { $set: { noticeSentAt: null, noticeSentTo: "", noticeTracked: true } }
    );
    return NextResponse.json({
      ok: true,
      sentAt: "",
      recorded: parents.map((p) => String(p.student)),
      skipped: [],
    });
  }

  const [parents, students] = await Promise.all([
    Parent.find({ student: { $in: ids } }).select({ student: 1, passwordSealed: 1 }).lean(),
    Student.find({ _id: { $in: ids } }).select({ phone: 1 }).lean(),
  ]);
  const sealedByStudent = new Map(
    parents.map((p) => [String(p.student), String(p.passwordSealed ?? "")])
  );
  const plan = planNoticeRecords(
    shown,
    parents.map((p) => ({ student: String(p.student), password: readParentPassword(p) })),
    new Map(students.map((s) => [String(s._id), String(s.phone ?? "")]))
  );

  const sentAt = new Date();
  const skipped: { id: string; reason: NoticeSkipReason }[] = [...plan.skipped];
  let recorded: string[] = [];
  if (plan.recorded.length) {
    await Parent.bulkWrite(
      plan.recorded.map((r) => ({
        updateOne: {
          // 읽은 뒤에 비밀번호가 재발급됐다면 맞지 않아 기록되지 않는다
          filter: { student: r.id, passwordSealed: sealedByStudent.get(r.id) },
          update: { $set: { noticeSentAt: sentAt, noticeSentTo: r.sentTo, noticeTracked: true } },
        },
      }))
    );
    // 실제로 기록된 계정만 돌려준다 (그 사이 재발급돼 걸러진 계정은 skipped)
    const written = new Set(
      (
        await Parent.find({
          student: { $in: plan.recorded.map((r) => r.id) },
          noticeSentAt: sentAt,
        })
          .select({ student: 1 })
          .lean()
      ).map((p) => String(p.student))
    );
    recorded = plan.recorded.map((r) => r.id).filter((id) => written.has(id));
    for (const r of plan.recorded) {
      if (!written.has(r.id)) skipped.push({ id: r.id, reason: "password" });
    }
  }
  return NextResponse.json({
    ok: true,
    sentAt: sentAt.toISOString(),
    recorded,
    skipped,
  });
}
