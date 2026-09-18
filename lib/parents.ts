// 학부모 계정 helper. 학생 계정과 같은 아이디·비밀번호로 시작하고,
// 학부모가 직접 비밀번호를 바꾸면(selfChanged) 그때부터 따로 관리된다.
import { Parent } from "./models";

type StudentLike = {
  _id: unknown;
  username: string;
  password: string;
  passwordPlain?: string | null;
};

/** 이 학생의 학부모 계정을 보장한다 (없으면 학생과 같은 비밀번호로 생성). */
export async function ensureParent(student: StudentLike) {
  const existing = await Parent.findOne({ student: student._id });
  if (existing) return existing;
  return Parent.create({
    student: student._id,
    username: student.username,
    password: student.password,
    passwordPlain: student.passwordPlain ?? "",
    selfChanged: false,
  });
}

/** 학생 비밀번호/아이디가 바뀌면 아직 스스로 바꾸지 않은 학부모 계정도 따라간다. */
export async function syncParentAccount(student: StudentLike) {
  await Parent.findOneAndUpdate(
    { student: student._id, selfChanged: { $ne: true } },
    {
      $set: {
        username: student.username,
        password: student.password,
        passwordPlain: student.passwordPlain ?? "",
      },
    }
  );
  // 아이디는 스스로 바꾼 계정도 학생 계정을 따라간다 (로그인 창구가 같아야 하므로).
  await Parent.findOneAndUpdate(
    { student: student._id, selfChanged: true },
    { $set: { username: student.username } }
  );
}
