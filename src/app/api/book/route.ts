import { z } from "zod";
import {
  duffelClient,
  duffelErrorMessage,
} from "@/lib/providers/duffel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BookRequest = z.object({
  offerId: z.string().startsWith("off_"),
  passengers: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.enum(["mr", "ms", "mrs", "miss", "dr"]),
        given_name: z.string().trim().min(1).max(80),
        family_name: z.string().trim().min(1).max(80),
        born_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        gender: z.enum(["m", "f"]),
        email: z.string().email(),
        phone_number: z
          .string()
          .regex(/^\+[1-9]\d{6,14}$/, "Use international format, e.g. +14155550123"),
      }),
    )
    .min(1)
    .max(8),
});

/**
 * POST /api/book — create a Duffel order for the given offer, paid from the
 * prepaid Duffel balance. No card data ever passes through this app.
 */
export async function POST(req: Request): Promise<Response> {
  if (!process.env.DUFFEL_API_TOKEN) {
    return Response.json(
      { error: "Booking is not configured (DUFFEL_API_TOKEN missing)" },
      { status: 503 },
    );
  }

  const parsed = BookRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return Response.json(
      { error: `Invalid booking details: ${issue?.path.join(".")} ${issue?.message}` },
      { status: 400 },
    );
  }
  const { offerId, passengers } = parsed.data;

  try {
    const duffel = duffelClient();

    // Re-fetch the offer for its CURRENT price — offers reprice/expire, and
    // the payment amount must match exactly.
    const fresh = await duffel.offers.get(offerId);
    const offer = fresh.data;

    const order = await duffel.orders.create({
      selected_offers: [offerId],
      type: "instant",
      payments: [
        {
          type: "balance",
          amount: offer.total_amount,
          currency: offer.total_currency,
        },
      ],
      passengers,
    });

    return Response.json({
      orderId: order.data.id,
      bookingReference: order.data.booking_reference,
      totalAmount: order.data.total_amount,
      totalCurrency: order.data.total_currency,
    });
  } catch (err) {
    const message = duffelErrorMessage(err);
    const expired = /not.*found|expired|no longer available/i.test(message);
    const balance = /insufficient|balance/i.test(message);
    return Response.json(
      {
        error: expired
          ? "This offer has expired — please search again for current prices."
          : balance
            ? "Insufficient Duffel balance. Top up in the Duffel dashboard (duffel.com) and try again."
            : message,
      },
      { status: expired ? 410 : 502 },
    );
  }
}
