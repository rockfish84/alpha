import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Term, TestConfig } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { resolveTerm } from "@/lib/term";
import { normalizeTypeOrder, normalizeTypes } from "@/lib/type-order";
import { normalizeQuestions } from "@/lib/grading";

export const dynamic = "force-dynamic";

/** GET /api/admin/typeorder?term=ID&subject=.. -> 저장된 순서 + 실제 쓰인 유형 */
export async function GET(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const term = await resolveTerm(searchParams.get("term"));
  const subject = searchParams.get("subject") ?? "";
  if (!term || !subject) return NextResponse.json({ order: [], used: [] });

  const order = normalizeTypeOrder(term.typeOrderBySubject)[subject] ?? [];
  const configs = await TestConfig.find({ term: term._id, subject })
    .select({ questions: 1 })
    .lean();
  const used = new Set<string>();
  for (const c of configs) {
    for (const q of normalizeQuestions(c.questions ?? [])) {
      if (q.type) used.add(q.type);
    }
  }
  return NextResponse.json({ order, used: [...used].sort((a, b) => a.localeCompare(b, "ko")) });
}

/** PUT /api/admin/typeorder -> 반별 유형 순서 저장 */
export async function PUT(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject ?? "");
  if (!body.term || !subject) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  await dbConnect();
  const term = await Term.findById(body.term);
  if (!term) return NextResponse.json({ error: "학기가 없습니다." }, { status: 400 });
  if (!(term.subjects ?? []).includes(subject)) {
    return NextResponse.json({ error: "이 학기의 수업이 아닙니다." }, { status: 400 });
  }

  const types = normalizeTypes(body.types);
  // 이 필드가 없던 기존 학기 문서도 안전하게 저장되도록 일반 객체로 다시 넣는다.
  const current = normalizeTypeOrder(
    term.typeOrderBySubject,
    (term.subjects ?? []) as string[]
  );
  if (types.length) current[subject] = types;
  else delete current[subject];
  term.set("typeOrderBySubject", current);
  await term.save();

  return NextResponse.json({ ok: true, types });
}
