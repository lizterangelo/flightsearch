"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/currency";
import type { FlightOffer } from "@/lib/types";

export function BestBadge() {
  return (
    <span className="absolute -top-2.5 left-6 rounded-md border border-accent/50 bg-[#0b1428] px-2 py-0.5 text-[10px] font-bold tracking-widest text-slate-200">
      BEST
    </span>
  );
}

export function CheaperBadge({ savingsUSD }: { savingsUSD: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-direct/15 px-2.5 py-1 text-xs font-semibold text-direct">
      <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
        <path
          d="M10 16V4m0 12l-4-4m4 4l4-4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Cheaper than Google Flights · save {formatMoney(savingsUSD, "USD")}
    </span>
  );
}

export function HiddenCityBadge({ offer }: { offer: FlightOffer }) {
  const [show, setShow] = useState(false);
  const ticketed = offer.hiddenCity?.ticketedDestination ?? "?";
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="inline-flex cursor-help items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
        Hidden-city
        <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
          <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M10 9v4m0-6.5v.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {show && (
        <span className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-card-border bg-[#0b1428] p-3 text-xs leading-relaxed font-normal text-slate-300 shadow-2xl">
          Ticketed to <b className="text-white">{ticketed}</b> — you exit at
          the layover. Carry-on only (checked bags go to {ticketed}), one-way
          use, and airlines prohibit it in their terms. Book at your own risk.
        </span>
      )}
    </span>
  );
}

export function SplitTicketBadge({ savingsUSD }: { savingsUSD: number | null }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="inline-flex cursor-help items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent-bright">
        <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
          <path
            d="M4 7h8m0 0l-3-3m3 3l-3 3M16 13H8m0 0l3-3m-3 3l3 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Split ticket
        {savingsUSD !== null && ` · save ${formatMoney(savingsUSD, "USD")}`}
      </span>
      {show && (
        <span className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-card-border bg-[#0b1428] p-3 text-xs leading-relaxed font-normal text-slate-300 shadow-2xl">
          Two <b className="text-white">separate</b> bookings (outbound + return)
          that together cost less than one round-trip fare. Book each leg on its
          own — but a delay on one isn&apos;t protected by the other, and bags
          don&apos;t through-check.
        </span>
      )}
    </span>
  );
}

export function CachedBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-muted">
      cached price
    </span>
  );
}

export function TestFareBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
      Duffel test fare — not a real price
    </span>
  );
}
