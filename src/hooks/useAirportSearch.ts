"use client";

import { useEffect, useRef, useState } from "react";

/** Mirror of the /api/places result shapes (see src/lib/airports.ts). */
export interface PlaceCity {
  kind: "city";
  key: string;
  name: string;
  country: string;
  airportCount: number;
  primary: string;
}
export interface PlaceAirport {
  kind: "airport";
  iata: string;
  name: string;
  city: string;
  country: string;
  isHub: boolean;
}
export interface PlaceNearby extends Omit<PlaceAirport, "kind"> {
  kind: "nearby";
  distanceMiles: number;
  fromCity: string;
}
export type Place = PlaceCity | PlaceAirport | PlaceNearby;

/** What an airport field holds once the user picks an entry. */
export interface PlaceSelection {
  /** Representative IATA (the metro's first hub for city picks). */
  iata: string;
  /** Set when the pick was a metro "Any airport" entry. */
  cityKey?: string;
  /** Display label, e.g. "Tokyo (any)" or "Cebu (CEB)". */
  label: string;
}

export function selectionFromPlace(place: Place): PlaceSelection {
  if (place.kind === "city") {
    return {
      iata: place.primary,
      cityKey: place.key,
      label: `${place.name} (any)`,
    };
  }
  return {
    iata: place.iata,
    label: `${place.city || place.name} (${place.iata})`,
  };
}

/** Debounced autocomplete against /api/places. */
export function usePlacesSearch(query: string): Place[] {
  const [places, setPlaces] = useState<Place[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setPlaces([]);
      return;
    }
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { places?: Place[] };
        if (!controller.signal.aborted && Array.isArray(body.places)) {
          setPlaces(body.places);
        }
      } catch {
        // Aborted or offline — keep the previous list.
      }
    }, 150);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  return places;
}

/** Reverse-geocode the browser location to the nearest large airport. */
export async function nearestAirportSelection(): Promise<PlaceSelection | null> {
  if (!("geolocation" in navigator)) return null;
  const position = await new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { maximumAge: 600000, timeout: 5000 },
    );
  });
  if (!position) return null;
  try {
    const res = await fetch(
      `/api/places?lat=${position.coords.latitude}&lon=${position.coords.longitude}`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      airport: { iata: string; city: string; name: string } | null;
    };
    if (!body.airport) return null;
    return {
      iata: body.airport.iata,
      label: `${body.airport.city || body.airport.name} (${body.airport.iata})`,
    };
  } catch {
    return null;
  }
}
