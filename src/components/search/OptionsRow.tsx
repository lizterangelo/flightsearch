"use client";

import type { Cabin, PassengerCounts, TripType } from "@/lib/types";
import Dropdown, { Chevron, MenuItem } from "./Dropdown";
import PassengerPicker from "./PassengerPicker";

const CABIN_LABELS: Record<Cabin, string> = {
  economy: "Economy",
  premium_economy: "Premium Economy",
  business: "Business",
  first: "First",
};

function Check() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4 text-accent-bright">
      <path
        d="M4 10.5l4 4 8-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The secondary pill under the hero search bar: trip type / pax / cabin. */
export default function OptionsRow({
  tripType,
  passengers,
  cabin,
  onTripTypeChange,
  onPassengersChange,
  onCabinChange,
}: {
  tripType: TripType;
  passengers: PassengerCounts;
  cabin: Cabin;
  onTripTypeChange: (v: TripType) => void;
  onPassengersChange: (v: PassengerCounts) => void;
  onCabinChange: (v: Cabin) => void;
}) {
  const item =
    "flex items-center gap-2 px-5 py-3 text-[15px] font-medium text-slate-200";

  return (
    <div className="flex items-center divide-x divide-white/10 rounded-full bg-pill/80 backdrop-blur-md">
      <Dropdown
        trigger={(open) => (
          <span className={item} aria-label="Trip type">
            <svg viewBox="0 0 20 20" fill="none" className="size-4.5 text-slate-300">
              <path
                d="M4 6.5h11m0 0l-3-3m3 3l-3 3M16 13.5H5m0 0l3-3m-3 3l3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {tripType === "round_trip" ? "Round trip" : "One way"}
            <Chevron open={open} />
          </span>
        )}
      >
        {(close) => (
          <>
            {(["round_trip", "one_way"] as TripType[]).map((t) => (
              <MenuItem
                key={t}
                selected={tripType === t}
                onClick={() => {
                  onTripTypeChange(t);
                  close();
                }}
              >
                <span>{t === "round_trip" ? "Round trip" : "One way"}</span>
                {tripType === t && <Check />}
              </MenuItem>
            ))}
          </>
        )}
      </Dropdown>

      <PassengerPicker value={passengers} onChange={onPassengersChange} />

      <Dropdown
        trigger={(open) => (
          <span className={item} aria-label="Cabin">
            <svg viewBox="0 0 20 20" fill="none" className="size-4.5 text-slate-300">
              <path
                d="M4.5 12V7a2 2 0 012-2h7a2 2 0 012 2v5M3 15.5h14a1 1 0 001-1V13a1 1 0 00-1-1H3a1 1 0 00-1 1v1.5a1 1 0 001 1z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {CABIN_LABELS[cabin]}
            <Chevron open={open} />
          </span>
        )}
      >
        {(close) => (
          <>
            {(Object.keys(CABIN_LABELS) as Cabin[]).map((c) => (
              <MenuItem
                key={c}
                selected={cabin === c}
                onClick={() => {
                  onCabinChange(c);
                  close();
                }}
              >
                <span>{CABIN_LABELS[c]}</span>
                {cabin === c && <Check />}
              </MenuItem>
            ))}
          </>
        )}
      </Dropdown>
    </div>
  );
}
