import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/db";
import { Student } from "@/lib/models";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 6;

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
  // 학부모 계정은 학원이 발급·관리한다. 비밀번호를 잊었으면 학원에서 재발급한다.
  if (g.user.role === "parent") {
    return NextResponse.json(
      { error: "학부모 계정의 비밀번호는 학원에서 관리합니다. 학원으로 문의해주세요." },
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
  const account = await Student.findById(g.user.id);
  if (!account) {
    return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!(await bcrypt.compare(current, account.password))) {
    return NextResponse.json(
      { error: "현재 비밀번호가 올바르지 않습니다." },
      { status: 400 }
    );
  }

  // 학생 비밀번호만 바꾼다. 학부모 계정은 따로 관리되므로 영향을 받지 않는다.
  account.password = await bcrypt.hash(next, 10);
  await account.save();

  return NextResponse.json({ ok: true });
}
