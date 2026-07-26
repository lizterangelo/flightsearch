import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { orderForUser } from "@/lib/data";
import type { FlightOffer } from "@/lib/types";
import OrderDetail from "@/components/trips/OrderDetail";

export const dynamic = "force-dynamic";

/** One booking: itinerary, PNR, protection status, cancellation. */
export default async function OrderPage({
  params,
}: PageProps<"/flights/orders/[orderId]">) {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const { orderId } = await params;
  const order = await orderForUser(orderId);
  if (!order) notFound();

  const parsed = order.offer_snapshot as FlightOffer;
  const snapshot = parsed?.slices?.length ? parsed : null;

  return (
    <OrderDetail
      order={{
        duffelOrderId: order.duffel_order_id,
        bookingReference: order.booking_reference,
        status: order.status,
        displayTotalUSD: order.display_total_usd,
        protect: order.protect,
        protectFeeUSD: order.protect_fee_usd,
        liveMode: order.live_mode,
        cancelledAt: order.cancelled_at,
        refundAmount: order.refund_amount,
        refundCurrency: order.refund_currency,
        createdAt: order.created_at,
      }}
      snapshot={snapshot}
    />
  );
}
