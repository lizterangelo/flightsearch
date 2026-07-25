/**
 * Feature flags derived from the environment. The app must boot with only
 * DUFFEL_API_TOKEN present; everything else is optional.
 */

export const flags = {
  /** Replay saved fixtures instead of calling Duffel (offline UI work). */
  mockFixtures: () => process.env.MOCK_FIXTURES === "1",
  /** Force the plain offer-request path instead of batch offer requests. */
  batchDisabled: () => process.env.DUFFEL_BATCH === "0",
  /** Allow the price-calendar to backfill missing days with live searches. */
  calendarFill: () => process.env.CALENDAR_FILL === "1",
  /** Poll price watches from instrumentation.ts while the dev server runs. */
  watchPoll: () => process.env.WATCH_POLL === "1",
};
