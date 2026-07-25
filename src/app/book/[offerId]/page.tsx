"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";

interface OfferDetails {
  id: string;
  expiresAt: string;
  totalAmount: string;
  totalCurrency: string;
  owner: { name: string; iata: string };
  testData: boolean;
  passengers: { id: string; type: string }[];
  slices: {
    origin: string;
    destination: string;
    segments: {
      carrier: string;
      flightNumber: string;
      origin: string;
      destination: string;
      departingAt: string;
      arrivingAt: string;
    }[];
  }[];
}

interface PassengerForm {
  id: string;
  title: string;
  given_name: string;
  family_name: string;
  born_on: string;
  gender: string;
  email: string;
  phone_number: string;
}

interface Confirmation {
  orderId: string;
  bookingReference: string;
  totalAmount: string;
  totalCurrency: string;
}

function fmtDateTime(iso: string): string {
  const [date, time] = [iso.slice(0, 10), iso.slice(11, 16)];
  return `${date} · ${time}`;
}

const inputCls =
  "w-full rounded-xl border border-card-border bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-muted/60 focus:border-accent/60";
const labelCls = "mb-1.5 block text-xs font-medium text-muted";

export default function BookPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}) {
  const { offerId } = use(params);
  const [offer, setOffer] = useState<OfferDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forms, setForms] = useState<PassengerForm[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/book/offer?id=${offerId}`);
        const data = (await res.json()) as OfferDetails & { error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
        setOffer(data);
        setForms(
          data.passengers.map((p) => ({
            id: p.id,
            title: "mr",
            given_name: "",
            family_name: "",
            born_on: "",
            gender: "m",
            email: "",
            phone_number: "",
          })),
        );
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load offer");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  const update = (i: number, field: keyof PassengerForm, value: string) => {
    setForms((prev) =>
      prev.map((f, idx) => (idx === i ? { ...f, [field]: value } : f)),
    );
  };

  const formsValid = forms.every(
    (f) =>
      f.given_name.trim() &&
      f.family_name.trim() &&
      /^\d{4}-\d{2}-\d{2}$/.test(f.born_on) &&
      /\S+@\S+\.\S+/.test(f.email) &&
      /^\+[1-9]\d{6,14}$/.test(f.phone_number),
  );

  const submit = async () => {
    if (!formsValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, passengers: forms }),
      });
      const data = (await res.json()) as Confirmation & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Booking failed (${res.status})`);
      setConfirmation(data);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-20 text-center">
        <div className="rounded-3xl border border-direct/40 bg-card p-10">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-direct/15">
            <svg viewBox="0 0 24 24" fill="none" className="size-7 text-direct">
              <path
                d="M4 12.5l5 5L20 6.5"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white">Booked!</h1>
          <p className="mt-2 text-sm text-muted">Your booking reference</p>
          <div className="mt-3 font-mono text-4xl font-bold tracking-widest text-white">
            {confirmation.bookingReference}
          </div>
          <p className="mt-4 text-sm text-slate-300">
            {formatMoney(
              Number(confirmation.totalAmount),
              confirmation.totalCurrency,
            )}{" "}
            paid from your Duffel balance
          </p>
          <p className="mt-1 text-xs text-muted">Order {confirmation.orderId}</p>
          <Link
            href="/"
            className="mt-8 inline-block rounded-full bg-accent px-7 py-3 font-semibold text-white"
          >
            New search
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-muted hover:text-slate-300">
        ← New search
      </Link>
      <h1 className="mt-4 text-3xl font-semibold text-white">Complete booking</h1>

      {loadError && (
        <div className="mt-8 rounded-2xl border border-stop/40 bg-stop/10 p-5 text-sm text-slate-200">
          {loadError}
        </div>
      )}

      {!offer && !loadError && (
        <div className="mt-8 space-y-3">
          <div className="shimmer h-24 rounded-2xl" />
          <div className="shimmer h-64 rounded-2xl" />
        </div>
      )}

      {offer && (
        <>
          {offer.testData && (
            <div className="mt-6 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-200">
              <b>Duffel test mode.</b> This is a sandbox fare — no real ticket
              will be issued and no real money moves. Swap in a live token
              (duffel_live_…) after Duffel verification to book real flights.
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-card-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted">
                Ticketed by{" "}
                <span className="font-medium text-slate-200">
                  {offer.owner.name}
                </span>
              </div>
              <div className="text-xl font-bold text-white">
                {formatMoney(Number(offer.totalAmount), offer.totalCurrency)}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {offer.slices.map((slice, i) => (
                <div key={i} className="text-sm text-slate-300">
                  <span className="font-semibold text-white">
                    {slice.origin} → {slice.destination}
                  </span>
                  {slice.segments.map((seg, j) => (
                    <span key={j} className="ml-2 text-muted">
                      {seg.flightNumber || seg.carrier}{" "}
                      {fmtDateTime(seg.departingAt)}
                      {j < slice.segments.length - 1 ? " ·" : ""}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-muted">
              Prices can change until ticketed. Offer expires{" "}
              {fmtDateTime(offer.expiresAt)}.
            </div>
          </div>

          {forms.map((form, i) => (
            <div
              key={form.id}
              className="mt-5 rounded-2xl border border-card-border bg-card p-5"
            >
              <h2 className="mb-4 text-sm font-semibold text-white">
                Passenger {i + 1} (adult)
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
                <div className="col-span-1">
                  <label className={labelCls}>Title</label>
                  <select
                    value={form.title}
                    onChange={(e) => update(i, "title", e.target.value)}
                    className={`${inputCls} [color-scheme:dark]`}
                  >
                    {["mr", "ms", "mrs", "miss", "dr"].map((t) => (
                      <option key={t} value={t}>
                        {t[0].toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className={labelCls}>First name</label>
                  <input
                    value={form.given_name}
                    onChange={(e) => update(i, "given_name", e.target.value)}
                    placeholder="As on ID"
                    className={inputCls}
                  />
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label className={labelCls}>Last name</label>
                  <input
                    value={form.family_name}
                    onChange={(e) => update(i, "family_name", e.target.value)}
                    placeholder="As on ID"
                    className={inputCls}
                  />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className={labelCls}>Date of birth</label>
                  <input
                    type="date"
                    value={form.born_on}
                    onChange={(e) => update(i, "born_on", e.target.value)}
                    className={`${inputCls} [color-scheme:dark]`}
                  />
                </div>
                <div className="col-span-1">
                  <label className={labelCls}>Gender</label>
                  <select
                    value={form.gender}
                    onChange={(e) => update(i, "gender", e.target.value)}
                    className={`${inputCls} [color-scheme:dark]`}
                  >
                    <option value="m">M</option>
                    <option value="f">F</option>
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label className={labelCls}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => update(i, "email", e.target.value)}
                    placeholder="traveler@email.com"
                    className={inputCls}
                  />
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label className={labelCls}>Phone (international)</label>
                  <input
                    type="tel"
                    value={form.phone_number}
                    onChange={(e) => update(i, "phone_number", e.target.value)}
                    placeholder="+14155550123"
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
          ))}

          {submitError && (
            <div className="mt-5 rounded-2xl border border-stop/40 bg-stop/10 p-4 text-sm text-slate-200">
              {submitError}
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!formsValid || submitting}
            className="mt-6 w-full cursor-pointer rounded-full bg-accent py-4 text-lg font-semibold text-white shadow-[0_0_24px_rgba(46,107,255,0.4)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting
              ? "Booking…"
              : `Confirm & pay ${formatMoney(Number(offer.totalAmount), offer.totalCurrency)} from Duffel balance`}
          </button>
          <p className="mt-3 text-center text-xs text-muted">
            Payment comes from your prepaid Duffel balance — card details never
            touch this app.
          </p>
        </>
      )}
    </main>
  );
}
