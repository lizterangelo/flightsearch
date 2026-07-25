"use client";

import { useEffect, useRef, useState } from "react";
import {
  selectionFromPlace,
  usePlacesSearch,
  type Place,
  type PlaceSelection,
} from "@/hooks/useAirportSearch";

function CityIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4 text-slate-300">
      <path
        d="M10 17s5.5-4.6 5.5-8.8A5.5 5.5 0 0010 2.5a5.5 5.5 0 00-5.5 5.7C4.5 12.4 10 17 10 17z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="10" cy="8.2" r="1.8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function PlaneIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4 text-slate-400">
      <path
        d="M2.5 13l15-5.5m0 0l-5.5 7m5.5-7l-7.5-1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlaceRow({ place }: { place: Place }) {
  if (place.kind === "city") {
    return (
      <span className="flex min-w-0 items-center gap-3">
        <span className="shrink-0"><CityIcon /></span>
        <span className="min-w-0">
          <span className="block truncate text-sm">
            <b className="text-accent-bright">{place.name}</b>{" "}
            <span className="text-slate-300">(Any airport)</span>
          </span>
          <span className="block truncate text-xs text-muted">
            {place.country}
          </span>
        </span>
      </span>
    );
  }
  if (place.kind === "nearby") {
    return (
      <span className="flex min-w-0 items-center gap-3">
        <span className="shrink-0"><PlaneIcon /></span>
        <span className="min-w-0">
          <span className="block truncate text-sm text-white">
            {place.name} <span className="text-muted">({place.iata})</span>
          </span>
          <span className="block truncate text-xs text-muted">
            {place.distanceMiles} miles from <b>{place.fromCity}</b>,{" "}
            {place.country}
          </span>
        </span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="shrink-0"><PlaneIcon /></span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-white">
          {place.city ? (
            <>
              <b>{place.city}</b> {place.name.replace(place.city, "").trim()}
            </>
          ) : (
            place.name
          )}{" "}
          <span className="text-muted">({place.iata})</span>
        </span>
        <span className="block truncate text-xs text-muted">{place.country}</span>
      </span>
    </span>
  );
}

/**
 * From/To field: shows the picked place ("Tokyo (any)" / "Cebu (CEB)") and
 * opens a places-autocomplete popover while typing (metros, airports,
 * nearby suggestions with distance).
 */
export default function AirportField({
  label,
  value,
  onChange,
  placeholder,
  autoFocusOnMount = false,
}: {
  label: string;
  value: PlaceSelection | null;
  onChange: (selection: PlaceSelection) => void;
  placeholder: string;
  autoFocusOnMount?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const places = usePlacesSearch(query);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusOnMount) {
      setEditing(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setEditing(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [editing]);

  const pick = (place: Place) => {
    onChange(selectionFromPlace(place));
    setEditing(false);
    setQuery("");
  };

  return (
    <div className="relative min-w-0 flex-1" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setEditing(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={`w-full cursor-text px-6 py-3.5 text-left ${editing ? "hidden" : ""}`}
      >
        <div className="text-xs font-medium text-muted">{label}</div>
        <div
          className={`truncate text-lg font-semibold ${value ? "text-white" : "text-muted/70"}`}
        >
          {value?.label || placeholder}
        </div>
      </button>

      {editing && (
        <div className="px-6 py-3.5">
          <div className="text-xs font-medium text-muted">{label}</div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, places.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter" && places[highlight]) {
                e.preventDefault();
                pick(places[highlight]);
              } else if (e.key === "Escape") {
                setEditing(false);
              }
            }}
            placeholder={placeholder}
            className="w-full bg-transparent text-lg font-semibold text-white outline-none placeholder:text-muted/70"
          />
        </div>
      )}

      {editing && places.length > 0 && (
        <div className="absolute top-full left-2 z-50 mt-1 w-96 overflow-hidden rounded-2xl border border-card-border bg-[#0b1428]/95 py-1 shadow-2xl shadow-black/50 backdrop-blur-xl">
          {places.map((place, i) => (
            <button
              key={place.kind === "city" ? `city-${place.key}` : place.iata}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(place)}
              className={`flex w-full items-center px-4 py-2.5 text-left ${
                i === highlight ? "bg-white/8" : ""
              } ${place.kind !== "city" ? "pl-7" : ""}`}
            >
              <PlaceRow place={place} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
