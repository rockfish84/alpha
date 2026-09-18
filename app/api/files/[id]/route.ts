import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { dbConnect } from "@/lib/db";
import { Enrollment, TestConfig } from "@/lib/models";
import { getSession } from "@/lib/auth";
import { findTestFile, openTestFile, resolveTestFile } from "@/lib/files";
import { toDate } from "@/lib/date";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/files/:id -> 시험지·답지 다운로드 (관리자 / 그 수업 학생·학부모) */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  await dbConnect();
  const doc = await resolveTestFile(params.id);
  if (!doc) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const meta = doc.metadata ?? {};
  if (session.user.role !== "admin") {
    const studentId =
      session.user.role === "parent" ? session.user.studentId : session.user.id;
    if (!studentId) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    const enrolled = await Enrollment.exists({
      term: meta.term,
      student: studentId,
      subjects: meta.subject,
      status: { $ne: "퇴원" },
    });
    if (!enrolled) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    // 아직 공개하지 않은 회차 자료는 내려주지 않는다.
    const config = await TestConfig.findOne({
      term: meta.term,
      subject: meta.subject,
      date: toDate(String(meta.date ?? "")),
    }).lean();
    if (config && config.answersPublished === false) {
      return NextResponse.json(
        { error: "아직 공개되지 않은 자료입니다." },
        { status: 403 }
      );
    }
  }

  // 참조 파일이면 원본에서 내려준다.
  const stream = await openTestFile(String(doc._id));
  const filename = encodeURIComponent(doc.filename ?? "file");
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": doc.contentType ?? "application/octet-stream",
      "Content-Length": String(doc.length ?? 0),
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
