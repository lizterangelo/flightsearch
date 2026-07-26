"use client";

import type { PassengerCounts } from "@/lib/types";
import { totalPassengers } from "@/lib/types";
import Dropdown, { Chevron } from "./Dropdown";

function Stepper({
  label,
  sub,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  sub: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const btn =
    "flex size-8 cursor-pointer items-center justify-center rounded-full border border-card-border text-slate-200 transition hover:bg-white/10 disabled:cursor-default disabled:opacity-30";
  return (
    <div className="flex items-center justify-between gap-6 px-3.5 py-2.5">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs text-muted">{sub}</div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className={btn}
          aria-label={`Fewer ${label.toLowerCase()}`}
        >
          −
        </button>
        <span className="w-4 text-center text-sm font-semibold text-white tabular-nums">
          {value}
        </span>
        <button
          type="button"
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className={btn}
          aria-label={`More ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

/** "Bring Friends" pill: You + steppers for adults / children / infants. */
export default function PassengerPicker({
  value,
  onChange,
  trigger,
}: {
  value: PassengerCounts;
  onChange: (v: PassengerCounts) => void;
  /** Custom pill renderer (defaults to the options-row style). */
  trigger?: (open: boolean, label: string) => React.ReactNode;
}) {
  const total = totalPassengers(value);
  const label = total > 1 ? `${total} Passengers` : "Bring Friends";

  const setChildren = (count: number) => {
    const ages = [...value.childAges];
    while (ages.length < count) ages.push(8);
    onChange({ ...value, childAges: ages.slice(0, count) });
  };

  return (
    <Dropdown
      trigger={(open) =>
        trigger?.(open, label) ?? (
          <span className="flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-[13px] font-medium text-slate-200 sm:gap-2 sm:px-5 sm:py-3 sm:text-[15px]">
            <svg viewBox="0 0 20 20" fill="none" className="hidden size-4.5 text-slate-300 sm:block">
              <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M4 16.5c0-2.8 2.7-4.5 6-4.5s6 1.7 6 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            {label}
            <span className="hidden sm:block"><Chevron open={open} /></span>
          </span>
        )
      }
    >
      <div className="w-72 py-1">
        <div className="flex items-center gap-3 border-b border-white/8 px-3.5 pb-2.5 pt-1">
          <span className="flex size-8 items-center justify-center rounded-full bg-accent/20 text-accent-bright">
            <svg viewBox="0 0 20 20" fill="none" className="size-4">
              <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M4 16.5c0-2.8 2.7-4.5 6-4.5s6 1.7 6 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="flex-1 text-sm font-medium text-white">You</span>
          <svg viewBox="0 0 20 20" fill="none" className="size-4.5 text-accent-bright">
            <path
              d="M4 10.5l4 4 8-9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <Stepper
          label="Adults"
          sub="12+ years"
          value={value.adults}
          min={1}
          max={8}
          onChange={(adults) =>
            onChange({
              ...value,
              adults,
              infants: Math.min(value.infants, adults),
            })
          }
        />
        <Stepper
          label="Children"
          sub="2–17 years"
          value={value.childAges.length}
          min={0}
          max={6}
          onChange={setChildren}
        />
        {value.childAges.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3.5 pb-2">
            {value.childAges.map((age, i) => (
              <label key={i} className="flex items-center gap-1.5 text-xs text-muted">
                Child {i + 1}
                <select
                  value={age}
                  onChange={(e) => {
                    const ages = [...value.childAges];
                    ages[i] = Number(e.target.value);
                    onChange({ ...value, childAges: ages });
                  }}
                  className="rounded-lg border border-card-border bg-pill px-1.5 py-1 text-xs text-white outline-none"
                >
                  {Array.from({ length: 16 }, (_, n) => n + 2).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
        <Stepper
          label="Infants"
          sub="Under 2, on a lap"
          value={value.infants}
          min={0}
          max={value.adults}
          onChange={(infants) => onChange({ ...value, infants })}
        />
      </div>
    </Dropdown>
  );
}
