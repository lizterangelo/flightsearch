"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AuthModal from "./auth/AuthModal";
import { useMe } from "./auth/MeProvider";
import { useCurrency } from "./CurrencyProvider";
import { REFERRAL_REWARD_USD } from "./account/tabs/FriendsTab";
import { useToast } from "./ui/Toast";
import Logo from "./Logo";

/**
 * Top bar: logo left; Sign in (or the bare avatar) right. The avatar opens
 * their account menu — profile header row, Flights / Friends / Settings,
 * Get help, Log out — with the account-modal hash routes behind it.
 */

function MenuIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      {children}
    </svg>
  );
}

function PlaneGlyph() {
  // Same solid NE plane family as the autocomplete rows.
  return (
    <svg viewBox="0 0 20 20" className="size-5 rotate-45">
      <path
        fill="currentColor"
        d="M10 1.9c.5 0 .9.4.9.9v4.9l6.6 3.9v1.7l-6.6-2v4.2l1.7 1.3v1.4L10 17.3l-2.6.9v-1.4l1.7-1.3v-4.2l-6.6 2v-1.7l6.6-3.9V2.8c0-.5.4-.9.9-.9z"
      />
    </svg>
  );
}

function Avatar({ url, size }: { url: string | null; size: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        className={`${size} rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      className={`flex ${size} items-center justify-center rounded-full bg-accent/25 text-accent-bright`}
    >
      <svg viewBox="0 0 20 20" fill="none" className="size-1/2">
        <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M4 16.5c0-2.8 2.7-4.5 6-4.5s6 1.7 6 4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function AccountMenu() {
  const { me, profile, unseenWatchAlerts, signOut } = useMe();
  const { format: money } = useCurrency();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!me) return null;

  const goHash = (hash: string) => {
    setOpen(false);
    window.location.hash = hash;
  };

  const item =
    "flex w-full cursor-pointer items-center gap-3.5 px-4 py-3 text-left text-base font-medium transition hover:bg-white/5";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="relative block cursor-pointer rounded-full transition hover:brightness-110"
      >
        <Avatar url={me.avatarUrl} size="size-10" />
        {unseenWatchAlerts > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4.5 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
            {unseenWatchAlerts}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-[calc(100%+10px)] right-0 z-[70] w-[19.5rem] animate-[popIn_.18s_cubic-bezier(.22,1,.36,1)_both] overflow-hidden rounded-3xl border border-card-border bg-panel py-1.5 shadow-2xl shadow-black/60">
          <button
            type="button"
            onClick={() => goHash("#/account/account")}
            className="flex w-full cursor-pointer items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-white/5"
          >
            <Avatar url={me.avatarUrl} size="size-13" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[17px] font-bold text-white">
                {profile?.nickname || me.name || "Traveler"}
              </span>
              <span className="block truncate text-[13px] text-muted">
                {me.email}
              </span>
            </span>
            <svg viewBox="0 0 20 20" fill="none" className="size-4 shrink-0 text-muted">
              <path
                d="M7.5 5l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="mx-4 my-1 h-px bg-white/8" />

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/flights");
            }}
            className={`${item} text-white`}
          >
            <span className="text-slate-300">
              <PlaneGlyph />
            </span>
            Flights
          </button>
          <button
            type="button"
            onClick={() => goHash("#/account/friends")}
            className={`${item} text-white`}
          >
            <span className="text-slate-300">
              <MenuIcon>
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </MenuIcon>
            </span>
            Friends
            <span className="ml-auto rounded-full bg-accent/20 px-3 py-1 text-[13px] font-semibold text-accent-bright">
              Get {money(REFERRAL_REWARD_USD)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => goHash("#/account/settings")}
            className={`${item} text-white`}
          >
            <span className="text-slate-300">
              <MenuIcon>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </MenuIcon>
            </span>
            Settings
          </button>

          <div className="mx-4 my-1 h-px bg-white/8" />

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              toast("Test build — support inbox isn't wired in this clone");
            }}
            className={`${item} text-white`}
          >
            <span className="text-slate-300">
              <MenuIcon>
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
              </MenuIcon>
            </span>
            Get help
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className={`${item} text-[#ff6b8a]`}
          >
            <MenuIcon>
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </MenuIcon>
            <span className="font-medium">Log out</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { me } = useMe();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <header className="flex items-center justify-between px-6 py-4 sm:px-8">
      <Logo />

      {me ? (
        <AccountMenu />
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
