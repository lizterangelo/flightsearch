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
    <svg viewBox="0 0 20 20" fill="none" className="size-4 text-slate-400">
      <path
        d="M10 17s5.5-4.6 5.5-8.8A5.5 5.5 0 0010 2.5a5.5 5.5 0 00-5.5 5.7C4.5 12.4 10 17 10 17z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="10" cy="8.2" r="1.8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Their row glyph: a small solid plane heading up-right. */
function PlaneIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 rotate-45 text-slate-400">
      <path
        fill="currentColor"
        d="M10 1.9c.5 0 .9.4.9.9v4.9l6.6 3.9v1.7l-6.6-2v4.2l1.7 1.3v1.4L10 17.3l-2.6.9v-1.4l1.7-1.3v-4.2l-6.6 2v-1.7l6.6-3.9V2.8c0-.5.4-.9.9-.9z"
      />
    </svg>
  );
}

/**
 * Their dropdown shows short airport names ("Mactan-Cebu", not
 * "Mactan-Cebu International Airport").
 */
function shortAirportName(name: string): string {
  const short = name
    .replace(/\b(International|Intl\.?|Regional|Municipal|Metropolitan)\b/gi, " ")
    .replace(/\bAirport\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–,]+|[-–,]+$/g, "")
    .trim();
  return short || name;
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
  let short = shortAirportName(place.name);
  // "Tokyo Haneda" next to bold "Tokyo" reads doubled — drop the prefix.
  if (place.city && short.toLowerCase().startsWith(`${place.city.toLowerCase()} `)) {
    short = short.slice(place.city.length).trim();
  }
  const redundant =
    !place.city || short.toLowerCase() === place.city.toLowerCase();
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="shrink-0"><PlaneIcon /></span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-white">
          <b>{place.city || short}</b>{" "}
          <span className="text-muted">
            {redundant ? "" : `${short} `}({place.iata})
          </span>
        </span>
        <span className="block truncate text-xs text-muted">{place.country}</span>
      </span>
    </span>
  );
}

/**
 * From/To field with places autocomplete (metros, airports, nearby with
 * distance). Two shapes:
 *   cell — the desktop pill-bar cell (label above value)
 *   row  — the mobile stacked-card row (leading icon + value)
 */
export default function AirportField({
  label,
  value,
  onChange,
  placeholder,
  autoFocusOnMount = false,
  variant = "cell",
  rowIcon,
}: {
  label: string;
  value: PlaceSelection | null;
  onChange: (selection: PlaceSelection) => void;
  placeholder: string;
  autoFocusOnMount?: boolean;
  variant?: "cell" | "row";
  rowIcon?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(autoFocusOnMount);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const places = usePlacesSearch(query);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusOnMount) inputRef.current?.focus();
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

  const onKeyDown = (e: React.KeyboardEvent) => {
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
  };

  const dropdown = editing && places.length > 0 && (
    <div
      className={`absolute top-full z-50 mt-1 overflow-hidden rounded-2xl border border-card-border bg-popover/95 py-1 shadow-2xl shadow-black/50 backdrop-blur-xl ${
        variant === "row" ? "inset-x-0" : "left-2 w-96 max-w-[calc(100vw-3rem)]"
      }`}
    >
      {places.map((place, i) => (
        <button
          key={place.kind === "city" ? `city-${place.key}` : place.iata}
          type="button"
          onMouseEnter={() => setHighlight(i)}
          onClick={() => pick(place)}
          className={`flex w-full items-center px-4 py-2 text-left ${
            i === highlight ? "bg-white/8" : ""
          }`}
        >
          <PlaceRow place={place} />
        </button>
      ))}
    </div>
  );

  if (variant === "row") {
    return (
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className={`flex w-full cursor-text items-center gap-3.5 px-4 py-4 text-left ${editing ? "hidden" : ""}`}
        >
          <span className="shrink-0 text-slate-300">{rowIcon}</span>
          <span
            className={`truncate text-lg font-medium ${value ? "text-white" : "text-muted/70"}`}
          >
            {value?.label || placeholder}
          </span>
        </button>

        {editing && (
          <div className="flex items-center gap-3.5 px-4 py-4">
            <span className="shrink-0 text-slate-300">{rowIcon}</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              aria-label={label}
              className="w-full bg-transparent text-lg font-medium text-white outline-none placeholder:text-muted/70"
            />
          </div>
        )}
        {dropdown}
      </div>
    );
  }

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
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="w-full bg-transparent text-lg font-semibold text-white outline-none placeholder:text-muted/70"
          />
        </div>
      )}
      {dropdown}
    </div>
  );
}
