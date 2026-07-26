"use client";

import { useCurrency } from "@/components/CurrencyProvider";
import type { FlightOffer } from "@/lib/types";
import AirlineLogo from "./AirlineLogo";
import { BestBadge } from "./Badges";
import LegRow from "./LegRow";

export default function FlightCard({
  offer,
  isBest,
  onOpen,
}: {
  offer: FlightOffer;
  isBest: boolean;
  /** Open the details view (card body click AND the Book pill). */
  onOpen: (offer: FlightOffer) => void;
}) {
  const { format: money } = useCurrency();
  const tripLabel = offer.slices.length > 1 ? "round-trip" : "one-way";

  return (
    // card-arrive animates once per mounted DOM node, so freshly-streamed
    // cards flash in while re-sorted existing cards don't re-animate.
    // No backdrop-blur here: dozens of blurring cards over the fixed starfield
    // can hang the compositor; the near-opaque card color does the job.
    <div
      onClick={() => onOpen(offer)}
      className={`card-arrive relative cursor-pointer rounded-3xl border bg-card p-6 transition hover:border-white/20 ${
        isBest
          ? "border-accent/50 shadow-[0_0_30px_rgba(46,107,255,0.15)]"
          : "border-card-border"
      }`}
    >
      {isBest && <BestBadge />}

      <div className="flex items-center gap-6">
        <div className="flex w-28 shrink-0 flex-col items-center gap-2 text-center">
          <AirlineLogo
            carrierCode={offer.ownerCode}
            carrierName={offer.ownerName}
            logoUrl={offer.ownerLogoUrl ?? undefined}
          />
          <div className="text-sm font-medium text-slate-200">
            {offer.ownerName}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {offer.slices.map((slice, i) => (
            <div key={i}>
              {i > 0 && <div className="my-1 h-px bg-white/8" />}
              <LegRow slice={slice} />
            </div>
          ))}
        </div>

        <div className="flex w-36 shrink-0 flex-col items-end gap-3 text-right">
          <div>
            <div className="text-[28px] leading-9 font-bold text-white">
              {money(offer.displayUSD)}
            </div>
            <div className="text-xs tracking-wide text-muted">{tripLabel}</div>
          </div>
          <button
            type="button"
            className="cursor-pointer btn-cta rounded-full px-6 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Book
          </button>
        </div>
      </div>
    </div>
  );
}
