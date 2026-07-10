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
