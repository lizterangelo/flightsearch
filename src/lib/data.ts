import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "./supabase/server";
import type { FlightOffer } from "./types";

/**
 * Server-side data access over Supabase (RLS-scoped). Account-tab CRUD
 * (friends, loyalty, cards, profile edits) runs client-side with the same
 * policies; these helpers cover the server routes and pages.
 */

/* -------------------------------- profile ------------------------------- */

export interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  nickname: string | null;
  describes: string | null;
  phone: string | null;
  avatar_url: string | null;
  legal_name: string | null;
  born_on: string | null;
  passport_number: string | null;
  passport_country: string | null;
  passport_expiry: string | null;
  known_traveler_number: string | null;
  currency: string;
  theme: "light" | "dark" | "system";
  confirm_before_booking: boolean;
  summary_cards: boolean;
  power_saver: boolean;
  notif_flight_alerts: boolean;
  notif_watched: boolean;
  notif_checkin: boolean;
  notif_marketing: boolean;
  beta_auto_checkin: boolean;
  beta_price_drop: boolean;
  beta_agent_booking: boolean;
  points: number;
  referral_credit_usd: number;
  account_uid: string;
  created_at: string;
}

export async function getProfile(
  supabase?: SupabaseClient,
): Promise<ProfileRow | null> {
  const db = supabase ?? (await supabaseServer());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

/* -------------------------------- orders -------------------------------- */

export interface OrderRow {
  id: string;
  duffel_order_id: string;
  user_id: string;
  booking_reference: string;
  status: "confirmed" | "cancelled";
  total_amount: string;
  total_currency: string;
  display_total_usd: number;
  protect: boolean;
  protect_fee_usd: number;
  offer_snapshot: FlightOffer | Record<string, never>;
  live_mode: boolean;
  cancelled_at: string | null;
  refund_amount: string | null;
  refund_currency: string | null;
  /** Set when the iMessage agent booked for a linked web account. */
  on_behalf_user_id: string | null;
  created_at: string;
}

export async function insertOrder(row: {
  duffelOrderId: string;
  userId: string;
  bookingReference: string;
  totalAmount: string;
  totalCurrency: string;
  displayTotalUSD: number;
  protect: boolean;
  protectFeeUSD: number;
  offerSnapshot: FlightOffer | null;
  liveMode: boolean;
  onBehalfUserId?: string | null;
}): Promise<void> {
  const db = await supabaseServer();
  const { error } = await db.from("orders").insert({
    duffel_order_id: row.duffelOrderId,
    user_id: row.userId,
    booking_reference: row.bookingReference,
    total_amount: row.totalAmount,
    total_currency: row.totalCurrency,
    display_total_usd: row.displayTotalUSD,
    protect: row.protect,
    protect_fee_usd: row.protectFeeUSD,
    offer_snapshot: row.offerSnapshot ?? {},
    live_mode: row.liveMode,
    on_behalf_user_id: row.onBehalfUserId ?? null,
  });
  if (error) throw new Error(`Order save failed: ${error.message}`);
}

export async function listOrdersForUser(): Promise<OrderRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as OrderRow[] | null) ?? [];
}

export async function orderForUser(
  duffelOrderId: string,
): Promise<OrderRow | null> {
  const db = await supabaseServer();
  const { data } = await db
    .from("orders")
    .select("*")
    .eq("duffel_order_id", duffelOrderId)
    .maybeSingle();
  return (data as OrderRow | null) ?? null;
}

export async function markOrderCancelled(
  duffelOrderId: string,
  refundAmount: string | null,
  refundCurrency: string | null,
): Promise<void> {
  const db = await supabaseServer();
  await db
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      refund_amount: refundAmount,
      refund_currency: refundCurrency,
    })
    .eq("duffel_order_id", duffelOrderId);
}

/** Booking reward: 1 point per display dollar. */
export async function addPoints(userId: string, points: number): Promise<void> {
  const db = await supabaseServer();
  const { data } = await db
    .from("profiles")
    .select("points")
    .eq("id", userId)
    .maybeSingle();
  const current = (data as { points: number } | null)?.points ?? 0;
  await db
    .from("profiles")
    .update({ points: current + points })
    .eq("id", userId);
}

/* -------------------------------- watches ------------------------------- */

export interface WatchRow {
  id: string;
  user_id: string;
  itinerary_key: string;
  search_url: string;
  label: string;
  cabin: string;
  last_price_usd: number | null;
  last_checked_at: string | null;
  delta_usd: number;
  seen: boolean;
  created_at: string;
}

export async function staleWatchesForUser(
  limit: number,
  staleMinutes: number,
): Promise<WatchRow[]> {
  const db = await supabaseServer();
  const cutoff = new Date(Date.now() - staleMinutes * 60000).toISOString();
  const { data } = await db
    .from("watches")
    .select("*")
    .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  return (data as WatchRow[] | null) ?? [];
}

export async function recordWatchPrice(
  id: string,
  priceUSD: number,
): Promise<void> {
  const db = await supabaseServer();
  const { data } = await db
    .from("watches")
    .select("last_price_usd")
    .eq("id", id)
    .maybeSingle();
  const last = (data as { last_price_usd: number | null } | null)
    ?.last_price_usd;
  const delta = last === null || last === undefined ? 0 : priceUSD - last;
  await db
    .from("watches")
    .update({
      last_price_usd: priceUSD,
      last_checked_at: new Date().toISOString(),
      delta_usd: delta,
      ...(delta !== 0 ? { seen: false } : {}),
    })
    .eq("id", id);
}

/* ---------------------------- price observations ------------------------ */

export async function upsertObservation(row: {
  origin: string;
  destination: string;
  departDate: string;
  cabin: string;
  tripType: string;
  amountUSD: number;
  source?: string;
  ttlDays?: number;
}): Promise<void> {
  const db = await supabaseServer();
  // Writes go through the validated SECURITY DEFINER RPC (the table's
  // anonymous write policies were removed per the security advisors).
  await db.rpc("record_observation", {
    p_origin: row.origin,
    p_destination: row.destination,
    p_depart_date: row.departDate,
    p_cabin: row.cabin,
    p_trip_type: row.tripType,
    p_amount_usd: row.amountUSD,
    p_source: row.source ?? "live_search",
    p_ttl_days: row.ttlDays ?? 30,
  });
}

export interface ObservationRow {
  depart_date: string;
  amount_usd: number;
  source: string;
  observed_at: string;
  expires_at: string;
}

export async function calendarWindow(params: {
  origin: string;
  destination: string;
  cabin: string;
  start: string;
  end: string;
}): Promise<ObservationRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from("price_observations")
    .select("depart_date, amount_usd, source, observed_at, expires_at")
    .eq("origin", params.origin)
    .eq("destination", params.destination)
    .eq("cabin", params.cabin)
    .eq("trip_type", "one_way")
    .gte("depart_date", params.start)
    .lte("depart_date", params.end)
    .gt("expires_at", new Date().toISOString())
    .order("depart_date");
  return (data as ObservationRow[] | null) ?? [];
}
