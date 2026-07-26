import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listOrdersForUser, type OrderRow } from "@/lib/data";
import type { FlightOffer } from "@/lib/types";
import OrderCard from "@/components/trips/OrderCard";
import WatchList from "@/components/trips/WatchList";

export const dynamic = "force-dynamic";

function firstDeparture(row: OrderRow): string {
  const snapshot = row.offer_snapshot as FlightOffer;
  return snapshot?.slices?.[0]?.departure ?? "9999";
}

/** My Flights: upcoming and past orders for the signed-in user. */
export default async function MyFlightsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const orders = await listOrdersForUser();
  const now = new Date().toISOString().slice(0, 16);
  const upcoming = orders.filter(
    (o) => o.status === "confirmed" && firstDeparture(o) >= now,
  );
  const past = orders.filter(
    (o) => o.status !== "confirmed" || firstDeparture(o) < now,
  );

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-24">
      <h1 className="mt-4 text-3xl font-bold text-white">My Flights</h1>

      {orders.length === 0 && (
        <div className="mt-16 text-center">
          <p className="text-lg text-slate-300">No trips yet.</p>
          <p className="mt-1 text-sm text-muted">
            Book a flight and it lands here.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-accent px-6 py-3 font-semibold text-white"
          >
            Search flights
          </Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-semibold tracking-widest text-muted">
            UPCOMING
          </h2>
          <div className="space-y-4">
            {upcoming.map((order) => (
              <OrderCard key={order.duffel_order_id} order={order} />
            ))}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-sm font-semibold tracking-widest text-muted">
            PAST & CANCELLED
          </h2>
          <div className="space-y-4 opacity-75">
            {past.map((order) => (
              <OrderCard key={order.duffel_order_id} order={order} />
            ))}
          </div>
        </>
      )}

      <WatchList />
    </main>
  );
}
