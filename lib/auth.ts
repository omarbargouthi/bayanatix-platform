import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { SessionUser } from "./types";

const COOKIE = "bayanatix_session";
const COOKIE_DAYS = 7;

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET must be set to a 32+ character secret.");
  }
  return new TextEncoder().encode(s);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_DAYS}d`)
    .setIssuer("bayanatix")
    .sign(secret());
}

export async function readSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "bayanatix" });
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      fullName: String(payload.fullName),
      role: payload.role as SessionUser["role"],
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  return readSession(token);
}

export async function requireSession(): Promise<SessionUser> {
  const u = await getSession();
  if (!u) throw new Error("UNAUTHORIZED");
  return u;
}

export function setSessionCookie(token: string) {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * COOKIE_DAYS,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;
