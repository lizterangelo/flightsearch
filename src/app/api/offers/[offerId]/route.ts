import type { NextRequest } from "next/server";
import {
  duffelClient,
  duffelConfigured,
  duffelErrorMessage,
  duffelTestMode,
} from "@/lib/duffel/client";
import { mapDuffelOffer } from "@/lib/duffel/map";
import { toUSD } from "@/lib/currency";
import type { OfferService } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RawService {
  id: string;
  type: string;
  total_amount: string;
  total_currency: string;
  maximum_quantity: number;
  passenger_ids: string[];
  segment_ids: string[];
  metadata?: {
    type?: "checked" | "carry_on";
    maximum_weight_kg?: number | null;
    refund_amount?: string;
    merchant_copy?: string;
  };
}

function mapService(raw: RawService): OfferService {
  const amount = Number(raw.total_amount);
  return {
    id: raw.id,
    type: raw.type,
    totalAmount: raw.total_amount,
    totalCurrency: raw.total_currency,
    totalUSD: toUSD(
      Number.isFinite(amount) ? amount : 0,
      raw.total_currency ?? "USD",
    ),
    maximumQuantity: raw.maximum_quantity ?? 1,
    ...(raw.type === "baggage" && raw.metadata?.type
      ? {
          baggage: {
            type: raw.metadata.type,
            maximumWeightKg: raw.metadata.maximum_weight_kg ?? null,
          },
        }
      : {}),
    passengerIds: raw.passenger_ids ?? [],
    segmentIds: raw.segment_ids ?? [],
  };
}

/**
 * GET /api/offers/off_... — fresh offer for the details panel / checkout:
 * the mapped FlightOffer, purchasable services, and passenger ids to fill.
 * 410 when the offer has expired (caller re-resolves via select_* search).
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/offers/[offerId]">,
): Promise<Response> {
  const { offerId } = await ctx.params;
  if (!offerId.startsWith("off_")) {
    return Response.json({ error: "Invalid offer id" }, { status: 400 });
  }
  if (!duffelConfigured()) {
    return Response.json(
      { error: "Booking is not configured (DUFFEL_API_TOKEN missing)" },
      { status: 503 },
    );
  }

  try {
    const res = await duffelClient().offers.get(offerId, {
      return_available_services: true,
    });
    const raw = res.data;
    const offer = mapDuffelOffer(raw, "detail");
    if (!offer) {
      return Response.json(
        { error: "Offer could not be read" },
        { status: 502 },
      );
    }
    const services = (
      (raw.available_services ?? []) as unknown as RawService[]
    ).map(mapService);

    return Response.json({
      offer,
      services,
      passengers: raw.passengers.map((p) => ({
        id: p.id,
        type: p.type ?? "adult",
      })),
      testMode: duffelTestMode(),
    });
  } catch (err) {
    const message = duffelErrorMessage(err);
    const gone = /not.*found|expired|no longer available/i.test(message);
    return Response.json(
      {
        error: gone
          ? "This offer has expired — please search again."
          : message,
      },
      { status: gone ? 410 : 502 },
    );
  }
}
