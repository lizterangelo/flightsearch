import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { toUSD } from "@/lib/currency";
import {
  duffelClient,
  duffelErrorMessage,
  duffelTestMode,
} from "@/lib/duffel/client";
import { mapDuffelOffer } from "@/lib/duffel/map";
import { addPoints, insertOrder } from "@/lib/data";

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
        identity_documents: z
          .array(
            z.object({
              type: z.literal("passport"),
              unique_identifier: z.string().trim().min(3).max(30),
              issuing_country_code: z.string().regex(/^[A-Z]{2}$/),
              expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            }),
          )
          .max(1)
          .optional(),
      }),
    )
    .min(1)
    .max(9),
  services: z
    .array(z.object({ id: z.string().min(1), quantity: z.number().int().min(1).max(9) }))
    .max(30)
    .default([]),
  loyaltyAccounts: z
    .array(
      z.object({
        airline_iata_code: z.string().regex(/^[A-Z0-9]{2}$/),
        account_number: z.string().min(2).max(40),
      }),
    )
    .max(10)
    .default([]),
  protect: z.boolean().default(false),
  protectFeeUSD: z.number().min(0).max(500).default(0),
  displayTotalUSD: z.number().min(0),
});

/**
 * POST /api/book — create a Duffel order for the given offer + services,
 * paid from the Duffel balance (unlimited in test mode). The payment amount
 * is recomputed server-side from the FRESH offer + its services; the
 * Undercut/Protect amounts are display+metadata only and never change what
 * Duffel is paid.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Sign in to book" }, { status: 401 });
  }
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
  const {
    offerId,
    passengers,
    services,
    loyaltyAccounts,
    protect,
    protectFeeUSD,
    displayTotalUSD,
  } = parsed.data;

  try {
    const duffel = duffelClient();

    // Re-fetch the offer WITH services for its current price and to validate
    // the chosen service ids — the payment amount must match exactly.
    const fresh = await duffel.offers.get(offerId, {
      return_available_services: true,
    });
    const offer = fresh.data;
    const available = new Map(
      (offer.available_services ?? []).map((s) => [s.id, s]),
    );

    // Seat services come from the seat map (not available_services), so only
    // validate the ones we can see; Duffel rejects anything truly invalid.
    let servicesTotal = 0;
    for (const svc of services) {
      const known = available.get(svc.id);
      if (known) servicesTotal += Number(known.total_amount) * svc.quantity;
    }
    const seatServiceIds = services
      .filter((s) => !available.has(s.id))
      .map((s) => s.id);
    if (seatServiceIds.length > 0) {
      // Seat prices arrive via the seat map; re-fetch to price them exactly.
      const seatMaps = await duffel.seatMaps.get({ offer_id: offerId });
      const seatPrices = new Map<string, number>();
      for (const map of seatMaps.data ?? []) {
        for (const cabin of map.cabins) {
          for (const row of cabin.rows) {
            for (const section of row.sections) {
              for (const el of section.elements) {
                if (el.type !== "seat") continue;
                const seat = el as {
                  available_services?: { id: string; total_amount: string }[];
                };
                for (const s of seat.available_services ?? []) {
                  seatPrices.set(s.id, Number(s.total_amount));
                }
              }
            }
          }
        }
      }
      for (const id of seatServiceIds) {
        const price = seatPrices.get(id);
        if (price === undefined) {
          return Response.json(
            { error: "A selected seat is no longer available — reopen the seat map." },
            { status: 409 },
          );
        }
        servicesTotal += price;
      }
    }

    const amount = (Number(offer.total_amount) + servicesTotal).toFixed(2);

    const order = await duffel.orders.create({
      selected_offers: [offerId],
      type: "instant",
      services: services.length > 0 ? services : undefined,
      payments: [
        {
          type: "balance",
          amount,
          currency: offer.total_currency,
        },
      ],
      // Loyalty programmes belong to the account holder — passenger 1.
      passengers: passengers.map((p, i) =>
        i === 0 && loyaltyAccounts.length > 0
          ? { ...p, loyalty_programme_accounts: loyaltyAccounts }
          : p,
      ),
      metadata: {
        protect: protect ? "1" : "0",
        protect_fee_usd: String(protectFeeUSD),
        undercut_display: "1",
      },
    });

    const snapshot = mapDuffelOffer(offer, "booked");
    await insertOrder({
      duffelOrderId: order.data.id,
      userId: user.id,
      bookingReference: order.data.booking_reference,
      totalAmount: order.data.total_amount ?? amount,
      totalCurrency: order.data.total_currency ?? offer.total_currency,
      displayTotalUSD:
        displayTotalUSD ||
        toUSD(Number(amount), offer.total_currency ?? "USD"),
      protect,
      protectFeeUSD,
      offerSnapshot: snapshot,
      liveMode: !duffelTestMode(),
    });
    // Booking reward: a point per display dollar.
    await addPoints(user.id, Math.max(0, Math.floor(displayTotalUSD)));

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
