import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { TestConfig } from "@/lib/models";
import { regionsExcludingFile } from "@/lib/regions";
import { resolveTerm } from "@/lib/term";
import { isClinicDate } from "@/lib/clinic-dates";
import {
  FILE_KINDS,
  MAX_FILE_BYTES,
  deleteTestFile,
  findTestFile,
  isAllowedType,
  listTestFiles,
  uploadTestFile,
  type FileKind,
} from "@/lib/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/files?term=ID&subject=&date= -> 업로드된 시험지/답지 목록
export async function GET(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const term = await resolveTerm(searchParams.get("term"));
  if (!term) return NextResponse.json([]);

  return NextResponse.json(
    await listTestFiles({
      termId: String(term._id),
      subject: searchParams.get("subject") ?? undefined,
      date: searchParams.get("date") ?? undefined,
    })
  );
}

// POST /api/admin/files (multipart) -> 시험지/답지 업로드
export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "파일을 읽을 수 없습니다." }, { status: 400 });
  }

  const file = form.get("file");
  const termParam = String(form.get("term") ?? "");
  const subject = String(form.get("subject") ?? "");
  const date = String(form.get("date") ?? "");
  const kindRaw = String(form.get("kind") ?? "paper");
  const kind = (FILE_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as FileKind)
    : "paper";

  if (!(file instanceof File) || !termParam || !subject || !date) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!isClinicDate(date)) {
    return NextResponse.json({ error: "날짜 형식이 잘못되었습니다." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "빈 파일입니다." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `파일은 ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB 이하만 올릴 수 있습니다.` },
      { status: 413 }
    );
  }
  if (!isAllowedType(file.type, file.name)) {
    return NextResponse.json(
      { error: "PDF·이미지·HWP 파일만 올릴 수 있습니다." },
      { status: 415 }
    );
  }

  await dbConnect();
  const term = await resolveTerm(termParam);
  if (!term) return NextResponse.json({ error: "학기가 없습니다." }, { status: 400 });
  if (!(term.subjects ?? []).includes(subject)) {
    return NextResponse.json({ error: "이 학기의 수업이 아닙니다." }, { status: 400 });
  }

  const meta = await uploadTestFile({
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: file.name || "test.pdf",
    contentType: file.type || "application/octet-stream",
    termId: String(term._id),
    subject,
    date,
    kind,
  });
  return NextResponse.json(meta, { status: 201 });
}

// DELETE /api/admin/files?id=FILEID
export async function DELETE(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "";
  await dbConnect();
  const doc = await findTestFile(id);
  if (!doc) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }
  const ok = await deleteTestFile(id);
  if (!ok) {
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
  // 이 파일을 가리키던 문항 위치 정보도 함께 정리한다.
  const configs = await TestConfig.find({ "questionRegions.fileId": id }).lean();
  for (const c of configs) {
    await TestConfig.updateOne(
      { _id: c._id },
      { $set: { questionRegions: regionsExcludingFile((c.questionRegions ?? []) as any, id) } }
    );
  }
  return NextResponse.json({ ok: true });
}
