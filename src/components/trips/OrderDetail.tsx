"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Timeline from "@/components/details/Timeline";
import { useToast } from "@/components/ui/Toast";
import type { FlightOffer } from "@/lib/types";

interface OrderView {
  duffelOrderId: string;
  bookingReference: string;
  status: "confirmed" | "cancelled";
  displayTotalUSD: number;
  protect: boolean;
  protectFeeUSD: number;
  liveMode: boolean;
  cancelledAt: string | null;
  refundAmount: string | null;
  refundCurrency: string | null;
  createdAt: string;
}

interface Quote {
  cancellationId: string;
  refundAmount: string | null;
  refundCurrency: string | null;
}

function money(usd: number): string {
  return `$${Math.round(usd).toLocaleString("en-US")}`;
}

export default function OrderDetail({
  order,
  snapshot,
}: {
  order: OrderView;
  snapshot: FlightOffer | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = order.status === "cancelled";

  const requestQuote = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/orders/${order.duffelOrderId}/cancel`,
        { method: "POST" },
      );
      const body = (await res.json()) as Quote & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't get a quote");
      setQuote(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = async () => {
    if (!quote) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/orders/${order.duffelOrderId}/cancel/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cancellationId: quote.cancellationId }),
        },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Cancellation failed");
      toast("Booking cancelled");
      router.refresh();
      setQuote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-24">
      <Link
        href="/flights"
        className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-white"
      >
        ← My Flights
      </Link>

      <div className="mt-4 rounded-3xl border border-card-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 text-2xl font-bold text-white">
              {snapshot ? (
                <>
                  {snapshot.slices[0]?.originCity}
                  <span className="text-accent-bright">
                    {snapshot.slices.length > 1 ? "⇄" : "→"}
                  </span>
                  {snapshot.slices[0]?.destinationCity}
                </>
              ) : (
                "Trip"
              )}
              {cancelled && (
                <span className="rounded-full bg-rose-400/15 px-2.5 py-0.5 text-xs font-semibold text-rose-300">
                  Cancelled
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-muted">
              Confirmation{" "}
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono font-semibold text-white">
                {order.bookingReference}
              </span>{" "}
              · booked {order.createdAt.slice(0, 10)}
              {!order.liveMode && " · test order"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-white">
              {money(order.displayTotalUSD)}
            </div>
            {order.protect && (
              <div className="text-xs font-semibold text-emerald-300">
                Protected · Refund Guarantee
              </div>
            )}
          </div>
        </div>

        {cancelled && (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-slate-300">
            Cancelled {order.cancelledAt?.slice(0, 10)}.{" "}
            {order.refundAmount
              ? `Refund: ${order.refundAmount} ${order.refundCurrency ?? ""} to the original payment method.`
              : "Refund handled per the fare rules."}
          </div>
        )}
      </div>

      {snapshot?.slices.map((slice, i) => (
        <div key={i} className="mt-6">
          <div className="mb-3 text-lg font-semibold text-white">
            {i === 0 ? "Departing flight" : "Returning flight"}
            <span className="ml-2 text-sm font-normal text-muted">
              {new Date(
                `${slice.departure.slice(0, 10)}T00:00:00`,
              ).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          <Timeline slice={slice} />
        </div>
      ))}

      {!cancelled && (
        <div className="mt-8 rounded-3xl border border-card-border bg-card p-6">
          <div className="text-lg font-semibold text-white">
            Need to cancel?
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {order.protect
              ? `This booking is protected: cancel before your first departure and get back everything you paid except the ${money(order.protectFeeUSD)} protection fee.`
              : "This fare follows the airline's cancellation rules — we'll quote your exact refund before anything is final."}
          </p>

          {error && (
            <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm text-rose-200">
              {error}
            </div>
          )}

          {!quote ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void requestQuote()}
              className="mt-4 cursor-pointer rounded-full border border-rose-400/40 bg-rose-400/10 px-6 py-2.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:opacity-40"
            >
              {busy ? "Getting quote…" : "Cancel this booking"}
            </button>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm text-slate-200">
                {order.protect ? (
                  <>
                    Refund Guarantee refund:{" "}
                    <b className="text-white">
                      {money(
                        Math.max(
                          0,
                          order.displayTotalUSD - order.protectFeeUSD,
                        ),
                      )}
                    </b>
                  </>
                ) : quote.refundAmount ? (
                  <>
                    Airline refund quote:{" "}
                    <b className="text-white">
                      {quote.refundAmount} {quote.refundCurrency ?? ""}
                    </b>
                  </>
                ) : (
                  "The airline quotes no automatic refund for this fare."
                )}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmCancel()}
                  className="cursor-pointer rounded-full bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
                >
                  {busy ? "Cancelling…" : "Confirm cancellation"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setQuote(null)}
                  className="cursor-pointer rounded-full border border-card-border bg-pill/80 px-5 py-2.5 text-sm font-semibold text-slate-200"
                >
                  Keep my booking
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
