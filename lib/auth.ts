import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionOptions, type SessionData, type SessionUser } from "./session";

export async function getSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}

/** Thrown-style guard: returns the user or a NextResponse error to return early. */
export type Guard =
  | { ok: true; user: SessionUser }
  | { ok: false; res: NextResponse };

export async function requireUser(): Promise<Guard> {
  const session = await getSession();
  if (!session.user) {
    return {
      ok: false,
      res: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    };
  }
  return { ok: true, user: session.user };
}

export async function requireStudent(): Promise<Guard> {
  const g = await requireUser();
  if (!g.ok) return g;
  if (g.user.role !== "student") {
    return {
      ok: false,
      res: NextResponse.json({ error: "학생 권한이 필요합니다." }, { status: 403 }),
    };
  }
  return g;
}

/** 학생 본인 또는 그 학부모 (조회 전용 화면에서 함께 허용). */
export type ViewerGuard =
  | { ok: true; user: SessionUser; studentId: string; isParent: boolean }
  | { ok: false; res: NextResponse };

export async function requireViewer(): Promise<ViewerGuard> {
  const g = await requireUser();
  if (!g.ok) return g;
  if (g.user.role === "student") {
    return { ok: true, user: g.user, studentId: g.user.id, isParent: false };
  }
  if (g.user.role === "parent" && g.user.studentId) {
    return { ok: true, user: g.user, studentId: g.user.studentId, isParent: true };
  }
  return {
    ok: false,
    res: NextResponse.json(
      { error: "학생 또는 학부모 권한이 필요합니다." },
      { status: 403 }
    ),
  };
}

export async function requireAdmin(): Promise<Guard> {
  const g = await requireUser();
  if (!g.ok) return g;
  if (g.user.role !== "admin") {
    return {
      ok: false,
      res: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    };
  }
  return g;
}
