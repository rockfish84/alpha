// Solapi(쿨SMS) 문자 발송 클라이언트. 외부 SDK 없이 REST + HMAC 인증 사용.
// 필요한 환경변수: SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER(사전등록 발신번호)
import crypto from "crypto";

const API = "https://api.solapi.com";

export function smsConfigured(): boolean {
  return !!(
    process.env.SOLAPI_API_KEY &&
    process.env.SOLAPI_API_SECRET &&
    process.env.SOLAPI_SENDER
  );
}

/** 숫자만 남김 (010-1234-5678 → 01012345678). */
export function onlyDigits(v: string): string {
  return (v || "").replace(/[^0-9]/g, "");
}

/** 한국 휴대폰 번호 형식인지 대략 검증. */
export function isValidPhone(v: string): boolean {
  const d = onlyDigits(v);
  return /^01[016789][0-9]{7,8}$/.test(d);
}

/** 90바이트(한글 45자) 이하면 SMS, 넘으면 LMS. 이미지가 있으면 MMS. */
function smsType(text: string, hasImage: boolean): "SMS" | "LMS" | "MMS" {
  if (hasImage) return "MMS";
  let bytes = 0;
  for (const ch of text) bytes += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return bytes <= 90 ? "SMS" : "LMS";
}

/** 솔라피 MMS 이미지 규격: 200KB 이하 JPG (가로 1500 / 세로 1440 이하) */
export const MMS_MAX_BYTES = 200 * 1024;
export const MMS_MAX_WIDTH = 1500;
export const MMS_MAX_HEIGHT = 1440;

/** data URL 또는 순수 base64에서 base64 본문만 뽑는다. */
export function stripDataUrl(value: string): string {
  const i = value.indexOf("base64,");
  return i >= 0 ? value.slice(i + 7) : value;
}

export function base64Bytes(base64: string): number {
  const b = stripDataUrl(base64);
  const padding = b.endsWith("==") ? 2 : b.endsWith("=") ? 1 : 0;
  return Math.floor((b.length * 3) / 4) - padding;
}

/**
 * MMS용 이미지를 솔라피 저장소에 올리고 fileId 를 받는다.
 * 같은 이미지를 여러 명에게 보낼 때는 한 번만 올리면 된다.
 */
export async function uploadImage(base64: string, name = "score.jpg"): Promise<string> {
  const headers = authHeaders();
  if (!headers) throw new Error("문자 발송 설정(SOLAPI_*)이 없습니다.");
  const file = stripDataUrl(base64);
  if (base64Bytes(file) > MMS_MAX_BYTES) {
    throw new Error(
      `이미지가 너무 큽니다. ${Math.floor(MMS_MAX_BYTES / 1024)}KB 이하 JPG 만 보낼 수 있습니다.`
    );
  }

  const res = await fetch(`${API}/storage/v1/files`, {
    method: "POST",
    headers,
    body: JSON.stringify({ file, name, type: "MMS" }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data?.fileId) {
    throw new Error(
      data?.errorMessage || data?.message || `이미지 업로드 실패 (${res.status})`
    );
  }
  return data.fileId as string;
}

function authHeaders(): Record<string, string> | null {
  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  if (!key || !secret) return null;
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString("hex");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(date + salt)
    .digest("hex");
  return {
    Authorization: `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`,
    "Content-Type": "application/json",
  };
}

export interface SmsResult {
  requested: number;
  sent: number;
  failed: number;
  failedList: { to: string; reason: string }[];
  redirectedTo?: string; // 안전장치로 이 번호로만 발송된 경우
}

/** 안전장치: SMS_TEST_TO 가 설정되어 있으면 모든 수신자를 이 번호로 강제.
 *  → 테스트 중 부모님 번호로 절대 안 나감. 실전 전환 시 .env 에서 이 줄만 제거. */
function testOverride(): string | null {
  const t = process.env.SMS_TEST_TO;
  return t && isValidPhone(t) ? onlyDigits(t) : null;
}

/** 여러 건을 한 번에 발송. 각 메시지 {to, text, imageId?}. 이미지가 있으면 MMS. */
export async function sendMany(
  messages: { to: string; text: string; imageId?: string }[]
): Promise<SmsResult> {
  const headers = authHeaders();
  const from = process.env.SOLAPI_SENDER;
  if (!headers || !from) {
    throw new Error("문자 발송 설정(SOLAPI_*)이 없습니다.");
  }

  const override = testOverride();
  const payload = {
    messages: messages.map((m) => {
      const type = smsType(m.text, !!m.imageId);
      return {
        to: override ?? onlyDigits(m.to),
        from: onlyDigits(from),
        text: m.text,
        type,
        ...(type === "SMS" ? {} : { subject: "더브코 알파 클리닉" }),
        ...(m.imageId ? { imageId: m.imageId } : {}),
      };
    }),
  };

  const res = await fetch(`${API}/messages/v4/send-many/detail`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const data: any = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      data?.errorMessage || data?.message || `문자 발송 실패 (${res.status})`
    );
  }

  const failedList: { to: string; reason: string }[] = Array.isArray(
    data?.failedMessageList
  )
    ? data.failedMessageList.map((f: any) => ({
        to: f?.to ?? "",
        reason: f?.statusMessage || f?.statusCode || "실패",
      }))
    : [];

  const requested = messages.length;
  const failed = failedList.length;
  return {
    requested,
    sent: requested - failed,
    failed,
    failedList,
    ...(override ? { redirectedTo: override } : {}),
  };
}
