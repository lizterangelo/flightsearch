import { formatDuration, formatTime } from "@/lib/format";
import type { OfferSlice } from "@/lib/types";

/**
 * One slice: depart time/code — duration line with Direct/stops — arrive
 * time/code (+N when the arrival lands on a later day).
 */
export default function LegRow({ slice }: { slice: OfferSlice }) {
  const direct = slice.stops === 0;
  const stopsLabel = direct
    ? "Direct"
    : `${slice.stops} stop${slice.stops > 1 ? "s" : ""}${
        slice.stopAirports.length ? ` ${slice.stopAirports.join(", ")}` : ""
      }`;

  return (
    <div className="flex items-center gap-5">
      <div className="w-24 text-right">
        <div className="text-[26px] leading-8 font-semibold text-white">
          {formatTime(slice.departure)}
        </div>
        <div className="text-sm text-muted">{slice.origin}</div>
      </div>

      <div className="relative flex-1 py-4">
        <div className="mb-1.5 text-center text-xs text-muted">
          {formatDuration(slice.durationMinutes)}
        </div>
        <div className="relative h-px bg-white/20">
          {!direct && (
            <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stop" />
          )}
        </div>
        <div
          className={`mt-1.5 text-center text-xs font-medium ${
            direct ? "text-direct" : "text-stop"
          }`}
        >
          {stopsLabel}
        </div>
      </div>

      <svg viewBox="0 0 20 20" fill="none" className="size-4 shrink-0 text-slate-400">
        <path
          d="M3 10h13m0 0l-4-4m4 4l-4 4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="w-24">
        <div className="text-[26px] leading-8 font-semibold text-white">
          {formatTime(slice.arrival)}
          {slice.overnightDays > 0 && (
            <sup className="ml-0.5 text-xs font-semibold text-stop">
              +{slice.overnightDays}
            </sup>
          )}
        </div>
        <div className="text-sm text-muted">{slice.destination}</div>
      </div>
    </div>
  );
}
