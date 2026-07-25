import type { OfferSegment } from "@/lib/types";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-300">
      {children}
    </span>
  );
}

/** Wi-Fi / power / seat-pitch chips for one segment (+ its source). */
export default function AmenityChips({ segment }: { segment: OfferSegment }) {
  const a = segment.amenities;
  if (!a) return null;

  const pitch = a.seat?.pitch;
  const pitchLabel =
    pitch && /^\d+$/.test(pitch)
      ? `${pitch} in seat pitch`
      : pitch === "more"
        ? "Extra legroom"
        : pitch === "less"
          ? "Tight seat pitch"
          : null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {a.wifi?.available && (
        <Chip>
          <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
            <path
              d="M3 8.5a10 10 0 0114 0M5.5 11.5a6.5 6.5 0 019 0M8 14.5a3 3 0 014 0"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="10" cy="16.4" r="1" fill="currentColor" />
          </svg>
          Wi-Fi{a.wifi.cost === "free" ? " (free)" : ""}
        </Chip>
      )}
      {a.power?.available && (
        <Chip>
          <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
            <path
              d="M11 2.5L4.5 11H9l-1 6.5L14.5 9H10l1-6.5z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
          Power
        </Chip>
      )}
      {pitchLabel && (
        <Chip>
          <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
            <path
              d="M10 3v14M6.5 6.5L10 3l3.5 3.5M6.5 13.5L10 17l3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {pitchLabel}
        </Chip>
      )}
    </div>
  );
}
