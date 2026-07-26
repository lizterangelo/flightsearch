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
    <div className="flex items-center gap-3 sm:gap-5">
      <div className="w-20 text-right sm:w-28">
        <div className="text-lg leading-7 font-semibold whitespace-nowrap text-white sm:text-[23px] sm:leading-8">
          {formatTime(slice.departure)}
        </div>
        <div className="text-xs text-muted sm:text-sm">{slice.origin}</div>
      </div>

      <div className="relative min-w-0 flex-1 py-3 sm:py-4">
        <div className="mb-1.5 truncate text-center text-xs text-muted">
          {formatDuration(slice.durationMinutes)}
        </div>
        <div className="relative h-px bg-white/20">
          {!direct && (
            <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stop" />
          )}
        </div>
        <div
          className={`mt-1.5 truncate text-center text-xs font-medium ${
            direct ? "text-direct" : "text-stop"
          }`}
        >
          {stopsLabel}
        </div>
      </div>

      <svg viewBox="0 0 20 20" fill="none" className="hidden size-4 shrink-0 text-slate-400 sm:block">
        <path
          d="M3 10h13m0 0l-4-4m4 4l-4 4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="w-20 sm:w-28">
        <div className="text-lg leading-7 font-semibold whitespace-nowrap text-white sm:text-[23px] sm:leading-8">
          {formatTime(slice.arrival)}
          {slice.overnightDays > 0 && (
            <sup className="ml-0.5 text-xs font-semibold text-stop">
              +{slice.overnightDays}
            </sup>
          )}
        </div>
        <div className="text-xs text-muted sm:text-sm">{slice.destination}</div>
      </div>
    </div>
  );
}
