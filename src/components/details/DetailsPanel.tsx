"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import Popover from "@/components/ui/Popover";
import { formatDuration } from "@/lib/format";
import type {
  FlightOffer,
  OfferService,
  SearchQuery,
} from "@/lib/types";
import { buildFlightsPath } from "@/lib/urls";
import AirlineLogo from "../results/AirlineLogo";
import Timeline from "./Timeline";

const PROTECT_MIN_USD = 19;
const PROTECT_MAX_USD = 149;

export function protectFeeUSD(displayUSD: number): number {
  return Math.min(
    PROTECT_MAX_USD,
    Math.max(PROTECT_MIN_USD, Math.round(displayUSD * 0.05)),
  );
}

interface OfferResponse {
  offer: FlightOffer;
  services: OfferService[];
  testMode: boolean;
}

function ConditionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-8 py-1 text-sm">
      <span className="font-medium text-white">{label}</span>
      <span className="text-slate-300">{value}</span>
    </div>
  );
}

function money(usd: number): string {
  return `$${Math.round(usd).toLocaleString("en-US")}`;
}

const dotted =
  "cursor-pointer border-b border-dotted border-white/40 text-slate-300 transition hover:text-white";

/**
 * The flight-details view: header card with price breakdown + fare
 * popovers, per-slice timelines, and the bags / seat / protect / share /
 * book action bar. Rendered by the flights page when the URL carries an
 * offer id.
 */
