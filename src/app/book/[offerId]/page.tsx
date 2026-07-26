"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { useMe } from "@/components/auth/MeProvider";
import AuthModal from "@/components/auth/AuthModal";
import SeatMapModal, {
  type SeatSelection,
} from "@/components/details/SeatMapModal";
import { protectFeeUSD } from "@/components/details/DetailsPanel";
import { useCurrency } from "@/components/CurrencyProvider";
import { useToast } from "@/components/ui/Toast";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatDuration, formatTime } from "@/lib/format";
import type { FlightOffer, OfferService } from "@/lib/types";

interface OfferResponse {
  offer: FlightOffer;
  services: OfferService[];
  passengers: { id: string; type: string }[];
  testMode: boolean;
}

interface PassengerForm {
  id: string;
  type: string;
  title: string;
  given_name: string;
  family_name: string;
  born_on: string;
  gender: string;
  email: string;
  phone_number: string;
  passport_number: string;
  passport_country: string;
  passport_expiry: string;
}

interface Confirmation {
  orderId: string;
  bookingReference: string;
  totalAmount: string;
  totalCurrency: string;
}

const input =
  "w-full rounded-xl border border-card-border bg-white/[0.04] px-3.5 py-2.5 text-[15px] text-white outline-none placeholder:text-muted/60 focus:border-accent/60";
const label = "mb-1.5 block text-xs font-medium text-muted";

const TYPE_LABEL: Record<string, string> = {
  adult: "Adult",
  child: "Child",
  infant_without_seat: "Infant",
};

