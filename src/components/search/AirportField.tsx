"use client";

import { useEffect, useRef, useState } from "react";
import { useAirportSearch, airportByIata, type Airport } from "@/hooks/useAirportSearch";

/**
 * From/To field: shows "City (IATA)" like the mock, opens an autocomplete
 * popover while typing. Value is the selected IATA code.
 */
export default function AirportField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string; // IATA or ""
  onChange: (iata: string) => void;
  placeholder: string;
}) {
  const selected = value ? airportByIata(value) : undefined;
  const display = selected ? `${selected.city || selected.name} (${selected.iata})` : "";

  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const results = useAirportSearch(query);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setEditing(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [editing]);

  const pick = (airport: Airport) => {
    onChange(airport.iata);
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
          className={`truncate text-lg font-semibold ${display ? "text-white" : "text-muted/70"}`}
        >
          {display || placeholder}
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
                setHighlight((h) => Math.min(h + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter" && results[highlight]) {
                e.preventDefault();
                pick(results[highlight]);
              } else if (e.key === "Escape") {
                setEditing(false);
              }
            }}
            placeholder={placeholder}
            className="w-full bg-transparent text-lg font-semibold text-white outline-none placeholder:text-muted/70"
          />
        </div>
      )}

      {editing && results.length > 0 && (
        <div className="absolute top-full left-2 z-50 mt-1 w-80 overflow-hidden rounded-2xl border border-card-border bg-[#0b1428]/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
          {results.map((airport, i) => (
            <button
              key={airport.iata}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(airport)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                i === highlight ? "bg-white/8" : ""
              }`}
            >
              <span className="w-11 shrink-0 rounded-lg bg-white/8 px-1.5 py-1 text-center font-mono text-xs font-bold text-slate-200">
                {airport.iata}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-white">
                  {airport.city || airport.name}
                </span>
                <span className="block truncate text-xs text-muted">
                  {airport.name} · {airport.country}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
