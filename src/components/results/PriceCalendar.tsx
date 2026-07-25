"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { addDaysYmd, todayLocalYmd } from "@/lib/dates";
import { toQueryString, type SearchParams } from "@/lib/types";

interface CalendarData {
  available: boolean;
  days?: Record<string, number>;
}

function weekday(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" });
}

function dayNum(ymd: string): string {
  return String(Number(ymd.slice(8, 10)));
}

function dayDelta(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/**
 * Cheapest-fare-by-day strip. Fetches the month's calendar from Travelpayouts;
 * hides itself entirely when no data (no token / thin route). Clicking a day
 * re-searches that departure date, preserving trip length on round trips.
 */
export default function PriceCalendar({ params }: { params: SearchParams }) {
  const router = useRouter();
  const month = params.departDate.slice(0, 7);
  const key = `${params.origin}-${params.destination}-${month}`;
  // Store the fetched key with its data so a params change auto-derives back
  // to "loading" (null) without a synchronous setState in the effect.
  const [state, setState] = useState<{ key: string; data: CalendarData } | null>(
    null,
  );
  const data = state?.key === key ? state.data : null;

  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams({
      origin: params.origin,
      destination: params.destination,
      month,
    });
    fetch(`/api/price-calendar?${q}`)
      .then((r) => r.json())
      .then((d: CalendarData) => {
        if (!cancelled) setState({ key, data: d });
      })
      .catch(() => {
        if (!cancelled) setState({ key, data: { available: false } });
      });
    return () => {
      cancelled = true;
    };
  }, [key, params.origin, params.destination, month]);

  // 15-day window centered on the searched date, clamped to today onward.
  const window = useMemo(() => {
    const today = todayLocalYmd();
    const start =
      addDaysYmd(params.departDate, -7) < today
        ? today
        : addDaysYmd(params.departDate, -7);
    return Array.from({ length: 15 }, (_, i) => addDaysYmd(start, i));
  }, [params.departDate]);

  const days = data?.days;
  const cheapest = useMemo(() => {
    if (!days) return null;
    let min = Infinity;
    for (const d of window) {
      const p = days[d];
      if (p !== undefined && p < min) min = p;
    }
    return min === Infinity ? null : min;
  }, [days, window]);

  if (!data || !data.available || !days) return null;
  // Nothing priced in the visible window → don't show an empty strip.
  if (!window.some((d) => days[d] !== undefined)) return null;

  const go = (date: string) => {
    if (date === params.departDate) return;
    const next: SearchParams = { ...params, departDate: date };
    if (params.tripType === "round_trip" && params.returnDate) {
      next.returnDate = addDaysYmd(
        params.returnDate,
        dayDelta(params.departDate, date),
      );
    }
    router.push(`/results?${toQueryString(next)}`);
  };

  return (
    <div className="mb-4">
      <div className="mb-1.5 text-xs text-muted">
        Cheapest fares by departure day{" "}
        <span className="text-muted/60">· from prices, one-way</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {window.map((date) => {
          const price = days[date];
          const isSelected = date === params.departDate;
          const isCheapest = price !== undefined && price === cheapest;
          return (
            <button
              key={date}
              type="button"
              onClick={() => go(date)}
              className={`flex min-w-[64px] shrink-0 flex-col items-center gap-0.5 rounded-xl border px-2 py-2 transition ${
                isSelected
                  ? "border-accent bg-accent/15"
                  : "border-card-border bg-card hover:border-white/25"
              }`}
            >
              <span className="text-[11px] text-muted">{weekday(date)}</span>
              <span className="text-sm font-semibold text-white">
                {dayNum(date)}
              </span>
              <span
                className={`text-[11px] font-medium ${
                  isCheapest ? "text-direct" : "text-muted"
                }`}
              >
                {price !== undefined ? `$${price}` : "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
