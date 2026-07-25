import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FlightOffer, SearchParams } from "./types";
import { searchParamsKey } from "./types";

/**
 * Two-tier cache: module-level memory Map + .cache/search/*.json files.
 * The file tier survives Next dev hot-reloads — it is what actually protects
 * the 250/month SerpAPI quota during development.
 */

const CACHE_DIR = path.join(process.cwd(), ".cache", "search");

interface CacheEntry {
  expiresAt: number;
  offers: FlightOffer[];
}

const memory = new Map<string, CacheEntry>();

function cacheKey(providerId: string, params: SearchParams): string {
  return createHash("sha1")
    .update(`${providerId}:${searchParamsKey(params)}`)
    .digest("hex");
}

export async function cacheGet(
  providerId: string,
  params: SearchParams,
): Promise<FlightOffer[] | null> {
  const key = cacheKey(providerId, params);

  const inMemory = memory.get(key);
  if (inMemory) {
    if (inMemory.expiresAt > Date.now()) return inMemory.offers;
    memory.delete(key);
  }

  try {
    const raw = await readFile(path.join(CACHE_DIR, `${key}.json`), "utf8");
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry.expiresAt > Date.now() && Array.isArray(entry.offers)) {
      memory.set(key, entry);
      return entry.offers;
    }
  } catch {
    // Missing/corrupt file → miss.
  }
  return null;
}

export async function cacheSet(
  providerId: string,
  params: SearchParams,
  offers: FlightOffer[],
  ttlMs: number,
): Promise<void> {
  const key = cacheKey(providerId, params);
  const entry: CacheEntry = { expiresAt: Date.now() + ttlMs, offers };
  // Sweep expired entries so the Map doesn't retain offer arrays for keys
  // that are never re-queried. It stays small, so O(size) per write is fine.
  const now = Date.now();
  for (const [k, v] of memory) {
    if (v.expiresAt <= now) memory.delete(k);
  }
  memory.set(key, entry);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(
      path.join(CACHE_DIR, `${key}.json`),
      JSON.stringify(entry),
      "utf8",
    );
  } catch {
    // File tier is best-effort; memory tier already has it.
  }
}

/** Fixture support: MOCK_FIXTURES=1 replays saved provider responses. */
export async function fixtureGet(
  providerId: string,
  params: SearchParams,
): Promise<FlightOffer[] | null> {
  const file = path.join(
    process.cwd(),
    ".cache",
    "fixtures",
    `${providerId}-${params.origin}-${params.destination}.json`,
  );
  try {
    const raw = await readFile(file, "utf8");
    const offers = JSON.parse(raw) as FlightOffer[];
    return Array.isArray(offers) ? offers : null;
  } catch {
    return null;
  }
}
