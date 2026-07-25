"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Duffel seat-map picker: one tab per segment, cabin grid, click a seat to
 * assign it to the next passenger without one. Seats without services are
 * unavailable; airlines with no map get a friendly empty state.
 */

export interface SeatSelection {
  serviceId: string;
  designator: string;
  segmentId: string;
  passengerId: string;
  totalUSD: number;
}

interface SeatService {
  id: string;
  passengerId: string;
  totalAmount: string;
  totalCurrency: string;
  totalUSD: number;
}

type Element =
  | { type: "seat"; designator: string; services: SeatService[] }
  | { type: string };

interface SeatMapData {
  segmentId: string;
  sliceId: string;
  cabins: {
    cabinClass: string;
    deck: number;
    aisles: number;
    rows: { sections: { elements: Element[] }[] }[];
  }[];
}

function money(usd: number): string {
  return `$${Math.round(usd).toLocaleString("en-US")}`;
}

export default function SeatMapModal({
  open,
  offerId,
  passengers,
  selections,
  onClose,
  onApply,
}: {
  open: boolean;
  offerId: string;
  passengers: { id: string; type: string }[];
  selections: SeatSelection[];
  onClose: () => void;
  onApply: (selections: SeatSelection[]) => void;
}) {
  const [maps, setMaps] = useState<SeatMapData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [segmentIdx, setSegmentIdx] = useState(0);
  const [chosen, setChosen] = useState<SeatSelection[]>(selections);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setChosen(selections);
  }

  useEffect(() => {
    if (!open || maps !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/offers/${offerId}/seat-map`);
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? "Seat map unavailable");
        }
        const body = (await res.json()) as { maps: SeatMapData[] };
        if (!cancelled) setMaps(body.maps);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, offerId, maps]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const current = maps?.[segmentIdx] ?? null;

  const totalUSD = useMemo(
    () => chosen.reduce((sum, s) => sum + s.totalUSD, 0),
    [chosen],
  );

  if (!open) return null;

  const pickSeat = (designator: string, services: SeatService[]) => {
    if (!current) return;
    const existingIdx = chosen.findIndex(
      (s) => s.segmentId === current.segmentId && s.designator === designator,
    );
    if (existingIdx >= 0) {
      // Clicking a chosen seat releases it.
      setChosen((prev) => prev.filter((_, i) => i !== existingIdx));
      return;
    }
    // Next passenger without a seat on this segment.
    const seated = new Set(
      chosen
        .filter((s) => s.segmentId === current.segmentId)
        .map((s) => s.passengerId),
    );
    const nextPax = passengers.find((p) => !seated.has(p.id));
    if (!nextPax) return;
    const service = services.find((s) => s.passengerId === nextPax.id);
    if (!service) return;
    setChosen((prev) => [
      ...prev,
      {
        serviceId: service.id,
        designator,
        segmentId: current.segmentId,
        passengerId: nextPax.id,
        totalUSD: service.totalUSD,
      },
    ]);
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center overflow-y-auto p-4 pt-[6vh]">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div role="dialog" aria-modal="true" aria-label="Pick your seats" className="relative w-full max-w-2xl rounded-3xl border border-card-border bg-[#0a1122] p-6 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-white">Pick your seats</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/10 text-slate-300 transition hover:bg-white/20"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="py-16 text-center text-slate-300">{error}</div>
        )}

        {!error && maps === null && (
          <div className="space-y-3 py-10">
            <div className="shimmer mx-auto h-8 w-56 rounded-lg bg-card" />
            <div className="shimmer mx-auto h-64 w-72 rounded-2xl bg-card" />
          </div>
        )}

        {maps !== null && maps.length === 0 && (
          <div className="py-16 text-center text-slate-300">
            Seat selection isn&apos;t offered for this flight. You&apos;ll be
            assigned a seat at check-in.
          </div>
        )}

        {maps !== null && maps.length > 0 && (
          <>
            {maps.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {maps.map((map, i) => (
                  <button
                    key={map.segmentId}
                    type="button"
                    onClick={() => setSegmentIdx(i)}
                    className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                      i === segmentIdx
                        ? "border-accent/60 bg-accent/15 text-white"
                        : "border-card-border bg-pill/70 text-slate-300"
                    }`}
                  >
                    Flight {i + 1}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-5 max-h-[50vh] overflow-y-auto rounded-2xl border border-card-border bg-white/[0.02] p-5">
              {current?.cabins.map((cabin, ci) => (
                <div key={ci} className="mx-auto w-fit">
                  {cabin.rows.map((row, ri) => (
                    <div key={ri} className="mb-1.5 flex items-center gap-3">
                      {row.sections.map((section, si) => (
                        <div key={si} className="flex gap-1.5">
                          {section.elements.map((el, ei) => {
                            if (el.type !== "seat") {
                              return (
                                <span
                                  key={ei}
                                  className="flex h-9 w-9 items-center justify-center text-[9px] text-muted/60"
                                >
                                  {el.type === "exit_row" ? "EXIT" : ""}
                                </span>
                              );
                            }
                            const seat = el as Extract<
                              Element,
                              { type: "seat" }
                            >;
                            const unavailable = seat.services.length === 0;
                            const mine = chosen.find(
                              (s) =>
                                s.segmentId === current.segmentId &&
                                s.designator === seat.designator,
                            );
                            const price = seat.services[0]?.totalUSD ?? 0;
                            return (
                              <button
                                key={ei}
                                type="button"
                                disabled={unavailable}
                                title={
                                  unavailable
                                    ? `${seat.designator} — taken`
                                    : `${seat.designator} · ${money(price)}`
                                }
                                onClick={() =>
                                  pickSeat(seat.designator, seat.services)
                                }
                                className={`h-9 w-9 cursor-pointer rounded-t-lg rounded-b-sm border text-[10px] font-semibold transition ${
                                  mine
                                    ? "border-accent bg-accent text-white"
                                    : unavailable
                                      ? "cursor-default border-white/10 bg-white/5 text-white/20"
                                      : "border-accent/40 bg-accent/10 text-slate-200 hover:bg-accent/25"
                                }`}
                              >
                                {seat.designator}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between gap-4">
              <div className="text-sm text-slate-300">
                {chosen.length > 0 ? (
                  <>
                    {chosen.map((s) => s.designator).join(", ")} ·{" "}
                    <b className="text-white">{money(totalUSD)}</b>
                  </>
                ) : (
                  "Click an available seat to assign it"
                )}
              </div>
              <button
                type="button"
                onClick={() => onApply(chosen)}
                className="cursor-pointer rounded-full bg-accent px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
