import { hashOtp, newOtpCode, normalizeIdentifier } from "@/lib/auth";
import { putOtp } from "@/lib/db";

export const runtime = "nodejs";

const OTP_TTL_MIN = 10;

/**
 * POST /api/auth/start {identifier} — issue a 6-digit code for a phone or
 * email. There's no SMS/email provider in this build: the code is printed
 * to the dev-server console, and returned as `devCode` in development so
 * the modal can autofill it.
 */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    identifier?: string;
  } | null;
  const normalized = normalizeIdentifier(body?.identifier ?? "");
  if (!normalized) {
    return Response.json(
      { error: "Enter a valid phone number or email" },
      { status: 400 },
    );
  }

  const code = newOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  putOtp(normalized.identifier, hashOtp(normalized.identifier, code), expiresAt);

  console.log(
    `\n[soar auth] Verification code for ${normalized.identifier}: ${code}\n`,
  );

  return Response.json({
    ok: true,
    identifier: normalized.identifier,
    ...(process.env.NODE_ENV === "development" ? { devCode: code } : {}),
  });
}
