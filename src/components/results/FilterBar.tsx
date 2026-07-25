"use client";

import { useState } from "react";
import { ALLIANCES, type Alliance } from "@/data/alliances";
import type { FlightOffer } from "@/lib/types";
import Dropdown, { Chevron } from "../search/Dropdown";
import AirlineLogo from "./AirlineLogo";
import TimeRangeSlider, {
  FULL_DAY,
  type TimeRange,
} from "./TimeRangeSlider";

/** 0 = Direct, 1 = 1 stop, 2 = 2+ stops. */
export type StopsBucket = 0 | 1 | 2;

export interface SliceTimes {
  depart: TimeRange;
  arrive: TimeRange;
}

export interface Filters {
  /** null = all buckets allowed. */
  stops: Set<StopsBucket> | null;
  /** null = all airlines. */
  airlines: Set<string> | null;
  outbound: SliceTimes;
  inbound: SliceTimes;
}

export const EMPTY_FILTERS: Filters = {
  stops: null,
  airlines: null,
  outbound: { depart: FULL_DAY, arrive: FULL_DAY },
  inbound: { depart: FULL_DAY, arrive: FULL_DAY },
};

const STOP_LABELS: Record<StopsBucket, string> = {
  0: "Direct",
  1: "1 stop",
  2: "2+ stops",
};

function stopsBucket(stops: number): StopsBucket {
  return Math.min(stops, 2) as StopsBucket;
}

function minutesOfDay(isoLocal: string): number {
  return Number(isoLocal.slice(11, 13)) * 60 + Number(isoLocal.slice(14, 16));
}

function inRange(v: number, [lo, hi]: TimeRange): boolean {
  return v >= lo && v <= hi;
}

function isFullDay([lo, hi]: TimeRange): boolean {
  return lo === 0 && hi === 1439;
}

export function offerCarriers(offer: FlightOffer): string[] {
  return [
    ...new Set(
      offer.slices.flatMap((slice) =>
        slice.segments.map((s) => s.carrierCode || s.carrierName),
      ),
    ),
  ];
}

export function applyFilters(
  offers: FlightOffer[],
  filters: Filters,
): FlightOffer[] {
  return offers.filter((offer) => {
    if (filters.stops) {
      const worst = stopsBucket(
        Math.max(...offer.slices.map((s) => s.stops)),
      );
      if (!filters.stops.has(worst)) return false;
    }
    if (filters.airlines) {
      if (!offerCarriers(offer).some((c) => filters.airlines!.has(c)))
        return false;
    }
    const out = offer.slices[0];
    if (out) {
      if (!inRange(minutesOfDay(out.departure), filters.outbound.depart))
        return false;
      if (!inRange(minutesOfDay(out.arrival), filters.outbound.arrive))
        return false;
    }
    const inb = offer.slices[1];
    if (inb) {
      if (!inRange(minutesOfDay(inb.departure), filters.inbound.depart))
        return false;
      if (!inRange(minutesOfDay(inb.arrival), filters.inbound.arrive))
        return false;
    }
    return true;
  });
}

