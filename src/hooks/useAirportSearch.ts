"use client";

import { useMemo } from "react";
import airportsData from "@/data/airports.json";

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  size: "large" | "medium";
}

const airports = airportsData as Airport[];

export function airportByIata(iata: string): Airport | undefined {
  const code = iata.toUpperCase();
  return airports.find((a) => a.iata === code);
}

function score(airport: Airport, q: string): number {
  const query = q.toLowerCase();
  const iata = airport.iata.toLowerCase();
  const city = airport.city?.toLowerCase() ?? "";
  const name = airport.name.toLowerCase();

  let s = 0;
  if (iata === query) s = 100;
  else if (iata.startsWith(query)) s = 80;
  else if (city.startsWith(query)) s = 60;
  else if (name.startsWith(query)) s = 50;
  else if (city.includes(query)) s = 45;
  else if (name.includes(query)) s = 40;
  else return 0;

  if (airport.size === "large") s += 10;
  if (airport.country === "US") s += 5; // USA tuning
  return s;
}

export function useAirportSearch(query: string, limit = 8): Airport[] {
  return useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    return airports
      .map((a) => ({ a, s: score(a, q) }))
      .filter(({ s }) => s > 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, limit)
      .map(({ a }) => a);
  }, [query, limit]);
}
