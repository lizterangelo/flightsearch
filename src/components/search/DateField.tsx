"use client";

import { useRef } from "react";

function formatShort(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function DateInput({
  value,
  min,
  onChange,
  placeholder,
}: {
  value: string;
  min?: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => ref.current?.showPicker?.()}
      className="relative cursor-pointer whitespace-nowrap"
    >
      <span
        className={`text-lg font-semibold ${value ? "text-white" : "text-muted/70"}`}
      >
        {value ? formatShort(value) : placeholder}
      </span>
      <input
        ref={ref}
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 [color-scheme:dark]"
        tabIndex={-1}
      />
    </button>
  );
}

/** "Dates" cell: depart (→ return) with native pickers under the hood. */
export default function DateField({
  departDate,
  returnDate,
  roundTrip,
  onDepartChange,
  onReturnChange,
  today,
}: {
  departDate: string;
  returnDate: string;
  roundTrip: boolean;
  onDepartChange: (v: string) => void;
  onReturnChange: (v: string) => void;
  today: string;
}) {
  return (
    <div className="px-6 py-3.5">
      <div className="text-xs font-medium text-muted">Dates</div>
      <div className="flex items-center gap-2.5">
        <DateInput
          value={departDate}
          min={today}
          onChange={onDepartChange}
          placeholder="Departure"
        />
        {roundTrip && (
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
            <DateInput
              value={returnDate}
              min={departDate || today}
              onChange={onReturnChange}
              placeholder="Return"
            />
          </>
        )}
      </div>
    </div>
  );
}
