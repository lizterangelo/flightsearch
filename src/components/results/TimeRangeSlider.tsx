"use client";

/**
 * Dual-handle time range (minutes since midnight, 0–1439) built from two
 * overlaid native range inputs — keyboard accessible for free.
 */
export type TimeRange = [number, number];
export const FULL_DAY: TimeRange = [0, 1439];

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function TimeRangeSlider({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: TimeRange;
  onChange: (v: TimeRange) => void;
}) {
  const [lo, hi] = value;
  const pct = (v: number) => (v / 1439) * 100;

  return (
    <div className="px-3.5 py-3">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
        {icon}
        {label}
      </div>
      <div className="mb-2 text-xs text-muted">
        {lo === 0 && hi === 1439
          ? "12:00 AM - 11:59 PM"
          : `${formatClock(lo)} - ${formatClock(hi)}`}
      </div>
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-white/15" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded bg-accent"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        {/* Lower handle wins pointer events on its half, upper on the other. */}
        <input
          type="range"
          min={0}
          max={1439}
          step={15}
          value={lo}
          aria-label={`${label} earliest`}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), hi - 15);
            onChange([v, hi]);
          }}
          className="time-slider pointer-events-none absolute inset-0 w-full appearance-none bg-transparent"
        />
        <input
          type="range"
          min={0}
          max={1439}
          step={15}
          value={hi}
          aria-label={`${label} latest`}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), lo + 15);
            onChange([lo, v]);
          }}
          className="time-slider pointer-events-none absolute inset-0 w-full appearance-none bg-transparent"
        />
      </div>
    </div>
  );
}
