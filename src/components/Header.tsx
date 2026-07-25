"use client";

import Logo from "./Logo";

/**
 * Top bar: logo left, Sign in right. The auth modal arrives in Phase 4 —
 * until then the button is a visual placeholder.
 */
export default function Header({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <header className="flex items-center justify-between px-6 py-4 sm:px-8">
      <Logo withWordmark={withWordmark} />
      <button
        type="button"
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
    </header>
  );
}
