"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addDaysYmd as addDays, todayLocalYmd as todayYmd } from "@/lib/dates";
import type { Cabin, SearchParams, TripType } from "@/lib/types";
import { toQueryString } from "@/lib/types";
import AirportField from "./AirportField";
import DateField from "./DateField";
import OptionsRow from "./OptionsRow";

/**
 * The pill search bar. `compact` renders the results-page variant (smaller,
 * with a cabin cell instead of the options row underneath).
 */
export default function SearchBar({
  initial,
  compact = false,
}: {
  initial?: Partial<SearchParams>;
  compact?: boolean;
}) {
  const router = useRouter();
  const today = todayYmd();

  const [origin, setOrigin] = useState(initial?.origin ?? "");
  const [destination, setDestination] = useState(initial?.destination ?? "");
  const [departDate, setDepartDate] = useState(
    initial?.departDate ?? addDays(today, 7),
  );
  const [returnDate, setReturnDate] = useState(
    initial?.returnDate ?? addDays(today, 14),
  );
  const [tripType, setTripType] = useState<TripType>(
    initial?.tripType ?? "round_trip",
  );
  const [adults, setAdults] = useState(initial?.adults ?? 1);
  const [cabin, setCabin] = useState<Cabin>(initial?.cabin ?? "economy");

  const valid =
    /^[A-Z]{3}$/.test(origin) &&
    /^[A-Z]{3}$/.test(destination) &&
    origin !== destination &&
    Boolean(departDate) &&
    (tripType === "one_way" || Boolean(returnDate));

  const submit = () => {
    if (!valid) return;
    const params: SearchParams = {
      origin,
      destination,
      departDate,
      returnDate: tripType === "round_trip" ? returnDate : undefined,
      tripType,
      adults,
      cabin,
      currency: "USD",
    };
    router.push(`/results?${toQueryString(params)}`);
  };

  const divider = <div className="h-10 w-px shrink-0 bg-white/10" />;

  return (
    <div className={compact ? "w-full" : "w-full max-w-5xl"}>
      <div
        className={`flex w-full items-center rounded-full border border-card-border bg-pill/90 shadow-xl shadow-black/30 backdrop-blur-md ${compact ? "pr-2" : "pr-2.5"}`}
      >
        <AirportField
          label="From"
          value={origin}
          onChange={setOrigin}
          placeholder="City or airport"
        />
        {divider}
        <AirportField
          label="To"
          value={destination}
          onChange={setDestination}
          placeholder="City or airport"
        />
        {divider}
        <div className="shrink-0">
          <DateField
            departDate={departDate}
            returnDate={returnDate}
            roundTrip={tripType === "round_trip"}
            onDepartChange={(v) => {
              setDepartDate(v);
              if (returnDate && returnDate < v) setReturnDate(v);
            }}
            onReturnChange={setReturnDate}
            today={today}
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!valid}
          className={`flex shrink-0 cursor-pointer items-center gap-2.5 rounded-full bg-accent font-semibold text-white shadow-[0_0_24px_rgba(46,107,255,0.45)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${
            compact ? "px-6 py-3 text-[15px]" : "px-8 py-4 text-lg"
          }`}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className={compact ? "size-4.5" : "size-5"}
          >
            <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M13.5 13.5L17 17"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          Search
        </button>
      </div>

      <div className={`flex justify-center ${compact ? "mt-2" : "mt-4"}`}>
        <OptionsRow
          tripType={tripType}
          adults={adults}
          cabin={cabin}
          onTripTypeChange={(t) => {
            setTripType(t);
            if (t === "round_trip" && !returnDate)
              setReturnDate(addDays(departDate || today, 7));
          }}
          onAdultsChange={setAdults}
          onCabinChange={setCabin}
        />
      </div>
    </div>
  );
}
