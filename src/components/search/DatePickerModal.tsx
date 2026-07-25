"use client";

import { useEffect, useMemo, useState } from "react";
import { addDaysYmd, todayLocalYmd } from "@/lib/dates";
import type { TripType } from "@/lib/types";

/** Tiers from /api/price-calendar drive the heatmap cell tints. */
type Tier = "cheap" | "medium" | "expensive";

interface CalendarResponse {
  prices: { date: string; tier: Tier }[];
}

export type FlexDays = 0 | 1 | 2 | 3 | 7 | 14;
const FLEX_OPTIONS: { value: FlexDays; label: string }[] = [
  { value: 0, label: "Exact dates" },
  { value: 1, label: "± 1 day" },
  { value: 2, label: "± 2 days" },
  { value: 3, label: "± 3 days" },
  { value: 7, label: "± 7 days" },
  { value: 14, label: "± 14 days" },
];

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function shortLabel(dateYmd: string): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const TIER_CLASS: Record<Tier, string> = {
  cheap: "bg-emerald-500/15 text-emerald-300",
  medium: "bg-amber-500/12 text-amber-200/90",
  expensive: "bg-rose-500/12 text-rose-300/90",
};

function MonthGrid({
  year,
  month,
  today,
  depart,
  ret,
  hover,
  tiers,
  onPick,
  onHover,
}: {
  year: number;
  month: number;
  today: string;
  depart: string | null;
  ret: string | null;
  hover: string | null;
  tiers: Map<string, Tier>;
  onPick: (date: string) => void;
  onHover: (date: string | null) => void;
}) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => ymd(year, month, i + 1)),
  ];

  // Range shading between depart and (ret | hovered candidate).
  const rangeEnd = ret ?? (depart && hover && hover > depart ? hover : null);

  return (
    <div className="flex-1">
      <div className="mb-3 text-center text-base font-semibold text-white">
        {monthLabel(year, month)}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] font-medium text-muted">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="pb-1">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`pad-${i}`} />;
          const past = date < today;
          const isDepart = date === depart;
          const isReturn = date === ret;
          const inRange =
            depart && rangeEnd ? date > depart && date < rangeEnd : false;
          const tier = tiers.get(date);
          const isToday = date === today;

          return (
            <div
              key={date}
              className={`relative py-0.5 ${inRange ? "bg-accent/15" : ""} ${
                isDepart && rangeEnd ? "rounded-l-lg bg-accent/15" : ""
              } ${isReturn ? "rounded-r-lg bg-accent/15" : ""}`}
            >
              <button
                type="button"
                disabled={past}
                onClick={() => onPick(date)}
                onMouseEnter={() => onHover(date)}
                onMouseLeave={() => onHover(null)}
                className={`mx-auto flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                  past
                    ? "cursor-default text-white/15"
                    : isDepart || isReturn
                      ? "bg-accent text-white"
                      : tier
                        ? `${TIER_CLASS[tier]} hover:ring-1 hover:ring-white/30`
                        : "text-slate-200 hover:bg-white/10"
                } ${isToday && !isDepart && !isReturn ? "ring-1 ring-white/50" : ""}`}
              >
                {Number(date.slice(8, 10))}
              </button>
              {isToday && (
                <div className="absolute -bottom-3.5 left-0 right-0 text-center text-[9px] font-medium tracking-wide text-muted">
                  Today
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The flysoar-style date modal: One-way/Roundtrip tabs, two-month grid with
 * price-heatmap tints from /api/price-calendar, flexible-dates pills, Apply.
 */
export default function DatePickerModal({
  open,
  origin,
  destination,
  cabin,
  initialDepart,
  initialReturn,
  initialTripType,
  initialFlex = 0,
  onClose,
  onApply,
}: {
  open: boolean;
  /** Representative airports for the calendar lookup. */
  origin: string | null;
  destination: string | null;
  cabin: string;
  initialDepart: string | null;
  initialReturn: string | null;
  initialTripType: TripType;
  initialFlex?: FlexDays;
  onClose: () => void;
  onApply: (v: {
    departDate: string;
    returnDate: string | null;
    tripType: TripType;
    flexDays: FlexDays;
  }) => void;
}) {
  const today = todayLocalYmd();
  const [tripType, setTripType] = useState<TripType>(initialTripType);
  const [depart, setDepart] = useState<string | null>(initialDepart);
  const [ret, setRet] = useState<string | null>(initialReturn);
  const [hover, setHover] = useState<string | null>(null);
  const [flex, setFlex] = useState<FlexDays>(initialFlex);
  const [monthOffset, setMonthOffset] = useState(0);
  const [tiers, setTiers] = useState<Map<string, Tier>>(() => new Map());

  // Re-seed from props each time the modal opens (render-time adjustment).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTripType(initialTripType);
      setDepart(initialDepart);
      setRet(initialReturn);
      setFlex(initialFlex);
    }
  }

  // Price heatmap for the visible year around today.
  useEffect(() => {
    if (!open || !origin || !destination) return;
    const controller = new AbortController();
    (async () => {
      try {
        const params = new URLSearchParams({
          origin,
          destination,
          start: today,
          end: addDaysYmd(today, 330),
          cabin,
        });
        const res = await fetch(`/api/price-calendar?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as CalendarResponse;
        setTiers(new Map(body.prices.map((p) => [p.date, p.tier])));
      } catch {
        // No tints — the calendar still works.
      }
    })();
    return () => controller.abort();
  }, [open, origin, destination, cabin, today]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const base = new Date();
  const firstMonth = new Date(
    base.getFullYear(),
    base.getMonth() + monthOffset,
    1,
  );
  const secondMonth = new Date(
    base.getFullYear(),
    base.getMonth() + monthOffset + 1,
    1,
  );

  const header = useMemo(() => {
    if (!depart) return "Pick departure";
    if (tripType === "one_way") return shortLabel(depart);
    if (!ret)
      return (
        <>
          {shortLabel(depart)}{" "}
          <span className="font-normal text-muted">· pick return</span>
        </>
      );
    return (
      <>
        {shortLabel(depart)} <span className="text-muted">→</span>{" "}
        {shortLabel(ret)}
      </>
    );
  }, [depart, ret, tripType]);

  const pick = (date: string) => {
    if (tripType === "one_way") {
      setDepart(date);
      return;
    }
    if (!depart || (depart && ret) || date < depart) {
      setDepart(date);
      setRet(null);
    } else {
      setRet(date);
    }
  };

  const canApply = Boolean(depart && (tripType === "one_way" || ret));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-4 pt-[8vh]">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div role="dialog" aria-modal="true" aria-label="Choose dates" className="relative w-full max-w-3xl rounded-3xl border border-card-border bg-[#0a1122] p-7 shadow-2xl shadow-black/60">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="text-2xl font-bold text-white">{header}</div>
          <div className="flex rounded-full border border-card-border bg-pill/80 p-1 text-sm font-medium">
            {(
              [
                ["one_way", "One-way"],
                ["round_trip", "Roundtrip"],
              ] as [TripType, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tripType === t}
                onClick={() => {
                  setTripType(t);
                  if (t === "one_way") setRet(null);
                }}
                className={`cursor-pointer rounded-full px-4 py-1.5 transition-colors ${
                  tripType === t
                    ? "bg-white text-[#0a1122]"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative flex gap-10">
          <button
            type="button"
            aria-label="Previous month"
            disabled={monthOffset <= 0}
            onClick={() => setMonthOffset((m) => Math.max(0, m - 1))}
            className="absolute -left-2 top-0 cursor-pointer rounded-full p-1.5 text-slate-300 transition hover:bg-white/10 disabled:opacity-30"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-5">
              <path
                d="M12.5 4.5L7 10l5.5 5.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <MonthGrid
            year={firstMonth.getFullYear()}
            month={firstMonth.getMonth()}
            today={today}
            depart={depart}
            ret={ret}
            hover={hover}
            tiers={tiers}
            onPick={pick}
            onHover={setHover}
          />
          <MonthGrid
            year={secondMonth.getFullYear()}
            month={secondMonth.getMonth()}
            today={today}
            depart={depart}
            ret={ret}
            hover={hover}
            tiers={tiers}
            onPick={pick}
            onHover={setHover}
          />
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonthOffset((m) => m + 1)}
            className="absolute -right-2 top-0 cursor-pointer rounded-full p-1.5 text-slate-300 transition hover:bg-white/10"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-5">
              <path
                d="M7.5 4.5L13 10l-5.5 5.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className="mt-8 flex items-center justify-between gap-4 border-t border-white/8 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            {FLEX_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFlex(value)}
                className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  flex === value
                    ? "border-accent/60 bg-accent/15 text-accent-bright"
                    : "border-card-border bg-pill/60 text-slate-300 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!canApply}
            onClick={() => {
              if (!depart) return;
              onApply({
                departDate: depart,
                returnDate: tripType === "round_trip" ? ret : null,
                tripType,
                flexDays: flex,
              });
            }}
            className="cursor-pointer rounded-full bg-accent px-7 py-2.5 font-semibold text-white shadow-[0_0_20px_rgba(46,107,255,0.45)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
