import { Duffel } from "@duffel/api";

/** Lazy module-level singleton over the Duffel SDK. */
let client: Duffel | null = null;

export function duffelClient(): Duffel {
  const token = process.env.DUFFEL_API_TOKEN;
  if (!token) throw new Error("DUFFEL_API_TOKEN missing");
  if (!client) client = new Duffel({ token });
  return client;
}

export function duffelConfigured(): boolean {
  return Boolean(process.env.DUFFEL_API_TOKEN);
}

/** True when running on a sandbox token — fares are fabricated. */
export function duffelTestMode(): boolean {
  return (process.env.DUFFEL_API_TOKEN ?? "").startsWith("duffel_test");
}

/** Duffel SDK errors carry an `errors[]` array; surface the first message. */
export function duffelErrorMessage(err: unknown): string {
  if (
    typeof err === "object" &&
    err !== null &&
    "errors" in err &&
    Array.isArray((err as { errors: unknown }).errors)
  ) {
    const first = (
      err as { errors: Array<{ message?: string; title?: string }> }
    ).errors[0];
    if (first?.message || first?.title) {
      return first.message ?? first.title ?? "Duffel error";
    }
  }
  return err instanceof Error ? err.message : "Duffel error";
}

/** Best-effort HTTP status from a Duffel SDK error (meta.status). */
export function duffelErrorStatus(err: unknown): number | null {
  if (
    typeof err === "object" &&
    err !== null &&
    "meta" in err &&
    typeof (err as { meta?: { status?: unknown } }).meta?.status === "number"
  ) {
    return (err as { meta: { status: number } }).meta.status;
  }
  return null;
}
