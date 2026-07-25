"use client";

import { formatDuration } from "@/lib/format";
import { sortOffers, type SortMode } from "@/lib/rank";
import { totalDurationMinutes, type FlightOffer } from "@/lib/types";
import Dropdown, { Chevron, MenuItem } from "../search/Dropdown";

const MODES: {
  mode: SortMode;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    mode: "best",
    label: "Best",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="size-4.5">
        <path
          d="M3 14l4-8 3.5 5L13 7l4 7"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    mode: "cheapest",
    label: "Cheapest",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="size-4.5">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M10 6v4l2.5 2.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    mode: "fastest",
    label: "Fastest",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="size-4.5">
        <path
          d="M11 3l-7 9h5l-1 5 7-9h-5l1-5z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

function Check() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4 text-accent-bright">
      <path
        d="M4 10.5l4 4 8-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** "Sort: Best ⌃" pill; the open panel shows each mode's live top metric. */
export default function SortMenu({
  offers,
  sortMode,
  onChange,
}: {
  offers: FlightOffer[];
  sortMode: SortMode;
  onChange: (mode: SortMode) => void;
}) {
  const active = MODES.find((m) => m.mode === sortMode)!;

  return (
    <Dropdown
      align="right"
      trigger={(open) => (
        <span className="flex items-center gap-2 rounded-full border border-card-border bg-pill/80 px-4 py-2 text-sm font-medium text-slate-200">
          Sort: {active.label}
          <Chevron open={open} />
        </span>
      )}
    >
      {(close) => (
        <div className="w-56">
          {MODES.map(({ mode, label, icon }) => {
            const top = offers.length ? sortOffers(offers, mode)[0] : null;
            return (
              <MenuItem
                key={mode}
                selected={sortMode === mode}
                onClick={() => {
                  onChange(mode);
                  close();
                }}
              >
                <span className="flex items-center gap-2.5">
                  <span className="text-slate-300">{icon}</span>
                  <span>
                    <span className="block font-medium">{label}</span>
                    {top && (
                      <span className="block text-xs text-muted">
                        ${Math.round(top.displayUSD).toLocaleString("en-US")} ·{" "}
                        {formatDuration(totalDurationMinutes(top))}
                      </span>
                    )}
                  </span>
                </span>
                {sortMode === mode && <Check />}
              </MenuItem>
            );
          })}
        </div>
      )}
    </Dropdown>
  );
}
