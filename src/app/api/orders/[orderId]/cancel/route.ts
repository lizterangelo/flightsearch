import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { orderForUser } from "@/lib/data";
import {
  duffelClient,
  duffelErrorMessage,
} from "@/lib/duffel/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/orders/ord_.../cancel — create a Duffel order cancellation
 * (a QUOTE: nothing is final until /confirm).
 */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/orders/[orderId]/cancel">,
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in" }, { status: 401 });

  const { orderId } = await ctx.params;
  const order = await orderForUser(orderId);
  if (!order) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.status === "cancelled") {
    return Response.json({ error: "Already cancelled" }, { status: 409 });
  }

  try {
    const res = await duffelClient().orderCancellations.create({
      order_id: orderId,
    });
    return Response.json({
      cancellationId: res.data.id,
      refundAmount: res.data.refund_amount ?? null,
      refundCurrency: res.data.refund_currency ?? null,
    });
  } catch (err) {
    return Response.json(
      { error: duffelErrorMessage(err) },
      { status: 502 },
    );
  }
}
