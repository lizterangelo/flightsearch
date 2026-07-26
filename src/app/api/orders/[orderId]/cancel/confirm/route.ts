import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { markOrderCancelled, orderForUser } from "@/lib/data";
import {
  duffelClient,
  duffelErrorMessage,
} from "@/lib/duffel/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ cancellationId: z.string().startsWith("ore_") });

/** POST /api/orders/ord_.../cancel/confirm — finalize the cancellation. */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/orders/[orderId]/cancel/confirm">,
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in" }, { status: 401 });

  const { orderId } = await ctx.params;
  const order = await orderForUser(orderId);
  if (!order) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid cancellation id" }, { status: 400 });
  }

  try {
    const res = await duffelClient().orderCancellations.confirm(
      parsed.data.cancellationId,
    );
    await markOrderCancelled(
      orderId,
      res.data.refund_amount ?? null,
      res.data.refund_currency ?? null,
    );
    return Response.json({
      ok: true,
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
