// 학원이 발급해 "다시 보여 줘야 하는" 값(학부모 비밀번호)을 담아 두는 상자. (서버 전용)
//
// 학부모 계정은 학원이 만들어 학부모에게 통지하는 조회 전용 계정이라, 학원이 다시
// 확인할 수 있어야 한다. 그래서 로그인 검증용 bcrypt 해시와 별개로, 관리자에게
// 보여 줄 사본만 여기에 암호화해 둔다. DB 에는 암호문으로만 남고, 여는 열쇠는
// 서버 환경변수(SESSION_SECRET)에서 만든다.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
// 키 유도용 고정 salt. 비밀은 SESSION_SECRET 쪽이므로 salt 는 상수여도 된다.
const SALT = "dubco-alpha-clinic/parent-password";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET 이 설정되지 않아 비밀번호 사본을 다룰 수 없습니다.");
  }
  cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

/** 평문 → 저장할 암호문. 실패하면 빈 문자열(사본 없이 진행). */
export function seal(plain: string): string {
  if (!plain) return "";
  try {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key(), iv);
    const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString("base64"), tag.toString("base64"), body.toString("base64")].join(
      ":"
    );
  } catch {
    return "";
  }
}

/**
 * 저장된 암호문 → 평문. 열 수 없으면 빈 문자열.
 * (SESSION_SECRET 이 바뀌었거나 사본이 없는 예전 계정)
 */
export function open(sealed: unknown): string {
  const text = typeof sealed === "string" ? sealed : "";
  if (!text.startsWith(`${VERSION}:`)) return "";
  try {
    const [, iv, tag, body] = text.split(":");
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}