export default function DetailsPanel({
  query,
  offerId,
  streamedOffer,
  onClose,
}: {
  query: SearchQuery;
  offerId: string;
  /** The offer as it arrived over the stream (skips a refetch when live). */
  streamedOffer: FlightOffer | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [fetched, setFetched] = useState<OfferResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [bagQty, setBagQty] = useState<Map<string, number>>(() => new Map());
  const [protect, setProtect] = useState(false);

  // Always refetch for services/current price; streamed offer renders
  // instantly in the meantime.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/offers/${offerId}`);
        if (res.status === 410) {
          if (!cancelled) setExpired(true);
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `Offer load failed (${res.status})`);
        }
        const body = (await res.json()) as OfferResponse;
        if (!cancelled) setFetched(body);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  const offer = fetched?.offer ?? streamedOffer;
  const services = useMemo(() => fetched?.services ?? [], [fetched]);
  const bagServices = useMemo(
    () => services.filter((s) => s.type === "baggage"),
    [services],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bagsTotalUSD = useMemo(
    () =>
      bagServices.reduce(
        (sum, s) => sum + (bagQty.get(s.id) ?? 0) * s.totalUSD,
        0,
      ),
    [bagServices, bagQty],
  );

  if (expired) {
    return (
      <Overlay onClose={onClose}>
        <div className="mx-auto max-w-lg py-24 text-center">
          <div className="text-2xl font-bold text-white">
            This fare has expired
          </div>
          <p className="mt-3 text-slate-300">
            Prices move fast. Run the search again for current fares on this
            route.
          </p>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push(buildFlightsPath(query));
            }}
            className="mt-6 cursor-pointer rounded-full bg-accent px-6 py-3 font-semibold text-white"
          >
            Refresh results
          </button>
        </div>
      </Overlay>
    );
  }

  if (error) {
    return (
      <Overlay onClose={onClose}>
        <div className="mx-auto max-w-lg py-24 text-center">
          <div className="text-2xl font-bold text-white">
            Couldn&apos;t load this flight
          </div>
          <p className="mt-3 text-slate-300">{error}</p>
        </div>
      </Overlay>
    );
  }

  if (!offer) {
    return (
      <Overlay onClose={onClose}>
        <div className="mx-auto max-w-lg space-y-4 py-24">
          <div className="shimmer h-28 rounded-3xl bg-card" />
          <div className="shimmer h-64 rounded-3xl bg-card" />
        </div>
      </Overlay>
    );
  }

  const tripLabel = offer.slices.length > 1 ? "Round trip" : "One-way";
  const out = offer.slices[0];
  const protectFee = protectFeeUSD(offer.displayUSD);
  const totalUSD = offer.displayUSD + bagsTotalUSD + (protect ? protectFee : 0);

  const baseUSD = offer.baseAmount
    ? Number(offer.baseAmount) * (offer.totalUSD / Number(offer.totalAmount))
    : null;
  const taxUSD = offer.taxAmount
    ? Number(offer.taxAmount) * (offer.totalUSD / Number(offer.totalAmount))
    : null;
  const undercut = offer.totalUSD - offer.displayUSD;

  const included = out?.segments[0];
  const refundable = offer.conditions.refundable;
  const changeable = offer.conditions.changeable;

  const bookHref = () => {
    const sp = new URLSearchParams();
    const chosen = [...bagQty.entries()].filter(([, q]) => q > 0);
    if (chosen.length)
      sp.set("services", chosen.map(([id, q]) => `${id}:${q}`).join(","));
    if (protect) sp.set("protect", "1");
    const qs = sp.toString();
    return `/book/${offer.id}${qs ? `?${qs}` : ""}`;
  };

  return (
    <Overlay onClose={onClose}>
      {/* Header card */}
      <div className="rounded-3xl border border-card-border bg-card p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <AirlineLogo
              carrierCode={offer.ownerCode}
              carrierName={offer.ownerName}
              logoUrl={offer.ownerLogoUrl ?? undefined}
            />
            <div>
              <div className="text-sm text-muted">
                {offer.ownerName} <span className="mx-1">·</span> {tripLabel}
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-3xl font-bold text-white">
                {out?.originCity ?? offer.slices[0]?.origin}
                <svg viewBox="0 0 24 24" fill="none" className="size-6 text-accent-bright">
                  <path
                    d="M4 8h14m0 0l-3.5-3.5M18 8l-3.5 3.5M20 16H6m0 0l3.5-3.5M6 16l3.5 3.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {out?.destinationCity ?? offer.slices[0]?.destination}
              </div>
              <div className="mt-1.5 flex items-center gap-2.5 text-sm">
                <Popover
                  trigger={<span className={dotted}>{out?.fareBrand ?? "Economy"}</span>}
                >
                  <div className="w-56">
                    <ConditionRow
                      label="Fare"
                      value={out?.fareBrand ?? "Economy"}
                    />
                    <ConditionRow
                      label="Changes"
                      value={
                        changeable === null
                          ? "Per airline rules"
                          : changeable
                            ? offer.conditions.changePenaltyAmount &&
                              Number(offer.conditions.changePenaltyAmount) > 0
                              ? `Yes, fee applies`
                              : "Yes, free"
                            : "Not allowed"
                      }
                    />
                    {included && (
                      <ConditionRow
                        label="Bags"
                        value={`${included.baggageCarryOn} carry-on · ${included.baggageChecked} checked`}
                      />
                    )}
                  </div>
                </Popover>
                <span className="text-muted">·</span>
                <Popover
                  trigger={
                    <span className={dotted}>
                      {refundable === null
                        ? "Refund policy"
                        : refundable
                          ? "Refundable"
                          : "Non-refundable"}
                    </span>
                  }
                >
                  <div className="w-64 text-sm leading-relaxed text-slate-300">
                    {refundable === null
                      ? "The airline didn't state a refund policy for this fare — airline rules apply."
                      : refundable
                        ? `This fare can be refunded before departure${
                            offer.conditions.refundPenaltyAmount &&
                            Number(offer.conditions.refundPenaltyAmount) > 0
                              ? ` (penalty ${offer.conditions.refundPenaltyAmount} ${offer.conditions.penaltyCurrency ?? ""})`
                              : ""
                          }.`
                        : "The airline treats this ticket as non-refundable. Adding Protect Flight covers you anyway."}
                  </div>
                </Popover>
                {offer.totalEmissionsKg !== null && (
                  <>
                    <span className="text-muted">·</span>
                    <span className="text-muted">
                      ~{Math.round(offer.totalEmissionsKg)} kg CO₂
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="text-right">
            <Popover
              align="right"
              trigger={
                <span className="cursor-pointer text-4xl font-bold text-white transition hover:text-accent-bright">
                  {money(totalUSD)}
                </span>
              }
            >
              <div className="w-60">
                {baseUSD !== null && (
                  <ConditionRow label="Base fare" value={money(baseUSD)} />
                )}
                {taxUSD !== null && (
                  <ConditionRow label="Taxes & fees" value={money(taxUSD)} />
                )}
                {bagsTotalUSD > 0 && (
                  <ConditionRow label="Extra bags" value={money(bagsTotalUSD)} />
                )}
                {protect && (
                  <ConditionRow label="Protect Flight" value={money(protectFee)} />
                )}
                {undercut > 0 && (
                  <ConditionRow
                    label="Soar Undercut"
                    value={`−${money(undercut)}`}
                  />
                )}
              </div>
            </Popover>
            <div className="text-xs tracking-wide text-muted">
              {offer.slices.length > 1 ? "round trip" : "one-way"}
            </div>
          </div>
        </div>
      </div>

      {/* Slices */}
      {offer.slices.map((slice, i) => (
        <div key={i} className="mt-7">
          <div className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
            {i === 0 ? "Departing flight" : "Returning flight"}
            <span className="font-normal text-muted">
              ·{" "}
              {new Date(`${slice.departure.slice(0, 10)}T00:00:00`).toLocaleDateString(
                "en-US",
                { weekday: "short", month: "short", day: "numeric" },
              )}
            </span>
            <span
              className={`text-sm font-medium ${slice.stops === 0 ? "text-direct" : "text-stop"}`}
            >
              ·{" "}
              {slice.stops === 0
                ? "Direct"
                : `${slice.stops} stop${slice.stops > 1 ? "s" : ""}`}
            </span>
            <span className="text-sm font-normal text-muted">
              · {formatDuration(slice.durationMinutes)}
            </span>
          </div>
          <Timeline slice={slice} />
        </div>
      ))}

      {/* Bottom action bar */}
      <div className="sticky bottom-0 z-10 mt-8 -mx-2 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-card-border bg-[#0a1122]/95 px-5 py-3.5 shadow-2xl shadow-black/50 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2.5">
          {included && (
            <Popover
              trigger={
                <span className="flex items-center gap-2 rounded-full border border-card-border bg-pill/80 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:text-white">
                  🧳 {included.baggageCarryOn} Carry-on ·{" "}
                  {(() => {
                    const checked =
                      included.baggageChecked +
                      [...bagQty.values()].reduce((a, b) => a + b, 0);
                    return `${checked} Checked bag${checked === 1 ? "" : "s"}`;
                  })()}
                  {bagServices.length > 0 && (
                    <span className="text-accent-bright">+</span>
                  )}
                </span>
              }
            >
              <div className="w-72">
                {bagServices.length === 0 ? (
                  <div className="text-sm leading-relaxed text-slate-300">
                    This fare includes {included.baggageCarryOn} carry-on and{" "}
                    {included.baggageChecked} checked{" "}
                    {included.baggageChecked === 1 ? "bag" : "bags"}. The
                    airline doesn&apos;t sell extra bags on this offer.
                  </div>
                ) : (
                  bagServices.map((s) => {
                    const qty = bagQty.get(s.id) ?? 0;
                    return (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-4 py-2"
                      >
                        <div>
                          <div className="text-sm font-medium text-white">
                            {s.baggage?.type === "carry_on"
                              ? "Extra carry-on"
                              : "Checked bag"}
                            {s.baggage?.maximumWeightKg
                              ? ` · ${s.baggage.maximumWeightKg} kg`
                              : ""}
                          </div>
                          <div className="text-xs text-muted">
                            {money(s.totalUSD)} each
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            disabled={qty <= 0}
                            onClick={() =>
                              setBagQty((prev) =>
                                new Map(prev).set(s.id, qty - 1),
                              )
                            }
                            className="flex size-7 cursor-pointer items-center justify-center rounded-full border border-card-border text-slate-200 disabled:opacity-30"
                          >
                            −
                          </button>
                          <span className="w-3 text-center text-sm font-semibold text-white">
                            {qty}
                          </span>
                          <button
                            type="button"
                            disabled={qty >= s.maximumQuantity}
                            onClick={() =>
                              setBagQty((prev) =>
                                new Map(prev).set(s.id, qty + 1),
                              )
                            }
                            className="flex size-7 cursor-pointer items-center justify-center rounded-full border border-card-border text-slate-200 disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Popover>
          )}

          <button
            type="button"
            onClick={() => toast("Sign in to pick seats — coming right up")}
            className="flex cursor-pointer items-center gap-2 rounded-full border border-card-border bg-pill/80 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:text-white"
          >
            Select seat <span className="text-accent-bright">+</span>
          </button>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-full border border-card-border bg-pill/80 px-4 py-2.5 text-sm font-medium text-slate-200">
            Protect Flight{" "}
            <span className="text-white">{money(protectFee)}</span>
            <input
              type="checkbox"
              checked={protect}
              onChange={(e) => setProtect(e.target.checked)}
              className="size-4 cursor-pointer accent-[#2e6bff]"
            />
          </label>
          <a
            href="/refund-guarantee"
            target="_blank"
            className="text-xs text-muted underline-offset-2 transition hover:text-white hover:underline"
          >
            Refund Guarantee ⓘ
          </a>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Share this flight"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                toast("Link copied — send it to your crew");
              } catch {
                toast("Couldn't copy the link");
              }
            }}
            className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-card-border bg-pill/80 text-slate-200 transition hover:text-white"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-4.5">
              <path
                d="M10 12.5V3m0 0L6.5 6.5M10 3l3.5 3.5M4 12v3.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V12"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <a
            href={bookHref()}
            className="cursor-pointer rounded-full bg-accent px-8 py-3 font-semibold text-white shadow-[0_0_24px_rgba(46,107,255,0.5)] transition hover:brightness-110"
          >
            Book Flight
          </a>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#050b18]/80 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-4xl px-6 pt-6 pb-10">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to flights"
          className="mb-5 flex size-10 cursor-pointer items-center justify-center rounded-full border border-card-border bg-pill/80 text-slate-200 transition hover:text-white"
        >
          <svg viewBox="0 0 20 20" fill="none" className="size-5">
            <path
              d="M12.5 4.5L7 10l5.5 5.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}
