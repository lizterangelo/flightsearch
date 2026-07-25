import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * SQLite persistence: users, sessions, OTP codes, orders, price watches,
 * and the price-observation cache behind the calendar heatmap.
 * Lazy singleton; migrations step PRAGMA user_version on boot.
 */

const MIGRATIONS: string[] = [
  // 1 — initial schema
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL UNIQUE,
    identifier_type TEXT NOT NULL CHECK (identifier_type IN ('phone','email')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE otp_codes (
    identifier TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    duffel_order_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    booking_reference TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed',
    total_amount TEXT NOT NULL,
    total_currency TEXT NOT NULL,
    display_total_usd REAL NOT NULL,
    protect INTEGER NOT NULL DEFAULT 0,
    protect_fee_usd REAL NOT NULL DEFAULT 0,
    offer_snapshot TEXT NOT NULL,
    live_mode INTEGER NOT NULL DEFAULT 0,
    cancelled_at TEXT,
    refund_amount TEXT,
    refund_currency TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_orders_user ON orders (user_id, created_at DESC);
  CREATE TABLE watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    itinerary_key TEXT NOT NULL,
    search_url TEXT NOT NULL,
    label TEXT NOT NULL,
    cabin TEXT NOT NULL,
    last_price_usd REAL,
    last_checked_at TEXT,
    delta_usd REAL NOT NULL DEFAULT 0,
    seen INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, itinerary_key)
  );
  CREATE TABLE price_observations (
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    depart_date TEXT NOT NULL,
    cabin TEXT NOT NULL,
    trip_type TEXT NOT NULL,
    amount_usd REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'live_search',
    observed_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    PRIMARY KEY (origin, destination, depart_date, cabin, trip_type)
  );
  CREATE INDEX idx_obs_route ON price_observations (origin, destination, cabin);
  `,
];

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;
  const dir = path.join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "soar.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const version = (db.pragma("user_version", { simple: true }) as number) ?? 0;
  for (let v = version; v < MIGRATIONS.length; v++) {
    const migrate = db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    });
    migrate();
  }
  instance = db;
  return db;
}

/* ------------------------------ users/auth ------------------------------ */

export interface UserRow {
  id: number;
  identifier: string;
  identifier_type: "phone" | "email";
  created_at: string;
}

export function upsertUser(
  identifier: string,
  type: "phone" | "email",
): UserRow {
  const db = getDb();
  db.prepare(
    `INSERT INTO users (identifier, identifier_type) VALUES (?, ?)
     ON CONFLICT(identifier) DO NOTHING`,
  ).run(identifier, type);
  return db
    .prepare(`SELECT * FROM users WHERE identifier = ?`)
    .get(identifier) as UserRow;
}

export function createSession(
  tokenHash: string,
  userId: number,
  expiresAt: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`,
    )
    .run(tokenHash, userId, expiresAt);
}

export function sessionUser(tokenHash: string): UserRow | null {
  const row = getDb()
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
    )
    .get(tokenHash) as UserRow | undefined;
  return row ?? null;
}

export function touchSession(tokenHash: string, expiresAt: string): void {
  getDb()
    .prepare(`UPDATE sessions SET expires_at = ? WHERE token_hash = ?`)
    .run(expiresAt, tokenHash);
}

export function deleteSession(tokenHash: string): void {
  getDb().prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
}

export function putOtp(
  identifier: string,
  codeHash: string,
  expiresAt: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO otp_codes (identifier, code_hash, expires_at, attempts)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(identifier) DO UPDATE SET
         code_hash = excluded.code_hash,
         expires_at = excluded.expires_at,
         attempts = 0`,
    )
    .run(identifier, codeHash, expiresAt);
}

export interface OtpRow {
  identifier: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
}

export function getOtp(identifier: string): OtpRow | null {
  return (
    (getDb()
      .prepare(`SELECT * FROM otp_codes WHERE identifier = ?`)
      .get(identifier) as OtpRow | undefined) ?? null
  );
}

export function bumpOtpAttempts(identifier: string): void {
  getDb()
    .prepare(`UPDATE otp_codes SET attempts = attempts + 1 WHERE identifier = ?`)
    .run(identifier);
}

export function deleteOtp(identifier: string): void {
  getDb().prepare(`DELETE FROM otp_codes WHERE identifier = ?`).run(identifier);
}

/* -------------------------------- orders -------------------------------- */

export interface OrderRow {
  id: number;
  duffel_order_id: string;
  user_id: number;
  booking_reference: string;
  status: "confirmed" | "cancelled";
  total_amount: string;
  total_currency: string;
  display_total_usd: number;
  protect: 0 | 1;
  protect_fee_usd: number;
  offer_snapshot: string;
  live_mode: 0 | 1;
  cancelled_at: string | null;
  refund_amount: string | null;
  refund_currency: string | null;
  created_at: string;
}

export function insertOrder(row: {
  duffelOrderId: string;
  userId: number;
  bookingReference: string;
  totalAmount: string;
  totalCurrency: string;
  displayTotalUSD: number;
  protect: boolean;
  protectFeeUSD: number;
  offerSnapshot: string;
  liveMode: boolean;
}): void {
  getDb()
    .prepare(
      `INSERT INTO orders (
        duffel_order_id, user_id, booking_reference, total_amount,
        total_currency, display_total_usd, protect, protect_fee_usd,
        offer_snapshot, live_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.duffelOrderId,
      row.userId,
      row.bookingReference,
      row.totalAmount,
      row.totalCurrency,
      row.displayTotalUSD,
      row.protect ? 1 : 0,
      row.protectFeeUSD,
      row.offerSnapshot,
      row.liveMode ? 1 : 0,
    );
}

