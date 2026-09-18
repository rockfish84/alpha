import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import crypto from "crypto";
import {
  MMS_MAX_BYTES,
  base64Bytes,
  isValidPhone,
  onlyDigits,
  sendMany,
  smsConfigured,
  stripDataUrl,
  uploadImage,
} from "@/lib/sms";

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
// body: { messages: [{ to, text, name?, image? }] }
//   image: 성적 카드 JPEG (data URL 또는 base64). 있으면 MMS 로 나간다.
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
  type OutMessage = { to: string; text: string; image: string };
  const messages: OutMessage[] = raw
    .filter(
      (m: any) =>
        m &&
        typeof m.to === "string" &&
        typeof m.text === "string" &&
        m.text.trim() &&
        isValidPhone(m.to)
    )
    .map((m: any) => ({
      to: m.to as string,
      text: m.text as string,
      image: typeof m.image === "string" && m.image ? stripDataUrl(m.image) : "",
    }));

  if (messages.length === 0) {
    return NextResponse.json(
      { error: "보낼 수 있는 유효한 번호가 없습니다." },
      { status: 400 }
    );
  }

  const tooBig = messages.find(
    (m: OutMessage) => m.image && base64Bytes(m.image) > MMS_MAX_BYTES
  );
  if (tooBig) {
    return NextResponse.json(
      {
        error: `첨부 이미지는 ${Math.floor(
          MMS_MAX_BYTES / 1024
        )}KB 이하여야 합니다. (솔라피 MMS 규격)`,
      },
      { status: 400 }
    );
  }

  try {
    // 같은 이미지는 한 번만 올려서 재사용한다.
    const uploaded = new Map<string, string>();
    const prepared: { to: string; text: string; imageId?: string }[] = [];
    for (const m of messages) {
      if (!m.image) {
        prepared.push({ to: m.to, text: m.text });
        continue;
      }
      const hash = crypto.createHash("sha1").update(m.image).digest("hex");
      let imageId = uploaded.get(hash);
      if (!imageId) {
        imageId = await uploadImage(m.image, "score-card.jpg");
        uploaded.set(hash, imageId);
      }
      prepared.push({ to: m.to, text: m.text, imageId });
    }

    const result = await sendMany(prepared);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "문자 발송에 실패했습니다." },
      { status: 502 }
    );
  }
}
