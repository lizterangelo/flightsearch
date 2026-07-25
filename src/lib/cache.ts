import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FlightOffer } from "./types";

/**
 * Two-tier offers cache: module-level memory Map + .cache/search/*.json
 * files (the file tier survives dev hot-reloads). TTL is kept well under
 * Duffel offer lifetime so a cached offer is still bookable when served —
 * it exists to absorb rapid duplicate searches (refresh, double-submit).
 */

const CACHE_DIR = path.join(process.cwd(), ".cache", "search");

interface CacheEntry {
  expiresAt: number;
  offers: FlightOffer[];
}

const memory = new Map<string, CacheEntry>();

function fileKey(key: string): string {
  return createHash("sha1").update(key).digest("hex");
}

export async function cacheGet(key: string): Promise<FlightOffer[] | null> {
  const hashed = fileKey(key);

  const inMemory = memory.get(hashed);
  if (inMemory) {
    if (inMemory.expiresAt > Date.now()) return inMemory.offers;
    memory.delete(hashed);
  }

  try {
    const raw = await readFile(path.join(CACHE_DIR, `${hashed}.json`), "utf8");
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry.expiresAt > Date.now() && Array.isArray(entry.offers)) {
      memory.set(hashed, entry);
      return entry.offers;
    }
  } catch {
    // Missing/corrupt file → miss.
  }
  return null;
}

export async function cacheSet(
  key: string,
  offers: FlightOffer[],
  ttlMs: number,
): Promise<void> {
  const hashed = fileKey(key);
  const entry: CacheEntry = { expiresAt: Date.now() + ttlMs, offers };
  const now = Date.now();
  for (const [k, v] of memory) {
    if (v.expiresAt <= now) memory.delete(k);
  }
  memory.set(hashed, entry);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(
      path.join(CACHE_DIR, `${hashed}.json`),
      JSON.stringify(entry),
      "utf8",
    );
  } catch {
    // File tier is best-effort; memory tier already has it.
  }
}

/**
 * Fixture support: MOCK_FIXTURES=1 replays a saved offers list for a route,
 * letting UI work proceed offline. Files: .cache/fixtures/duffel-JFK-MIA.json
 */
export async function fixtureGet(
  origin: string,
  destination: string,
): Promise<FlightOffer[] | null> {
  const file = path.join(
    process.cwd(),
    ".cache",
    "fixtures",
    `duffel-${origin}-${destination}.json`,
  );
  try {
    const raw = await readFile(file, "utf8");
    const offers = JSON.parse(raw) as FlightOffer[];
    return Array.isArray(offers) ? offers : null;
  } catch {
    return null;
  }
}

export async function fixtureSet(
  origin: string,
  destination: string,
  offers: FlightOffer[],
): Promise<void> {
  const dir = path.join(process.cwd(), ".cache", "fixtures");
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, `duffel-${origin}-${destination}.json`),
      JSON.stringify(offers),
      "utf8",
    );
  } catch {
    // Best-effort.
  }
}
