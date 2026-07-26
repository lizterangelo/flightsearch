"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  nearestAirportSelection,
  type PlaceSelection,
} from "@/hooks/useAirportSearch";
import { buildFlightsPath } from "@/lib/urls";
import type {
  Cabin,
  PassengerCounts,
  SearchQuery,
  TripType,
} from "@/lib/types";
import AirportField from "./AirportField";
import DatePickerModal, { type FlexDays } from "./DatePickerModal";
import OptionsRow from "./OptionsRow";

const LAST_ORIGIN_KEY = "soar.lastOrigin";

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Rebuild field selections from a parsed URL query (results page). */
export function selectionsFromQuery(q: SearchQuery): {
  origin: PlaceSelection;
  destination: PlaceSelection;
} {
  const label = (iata: string, anyKey?: string) => {
    if (anyKey) {
      const city = anyKey.split("-").slice(0, -1).join(" ");
      const pretty = city.replace(/\b\w/g, (c) => c.toUpperCase());
      return `${pretty || iata} (any)`;
    }
    return iata;
  };
  return {
    origin: {
      iata: q.origin,
      cityKey: q.originAny,
      label: label(q.origin, q.originAny),
    },
    destination: {
      iata: q.destination,
      cityKey: q.destinationAny,
      label: label(q.destination, q.destinationAny),
    },
  };
}

/**
 * The pill search bar. `compact` renders the results-page variant.
 * Picking a destination auto-opens the date modal (flysoar behavior).
 */
