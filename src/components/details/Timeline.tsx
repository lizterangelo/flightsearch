import { formatDuration, formatTime } from "@/lib/format";
import type { OfferSlice } from "@/lib/types";
import AmenityChips from "./AmenityChips";

/** Minutes between two local wall times (lexical-safe ISO strings). */
function minutesBetween(a: string, b: string): number {
  const toMin = (t: string) => {
    const [y, m, d] = t.slice(0, 10).split("-").map(Number);
    return (
      new Date(y, m - 1, d).getTime() / 60000 +
      Number(t.slice(11, 13)) * 60 +
      Number(t.slice(14, 16))
    );
  };
  return Math.max(0, Math.round(toMin(b) - toMin(a)));
}

const CABIN_LABELS: Record<string, string> = {
  economy: "Economy",
  premium_economy: "Premium Economy",
  business: "Business",
  first: "First",
};

function Dot() {
  // Centered on the timeline rail: 24px row padding + half the 1px border.
  return (
    <span className="absolute -left-[29px] top-2 size-2.5 rounded-full border-2 border-slate-400 bg-[#0a1122]" />
  );
}

/** Vertical timeline for one slice: segments with layover rows between. */
export default function Timeline({ slice }: { slice: OfferSlice }) {
  return (
    <div className="rounded-3xl border border-card-border bg-card p-6">
      {slice.segments.map((seg, i) => {
        const layoverMin =
          i > 0
            ? minutesBetween(slice.segments[i - 1].arrival, seg.departure)
            : 0;
        return (
          <div key={seg.id}>
            {i > 0 && (
              <div className="my-4 flex items-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-300">
                <svg viewBox="0 0 20 20" fill="none" className="size-4 text-muted">
                  <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="M10 6v4l2.5 2.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                {formatDuration(layoverMin)} layover ·{" "}
                <b className="text-white">{seg.origin}</b>
              </div>
            )}

            <div className="relative border-l border-white/15 pl-6">
              <div className="relative pb-1">
                <Dot />
                <span className="text-lg font-semibold text-white">
                  {formatTime(seg.departure)}
                </span>
                <span className="text-muted"> · </span>
                <span className="text-[15px] text-slate-200">
                  {seg.origin}{" "}
                  <span className="text-muted">({seg.originName})</span>
                  {seg.originTerminal && (
                    <span className="text-muted"> · T{seg.originTerminal}</span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2 py-2.5 text-[13px] text-muted">
                <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
                  <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="M10 6v4l2.5 2.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Travel time: {formatDuration(seg.durationMinutes)}
              </div>

              <div className="relative pb-1">
                <Dot />
                <span className="text-lg font-semibold text-white">
                  {formatTime(seg.arrival)}
                </span>
                <span className="text-muted"> · </span>
                <span className="text-[15px] text-slate-200">
                  {seg.destination}{" "}
                  <span className="text-muted">({seg.destinationName})</span>
                  {seg.destinationTerminal && (
                    <span className="text-muted">
                      {" "}
                      · T{seg.destinationTerminal}
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="mt-2 pl-6">
              <div className="text-[13px] text-muted">
                {CABIN_LABELS[seg.cabin] ?? seg.cabinMarketingName ?? "Economy"}
                {" · "}
                {seg.carrierName}
                {seg.aircraftName ? ` · ${seg.aircraftName}` : ""}
                {seg.flightNumber ? ` · ${seg.flightNumber}` : ""}
              </div>
              {seg.operatingCarrierName && (
                <div className="text-[12px] italic text-muted">
                  Operated by {seg.operatingCarrierName}
                </div>
              )}
              <AmenityChips segment={seg} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
