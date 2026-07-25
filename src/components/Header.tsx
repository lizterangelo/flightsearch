"use client";

import Link from "next/link";
import { useState } from "react";
import AuthModal from "./auth/AuthModal";
import { useMe } from "./auth/MeProvider";
import Logo from "./Logo";

/** Top bar: logo left; Sign in (or account chip + alerts) right. */
export default function Header() {
  const { me, unseenWatchAlerts, signOut } = useMe();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex items-center justify-between px-6 py-4 sm:px-8">
      <Logo />

      {me ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex cursor-pointer items-center gap-2.5 rounded-full border border-card-border bg-pill/70 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-pill"
          >
            <span className="relative flex size-7 items-center justify-center rounded-full bg-accent/25 text-accent-bright">
              <svg viewBox="0 0 20 20" fill="none" className="size-4">
                <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M4 16.5c0-2.8 2.7-4.5 6-4.5s6 1.7 6 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {unseenWatchAlerts > 0 && (
                <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
                  {unseenWatchAlerts}
                </span>
              )}
            </span>
            <span className="max-w-40 truncate">{me.identifier}</span>
          </button>
          {menuOpen && (
            <div className="absolute top-full right-0 z-50 mt-2 w-48 rounded-2xl border border-card-border bg-[#0b1428]/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
              <Link
                href="/flights"
                onClick={() => setMenuOpen(false)}
                className="block rounded-xl px-3.5 py-2.5 text-sm text-slate-200 transition hover:bg-white/5"
              >
                My Flights
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void signOut();
                }}
                className="block w-full cursor-pointer rounded-xl px-3.5 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/5"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-card-border bg-pill/70 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-pill"
        >
          Sign in
          <svg viewBox="0 0 20 20" fill="none" className="size-4 text-slate-300">
            <path
              d="M7.5 5l5 5-5 5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
  );
}
