import { NextResponse } from "next/server";
import crypto from "crypto";
import { dbConnect } from "@/lib/db";
import { ShareLink } from "@/lib/models";
import { requireAdmin } from "@/lib/auth";
import { resolveTerm } from "@/lib/term";
import { isClinicDate } from "@/lib/clinic-dates";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 180;

/**
 * POST /api/admin/share-links
 * body: { term, days?, items: [{ studentId, subject, date }] }
 *
 * 문자에 붙일 "로그인 없는 성적 링크"를 만든다. 토큰 하나가 (학생·반·날짜) 한 칸만 열고,
 * days 일 뒤 만료된다. 아직 살아 있는 링크가 있으면 새로 만들지 않고 그대로 쓴다.
 */
export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  await dbConnect();
  const body = await req.json().catch(() => ({}));
  const term = await resolveTerm(body?.term);
  if (!term) return NextResponse.json({ error: "학기를 찾을 수 없습니다." }, { status: 400 });

  const days = Math.min(MAX_DAYS, Math.max(1, Number(body?.days) || DEFAULT_DAYS));
  const items = Array.isArray(body?.items) ? body.items : [];
  const now = Date.now();
  const expiresAt = new Date(now + days * 24 * 60 * 60 * 1000);

  const links: { studentId: string; subject: string; date: string; token: string }[] = [];
  for (const it of items) {
    const studentId = String(it?.studentId ?? "");
    const subject = String(it?.subject ?? "");
    const date = String(it?.date ?? "");
    if (!studentId || !subject || !isClinicDate(date)) continue;

    const key = { student: studentId, term: term._id, subject, date: new Date(date) };
    const alive = await ShareLink.findOne({
      ...key,
      revoked: false,
      expiresAt: { $gt: new Date(now) },
    }).lean();

    let token = alive?.token as string | undefined;
    if (!token) {
      token = crypto.randomBytes(16).toString("base64url"); // 128비트
      await ShareLink.create({ ...key, token, expiresAt });
    }
    links.push({ studentId, subject, date, token });
  }

  return NextResponse.json({ links, days, expiresAt: expiresAt.toISOString() });
}

/** DELETE /api/admin/share-links?token=... -> 링크 즉시 폐기 */
export async function DELETE(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;
  await dbConnect();
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return NextResponse.json({ error: "token 이 필요합니다." }, { status: 400 });
  await ShareLink.updateOne({ token }, { $set: { revoked: true } });
  return NextResponse.json({ ok: true });
}
