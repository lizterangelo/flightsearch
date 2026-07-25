"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { addDaysYmd } from "@/lib/dates";
import type { SearchQuery } from "@/lib/types";
import { buildFlightsPath } from "@/lib/urls";

/**
 * Flexible-dates strip: one chip per departure day in the ±N window with
 * the observed price (from the calendar cache). Clicking a chip re-runs
 * the search shifted to that day (return shifts by the same trip length).
 */

interface CalendarDay {
  date: string;
  amount: number;
  tier: "cheap" | "medium" | "expensive";
}

const TIER_TEXT: Record<CalendarDay["tier"], string> = {
  cheap: "text-emerald-300",
  medium: "text-slate-300",
  expensive: "text-rose-300",
};

function shortDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function FlexDateStrip({ query }: { query: SearchQuery }) {
  const router = useRouter();
  const [prices, setPrices] = useState<Map<string, CalendarDay>>(
    () => new Map(),
  );
  const flex = query.flexDays ?? 0;

  useEffect(() => {
    if (!flex) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          origin: query.origin,
          destination: query.destination,
          start: addDaysYmd(query.departDate, -flex),
          end: addDaysYmd(query.departDate, flex),
          cabin: query.cabin,
        });
        const res = await fetch(`/api/price-calendar?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { prices: CalendarDay[] };
        setPrices(new Map(body.prices.map((p) => [p.date, p])));
      } catch {
        // Chips render dateless-price — fine.
      }
    }, 0);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query.origin, query.destination, query.departDate, query.cabin, flex]);

  if (!flex) return null;

  const tripLen =
    query.returnDate !== undefined && query.tripType === "round_trip"
      ? Math.round(
          (new Date(`${query.returnDate}T00:00:00`).getTime() -
            new Date(`${query.departDate}T00:00:00`).getTime()) /
            86400000,
        )
      : null;

  const days: string[] = [];
  for (let offset = -flex; offset <= flex; offset++) {
    days.push(addDaysYmd(query.departDate, offset));
  }

  return (
    <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1">
      {days.map((date) => {
        const active = date === query.departDate;
        const info = prices.get(date);
        return (
          <button
            key={date}
            type="button"
            disabled={active}
            onClick={() => {
              const next: SearchQuery = {
                ...query,
                departDate: date,
                returnDate:
                  tripLen !== null ? addDaysYmd(date, tripLen) : undefined,
              };
              router.push(buildFlightsPath(next));
            }}
            className={`shrink-0 cursor-pointer rounded-2xl border px-4 py-2 text-left transition ${
              active
                ? "border-accent/60 bg-accent/15"
                : "border-card-border bg-pill/70 hover:border-white/25"
            }`}
          >
            <div className="text-xs font-medium text-slate-200">
              {shortDay(date)}
            </div>
            <div
              className={`text-[13px] font-bold ${info ? TIER_TEXT[info.tier] : "text-muted"}`}
            >
              {info ? `$${info.amount.toLocaleString("en-US")}` : "—"}
            </div>
          </button>
        );
      })}
    </div>
  );
}
