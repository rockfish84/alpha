import type { SessionOptions } from "iron-session";

export type Role = "student" | "admin";

export interface SessionUser {
  id: string;
  role: Role;
  name: string;
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
