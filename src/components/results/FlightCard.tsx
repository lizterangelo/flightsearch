import { savingsVsBaseline } from "@/lib/baseline";
import type { FlightOffer, ProviderId } from "@/lib/types";
import AirlineLogo from "./AirlineLogo";
import {
  BestBadge,
  CachedBadge,
  CheaperBadge,
  HiddenCityBadge,
  SplitTicketBadge,
  TestFareBadge,
} from "./Badges";
import LegRow from "./LegRow";
import PriceBlock from "./PriceBlock";

const SOURCE_LABELS: Partial<Record<ProviderId, string>> = {
  serpapi: "Google",
  "fast-flights": "Google",
  travelpayouts: "Aviasales",
  skiplagged: "Skiplagged",
  skyscanner: "Skyscanner",
  duffel: "Duffel",
  split: "Split ticket",
  "agent:frontier": "Frontier.com",
  "agent:trip-com": "Trip.com",
  "agent:google": "Google",
  "agent:navitaire": "Allegiant.com",
};

function primaryCarrier(offer: FlightOffer): {
  code: string;
  name: string;
} {
  const seg = offer.legs[0]?.segments[0];
  return { code: seg?.carrierCode ?? "", name: seg?.carrierName ?? "Unknown" };
}

export default function FlightCard({
  offer,
  adults,
  baselineUSD,
  isBest,
}: {
  offer: FlightOffer;
  adults: number;
  baselineUSD: number | null;
  isBest: boolean;
}) {
  const carrier = primaryCarrier(offer);
  const isTestFare = offer.bookable?.testData === true;
  // Sandbox prices must never claim to beat real ones.
  const savings = isTestFare ? null : savingsVsBaseline(offer, baselineUSD);
  const sourceLabels = [
    ...new Set(offer.sources.map((s) => SOURCE_LABELS[s] ?? s)),
  ];

  const isSplit = Boolean(offer.splitTicket);
  const hasBadgeRow =
    savings !== null ||
    isTestFare ||
    isSplit ||
    offer.freshness === "hidden-city" ||
    offer.freshness === "cached";

  return (
    // card-arrive animates once per mounted DOM node, so freshly-streamed
    // cards flash in while re-sorted existing cards don't re-animate.
    // No backdrop-blur here: dozens of blurring cards over the fixed starfield
    // can hang the compositor; the near-opaque card color does the job.
    <div
      className={`card-arrive relative rounded-3xl border bg-card p-6 ${
        isBest
          ? "border-accent/50 shadow-[0_0_30px_rgba(46,107,255,0.15)]"
          : "border-card-border"
      }`}
    >
      {isBest && <BestBadge />}

      <div className="flex items-center gap-6">
        <div className="flex w-28 shrink-0 flex-col items-center gap-2 text-center">
          <AirlineLogo carrierCode={carrier.code} carrierName={carrier.name} />
          <div className="text-sm font-medium text-slate-200">
            {carrier.name}
          </div>
          <div className="text-[10px] text-muted">
            via {sourceLabels.join(" · ")}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {offer.legs.map((leg, i) => (
            <div key={i}>
              {i > 0 && <div className="my-1 h-px bg-white/8" />}
              <LegRow leg={leg} />
            </div>
          ))}
          {offer.returnLegPending && (
            <div className="mt-1 text-xs text-muted italic">
              Round-trip price — return flight chosen on{" "}
              {SOURCE_LABELS[offer.source] ?? "the booking site"}
            </div>
          )}
        </div>

        <PriceBlock offer={offer} adults={adults} />
      </div>

      {hasBadgeRow && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3.5">
          {/* Split badge carries its own savings, so don't double up. */}
          {isSplit ? (
            <SplitTicketBadge savingsUSD={savings} />
          ) : (
            savings !== null && <CheaperBadge savingsUSD={savings} />
          )}
          {isTestFare && <TestFareBadge />}
          {offer.freshness === "hidden-city" && (
            <HiddenCityBadge offer={offer} />
          )}
          {offer.freshness === "cached" && <CachedBadge />}
        </div>
      )}
    </div>
  );
}