function CheckSquare({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex size-4.5 items-center justify-center rounded border transition-colors ${
        checked
          ? "border-accent bg-accent text-white"
          : "border-white/30 bg-transparent"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 20 20" fill="none" className="size-3">
          <path
            d="M4 10.5l4 4 8-9"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

const pill = (active: boolean) =>
  `flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${
    active
      ? "border-accent/50 bg-accent/15 text-white"
      : "border-card-border bg-pill/80 text-slate-200"
  }`;

function CheckRow({
  checked,
  onClick,
  children,
}: {
  checked: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm text-slate-200 transition-colors hover:bg-white/5"
    >
      {children}
      <CheckSquare checked={checked} />
    </button>
  );
}

/** Stops / Airlines (with alliances) / Times filter pills. */
export default function FilterBar({
  offers,
  filters,
  onChange,
}: {
  /** Unfiltered offers — used to derive airline options. */
  offers: FlightOffer[];
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  const airlineInfo = new Map<string, string>();
  for (const offer of offers) {
    for (const slice of offer.slices) {
      for (const seg of slice.segments) {
        const code = seg.carrierCode || seg.carrierName;
        if (!airlineInfo.has(code)) airlineInfo.set(code, seg.carrierName);
      }
    }
  }
  const airlineOptions = [...airlineInfo.entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const presentAlliances = (
    Object.entries(ALLIANCES) as [Alliance, string[]][]
  ).filter(([, carriers]) => carriers.some((c) => airlineInfo.has(c)));

  const toggleStop = (bucket: StopsBucket) => {
    // null (all allowed) renders as all checked; a toggle then unchecks one.
    const next = new Set<StopsBucket>(filters.stops ?? [0, 1, 2]);
    if (next.has(bucket)) next.delete(bucket);
    else next.add(bucket);
    onChange({
      ...filters,
      stops: next.size === 0 || next.size === 3 ? null : next,
    });
  };

  const toggleAirline = (code: string) => {
    const all = [...airlineInfo.keys()];
    const next = new Set(filters.airlines ?? all);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange({
      ...filters,
      airlines: next.size === 0 || next.size >= all.length ? null : next,
    });
  };

  const toggleAlliance = (carriers: string[]) => {
    const members = carriers.filter((c) => airlineInfo.has(c));
    const current = filters.airlines ?? new Set(airlineInfo.keys());
    const allOn = members.every((c) => current.has(c));
    const next = new Set(current);
    for (const c of members) {
      if (allOn) next.delete(c);
      else next.add(c);
    }
    onChange({
      ...filters,
      airlines:
        next.size === 0 || next.size >= airlineInfo.size ? null : next,
    });
  };

  const timesActive =
    !isFullDay(filters.outbound.depart) ||
    !isFullDay(filters.outbound.arrive) ||
    !isFullDay(filters.inbound.depart) ||
    !isFullDay(filters.inbound.arrive);

  return (
    <div className="flex items-center gap-2.5">
      <Dropdown
        trigger={(open) => (
          <span className={pill(filters.stops !== null)}>
            Stops
            <Chevron open={open} />
          </span>
        )}
      >
        <div className="w-48">
          {([0, 1, 2] as StopsBucket[]).map((bucket) => (
            <CheckRow
              key={bucket}
              checked={filters.stops?.has(bucket) ?? true}
              onClick={() => toggleStop(bucket)}
            >
              <span>{STOP_LABELS[bucket]}</span>
            </CheckRow>
          ))}
        </div>
      </Dropdown>

      <Dropdown
        trigger={(open) => (
          <span className={pill(filters.airlines !== null)}>
            Airlines
            <Chevron open={open} />
          </span>
        )}
      >
        <div className="max-h-80 w-72 overflow-y-auto">
          {airlineOptions.map(([code, name]) => (
            <CheckRow
              key={code}
              checked={filters.airlines?.has(code) ?? true}
              onClick={() => toggleAirline(code)}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="shrink-0 scale-[0.6] origin-left">
                  <AirlineLogo carrierCode={code} carrierName={name} />
                </span>
                <span className="-ml-3 truncate">{name}</span>
              </span>
            </CheckRow>
          ))}
          {presentAlliances.length > 0 && (
            <>
              <div className="px-3.5 pt-3 pb-1 text-[11px] font-semibold tracking-widest text-muted">
                ALLIANCE
              </div>
              {presentAlliances.map(([alliance, carriers]) => {
                const members = carriers.filter((c) => airlineInfo.has(c));
                const current =
                  filters.airlines ?? new Set(airlineInfo.keys());
                const allOn = members.every((c) => current.has(c));
                return (
                  <CheckRow
                    key={alliance}
                    checked={allOn}
                    onClick={() => toggleAlliance(carriers)}
                  >
                    <span>{alliance}</span>
                  </CheckRow>
                );
              })}
            </>
          )}
        </div>
      </Dropdown>

      <Dropdown
        align="right"
        trigger={(open) => (
          <span className={pill(timesActive)}>
            Times
            <Chevron open={open} />
          </span>
        )}
      >
        <TimesPanel filters={filters} onChange={onChange} />
      </Dropdown>
    </div>
  );
}

function TimesPanel({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const [tab, setTab] = useState<"outbound" | "inbound">("outbound");

  const times = filters[tab];
  const setTimes = (next: SliceTimes) =>
    onChange({ ...filters, [tab]: next });

  return (
    <div className="w-80">
      <div className="flex items-center justify-between px-3.5 pt-1.5">
        <span className="text-sm font-semibold text-white">Times</span>
        <div className="flex rounded-full border border-card-border bg-pill/80 p-0.5 text-xs font-medium">
          {(["outbound", "inbound"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`cursor-pointer rounded-full px-3 py-1 capitalize transition-colors ${
                tab === t
                  ? "bg-white text-[#0a1122]"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {t === "outbound" ? "Outbound" : "Return"}
            </button>
          ))}
        </div>
      </div>
      <TimeRangeSlider
        label="Depart"
        icon={
          <svg viewBox="0 0 20 20" fill="none" className="size-4 text-slate-300">
            <path
              d="M2.5 15.5h15M3 11.5l13-4.5-2 5-11-.5zM12 4l2 2.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        }
        value={times.depart}
        onChange={(depart) => setTimes({ ...times, depart })}
      />
      <TimeRangeSlider
        label="Arrival"
        icon={
          <svg viewBox="0 0 20 20" fill="none" className="size-4 text-slate-300">
            <path
              d="M2.5 15.5h15M3 7l13 4.5-5.5.5L4 14zM14 4.5L15 8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        }
        value={times.arrive}
        onChange={(arrive) => setTimes({ ...times, arrive })}
      />
    </div>
  );
}