export default function CheckoutPage({
  params,
}: PageProps<"/book/[offerId]">) {
  const { offerId } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { me, loaded, profile } = useMe();
  const { format: money } = useCurrency();

  const [data, setData] = useState<OfferResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [forms, setForms] = useState<PassengerForm[]>([]);
  const [bagQty, setBagQty] = useState<Map<string, number>>(() => new Map());
  const [protect, setProtect] = useState(false);
  const [seats, setSeats] = useState<SeatSelection[]>([]);
  const [seatModalOpen, setSeatModalOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [friends, setFriends] = useState<
    { id: string; given_name: string; family_name: string; born_on: string | null; gender: string | null; email: string | null; phone: string | null }[]
  >([]);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  // Carry over services/protect chosen on the details panel via query params.
  // Deferred a tick: SSR-safe and satisfies no-sync-setState-in-effect.
  useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams(window.location.search);
      setProtect(sp.get("protect") === "1");
      const services = sp.get("services");
      if (services) {
        const next = new Map<string, number>();
        for (const part of services.split(",")) {
          const [id, qty] = part.split(":");
          if (id && Number(qty) > 0) next.set(id, Number(qty));
        }
        setBagQty(next);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

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
        if (cancelled) return;
        setData(body);
        setForms(
          body.passengers.map((p) => ({
            id: p.id,
            type: p.type,
            title: "ms",
            given_name: "",
            family_name: "",
            born_on: "",
            gender: "f",
            email: "",
            phone_number: "",
            passport_number: "",
            passport_country: "",
            passport_expiry: "",
          })),
        );
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

  // Prefill passenger 1 from saved details (deferred a tick — same
  // no-sync-setState-in-effect pattern as the query-param seeding above).
  useEffect(() => {
    if (!me || !profile || forms.length === 0) return;
    const t = setTimeout(() => {
      setForms((prev) => {
        if (!prev[0] || prev[0].given_name) return prev;
        const [given, ...rest] = (
          profile.legal_name ?? profile.nickname ?? me.name ?? ""
        ).split(" ");
        return prev.map((f, i) =>
          i === 0
            ? {
                ...f,
                given_name: given ?? "",
                family_name: rest.join(" "),
                born_on: profile.born_on ?? "",
                email: me.email ?? "",
                phone_number: profile.phone ?? "",
                passport_number: profile.passport_number ?? "",
                passport_country: profile.passport_country ?? "",
                passport_expiry: profile.passport_expiry ?? "",
              }
            : f,
        );
      });
    }, 0);
    return () => clearTimeout(t);
  }, [me, profile, forms.length]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data: rows } = await supabaseBrowser()
        .from("friends")
        .select("*")
        .order("created_at");
      if (!cancelled && rows) setFriends(rows as typeof friends);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [me]);

  const fillFromFriend = (formIndex: number, friendId: string) => {
    const friend = friends.find((f) => f.id === friendId);
    if (!friend) return;
    setForms((prev) =>
      prev.map((f, i) =>
        i === formIndex
          ? {
              ...f,
              given_name: friend.given_name,
              family_name: friend.family_name,
              born_on: friend.born_on ?? f.born_on,
              gender: friend.gender ?? f.gender,
              email: friend.email ?? f.email,
              phone_number: friend.phone ?? f.phone_number,
            }
          : f,
      ),
    );
  };

  const offer = data?.offer ?? null;
  const bagServices = useMemo(
    () => (data?.services ?? []).filter((s) => s.type === "baggage"),
    [data],
  );

  const bagsTotalUSD = useMemo(
    () =>
      bagServices.reduce(
        (sum, s) => sum + (bagQty.get(s.id) ?? 0) * s.totalUSD,
        0,
      ),
    [bagServices, bagQty],
  );
  const seatsTotalUSD = useMemo(
    () => seats.reduce((sum, s) => sum + s.totalUSD, 0),
    [seats],
  );
  const protectFee = offer ? protectFeeUSD(offer.displayUSD) : 0;
  const totalUSD = offer
    ? offer.displayUSD +
      bagsTotalUSD +
      seatsTotalUSD +
      (protect ? protectFee : 0)
    : 0;

  const passportRequired = offer?.passengerIdentityDocumentsRequired ?? false;

  const formValid = forms.every(
    (f) =>
      f.given_name.trim() &&
      f.family_name.trim() &&
      /^\d{4}-\d{2}-\d{2}$/.test(f.born_on) &&
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email) &&
      /^\+[1-9]\d{6,14}$/.test(f.phone_number) &&
      (!passportRequired ||
        (f.passport_number.trim() &&
          /^[A-Za-z]{2}$/.test(f.passport_country) &&
          /^\d{4}-\d{2}-\d{2}$/.test(f.passport_expiry))),
  );

  const pay = async () => {
    if (!offer || paying) return;
    setPaying(true);
    setError(null);
    try {
      const services = [
        ...[...bagQty.entries()]
          .filter(([, q]) => q > 0)
          .map(([id, quantity]) => ({ id, quantity })),
        ...seats.map((s) => ({ id: s.serviceId, quantity: 1 })),
      ];
      // Attach saved loyalty programmes that match this itinerary's carriers.
      const carriers = new Set(
        offer.slices.flatMap((s) => s.segments.map((seg) => seg.carrierCode)),
      );
      const { data: loyaltyRows } = await supabaseBrowser()
        .from("loyalty_programmes")
        .select("airline_iata, account_number");
      const loyaltyAccounts = (
        (loyaltyRows ?? []) as { airline_iata: string; account_number: string }[]
      )
        .filter((l) => carriers.has(l.airline_iata))
        .map((l) => ({
          airline_iata_code: l.airline_iata,
          account_number: l.account_number,
        }));
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: offer.id,
          passengers: forms.map((f) => ({
            id: f.id,
            title: f.title,
            given_name: f.given_name.trim(),
            family_name: f.family_name.trim(),
            born_on: f.born_on,
            gender: f.gender,
            email: f.email.trim(),
            phone_number: f.phone_number.trim(),
            ...(passportRequired
              ? {
                  identity_documents: [
                    {
                      type: "passport",
                      unique_identifier: f.passport_number.trim(),
                      issuing_country_code: f.passport_country.toUpperCase(),
                      expires_on: f.passport_expiry,
                    },
                  ],
                }
              : {}),
          })),
          services,
          loyaltyAccounts,
          protect,
          protectFeeUSD: protect ? protectFee : 0,
          displayTotalUSD: totalUSD,
        }),
      });
      const body = (await res.json()) as Confirmation & { error?: string };
      if (res.status === 410) {
        setExpired(true);
        return;
      }
      if (!res.ok) throw new Error(body.error ?? "Booking failed");
      setConfirmation(body);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      toast("Booking failed — see the error above the pay button");
    } finally {
      setPaying(false);
    }
  };

  /* ---------------------------- render states ---------------------------- */

  if (loaded && !me) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-white">Sign in to book</h1>
        <p className="mt-2 text-slate-300">
          Bookings live in your account — sign in and this page picks right
          back up.
        </p>
        <AuthModal open onClose={() => router.back()} />
      </main>
    );
  }

  if (expired) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-white">This fare has expired</h1>
        <p className="mt-2 text-slate-300">
          Prices move fast — search again for current fares.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-accent px-6 py-3 font-semibold text-white"
        >
          New search
        </Link>
      </main>
    );
  }

  if (confirmation && offer) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-20 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-direct/15 text-direct">
          <svg viewBox="0 0 24 24" fill="none" className="size-8">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="mt-5 text-3xl font-bold text-white">
          You&apos;re booked!
        </h1>
        <p className="mt-2 text-slate-300">
          Confirmation{" "}
          <span className="rounded-lg bg-white/10 px-2 py-0.5 font-mono font-bold text-white">
            {confirmation.bookingReference}
          </span>
        </p>
        <p className="mt-1 text-sm text-muted">
          {offer.slices[0]?.originCity} ⇄{" "}
          {offer.slices[0]?.destinationCity} ·{" "}
          {confirmation.totalAmount} {confirmation.totalCurrency}
        </p>
        {data?.testMode && (
          <p className="mx-auto mt-4 max-w-md rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
            Duffel test mode — this is a sandbox order, not a real ticket.
          </p>
        )}
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/flights"
            className="rounded-full bg-accent px-6 py-3 font-semibold text-white"
          >
            My Flights
          </Link>
          <Link
            href="/"
            className="rounded-full border border-card-border bg-pill/80 px-6 py-3 font-semibold text-slate-200"
          >
            New search
          </Link>
        </div>
      </main>
    );
  }

  if (error && !offer) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-white">
          Couldn&apos;t load this offer
        </h1>
        <p className="mt-2 text-slate-300">{error}</p>
      </main>
    );
  }

  if (!offer) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 px-6 py-16">
        <div className="shimmer h-24 rounded-3xl bg-card" />
        <div className="shimmer h-72 rounded-3xl bg-card" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24">
      {data?.testMode && (
        <div className="mb-5 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-3 text-sm text-amber-200">
          Duffel test mode — fares are sandbox data, payment uses the test
          balance, and no real ticket is issued.
        </div>
      )}

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Left: forms */}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-white">Who&apos;s flying?</h1>

          {forms.map((form, i) => (
            <div
              key={form.id}
              className="mt-5 rounded-3xl border border-card-border bg-card p-6"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold tracking-wide text-slate-300">
                  Passenger {i + 1} ·{" "}
                  <span className="text-muted">
                    {TYPE_LABEL[form.type] ?? form.type}
                  </span>
                </div>
                {friends.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted">Fill from:</span>
                    {friends.map((friend) => (
                      <button
                        key={friend.id}
                        type="button"
                        onClick={() => fillFromFriend(i, friend.id)}
                        className="cursor-pointer rounded-full border border-card-border bg-pill/70 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:text-white"
                      >
                        {friend.given_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
                <div className="col-span-1">
                  <label className={label}>Title</label>
                  <select
                    value={form.title}
                    onChange={(e) =>
                      setForms((prev) =>
                        prev.map((f, j) =>
                          j === i ? { ...f, title: e.target.value } : f,
                        ),
                      )
                    }
                    className={input}
                  >
                    {["ms", "mr", "mrs", "miss", "dr"].map((t) => (
                      <option key={t} value={t}>
                        {t[0].toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className={label}>First name</label>
                  <input
                    value={form.given_name}
                    onChange={(e) =>
                      setForms((prev) =>
                        prev.map((f, j) =>
                          j === i ? { ...f, given_name: e.target.value } : f,
                        ),
                      )
                    }
                    placeholder="Amelia"
                    className={input}
                  />
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label className={label}>Last name</label>
                  <input
                    value={form.family_name}
                    onChange={(e) =>
                      setForms((prev) =>
                        prev.map((f, j) =>
                          j === i ? { ...f, family_name: e.target.value } : f,
                        ),
                      )
                    }
                    placeholder="Earhart"
                    className={input}
                  />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className={label}>Date of birth</label>
                  <input
                    type="date"
                    value={form.born_on}
                    onChange={(e) =>
                      setForms((prev) =>
                        prev.map((f, j) =>
                          j === i ? { ...f, born_on: e.target.value } : f,
                        ),
                      )
                    }
                    className={`${input} [color-scheme:dark]`}
                  />
                </div>
                <div className="col-span-1">
                  <label className={label}>Gender</label>
                  <select
                    value={form.gender}
                    onChange={(e) =>
                      setForms((prev) =>
                        prev.map((f, j) =>
                          j === i ? { ...f, gender: e.target.value } : f,
                        ),
                      )
                    }
                    className={input}
                  >
                    <option value="f">Female</option>
                    <option value="m">Male</option>
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label className={label}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForms((prev) =>
                        prev.map((f, j) =>
                          j === i ? { ...f, email: e.target.value } : f,
                        ),
                      )
                    }
                    placeholder="amelia@example.com"
                    className={input}
                  />
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label className={label}>Phone (international)</label>
                  <input
                    value={form.phone_number}
                    onChange={(e) =>
                      setForms((prev) =>
                        prev.map((f, j) =>
                          j === i
                            ? { ...f, phone_number: e.target.value }
                            : f,
                        ),
                      )
                    }
                    placeholder="+14155550123"
                    className={input}
                  />
                </div>

                {passportRequired && (
                  <>
                    <div className="col-span-2 sm:col-span-3">
                      <label className={label}>Passport number</label>
                      <input
                        value={form.passport_number}
                        onChange={(e) =>
                          setForms((prev) =>
                            prev.map((f, j) =>
                              j === i
                                ? { ...f, passport_number: e.target.value }
                                : f,
                            ),
                          )
                        }
                        placeholder="X1234567"
                        className={input}
                      />
                    </div>
                    <div className="col-span-1">
                      <label className={label}>Issuing country</label>
                      <input
                        value={form.passport_country}
                        onChange={(e) =>
                          setForms((prev) =>
                            prev.map((f, j) =>
                              j === i
                                ? {
                                    ...f,
                                    passport_country: e.target.value
                                      .toUpperCase()
                                      .slice(0, 2),
                                  }
                                : f,
                            ),
                          )
                        }
                        placeholder="US"
                        className={input}
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                      <label className={label}>Passport expiry</label>
                      <input
                        type="date"
                        value={form.passport_expiry}
                        onChange={(e) =>
                          setForms((prev) =>
                            prev.map((f, j) =>
                              j === i
                                ? { ...f, passport_expiry: e.target.value }
                                : f,
                            ),
                          )
                        }
                        className={`${input} [color-scheme:dark]`}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}

          {/* Extras */}
          <div className="mt-5 rounded-3xl border border-card-border bg-card p-6">
            <div className="mb-3 text-sm font-semibold tracking-wide text-slate-300">
              Extras
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setSeatModalOpen(true)}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-card-border bg-pill/80 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:text-white"
              >
                {seats.length > 0
                  ? `Seats: ${seats.map((s) => s.designator).join(", ")}`
                  : "Select seat"}
                <span className="text-accent-bright">+</span>
              </button>

              {bagServices.map((s) => {
                const qty = bagQty.get(s.id) ?? 0;
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2.5 rounded-full border border-card-border bg-pill/80 px-4 py-2 text-sm text-slate-200"
                  >
                    {s.baggage?.type === "carry_on" ? "Carry-on" : "Checked bag"}{" "}
                    · {money(s.totalUSD)}
                    <button
                      type="button"
                      disabled={qty <= 0}
                      onClick={() =>
                        setBagQty((prev) => new Map(prev).set(s.id, qty - 1))
                      }
                      className="flex size-6 cursor-pointer items-center justify-center rounded-full border border-card-border disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="w-3 text-center font-semibold text-white">
                      {qty}
                    </span>
                    <button
                      type="button"
                      disabled={qty >= s.maximumQuantity}
                      onClick={() =>
                        setBagQty((prev) => new Map(prev).set(s.id, qty + 1))
                      }
                      className="flex size-6 cursor-pointer items-center justify-center rounded-full border border-card-border disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                );
              })}

              <label className="flex cursor-pointer items-center gap-2.5 rounded-full border border-card-border bg-pill/80 px-4 py-2.5 text-sm font-medium text-slate-200">
                Protect Flight <span className="text-white">{money(protectFee)}</span>
                <input
                  type="checkbox"
                  checked={protect}
                  onChange={(e) => setProtect(e.target.checked)}
                  className="size-4 cursor-pointer accent-[#2e6bff]"
                />
              </label>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Protect Flight is our Refund Guarantee: cancel through Soar any
              time before your first departure and get back everything you
              paid except the protection fee — even on non-refundable fares.{" "}
              <a
                href="/refund-guarantee"
                target="_blank"
                className="underline underline-offset-2 hover:text-white"
              >
                Terms
              </a>
            </p>
          </div>
        </div>

        {/* Right: summary + pay */}
        <div className="w-full shrink-0 lg:w-96">
          <div className="sticky top-6 rounded-3xl border border-card-border bg-card p-6">
            <div className="text-sm font-semibold tracking-wide text-slate-300">
              Your trip
            </div>
            {offer.slices.map((slice, i) => (
              <div key={i} className="mt-3 border-b border-white/8 pb-3 text-sm">
                <div className="font-semibold text-white">
                  {slice.origin} → {slice.destination}
                  <span className="ml-2 font-normal text-muted">
                    {formatTime(slice.departure)} ·{" "}
                    {formatDuration(slice.durationMinutes)} ·{" "}
                    {slice.stops === 0
                      ? "Direct"
                      : `${slice.stops} stop${slice.stops > 1 ? "s" : ""}`}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {slice.segments[0]?.carrierName} ·{" "}
                  {new Date(
                    `${slice.departure.slice(0, 10)}T00:00:00`,
                  ).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </div>
            ))}

            <div className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-300">
                <span>Fare</span>
                <span>{money(offer.displayUSD)}</span>
              </div>
              {bagsTotalUSD > 0 && (
                <div className="flex justify-between text-slate-300">
                  <span>Bags</span>
                  <span>{money(bagsTotalUSD)}</span>
                </div>
              )}
              {seatsTotalUSD > 0 && (
                <div className="flex justify-between text-slate-300">
                  <span>Seats</span>
                  <span>{money(seatsTotalUSD)}</span>
                </div>
              )}
              {protect && (
                <div className="flex justify-between text-slate-300">
                  <span>Protect Flight</span>
                  <span>{money(protectFee)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-white/10 pt-2 text-base font-bold text-white">
                <span>Total</span>
                <span>{money(totalUSD)}</span>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm text-rose-200">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={!formValid || paying}
              onClick={() => {
                // Settings → Confirm Before Booking: one last look first.
                if (profile?.confirm_before_booking) setConfirmOpen(true);
                else void pay();
              }}
              className="mt-5 w-full cursor-pointer rounded-full bg-accent px-6 py-3.5 font-semibold text-white shadow-[0_0_24px_rgba(46,107,255,0.5)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {paying ? "Booking…" : `Pay ${money(totalUSD)}`}
            </button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
              Paid from the Duffel test balance — card details never touch
              this app.
            </p>
          </div>
        </div>
      </div>

      {confirmOpen && offer && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 animate-[soar-backdrop-in_.24s_ease_both] bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm booking"
            className="relative w-full max-w-sm animate-[soar-dialog-in_.26s_cubic-bezier(.22,1,.36,1)_both] rounded-3xl border border-card-border bg-[#0a1122] p-6 shadow-2xl shadow-black/60"
          >
            <h2 className="text-xl font-bold text-white">One last look</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              {offer.slices[0]?.originCity}{" "}
              {offer.slices.length > 1 ? "⇄" : "→"}{" "}
              {offer.slices[0]?.destinationCity} ·{" "}
              {forms.length} passenger{forms.length > 1 ? "s" : ""}
              {protect ? " · Protect Flight" : ""}
            </p>
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200">
              Paying <b className="text-white">{money(totalUSD)}</b> from the
              Duffel test balance.
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  void pay();
                }}
                className="flex-1 cursor-pointer rounded-full bg-accent py-3 font-semibold text-white transition hover:brightness-110"
              >
                Looks good — pay
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="cursor-pointer rounded-full border border-card-border bg-pill/80 px-5 py-3 font-semibold text-slate-200"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      <SeatMapModal
        open={seatModalOpen}
        offerId={offer.id}
        passengers={data?.passengers ?? []}
        selections={seats}
        onClose={() => setSeatModalOpen(false)}
        onApply={(next) => {
          setSeats(next);
          setSeatModalOpen(false);
        }}
      />
    </main>
  );
}
