"use client";

import { useState } from "react";
import { useMe } from "@/components/auth/MeProvider";
import { useToast } from "@/components/ui/Toast";
import { APPROX_USD_RATES } from "@/lib/currency";
import { Row, Section, Toggle } from "../primitives";

const APP_VERSION = "v0.1.0";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  PHP: "₱",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  AUD: "$",
  CAD: "$",
  SGD: "$",
  INR: "₹",
  KRW: "₩",
  THB: "฿",
  CNY: "¥",
};

/** Settings: appearance, currency, preferences, UID, version, delete. */
export default function SettingsTab({ onDeleted }: { onDeleted: () => void }) {
  const { profile, updateProfile, signOut } = useMe();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!profile) return null;

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Deletion failed");
      }
      await signOut();
      onDeleted();
      toast("Account deleted");
      window.location.href = "/";
    } catch (err) {
      toast(err instanceof Error ? err.message : "Deletion failed");
      setDeleting(false);
    }
  };

  return (
    <>
      <Section label="Appearance">
        <Row
          title="Theme"
          sub="Choose how Soar looks on this device."
          right={
            <div className="flex rounded-full border border-white/10 bg-white/5 p-1 text-sm font-medium">
              {(["light", "dark", "system"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => void updateProfile({ theme: t })}
                  className={`cursor-pointer rounded-full px-3.5 py-1 capitalize transition ${
                    profile.theme === t
                      ? "bg-white text-[#0b0d12]"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          }
        />
        <Row
          title="Currency"
          sub="Used to price every flight you search."
          right={
            <div className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/5 py-1.5 pr-2 pl-3">
              <span className="flex size-5 items-center justify-center rounded-full bg-white/10 text-[11px] text-slate-200">
                {CURRENCY_SYMBOLS[profile.currency] ?? "¤"}
              </span>
              <select
                value={profile.currency}
                onChange={(e) =>
                  void updateProfile({ currency: e.target.value })
                }
                className="cursor-pointer bg-transparent text-sm font-semibold text-white outline-none [color-scheme:dark]"
              >
                {Object.keys(APPROX_USD_RATES).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          }
          last
        />
      </Section>

      <Section label="Preferences">
        <Row
          title="Confirm Before Booking"
          sub="Take a final look at your flight and card before you pay."
          right={
            <Toggle
              label="Confirm before booking"
              checked={profile.confirm_before_booking}
              onChange={(v) =>
                void updateProfile({ confirm_before_booking: v })
              }
            />
          }
        />
        <Row
          title="Summary Cards"
          sub="Compare the best, cheapest, and fastest flights atop your results."
          right={
            <Toggle
              label="Summary cards"
              checked={profile.summary_cards}
              onChange={(v) => void updateProfile({ summary_cards: v })}
            />
          }
        />
        <Row
          title="Power Saver"
          sub="Disable the sky effect. reduces GPU and memory usage"
          right={
            <Toggle
              label="Power saver"
              checked={profile.power_saver}
              onChange={(v) => void updateProfile({ power_saver: v })}
            />
          }
        />
        <Row
          title="Account UID"
          sub="Share with support to identify your account."
          right={
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(profile.account_uid);
                toast("UID copied");
              }}
              className="cursor-pointer rounded-md bg-white/8 px-2 py-1 font-mono text-[13px] text-slate-300 transition hover:bg-white/15 hover:text-white"
            >
              {profile.account_uid}
            </button>
          }
        />
        <Row
          title="App version"
          sub="The version you're running."
          right={<span className="text-[13px] text-muted">{APP_VERSION}</span>}
        />
        <Row
          title="Delete account"
          sub="Removes your profile, bookings, friends, and saved cards. Cannot be undone."
          danger
          right={
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="cursor-pointer rounded-full bg-rose-300 px-5 py-2 text-sm font-bold text-[#3d0a18] transition hover:bg-rose-200"
            >
              Delete
            </button>
          }
          last
        />
      </Section>

      {confirmDelete && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setConfirmDelete(false)}
          />
          <div className="relative w-full max-w-sm animate-[soar-dialog-in_.24s_ease_both] rounded-3xl border border-white/10 bg-[#101218] p-6">
            <div className="text-xl font-bold text-white">Delete account?</div>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              This removes your profile, bookings, friends, watches, and saved
              cards permanently. There&apos;s no undo.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => void deleteAccount()}
                className="cursor-pointer rounded-full bg-rose-500 px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Delete forever"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="cursor-pointer rounded-full border border-white/12 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200"
              >
                Keep my account
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
