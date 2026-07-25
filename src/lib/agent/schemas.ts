import { z } from "zod";

/**
 * Lax extraction schemas for Stagehand extract(). Deliberately permissive —
 * LLM extraction is noisy; normalize.ts does the strict parsing and drops
 * anything it cannot make sense of.
 */

export const ScrapedFareSchema = z.object({
  airline: z.string().describe("Airline name as shown, e.g. 'Frontier'"),
  flightNumber: z
    .string()
    .optional()
    .describe("Flight number if visible, e.g. 'F9 1234'"),
  departTime: z
    .string()
    .describe("Departure time exactly as shown, e.g. '7:15 AM' or '19:05'"),
  arriveTime: z.string().describe("Arrival time exactly as shown"),
  nextDayArrival: z
    .boolean()
    .optional()
    .describe("True if the arrival is marked +1 / next day"),
  stops: z
    .union([z.number(), z.string()])
    .describe("Number of stops, or the label shown, e.g. 'Nonstop', '1 stop'"),
  stopAirports: z.array(z.string()).optional(),
  durationText: z.string().optional().describe("Duration as shown, e.g. '3h 05m'"),
  price: z
    .union([z.number(), z.string()])
    .describe("Price exactly as displayed, e.g. '$39' or 39"),
  fareBrand: z.string().optional().describe("Fare brand/class label if shown"),
});

export const ScrapedFaresSchema = z.object({
  fares: z.array(ScrapedFareSchema),
});

export type ScrapedFare = z.infer<typeof ScrapedFareSchema>;
export type ScrapedFares = z.infer<typeof ScrapedFaresSchema>;
