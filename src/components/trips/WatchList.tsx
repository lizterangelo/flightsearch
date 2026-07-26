"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrency } from "@/components/CurrencyProvider";

interface Watch {
  id: number;
  label: string;
  searchUrl: string;
  cabin: string;
  lastPriceUSD: number | null;
  lastCheckedAt: string | null;
  deltaUSD: number;
}

/** "WATCHING" section on My Flights: prices, deltas, remove buttons. */
export default function WatchList() {
  const { format: money } = useCurrency();
  const [watches, setWatches] = useState<Watch[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        // Visit-triggered refresh of stale watches, then load the list.
        await fetch("/api/watches/refresh", { method: "POST" }).catch(() => {});
        const res = await fetch("/api/watches");
        if (!res.ok) return;
        const body = (await res.json()) as { watches: Watch[] };
        if (!cancelled) setWatches(body.watches);
      } catch {
        // Signed out or offline — section just stays hidden.
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  if (!watches || watches.length === 0) return null;

  return (
    <>
      <h2 className="mt-10 mb-3 text-sm font-semibold tracking-widest text-muted">
        WATCHING
      </h2>
      <div className="space-y-3">
        {watches.map((watch) => (
          <div
            key={watch.id}
            className="flex items-center justify-between gap-4 rounded-2xl border border-card-border bg-card px-5 py-3.5"
          >
            <Link
              href={watch.searchUrl}
              className="min-w-0 flex-1 truncate text-sm font-medium text-white transition hover:text-accent-bright"
            >
              {watch.label}
            </Link>
            <div className="flex shrink-0 items-center gap-3">
              {watch.lastPriceUSD !== null && (
                <span className="text-sm font-bold text-white">
                  {money(watch.lastPriceUSD)}
                </span>
              )}
              {watch.deltaUSD !== 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    watch.deltaUSD < 0
                      ? "bg-emerald-400/15 text-emerald-300"
                      : "bg-rose-400/15 text-rose-300"
                  }`}
                >
                  {watch.deltaUSD < 0 ? "▼" : "▲"} $
                  {Math.abs(Math.round(watch.deltaUSD))}
                </span>
              )}
              <button
                type="button"
                aria-label="Stop watching"
                onClick={async () => {
                  await fetch(`/api/watches/${watch.id}`, { method: "DELETE" });
                  setWatches((prev) =>
                    prev ? prev.filter((w) => w.id !== watch.id) : prev,
                  );
                }}
                className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted transition hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
