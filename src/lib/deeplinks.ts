import type { SearchParams } from "./types";

/** Booking/deep-link URL builders. All open in a new tab from the Book pill. */

export function googleFlightsLink(p: SearchParams): string {
  const q =
    p.tripType === "round_trip" && p.returnDate
      ? `Flights from ${p.origin} to ${p.destination} on ${p.departDate} through ${p.returnDate}`
      : `One way flights from ${p.origin} to ${p.destination} on ${p.departDate}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=USD&hl=en`;
}

export function skiplaggedLink(p: SearchParams): string {
  const base = `https://skiplagged.com/flights/${p.origin}/${p.destination}/${p.departDate}`;
  return p.tripType === "round_trip" && p.returnDate
    ? `${base}/${p.returnDate}`
    : base;
}

export function aviasalesLink(ticketLink: string | undefined): string {
  // Travelpayouts tickets carry a relative `link` into aviasales search.
  return ticketLink
    ? `https://www.aviasales.com${ticketLink}`
    : "https://www.aviasales.com";
}

export function frontierLink(p: SearchParams): string {
  const sp = new URLSearchParams({
    o1: p.origin,
    d1: p.destination,
    dd1: p.departDate,
    ADT: String(p.adults),
    mon: "true",
    promo: "",
  });
  if (p.tripType === "round_trip" && p.returnDate) sp.set("dd2", p.returnDate);
  return `https://booking.flyfrontier.com/Flight/InternalSelect?${sp.toString()}`;
}

export function tripComLink(p: SearchParams): string {
  const type = p.tripType === "round_trip" ? "rt" : "ow";
  const sp = new URLSearchParams({
    dcity: p.origin.toLowerCase(),
    acity: p.destination.toLowerCase(),
    ddate: p.departDate,
    triptype: type,
    class: p.cabin === "economy" ? "y" : p.cabin === "business" ? "c" : "y",
    quantity: String(p.adults),
    locale: "en-US",
    curr: "USD",
  });
  if (type === "rt" && p.returnDate) sp.set("rdate", p.returnDate);
  return `https://us.trip.com/flights/showfarefirst?${sp.toString()}`;
}
