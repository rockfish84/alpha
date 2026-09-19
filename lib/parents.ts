// 학부모 계정 helper.
//
// 학부모 계정은 학생 계정과 완전히 별개다. 아이디는 학원이 user001 · user002 … 로
// 발급하고, 비밀번호는 숫자 10자리를 무작위로 만들어 발급 시점에 한 번만 알려 준다.
// (DB 에는 해시만 남으므로 나중에 다시 볼 수 없고, 잊었으면 재발급한다)
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { Parent } from "./models";

const USERNAME_PREFIX = "user";
const USERNAME_DIGITS = 3;
const PASSWORD_DIGITS = 10;

type StudentLike = {
  _id: unknown;
  username?: string;
  password?: string;
};

/** 숫자 10자리 임시 비밀번호. */
export function randomParentPassword(): string {
  let out = "";
  for (let i = 0; i < PASSWORD_DIGITS; i++) out += String(randomInt(0, 10));
  return out;
}

/** 다음 학부모 아이디 (user001 → user002 …). */
export async function nextParentUsername(): Promise<string> {
  const docs = await Parent.find({ username: new RegExp(`^${USERNAME_PREFIX}\\d+$`) })
    .select({ username: 1 })
    .lean();
  const max = docs.reduce(
    (a, d) => Math.max(a, Number(String(d.username).slice(USERNAME_PREFIX.length)) || 0),
    0
  );
  return `${USERNAME_PREFIX}${String(max + 1).padStart(USERNAME_DIGITS, "0")}`;
}

/**
 * 이 학생의 학부모 계정을 보장한다.
 * 새로 만든 경우에만 평문 비밀번호를 함께 돌려준다 (그때 한 번 알려 주면 된다).
 */
export async function ensureParent(
  student: StudentLike
): Promise<{ parent: any; username: string; password?: string }> {
  const existing = await Parent.findOne({ student: student._id });
  if (existing) return { parent: existing, username: existing.username };

  const username = await nextParentUsername();
  const password = randomParentPassword();
  const parent = await Parent.create({
    student: student._id,
    username,
    password: await bcrypt.hash(password, 10),
    // 학생 계정과 연동하지 않는다 (학생이 비밀번호를 바꿔도 따라가지 않음)
    selfChanged: true,
  });
  return { parent, username, password };
}

/** 학부모 비밀번호 재발급. 새 비밀번호를 한 번만 돌려준다. */
export async function reissueParentPassword(
  studentId: unknown
): Promise<{ username: string; password: string } | null> {
  const parent = await Parent.findOne({ student: studentId });
  if (!parent) return null;
  const password = randomParentPassword();
  parent.password = await bcrypt.hash(password, 10);
  parent.selfChanged = true;
  await parent.save();
  return { username: parent.username, password };
}