export default function SearchBar({
  initial,
  initialSelections,
  compact = false,
}: {
  initial?: Partial<SearchQuery>;
  initialSelections?: { origin: PlaceSelection; destination: PlaceSelection };
  compact?: boolean;
}) {
  const router = useRouter();

  const [origin, setOrigin] = useState<PlaceSelection | null>(
    initialSelections?.origin ?? null,
  );
  const [destination, setDestination] = useState<PlaceSelection | null>(
    initialSelections?.destination ?? null,
  );
  const [departDate, setDepartDate] = useState<string | null>(
    initial?.departDate ?? null,
  );
  const [returnDate, setReturnDate] = useState<string | null>(
    initial?.returnDate ?? null,
  );
  const [tripType, setTripType] = useState<TripType>(
    initial?.tripType ?? "round_trip",
  );
  const [passengers, setPassengers] = useState<PassengerCounts>(
    initial?.passengers ?? { adults: 1, childAges: [], infants: 0 },
  );
  const [cabin, setCabin] = useState<Cabin>(initial?.cabin ?? "economy");
  const [flexDays, setFlexDays] = useState<FlexDays>(initial?.flexDays ?? 0);
  const [dateModalOpen, setDateModalOpen] = useState(false);

  // Default origin: last used, else geolocate on mount (like flysoar's
  // pre-filled "From"). Async so hydration renders the same empty field the
  // server did; never blocks typing.
  useEffect(() => {
    if (origin) return;
    let cancelled = false;
    (async () => {
      try {
        const saved = localStorage.getItem(LAST_ORIGIN_KEY);
        if (saved) {
          const sel = JSON.parse(saved) as PlaceSelection;
          if (!cancelled) setOrigin((prev) => prev ?? sel);
          return;
        }
      } catch {
        // Bad JSON — fall through to geolocation.
      }
      const sel = await nearestAirportSelection();
      if (sel && !cancelled) setOrigin((prev) => prev ?? sel);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valid =
    origin &&
    destination &&
    origin.iata !== destination.iata &&
    departDate &&
    (tripType === "one_way" || returnDate);

  const navigate = (overrides?: {
    departDate?: string;
    returnDate?: string | null;
    tripType?: TripType;
    flexDays?: FlexDays;
  }) => {
    const dep = overrides?.departDate ?? departDate;
    const retRaw =
      overrides?.returnDate !== undefined ? overrides.returnDate : returnDate;
    const trip = overrides?.tripType ?? tripType;
    const flex = overrides?.flexDays ?? flexDays;
    if (!origin || !destination || !dep) return;
    if (trip === "round_trip" && !retRaw) return;

    try {
      localStorage.setItem(LAST_ORIGIN_KEY, JSON.stringify(origin));
    } catch {
      // Storage full/blocked — nonessential.
    }
    const query: SearchQuery = {
      origin: origin.iata,
      destination: destination.iata,
      originAny: origin.cityKey,
      destinationAny: destination.cityKey,
      departDate: dep,
      returnDate: trip === "round_trip" ? (retRaw ?? undefined) : undefined,
      tripType: trip,
      passengers,
      cabin,
      flexDays: flex,
    };
    router.push(buildFlightsPath(query));
  };

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const divider = <div className="h-10 w-px shrink-0 bg-white/10" />;

  const fromIcon = (
    <svg viewBox="0 0 20 20" fill="none" className="size-5">
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
  const toIcon = (
    <svg viewBox="0 0 20 20" fill="none" className="size-5">
      <path
        d="M10 17.5s5.5-4.8 5.5-9A5.5 5.5 0 0010 3a5.5 5.5 0 00-5.5 5.5c0 4.2 5.5 9 5.5 9z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="10" cy="8.5" r="1.9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );

  return (
    <div className={compact ? "w-full" : "w-full max-w-5xl"}>
      {/* Mobile: the stacked search card (their under-640px layout). */}
      {!compact && (
        <div className="relative z-20 animate-[productSearchIn_.55s_cubic-bezier(.22,1,.36,1)_both] sm:hidden">
          <div className="relative rounded-[28px] border border-white/12 bg-[#0d1016] p-1 shadow-xl shadow-black/40">
            <div className="rounded-3xl bg-[#08080c]">
            <AirportField
              label="From"
              variant="row"
              rowIcon={fromIcon}
              value={origin}
              onChange={setOrigin}
              placeholder="City or airport"
            />
            <div className="mx-4 h-px bg-white/8" />
            <AirportField
              label="To"
              variant="row"
              rowIcon={toIcon}
              value={destination}
              onChange={(sel) => {
                setDestination(sel);
                setDateModalOpen(true);
              }}
              placeholder="City or airport"
            />
            <button
              type="button"
              onClick={swap}
              aria-label="Swap origin and destination"
              className="absolute top-[56px] right-5 flex size-11 cursor-pointer items-center justify-center rounded-full border border-card-border bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <svg viewBox="0 0 20 20" fill="none" className="size-4 rotate-90">
                <path
                  d="M4 6.5h11m0 0l-3-3m3 3l-3 3M16 13.5H5m0 0l3-3m-3 3l3 3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="mx-4 h-px bg-white/8" />
            <button
              type="button"
              onClick={() => setDateModalOpen(true)}
              className="flex w-full cursor-pointer items-center gap-3.5 px-4 py-4 text-left"
            >
              <svg viewBox="0 0 20 20" fill="none" className="size-5 shrink-0 text-slate-300">
                <rect x="3" y="4.5" width="14" height="12.5" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 8.5h14M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M6 11.5h2M6 14h2M9.5 11.5h2M9.5 14h2M13 11.5h1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              {departDate ? (
                <span className="flex items-center gap-2 text-lg font-medium text-white">
                  {shortDate(departDate)}
                  {tripType === "round_trip" && (
                    <>
                      <svg viewBox="0 0 20 20" fill="none" className="size-4 shrink-0 text-muted">
                        <path
                          d="M3 10h13m0 0l-4-4m4 4l-4 4"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className={returnDate ? "" : "text-muted/70"}>
                        {returnDate ? shortDate(returnDate) : "Add return"}
                      </span>
                    </>
                  )}
                </span>
              ) : (
                <span className="text-lg font-medium text-muted/70">
                  Add dates
                </span>
              )}
            </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate()}
            disabled={!valid}
            className="btn-cta mt-3 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-full py-3.5 text-lg font-semibold text-white shadow-lg shadow-black/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-5">
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
      )}

      <div
        // relative z-20: sibling stacking contexts (options row) would
        // otherwise paint over the airport dropdowns.
        // Their two-layer glass: a 4px near-black rim (search-card) around a
        // solid #08080c field row (search-row), Search button inside the rim.
        className={`relative z-20 w-full items-center rounded-full border border-white/12 bg-[#0d1016] p-1 shadow-xl shadow-black/40 ${compact ? "flex" : "hidden animate-[productSearchIn_.55s_cubic-bezier(.22,1,.36,1)_both] sm:flex"}`}
      >
        <div className="flex min-w-0 flex-1 items-center rounded-full bg-[#08080c]">
          <AirportField
            label="From"
            value={origin}
            onChange={setOrigin}
            placeholder="City or airport"
          />
          <button
            type="button"
            onClick={swap}
            aria-label="Swap origin and destination"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-card-border bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-4">
              <path
                d="M4 6.5h11m0 0l-3-3m3 3l-3 3M16 13.5H5m0 0l3-3m-3 3l3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <AirportField
            label="To"
            value={destination}
            onChange={(sel) => {
              setDestination(sel);
              // flysoar: picking the destination opens the date picker.
              setDateModalOpen(true);
            }}
            placeholder="City or airport"
          />
          {divider}
          <button
            type="button"
            onClick={() => setDateModalOpen(true)}
            className="shrink-0 cursor-pointer px-6 py-3.5 text-left"
          >
            <div className="text-xs font-medium text-muted">Dates</div>
            <div className="flex items-center gap-2 whitespace-nowrap text-lg font-semibold">
              {departDate ? (
                <>
                  <span className="text-white">{shortDate(departDate)}</span>
                  <svg viewBox="0 0 20 20" fill="none" className="size-4 shrink-0 text-muted">
                    <path
                      d="M3 10h13m0 0l-4-4m4 4l-4 4"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {tripType === "round_trip" ? (
                    <span className={returnDate ? "text-white" : "text-muted/70"}>
                      {returnDate ? shortDate(returnDate) : "Add return"}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-muted/70">Add dates</span>
              )}
            </div>
          </button>
        </div>
        <button
          type="button"
          onClick={() => navigate()}
          disabled={!valid}
          aria-label="Search flights"
          className={`btn-cta ml-1 flex shrink-0 cursor-pointer items-center gap-2.5 rounded-full font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${
            compact ? "px-6 py-2.5 text-[15px]" : "px-8 py-3.5 text-lg"
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

      {!compact && (
        <div className="relative z-10 mt-4 flex animate-[productSearchActionsIn_.5s_.1s_cubic-bezier(.22,1,.36,1)_both] justify-center">
          <OptionsRow
            tripType={tripType}
            passengers={passengers}
            cabin={cabin}
            onTripTypeChange={(t) => {
              setTripType(t);
              if (t === "one_way") setReturnDate(null);
            }}
            onPassengersChange={setPassengers}
            onCabinChange={setCabin}
          />
        </div>
      )}

      <DatePickerModal
        open={dateModalOpen}
        origin={origin?.iata ?? null}
        destination={destination?.iata ?? null}
        cabin={cabin}
        initialDepart={departDate}
        initialReturn={returnDate}
        initialTripType={tripType}
        initialFlex={flexDays}
        onClose={() => setDateModalOpen(false)}
        onApply={({ departDate: dep, returnDate: ret, tripType: trip, flexDays: flex }) => {
          setDepartDate(dep);
          setReturnDate(ret);
          setTripType(trip);
          setFlexDays(flex);
          setDateModalOpen(false);
          // flysoar: Apply runs the search immediately when the form is complete.
          if (origin && destination && origin.iata !== destination.iata) {
            navigate({ departDate: dep, returnDate: ret, tripType: trip, flexDays: flex });
          }
        }}
      />
    </div>
  );
}
