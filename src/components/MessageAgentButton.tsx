"use client";

import { useState } from "react";
import { useMe } from "./auth/MeProvider";
import { useToast } from "./ui/Toast";

/**
 * "Text the agent" entry points (account tab pill + homepage footer chip).
 * The agent identifies travelers by phone number, so signed-in users with
 * an empty profile phone get a small modal to add it before Messages
 * opens; everyone else goes straight to the thread.
 */
export default function MessageAgentButton({
  handle,
  variant,
}: {
  /** The agent's iMessage handle (NEXT_PUBLIC_IMESSAGE_HANDLE). */
  handle?: string;
  variant: "chip" | "pill";
}) {
  const { me, profile, updateProfile } = useMe();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openThread = () => {
    window.location.href = `sms:${handle}`;
  };

  const click = () => {
    if (!handle) {
      toast(
        "Set NEXT_PUBLIC_IMESSAGE_HANDLE and run the agent to enable iMessage",
      );
      return;
    }
    // Signed in without a phone on file → the agent couldn't recognize
    // them; collect it first.
    if (me && profile && !profile.phone) {
      setPhone("");
      setError(null);
      setOpen(true);
      return;
    }
    openThread();
  };

  const save = async () => {
    const value = phone.trim().replace(/[\s\-()]/g, "");
    if (!/^\+[1-9]\d{6,14}$/.test(value)) {
      setError("Use international format, e.g. +639171234567");
      return;
    }
    setBusy(true);
    const ok = await updateProfile({ phone: value });
    setBusy(false);
    if (!ok) {
      setError("Couldn't save your number — try again");
      return;
    }
    setOpen(false);
    toast("Number saved — the agent will recognize you");
    openThread();
  };

  return (
    <>
      {variant === "chip" ? (
        <button
          type="button"
          onClick={click}
          className="flex cursor-pointer items-center gap-1.5 transition hover:text-white"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/imessage-logo.png" alt="" className="size-4 rounded" />
          iMessage
        </button>
      ) : (
        <button
          type="button"
          onClick={click}
          className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/imessage-logo.png" alt="" className="size-4.5 rounded" />
            Message Agent
          </span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 animate-[soar-backdrop-in_.24s_ease_both] bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add your phone number"
            className="relative w-full max-w-sm animate-[soar-dialog-in_.26s_cubic-bezier(.22,1,.36,1)_both] rounded-3xl border border-card-border bg-panel p-6 shadow-2xl shadow-black/60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/imessage-logo.png" alt="" className="size-11 rounded-xl" />
            <h2 className="mt-3 text-xl font-bold text-white">
              Add your number first
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              The agent recognizes you by the number you text from — save it
              so your bookings land on this account.
            </p>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
              }}
              placeholder="+639171234567"
              autoFocus
              className="mt-4 w-full rounded-xl border border-white/12 bg-white/5 px-3.5 py-2.5 text-[15px] text-white outline-none placeholder:text-muted/60 focus:border-accent/50"
            />
            {error && (
              <div className="mt-2 animate-[soar-shake_.3s_ease_both] text-[13px] text-rose-300">
                {error}
              </div>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="btn-cta mt-4 w-full cursor-pointer rounded-full py-2.5 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save & open Messages"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openThread();
              }}
              className="mt-2.5 w-full cursor-pointer text-center text-[13px] text-muted transition hover:text-white"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}
    </>
  );
}
