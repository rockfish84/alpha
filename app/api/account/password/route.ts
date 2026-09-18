import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db";
import { Student, Parent } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { syncParentAccount } from "@/lib/parents";

export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 4;

// PATCH /api/account/password -> 학생·학부모 본인 비밀번호 변경
export async function PATCH(req: Request) {
  const g = await requireUser();
  if (!g.ok) return g.res;
  if (g.user.role === "admin") {
    return NextResponse.json(
      { error: "관리자 비밀번호는 여기서 바꿀 수 없습니다." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const current = String(body.current ?? "");
  const next = String(body.next ?? "");
  if (!current || !next) {
    return NextResponse.json(
      { error: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요." },
      { status: 400 }
    );
  }
  if (next.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `새 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` },
      { status: 400 }
    );
  }
  if (next === current) {
    return NextResponse.json(
      { error: "현재 비밀번호와 다른 비밀번호를 입력해주세요." },
      { status: 400 }
    );
  }

  await dbConnect();
  const account =
    g.user.role === "parent"
      ? await Parent.findById(g.user.id)
      : await Student.findById(g.user.id);
  if (!account) {
    return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!(await bcrypt.compare(current, account.password))) {
    return NextResponse.json(
      { error: "현재 비밀번호가 올바르지 않습니다." },
      { status: 400 }
    );
  }

  account.password = await bcrypt.hash(next, 10);
  account.passwordPlain = next;
  if (g.user.role === "parent") {
    // 스스로 바꾼 뒤로는 학생 비밀번호 변경에 더 이상 끌려가지 않는다.
    (account as any).selfChanged = true;
  }
  await account.save();

  // 학생이 바꾸면 아직 스스로 바꾸지 않은 학부모 계정도 같이 맞춘다.
  if (g.user.role === "student") {
    await syncParentAccount(account as any);
  }

  return NextResponse.json({ ok: true });
}
