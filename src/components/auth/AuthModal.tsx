"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useMe } from "./MeProvider";
import WorldMap from "./WorldMap";

/**
 * Sign-in modal: animated dotted world map, a rotating headline, and Google
 * OAuth via Supabase. If the Google provider isn't configured on the
 * Supabase project yet, the button surfaces the error with a hint.
 */

const LAST_AUTH_KEY = "soar.lastAuth";
const HEADLINE_SWAP_MS = 4500;
const HEADLINE_OUT_MS = 380;

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
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
  const { signInWithGoogle } = useMe();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [headlineLeaving, setHeadlineLeaving] = useState(false);
  const [lastUsed, setLastUsed] = useState(false);

  const headlines = [headline, "Real 24/7 support, whenever you need it"];

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError(null);
      setHeadlineIndex(0);
      setHeadlineLeaving(false);
      // "Last used" chip on the Google button, like theirs. Open only ever
      // flips on the client, so localStorage is safe here.
      try {
        setLastUsed(localStorage.getItem(LAST_AUTH_KEY) === "google");
      } catch {
        // Storage blocked — skip the chip.
      }
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

  // Rotating headline (theirs cycles; blur out → swap → blur in).
  useEffect(() => {
    if (!open) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cycle = setInterval(() => {
      setHeadlineLeaving(true);
      setTimeout(() => {
        setHeadlineIndex((i) => (i + 1) % 2);
        setHeadlineLeaving(false);
      }, HEADLINE_OUT_MS);
    }, HEADLINE_SWAP_MS);
    return () => clearInterval(cycle);
  }, [open]);

  if (!open) return null;

  const google = async () => {
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(LAST_AUTH_KEY, "google");
    } catch {
      // Nonessential.
    }
    const message = await signInWithGoogle();
    if (message) {
      setBusy(false);
      setError(
        /provider|not.*enabled|unsupported/i.test(message)
          ? "Google sign-in isn't enabled on the Supabase project yet — add the Google provider in Authentication → Providers."
          : message,
      );
      toast("Google sign-in failed");
    }
    // On success the browser redirects to Google.
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto p-4">
      <div
        className="fixed inset-0 animate-[soar-backdrop-in_.24s_ease_both] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
        className="relative w-full max-w-md animate-[soar-dialog-in_.26s_cubic-bezier(.22,1,.36,1)_both] overflow-hidden rounded-3xl border border-card-border bg-panel shadow-2xl shadow-black/60"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 z-10 flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/10 text-slate-300 transition hover:bg-white/20 hover:text-white"
        >
          ✕
        </button>

        <WorldMap />

        <div className="px-7 pb-7">
          <div className="text-sm text-muted">Sign in.</div>
          <h2
            key={`${headlineIndex}-${headlineLeaving}`}
            className={`mt-1 min-h-16 text-2xl font-bold leading-snug text-white ${
              headlineLeaving
                ? "animate-[heroGreetingBlurOut_.38s_cubic-bezier(.55,0,.55,.2)_both]"
                : "animate-[heroGreetingBlurIn_.5s_cubic-bezier(.22,1,.36,1)_both]"
            }`}
          >
            {headlines[headlineIndex]}
          </h2>

          <div className="mt-6">
            <button
              type="button"
              disabled={busy}
              onClick={() => void google()}
              className="relative flex w-full cursor-pointer items-center justify-center gap-3 rounded-2xl border border-card-border bg-white px-5 py-3.5 text-[15px] font-semibold text-[#0b0c10] transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleMark />
              {busy ? "Opening Google…" : "Continue with Google"}
              {lastUsed && !busy && (
                <span className="absolute right-3 rounded-full bg-[#eef1f6] px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  Last used
                </span>
              )}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-muted">
            <span>✓ Cheaper than Google Flights</span>
            <span>✓ Book in seconds</span>
            <span>✓ Trips synced to your account</span>
            <span>✓ Refund guarantees</span>
          </div>

          {error && (
            <div
              key={error}
              className="mt-4 animate-[soar-shake_.3s_ease_both] rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm text-rose-200"
            >
              {error}
            </div>
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
