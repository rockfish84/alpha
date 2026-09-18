import type { SessionOptions } from "iron-session";

export type Role = "student" | "admin" | "parent";

export interface SessionUser {
  id: string; // 로그인한 계정 id (학부모는 Parent 문서 id)
  role: Role;
  name: string;
  /** 학부모 계정이 보는 자녀(Student) id. 학생은 자기 id 와 같다. */
  studentId?: string;
}

export interface SessionData {
  user?: SessionUser;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: "dubco_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  },
};
