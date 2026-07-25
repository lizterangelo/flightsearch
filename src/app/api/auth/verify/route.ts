import { cookies } from "next/headers";
import {
  hashOtp,
  normalizeIdentifier,
  SESSION_COOKIE,
  startSession,
} from "@/lib/auth";
import { bumpOtpAttempts, deleteOtp, getOtp, upsertUser } from "@/lib/db";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 5;

/** POST /api/auth/verify {identifier, code} — check the OTP, set the session. */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    identifier?: string;
    code?: string;
  } | null;
  const normalized = normalizeIdentifier(body?.identifier ?? "");
  const code = (body?.code ?? "").trim();
  if (!normalized || !/^\d{6}$/.test(code)) {
    return Response.json({ error: "Invalid code" }, { status: 400 });
  }

  const otp = getOtp(normalized.identifier);
  if (!otp || otp.expires_at <= new Date().toISOString().slice(0, 19).replace("T", " ")) {
    return Response.json(
      { error: "Code expired — request a new one" },
      { status: 400 },
    );
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    return Response.json(
      { error: "Too many attempts — request a new code" },
      { status: 429 },
    );
  }
  if (otp.code_hash !== hashOtp(normalized.identifier, code)) {
    bumpOtpAttempts(normalized.identifier);
    return Response.json({ error: "Wrong code — try again" }, { status: 400 });
  }

  deleteOtp(normalized.identifier);
  const user = upsertUser(normalized.identifier, normalized.type);
  const { token, options } = startSession(user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, options);

  return Response.json({
    user: { id: user.id, identifier: user.identifier },
  });
}
