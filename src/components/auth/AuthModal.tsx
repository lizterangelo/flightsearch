"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useMe } from "./MeProvider";

/**
 * The sign-in modal: dotted-globe art, headline, and three providers.
 * "Continue with Messages" runs the phone/email OTP flow (dev builds print
 * the code to the server console and autofill it here); Google/Apple are
 * visual stand-ins unless OAuth env vars are configured.
 */

type Step = "providers" | "identifier" | "code";

function DottedGlobe() {
  // Abstract dot-grid "world" — softly masked, no real geography claimed.
  return (
    <div
      aria-hidden
      className="relative h-44 w-full overflow-hidden rounded-t-3xl"
      style={{
        backgroundImage:
          "radial-gradient(rgba(120,150,255,0.55) 1.2px, transparent 1.3px)",
        backgroundSize: "11px 11px",
        maskImage:
          "radial-gradient(ellipse 75% 90% at 50% 42%, black 30%, transparent 78%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 75% 90% at 50% 42%, black 30%, transparent 78%)",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(200,215,255,0.9) 1.1px, transparent 1.2px)",
          backgroundSize: "23px 19px",
          maskImage:
            "radial-gradient(ellipse 55% 65% at 48% 40%, black 15%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 55% 65% at 48% 40%, black 15%, transparent 70%)",
        }}
      />
    </div>
  );
}

function ProviderButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-card-border bg-white/[0.03] px-5 py-3.5 text-[15px] font-semibold text-white transition hover:bg-white/[0.07]"
    >
      {icon}
      {label}
    </button>
  );
}

export default function AuthModal({
  open,
  onClose,
  headline = "Cheaper than Google Flights, guaranteed",
}: {
  open: boolean;
  onClose: () => void;
  headline?: string;
}) {
  const { refresh } = useMe();
  const toast = useToast();
  const [step, setStep] = useState<Step>("providers");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep("providers");
      setIdentifier("");
      setCode("");
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const body = (await res.json()) as {
        error?: string;
        devCode?: string;
        identifier?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Couldn't send a code");
      if (body.identifier) setIdentifier(body.identifier);
      setStep("code");
      if (body.devCode) {
        setCode(body.devCode);
        toast("Dev build: code autofilled");
      }
      setTimeout(() => codeRef.current?.focus(), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, code }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Verification failed");
      await refresh();
      onClose();
      toast("You're in — welcome aboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div role="dialog" aria-modal="true" aria-label="Sign in" className="relative w-full max-w-md overflow-hidden rounded-3xl border border-card-border bg-[#0a1122] shadow-2xl shadow-black/60">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 z-10 flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/10 text-slate-300 transition hover:bg-white/20 hover:text-white"
        >
          ✕
        </button>
        {step !== "providers" && (
          <button
            type="button"
            onClick={() => setStep(step === "code" ? "identifier" : "providers")}
            aria-label="Back"
            className="absolute top-4 left-4 z-10 flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/10 text-slate-300 transition hover:bg-white/20 hover:text-white"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-4">
              <path
                d="M12.5 4.5L7 10l5.5 5.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}

        <DottedGlobe />

        <div className="px-7 pb-7">
          <div className="text-sm text-muted">Sign in.</div>
          <h2 className="mt-1 text-2xl font-bold leading-snug text-white">
            {headline}
          </h2>

          {step === "providers" && (
            <div className="mt-6 space-y-3">
              <ProviderButton
                label="Continue with Messages"
                icon={
                  <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500 text-white">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="size-4.5">
                      <path d="M10 3C5.6 3 2 5.9 2 9.5c0 2 1.1 3.8 2.9 5-.2.8-.7 1.9-1.5 2.6 1.6-.1 3-.7 3.9-1.3.9.2 1.8.4 2.7.4 4.4 0 8-2.9 8-6.5S14.4 3 10 3z" />
                    </svg>
                  </span>
                }
                onClick={() => setStep("identifier")}
              />
              <ProviderButton
                label="Continue with Google"
                icon={
                  <span className="flex size-7 items-center justify-center rounded-lg bg-white text-[13px] font-black text-[#4285F4]">
                    G
                  </span>
                }
                onClick={() =>
                  toast("Google sign-in isn't configured in this build")
                }
              />
              <ProviderButton
                label="Continue with Apple"
                icon={
                  <span className="flex size-7 items-center justify-center rounded-lg bg-white text-black">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
                      <path d="M13.5 10.6c0-1.6 1.3-2.4 1.4-2.5-.8-1.1-2-1.3-2.4-1.3-1-.1-2 .6-2.5.6s-1.3-.6-2.2-.6c-1.1 0-2.2.7-2.8 1.7-1.2 2-.3 5.1.9 6.8.6.8 1.2 1.7 2.1 1.7.9 0 1.2-.5 2.2-.5s1.3.5 2.2.5 1.5-.8 2-1.6c.6-.9.9-1.8.9-1.9-.1 0-1.8-.7-1.8-2.9zM11.9 5.6c.5-.6.8-1.4.7-2.2-.7 0-1.6.5-2.1 1.1-.4.5-.8 1.3-.7 2.1.8.1 1.6-.4 2.1-1z" />
                    </svg>
                  </span>
                }
                onClick={() =>
                  toast("Apple sign-in isn't configured in this build")
                }
              />
            </div>
          )}

          {step === "identifier" && (
            <form
              className="mt-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) void start();
              }}
            >
              <div className="text-lg font-semibold text-white">
                Enter your phone number
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-2xl border border-card-border bg-white/[0.04] p-1.5 pl-4 focus-within:border-accent/60">
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="(555) 123-4567 or email"
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-muted/70"
                />
                <button
                  type="submit"
                  disabled={busy || identifier.trim().length < 5}
                  className="cursor-pointer rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#0a1122] transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? "…" : "Continue"}
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-muted">
                <span>✓ Cheaper than Google Flights</span>
                <span>✓ Book in seconds</span>
                <span>✓ Trip updates in your inbox</span>
                <span>✓ Refund guarantees</span>
              </div>
            </form>
          )}

          {step === "code" && (
            <form
              className="mt-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) void verify();
              }}
            >
              <div className="text-lg font-semibold text-white">
                Enter the 6-digit code
              </div>
              <div className="mt-1 text-sm text-muted">
                Sent to {identifier}{" "}
                <span className="text-slate-400">
                  (dev builds print it in the server console)
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  ref={codeRef}
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  inputMode="numeric"
                  placeholder="123456"
                  className="w-40 rounded-2xl border border-card-border bg-white/[0.04] px-4 py-3 text-center font-mono text-xl tracking-[0.3em] text-white outline-none focus:border-accent/60"
                />
                <button
                  type="submit"
                  disabled={busy || code.length !== 6}
                  className="cursor-pointer rounded-full bg-accent px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? "Verifying…" : "Verify"}
                </button>
              </div>
            </form>
          )}

          {error && (
            <div className="mt-4 text-sm text-rose-300">{error}</div>
          )}

          <div className="mt-6 text-center text-xs text-muted">
            By continuing you agree to our{" "}
            <a href="/terms" className="underline underline-offset-2 hover:text-white">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline underline-offset-2 hover:text-white">
              Privacy Policy
            </a>
            .
          </div>
        </div>
      </div>
    </div>
  );
}
