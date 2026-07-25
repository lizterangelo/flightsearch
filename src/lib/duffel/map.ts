import type { Offer, OfferSliceSegment } from "@duffel/api/types";
import { toUSD } from "../currency";
import type {
  Cabin,
  FlightOffer,
  OfferConditions,
  OfferSegment,
  OfferSlice,
  SegmentAmenities,
} from "../types";

/**
 * Duffel Offer → FlightOffer. Pure mapping, defensive against the fields
 * Duffel documents as nullable/omittable; returns null when an offer is too
 * malformed to render.
 */

/** How much cheaper we always are. Display-only; payments use exact totals. */
export function undercutUSD(): number {
  const n = Number(process.env.UNDERCUT_USD ?? 1);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

/** "PT2H30M" → minutes; tolerates missing parts. */
export function isoDurationMinutes(iso: string | null | undefined): number {
  if (!iso) return 0;
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return 0;
  return (
    Number(m[1] ?? 0) * 24 * 60 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  );
}

/** Duffel departing_at/arriving_at are local ISO without offset. */
function wall(t: string): string {
  return t.slice(0, 16);
}

/** Days between two local wall dates ("...T.." strings), calendar-wise. */
function calendarDayDiff(departure: string, arrival: string): number {
  const d = new Date(`${departure.slice(0, 10)}T00:00:00`);
  const a = new Date(`${arrival.slice(0, 10)}T00:00:00`);
  return Math.max(0, Math.round((a.getTime() - d.getTime()) / 86400000));
}

type DuffelConditions = {
  refund_before_departure?: {
    allowed: boolean;
    penalty_amount: string | null;
    penalty_currency: string | null;
  } | null;
  change_before_departure?: {
    allowed: boolean;
    penalty_amount: string | null;
    penalty_currency: string | null;
  } | null;
};

function mapConditions(c: DuffelConditions | null | undefined): OfferConditions {
  const refund = c?.refund_before_departure ?? null;
  const change = c?.change_before_departure ?? null;
  return {
    refundable: refund ? refund.allowed : null,
    refundPenaltyAmount: refund?.penalty_amount ?? null,
    changeable: change ? change.allowed : null,
    changePenaltyAmount: change?.penalty_amount ?? null,
    penaltyCurrency:
      refund?.penalty_currency ?? change?.penalty_currency ?? null,
  };
}

function mapAmenities(seg: OfferSliceSegment): SegmentAmenities | null {
  const cabin = seg.passengers?.[0]?.cabin;
  const amenities = cabin?.amenities;
  if (!amenities) return null;
  const { wifi, power, seat } = amenities;
  if (!wifi && !power && !seat) return null;
  return {
    wifi: wifi ? { available: wifi.available, cost: wifi.cost } : null,
    power: power ? { available: power.available } : null,
    seat: seat ? { pitch: seat.pitch, type: seat.type } : null,
    source: "duffel",
  };
}

function mapSegment(seg: OfferSliceSegment): OfferSegment | null {
  const marketing = seg.marketing_carrier ?? seg.operating_carrier;
  if (!marketing || !seg.origin?.iata_code || !seg.destination?.iata_code) {
    return null;
  }
  const operating = seg.operating_carrier;
  const isCodeshare =
    Boolean(operating?.name) &&
    operating?.name !== marketing.name &&
    operating?.iata_code !== marketing.iata_code;

  const pax = seg.passengers?.[0];
  const bags = pax?.baggages ?? [];
  const flightNumber = seg.marketing_carrier_flight_number
    ? `${marketing.iata_code ?? ""} ${seg.marketing_carrier_flight_number}`.trim()
    : "";

  return {
    id: seg.id,
    carrierCode: marketing.iata_code ?? "",
    carrierName: marketing.name ?? marketing.iata_code ?? "Unknown",
    carrierLogoUrl:
      (marketing as { logo_symbol_url?: string | null }).logo_symbol_url ??
      null,
    operatingCarrierName: isCodeshare ? (operating?.name ?? null) : null,
    flightNumber,
    origin: seg.origin.iata_code,
    originName: seg.origin.name ?? seg.origin.iata_code,
    originTerminal: seg.origin_terminal ?? null,
    destination: seg.destination.iata_code,
    destinationName: seg.destination.name ?? seg.destination.iata_code,
    destinationTerminal: seg.destination_terminal ?? null,
    departure: wall(seg.departing_at),
    arrival: wall(seg.arriving_at),
    durationMinutes: isoDurationMinutes(seg.duration),
    aircraftName: seg.aircraft?.name ?? null,
    fareBasisCode: pax?.fare_basis_code ?? null,
    fareBrand: null, // slice-level on Duffel; filled by caller
    cabin: (pax?.cabin_class ?? "economy") as Cabin,
    cabinMarketingName: pax?.cabin_class_marketing_name ?? null,
    baggageCarryOn: bags
      .filter((b) => b.type === "carry_on")
      .reduce((n, b) => n + b.quantity, 0),
    baggageChecked: bags
      .filter((b) => b.type === "checked")
      .reduce((n, b) => n + b.quantity, 0),
    amenities: mapAmenities(seg),
  };
}

type DuffelSlice = Offer["slices"][number];

function mapSlice(slice: DuffelSlice): OfferSlice | null {
  const segments: OfferSegment[] = [];
  for (const seg of slice.segments) {
    const mapped = mapSegment(seg);
    if (!mapped) return null;
    mapped.fareBrand = slice.fare_brand_name ?? null;
    segments.push(mapped);
  }
  if (segments.length === 0) return null;

  const first = segments[0];
  const last = segments[segments.length - 1];
  const sliceCity = (
    place: { city_name?: string | null; city?: { name?: string } | null } | null | undefined,
    fallback: string,
  ) => place?.city_name ?? place?.city?.name ?? fallback;

  const sliceConditions = (
    slice as unknown as {
      conditions?: DuffelConditions & {
        advance_seat_selection?: boolean | null;
        priority_boarding?: boolean | null;
      };
    }
  ).conditions;

  return {
    origin: first.origin,
    originName: slice.origin?.name ?? first.originName,
    originCity: sliceCity(
      slice.origin as { city_name?: string | null },
      first.originName,
    ),
    destination: last.destination,
    destinationName: slice.destination?.name ?? last.destinationName,
    destinationCity: sliceCity(
      slice.destination as { city_name?: string | null },
      last.destinationName,
    ),
    departure: first.departure,
    arrival: last.arrival,
    durationMinutes:
      isoDurationMinutes(slice.duration) ||
      segments.reduce((sum, s) => sum + s.durationMinutes, 0),
    stops: segments.length - 1,
    stopAirports: segments.slice(0, -1).map((s) => s.destination),
    overnightDays: calendarDayDiff(first.departure, last.arrival),
    fareBrand: slice.fare_brand_name ?? null,
    cabin: first.cabin,
    ngsShelf:
      (slice as unknown as { ngs_shelf?: number | null }).ngs_shelf ?? null,
    comparisonKey:
      (slice as unknown as { comparison_key?: string }).comparison_key ?? "",
    conditions: {
      ...mapConditions(sliceConditions),
      advanceSeatSelection: sliceConditions?.advance_seat_selection ?? null,
      priorityBoarding: sliceConditions?.priority_boarding ?? null,
    },
    segments,
  };
}

/** Structural fallback when Duffel omits comparison keys. */
function structuralKey(slices: OfferSlice[]): string {
  return slices
    .map((s) =>
      s.segments
        .map((seg) => `${seg.carrierCode}${seg.flightNumber}@${seg.departure}`)
        .join(","),
    )
    .join("|");
}

export function mapDuffelOffer(
  offer: Omit<Offer, "available_services">,
  requestId: string,
): FlightOffer | null {
  const slices: OfferSlice[] = [];
  for (const slice of offer.slices) {
    const mapped = mapSlice(slice);
    if (!mapped) return null;
    slices.push(mapped);
  }
  if (slices.length === 0) return null;

  const total = Number(offer.total_amount);
  if (!Number.isFinite(total) || total <= 0) return null;
  const currency = offer.total_currency ?? "USD";
  const totalUSD = toUSD(total, currency);
  const undercut = undercutUSD();

  const comparisonKeys = slices.map((s) => s.comparisonKey);
  const dedupeKey = comparisonKeys.every(Boolean)
    ? comparisonKeys.join("|")
    : structuralKey(slices);

  const emissions = Number(offer.total_emissions_kg);

  return {
    id: offer.id,
    requestId,
    dedupeKey,
    totalAmount: offer.total_amount,
    totalCurrency: currency,
    baseAmount: offer.base_amount ?? null,
    taxAmount: offer.tax_amount ?? null,
    totalUSD,
    // Never undercut into or past zero on tiny fares.
    displayUSD: totalUSD > undercut * 5 ? totalUSD - undercut : totalUSD,
    expiresAt: offer.expires_at,
    liveMode: offer.live_mode,
    passengerIdentityDocumentsRequired:
      offer.passenger_identity_documents_required,
    totalEmissionsKg: Number.isFinite(emissions) ? emissions : null,
    conditions: mapConditions(
      offer.conditions as unknown as DuffelConditions,
    ),
    ownerCode: offer.owner?.iata_code ?? "",
    ownerName: offer.owner?.name ?? "Unknown",
    ownerLogoUrl:
      (offer.owner as { logo_symbol_url?: string | null } | undefined)
        ?.logo_symbol_url ?? null,
    slices,
  };
}
