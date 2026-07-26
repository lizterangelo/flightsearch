"use client";

import { useState } from "react";
import AuthModal from "./auth/AuthModal";
import { useMe } from "./auth/MeProvider";
import Logo from "./Logo";

/**
 * Top bar: logo left; Sign in (or the account avatar chip) right. The chip
 * opens the account modal at #/account/account — same hash routing as the
 * original.
 */
export default function Header() {
  const { me, profile, unseenWatchAlerts } = useMe();
  const [authOpen, setAuthOpen] = useState(false);

  const openAccount = () => {
    window.location.hash = "#/account/account";
  };

  return (
    <header className="flex items-center justify-between px-6 py-4 sm:px-8">
      <Logo />

      {me ? (
        <button
          type="button"
          onClick={openAccount}
          className="relative flex cursor-pointer items-center gap-2.5 rounded-full border border-card-border bg-pill/70 p-1 pr-4 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-pill"
        >
          {me.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={me.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="size-8 rounded-full object-cover"
            />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-accent/25 text-accent-bright">
              <svg viewBox="0 0 20 20" fill="none" className="size-4">
                <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M4 16.5c0-2.8 2.7-4.5 6-4.5s6 1.7 6 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          )}
          <span className="hidden max-w-40 truncate sm:block">
            {profile?.nickname || me.name || me.email || "Account"}
          </span>
          {unseenWatchAlerts > 0 && (
            <span className="absolute -top-1 -right-1 flex size-4.5 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
              {unseenWatchAlerts}
            </span>
          )}
        </button>
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
