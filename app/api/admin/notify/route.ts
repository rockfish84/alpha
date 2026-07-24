import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sendMany, smsConfigured, isValidPhone, onlyDigits } from "@/lib/sms";

export const dynamic = "force-dynamic";

// GET /api/admin/notify -> 발송 설정 상태 (테스트 강제 번호 포함)
export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.res;
  const testTo = process.env.SMS_TEST_TO;
  return NextResponse.json({
    configured: smsConfigured(),
    testTo: testTo && isValidPhone(testTo) ? onlyDigits(testTo) : null,
  });
}

// POST /api/admin/notify -> 성적 문자 발송
// body: { messages: [{ to, text, name? }] }
export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  if (!smsConfigured()) {
    return NextResponse.json(
      {
        error:
          "문자 발송이 아직 설정되지 않았습니다. (SOLAPI_API_KEY / SECRET / SENDER 필요)",
      },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const raw = Array.isArray(body?.messages) ? body.messages : [];
  const messages = raw
    .filter(
      (m: any) =>
        m &&
        typeof m.to === "string" &&
        typeof m.text === "string" &&
        m.text.trim() &&
        isValidPhone(m.to)
    )
    .map((m: any) => ({ to: m.to, text: m.text }));

  if (messages.length === 0) {
    return NextResponse.json(
      { error: "보낼 수 있는 유효한 번호가 없습니다." },
      { status: 400 }
    );
  }

  try {
    const result = await sendMany(messages);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "문자 발송에 실패했습니다." },
      { status: 502 }
    );
  }
}
