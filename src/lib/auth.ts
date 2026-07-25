import { createHash, randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import {
  createSession,
  deleteSession,
  sessionUser,
  touchSession,
  type UserRow,
} from "./db";

/**
 * Cookie sessions over the DB: the cookie holds a random token, the DB holds
 * its sha256. Every check is a DB lookup, so no signing is needed.
 */

export const SESSION_COOKIE = "soar_session";
const SESSION_DAYS = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashOtp(identifier: string, code: string): string {
  return createHash("sha256").update(`${identifier}:${code}`).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function newOtpCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

export function sessionExpiry(): string {
  const d = new Date(Date.now() + SESSION_DAYS * 86400000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  };
}

export function startSession(userId: number): {
  token: string;
  options: ReturnType<typeof sessionCookieOptions>;
} {
  const token = newSessionToken();
  createSession(hashToken(token), userId, sessionExpiry());
  return { token, options: sessionCookieOptions() };
}

/** Server-side session lookup (route handlers + server components). */
export async function getSessionUser(): Promise<UserRow | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = sessionUser(hashToken(token));
  if (user) {
    // Sliding renewal; cheap enough to do on every authenticated read.
    touchSession(hashToken(token), sessionExpiry());
  }
  return user;
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(hashToken(token));
}

/** Loose phone/email validation for the sign-in identifier. */
export function normalizeIdentifier(
  raw: string,
): { identifier: string; type: "phone" | "email" } | null {
  const value = raw.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    return { identifier: value.toLowerCase(), type: "email" };
  }
  const digits = value.replace(/[\s\-().]/g, "");
  if (/^\+?\d{7,15}$/.test(digits)) {
    return {
      identifier: digits.startsWith("+") ? digits : `+${digits}`,
      type: "phone",
    };
  }
  return null;
}