export function listOrdersForUser(userId: number): OrderRow[] {
  return getDb()
    .prepare(`SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as OrderRow[];
}

export function orderForUser(
  userId: number,
  duffelOrderId: string,
): OrderRow | null {
  return (
    (getDb()
      .prepare(
        `SELECT * FROM orders WHERE user_id = ? AND duffel_order_id = ?`,
      )
      .get(userId, duffelOrderId) as OrderRow | undefined) ?? null
  );
}

export function markOrderCancelled(
  duffelOrderId: string,
  refundAmount: string | null,
  refundCurrency: string | null,
): void {
  getDb()
    .prepare(
      `UPDATE orders SET status = 'cancelled', cancelled_at = datetime('now'),
        refund_amount = ?, refund_currency = ? WHERE duffel_order_id = ?`,
    )
    .run(refundAmount, refundCurrency, duffelOrderId);
}

/* ------------------------------ observations ----------------------------- */

export function upsertObservation(row: {
  origin: string;
  destination: string;
  departDate: string;
  cabin: string;
  tripType: string;
  amountUSD: number;
  source?: string;
  ttlDays?: number;
}): void {
  getDb()
    .prepare(
      `INSERT INTO price_observations (
        origin, destination, depart_date, cabin, trip_type, amount_usd,
        source, observed_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now', ?))
      ON CONFLICT(origin, destination, depart_date, cabin, trip_type)
      DO UPDATE SET
        amount_usd = excluded.amount_usd,
        source = excluded.source,
        observed_at = excluded.observed_at,
        expires_at = excluded.expires_at`,
    )
    .run(
      row.origin,
      row.destination,
      row.departDate,
      row.cabin,
      row.tripType,
      row.amountUSD,
      row.source ?? "live_search",
      `+${row.ttlDays ?? 30} days`,
    );
}

export interface ObservationRow {
  depart_date: string;
  amount_usd: number;
  source: string;
  observed_at: string;
  expires_at: string;
}

export function calendarWindow(params: {
  origin: string;
  destination: string;
  cabin: string;
  start: string;
  end: string;
}): ObservationRow[] {
  return getDb()
    .prepare(
      `SELECT depart_date, amount_usd, source, observed_at, expires_at
       FROM price_observations
       WHERE origin = ? AND destination = ? AND cabin = ?
         AND trip_type = 'one_way'
         AND depart_date BETWEEN ? AND ?
         AND expires_at > datetime('now')
       ORDER BY depart_date`,
    )
    .all(
      params.origin,
      params.destination,
      params.cabin,
      params.start,
      params.end,
    ) as ObservationRow[];
}

/* -------------------------------- watches -------------------------------- */

export interface WatchRow {
  id: number;
  user_id: number;
  itinerary_key: string;
  search_url: string;
  label: string;
  cabin: string;
  last_price_usd: number | null;
  last_checked_at: string | null;
  delta_usd: number;
  seen: 0 | 1;
  created_at: string;
}

export function upsertWatch(row: {
  userId: number;
  itineraryKey: string;
  searchUrl: string;
  label: string;
  cabin: string;
  priceUSD: number | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO watches (
        user_id, itinerary_key, search_url, label, cabin, last_price_usd,
        last_checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, itinerary_key) DO UPDATE SET
        search_url = excluded.search_url,
        last_price_usd = excluded.last_price_usd,
        last_checked_at = excluded.last_checked_at`,
    )
    .run(
      row.userId,
      row.itineraryKey,
      row.searchUrl,
      row.label,
      row.cabin,
      row.priceUSD,
    );
}

export function listWatches(userId: number): WatchRow[] {
  return getDb()
    .prepare(`SELECT * FROM watches WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as WatchRow[];
}

export function staleWatches(limit: number, staleMinutes: number): WatchRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM watches
       WHERE last_checked_at IS NULL
          OR last_checked_at < datetime('now', ?)
       ORDER BY last_checked_at ASC LIMIT ?`,
    )
    .all(`-${staleMinutes} minutes`, limit) as WatchRow[];
}

export function recordWatchPrice(id: number, priceUSD: number): void {
  getDb()
    .prepare(
      `UPDATE watches SET
        delta_usd = CASE WHEN last_price_usd IS NULL THEN 0
                         ELSE ? - last_price_usd END,
        seen = CASE WHEN last_price_usd IS NOT NULL AND ? != last_price_usd
                    THEN 0 ELSE seen END,
        last_price_usd = ?,
        last_checked_at = datetime('now')
      WHERE id = ?`,
    )
    .run(priceUSD, priceUSD, priceUSD, id);
}

export function deleteWatch(userId: number, id: number): void {
  getDb()
    .prepare(`DELETE FROM watches WHERE user_id = ? AND id = ?`)
    .run(userId, id);
}

export function markWatchesSeen(userId: number): void {
  getDb().prepare(`UPDATE watches SET seen = 1 WHERE user_id = ?`).run(userId);
}

export function unseenWatchCount(userId: number): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM watches WHERE user_id = ? AND seen = 0`)
    .get(userId) as { n: number };
  return row.n;
}
