"use client";

import Link from "next/link";
import { useCurrency } from "@/components/CurrencyProvider";
import { formatTime } from "@/lib/format";
import type { OrderRow } from "@/lib/data";
import type { FlightOffer } from "@/lib/types";

function parseSnapshot(row: OrderRow): FlightOffer | null {
  const snap = row.offer_snapshot as FlightOffer;
  return snap?.slices?.length ? snap : null;
}

/** One order row on My Flights. */
export default function OrderCard({ order }: { order: OrderRow }) {
  const { format: money } = useCurrency();
  const snapshot = parseSnapshot(order);
  const out = snapshot?.slices[0];
  const cancelled = order.status === "cancelled";

  return (
    <Link
      href={`/flights/orders/${order.duffel_order_id}`}
      className="block rounded-3xl border border-card-border bg-card p-5 transition hover:border-white/20"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 text-lg font-bold text-white">
            {out ? (
              <>
                {out.originCity || out.origin}
                <span className="text-accent-bright">
                  {snapshot!.slices.length > 1 ? "⇄" : "→"}
                </span>
                {out.destinationCity || out.destination}
              </>
            ) : (
              "Trip"
            )}
            {cancelled && (
              <span className="rounded-full bg-rose-400/15 px-2.5 py-0.5 text-xs font-semibold text-rose-300">
                Cancelled
              </span>
            )}
            {order.protect && !cancelled && (
              <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                Protected
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-sm text-muted">
            {out && (
              <>
                {new Date(
                  `${out.departure.slice(0, 10)}T00:00:00`,
                ).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}{" "}
                · {formatTime(out.departure)} · {snapshot!.ownerName} ·{" "}
              </>
            )}
            <span className="font-mono">{order.booking_reference}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xl font-bold text-white">
            {money(order.display_total_usd)}
          </div>
          <div className="text-xs text-muted">
            {order.live_mode ? "live" : "test"} order
          </div>
        </div>
      </div>
    </Link>
  );
}
