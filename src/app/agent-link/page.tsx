"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AuthModal from "@/components/auth/AuthModal";
import { useMe } from "@/components/auth/MeProvider";

/**
 * Landing page for the iMessage agent's sign-in links: the daemon texts
 * unknown handles a /agent-link?token=… URL; signing in here binds that
 * handle to the account, and the agent then books on their behalf.
 */

function AgentLinkContent() {
  const token = useSearchParams().get("token") ?? "";
  const { me, loaded } = useMe();
  const [authOpen, setAuthOpen] = useState(false);
  const [state, setState] = useState<
    { status: "idle" | "working" | "done"; detail?: string } | { status: "error"; detail: string }
  >({ status: "idle" });

  useEffect(() => {
    if (!loaded || !me || !token || state.status !== "idle") return;
    // Deferred so the effect body stays setState-free (lint rule).
    const t = setTimeout(async () => {
      setState({ status: "working" });
      try {
        const res = await fetch("/api/agent-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = (await res.json()) as { handle?: string; error?: string };
        if (!res.ok || body.error) {
          setState({ status: "error", detail: body.error ?? "Link failed" });
        } else {
          setState({ status: "done", detail: body.handle });
        }
      } catch {
        setState({ status: "error", detail: "Network error — try the link again" });
      }
    }, 0);
    return () => clearTimeout(t);
  }, [loaded, me, token, state.status]);

  return (
    <main className="relative z-[2] mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 pb-24">
      <div className="w-full rounded-3xl border border-card-border bg-panel p-7 text-center shadow-2xl shadow-black/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/imessage-logo.png" alt="" className="mx-auto size-14 rounded-2xl" />
        <h1 className="mt-4 text-2xl font-bold text-white">
          {state.status === "done" ? "iMessage linked" : "Link your iMessage"}
        </h1>

        {!token && (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            This page needs a link token — text the Soar agent and tap the
            link it sends back.
          </p>
        )}

        {token && !me && (
          <>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Sign in and the number you texted from gets attached to your
              Soar account — bookings land in your trips.
            </p>
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="btn-cta mt-6 w-full cursor-pointer rounded-full py-3 font-semibold text-white transition hover:brightness-110"
            >
              Sign in to link
            </button>
          </>
        )}

        {token && me && state.status === "working" && (
          <p className="mt-3 text-sm text-muted">Linking…</p>
        )}
        {state.status === "done" && (
          <>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              You&apos;re set — text the agent again and it&apos;ll act on
              your account: searches, bookings, cancellations, watches.
            </p>
            <Link
              href="/"
              className="btn-cta mt-6 inline-block w-full rounded-full py-3 font-semibold text-white transition hover:brightness-110"
            >
              Done
            </Link>
          </>
        )}
        {state.status === "error" && (
          <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm text-rose-200">
            {state.detail}. Text the agent again for a fresh link.
          </p>
        )}
      </div>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        headline="Link iMessage to your Soar account"
      />
    </main>
  );
}

export default function AgentLinkPage() {
  return (
    <Suspense>
      <AgentLinkContent />
    </Suspense>
  );
}
