import type { NextRequest } from "next/server";
import {
  duffelClient,
  duffelErrorMessage,
  duffelTestMode,
} from "@/lib/duffel/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/book/offer?id=off_... — fresh offer details for the checkout
 * page: current price, expiry, passenger ids to fill, and leg summary.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !id.startsWith("off_")) {
    return Response.json({ error: "Invalid offer id" }, { status: 400 });
  }
  if (!process.env.DUFFEL_API_TOKEN) {
    return Response.json(
      { error: "Booking is not configured (DUFFEL_API_TOKEN missing)" },
      { status: 503 },
    );
  }

  try {
    const res = await duffelClient().offers.get(id);
    const offer = res.data;
    return Response.json({
      id: offer.id,
      expiresAt: offer.expires_at,
      totalAmount: offer.total_amount,
      totalCurrency: offer.total_currency,
      owner: {
        name: offer.owner?.name ?? "Airline",
        iata: offer.owner?.iata_code ?? "",
      },
      testData: duffelTestMode(),
      passengers: offer.passengers.map((p) => ({ id: p.id, type: p.type })),
      slices: offer.slices.map((slice) => ({
        origin: slice.origin?.iata_code ?? "",
        destination: slice.destination?.iata_code ?? "",
        segments: slice.segments.map((seg) => ({
          carrier:
            seg.marketing_carrier?.name ??
            seg.operating_carrier?.name ??
            "Flight",
          flightNumber: seg.marketing_carrier_flight_number
            ? `${seg.marketing_carrier?.iata_code ?? ""} ${seg.marketing_carrier_flight_number}`
            : "",
          origin: seg.origin?.iata_code ?? "",
          destination: seg.destination?.iata_code ?? "",
          departingAt: seg.departing_at,
          arrivingAt: seg.arriving_at,
        })),
      })),
    });
  } catch (err) {
    const message = duffelErrorMessage(err);
    const gone = /not.*found|expired/i.test(message);
    return Response.json(
      { error: gone ? "This offer has expired — please search again." : message },
      { status: gone ? 410 : 502 },
    );
  }
}
