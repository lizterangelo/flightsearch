"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { FlightOffer } from "@/lib/types";
import { EmptyState, Section } from "../primitives";

interface Invoice {
  duffel_order_id: string;
  booking_reference: string;
  status: "confirmed" | "cancelled";
  display_total_usd: number;
  refund_amount: string | null;
  refund_currency: string | null;
  created_at: string;
  offer_snapshot: FlightOffer;
}

/** Receipts: every payment as an invoice row, straight from orders. */
export default function ReceiptsTab() {
  const { format: money } = useCurrency();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabaseBrowser()
        .from("orders")
        .select(
          "duffel_order_id, booking_reference, status, display_total_usd, refund_amount, refund_currency, created_at, offer_snapshot",
        )
        .order("created_at", { ascending: false });
      if (!cancelled) setInvoices((data as Invoice[] | null) ?? []);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  return (
    <Section>
      {invoices !== null && invoices.length === 0 && (
        <EmptyState
          icon={
            <svg viewBox="0 0 20 20" fill="none" className="size-6">
              <path d="M5.5 2.5h9v15l-2.25-1.5L10 17.5l-2.25-1.5L5.5 17.5v-15z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M8 7h4M8 10h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
          title="No invoices yet"
          sub="They'll appear here automatically after you book a flight or stay."
        />
      )}

      {invoices?.map((invoice, i) => {
        const out = invoice.offer_snapshot?.slices?.[0];
        return (
          <Link
            key={invoice.duffel_order_id}
            href={`/flights/orders/${invoice.duffel_order_id}`}
            className={`flex items-center justify-between gap-4 px-4 py-3.5 transition hover:bg-white/[0.03] ${
              i === invoices.length - 1 ? "" : "border-b border-white/6"
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-white">
                {out
                  ? `${out.originCity || out.origin} ${invoice.offer_snapshot.slices.length > 1 ? "⇄" : "→"} ${out.destinationCity || out.destination}`
                  : "Flight booking"}
                {invoice.status === "cancelled" && (
                  <span className="rounded-full bg-rose-400/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
                    Refunded
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[13px] text-muted">
                {invoice.created_at.slice(0, 10)} ·{" "}
                <span className="font-mono">{invoice.booking_reference}</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[15px] font-bold text-white">
                {money(invoice.display_total_usd)}
              </div>
              {invoice.status === "cancelled" && invoice.refund_amount && (
                <div className="text-[12px] text-emerald-300">
                  −{invoice.refund_amount} {invoice.refund_currency ?? ""}
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </Section>
  );
}
