import type { NextRequest } from "next/server";
import {
  duffelClient,
  duffelConfigured,
  duffelErrorMessage,
} from "@/lib/duffel/client";
import { toUSD } from "@/lib/currency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/offers/off_.../seat-map — Duffel seat maps trimmed for the
 * cabin-grid modal. Airlines without seat maps return { cabins: [] }
 * (normal in test mode outside Duffel Airways).
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/offers/[offerId]/seat-map">,
): Promise<Response> {
  const { offerId } = await ctx.params;
  if (!offerId.startsWith("off_")) {
    return Response.json({ error: "Invalid offer id" }, { status: 400 });
  }
  if (!duffelConfigured()) {
    return Response.json({ error: "Not configured" }, { status: 503 });
  }

  try {
    const res = await duffelClient().seatMaps.get({ offer_id: offerId });
    const maps = (res.data ?? []).map((map) => ({
      segmentId: map.segment_id,
      sliceId: map.slice_id,
      cabins: map.cabins.map((cabin) => ({
        cabinClass: cabin.cabin_class,
        deck: cabin.deck,
        aisles: cabin.aisles,
        rows: cabin.rows.map((row) => ({
          sections: row.sections.map((section) => ({
            elements: section.elements.map((el) => {
              if (el.type !== "seat") {
                return { type: el.type };
              }
              const seat = el as {
                type: "seat";
                designator: string;
                available_services: {
                  id: string;
                  passenger_id: string;
                  total_amount: string;
                  total_currency: string;
                }[];
              };
              return {
                type: "seat",
                designator: seat.designator,
                services: seat.available_services.map((s) => ({
                  id: s.id,
                  passengerId: s.passenger_id,
                  totalAmount: s.total_amount,
                  totalCurrency: s.total_currency,
                  totalUSD: toUSD(
                    Number(s.total_amount) || 0,
                    s.total_currency ?? "USD",
                  ),
                })),
              };
            }),
          })),
        })),
      })),
    }));
    return Response.json({ maps });
  } catch (err) {
    return Response.json(
      { error: duffelErrorMessage(err) },
      { status: 502 },
    );
  }
}
