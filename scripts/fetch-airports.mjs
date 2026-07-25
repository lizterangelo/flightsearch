/**
 * Fetch the OurAirports dataset and distill it into:
 *   src/data/airports.json — scheduled-service large/medium airports with
 *     real IATA codes, coordinates, and city names (for autocomplete,
 *     nearby-airport suggestions, and metro grouping)
 *   src/data/cities.json — metro groups: cities served by 2+ airports,
 *     used for "Tokyo (Any airport)" searches.
 * Plain Node (>=18) ESM, no dependencies.
 *
 * Usage: node scripts/fetch-airports.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SOURCES = [
  "https://davidmegginson.github.io/ourairports-data/airports.csv",
  "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv",
];

const DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "data",
);
const AIRPORTS_PATH = path.join(DATA_DIR, "airports.json");
const CITIES_PATH = path.join(DATA_DIR, "cities.json");

async function download() {
  let lastErr;
  for (const url of SOURCES) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes("iata_code")) {
        throw new Error(`${url} -> unexpected payload (no iata_code header)`);
      }
      console.log(`Downloaded ${url} (${(text.length / 1e6).toFixed(1)} MB)`);
      return text;
    } catch (err) {
      lastErr = err;
      console.warn(`Fetch failed: ${err.message ?? err}`);
    }
  }
  throw new Error(`All sources failed; last error: ${lastErr}`);
}

/**
 * RFC-4180-ish CSV parser: handles quoted fields containing commas, doubled
 * quotes, and embedded newlines. Returns rows of string fields.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Curated metro areas (IATA metropolitan-area style). Municipality grouping
 * alone misses these — e.g. Narita's municipality is "Narita", not "Tokyo".
 * Order within `airports` = hub preference for fan-out.
 */
const METRO_AREAS = [
  { name: "Tokyo", country: "JP", airports: ["HND", "NRT"] },
  { name: "London", country: "GB", airports: ["LHR", "LGW", "STN", "LTN", "LCY", "SEN"] },
  { name: "New York", country: "US", airports: ["JFK", "EWR", "LGA"] },
  { name: "Paris", country: "FR", airports: ["CDG", "ORY", "BVA"] },
  { name: "Milan", country: "IT", airports: ["MXP", "LIN", "BGY"] },
  { name: "Rome", country: "IT", airports: ["FCO", "CIA"] },
  { name: "Moscow", country: "RU", airports: ["SVO", "DME", "VKO"] },
  { name: "Istanbul", country: "TR", airports: ["IST", "SAW"] },
  { name: "Dubai", country: "AE", airports: ["DXB", "DWC"] },
  { name: "Seoul", country: "KR", airports: ["ICN", "GMP"] },
  { name: "Osaka", country: "JP", airports: ["KIX", "ITM", "UKB"] },
  { name: "Shanghai", country: "CN", airports: ["PVG", "SHA"] },
  { name: "Beijing", country: "CN", airports: ["PEK", "PKX"] },
  { name: "Bangkok", country: "TH", airports: ["BKK", "DMK"] },
  { name: "Jakarta", country: "ID", airports: ["CGK", "HLP"] },
  { name: "São Paulo", country: "BR", airports: ["GRU", "CGH", "VCP"] },
  { name: "Rio de Janeiro", country: "BR", airports: ["GIG", "SDU"] },
  { name: "Buenos Aires", country: "AR", airports: ["EZE", "AEP"] },
  { name: "Chicago", country: "US", airports: ["ORD", "MDW"] },
  { name: "Los Angeles", country: "US", airports: ["LAX", "BUR", "LGB", "SNA", "ONT"] },
  { name: "San Francisco Bay Area", country: "US", airports: ["SFO", "OAK", "SJC"] },
  { name: "Washington", country: "US", airports: ["IAD", "DCA", "BWI"] },
  { name: "Miami", country: "US", airports: ["MIA", "FLL", "PBI"] },
  { name: "Houston", country: "US", airports: ["IAH", "HOU"] },
  { name: "Dallas", country: "US", airports: ["DFW", "DAL"] },
  { name: "Toronto", country: "CA", airports: ["YYZ", "YTZ"] },
  { name: "Montreal", country: "CA", airports: ["YUL", "YMX"] },
  { name: "Stockholm", country: "SE", airports: ["ARN", "BMA", "NYO"] },
  { name: "Oslo", country: "NO", airports: ["OSL", "TRF"] },
  { name: "Brussels", country: "BE", airports: ["BRU", "CRL"] },
  { name: "Berlin", country: "DE", airports: ["BER"] },
  { name: "Tehran", country: "IR", airports: ["IKA", "THR"] },
  { name: "Taipei", country: "TW", airports: ["TPE", "TSA"] },
  { name: "Nagoya", country: "JP", airports: ["NGO", "NKM"] },
  { name: "Melbourne", country: "AU", airports: ["MEL", "AVV"] },
  { name: "Manila", country: "PH", airports: ["MNL", "CRK"] },
  { name: "Mexico City", country: "MX", airports: ["MEX", "NLU", "TLC"] },
  { name: "Johannesburg", country: "ZA", airports: ["JNB", "HLA"] },
];

function main(csvText) {
  const rows = parseCsv(csvText);
  const header = rows[0];
  const col = (name) => {
    const idx = header.indexOf(name);
    if (idx === -1) throw new Error(`Column "${name}" missing from CSV header`);
    return idx;
  };

  const cType = col("type");
  const cName = col("name");
  const cCountry = col("iso_country");
  const cCity = col("municipality");
  const cScheduled = col("scheduled_service");
  const cIata = col("iata_code");
  const cLat = col("latitude_deg");
  const cLon = col("longitude_deg");

  const IATA = /^[A-Z]{3}$/;
  // Keyed by IATA to drop rare duplicates; large wins over medium.
  const byIata = new Map();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const type = r[cType];
    if (type !== "large_airport" && type !== "medium_airport") continue;
    if (r[cScheduled] !== "yes") continue;
    const iata = (r[cIata] ?? "").trim().toUpperCase();
    if (!IATA.test(iata)) continue;
    const lat = Number(r[cLat]);
    const lon = Number(r[cLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const entry = {
      iata,
      name: r[cName].trim(),
      city: (r[cCity] ?? "").trim(),
      country: r[cCountry].trim(),
      size: type === "large_airport" ? "large" : "medium",
      lat: Math.round(lat * 1000) / 1000,
      lon: Math.round(lon * 1000) / 1000,
    };
    const existing = byIata.get(iata);
    if (!existing || (existing.size === "medium" && entry.size === "large")) {
      byIata.set(iata, entry);
    }
  }

  const airports = [...byIata.values()].sort((a, b) => {
    if (a.size !== b.size) return a.size === "large" ? -1 : 1;
    return a.iata < b.iata ? -1 : a.iata > b.iata ? 1 : 0;
  });

  // Curated metros first (order = fan-out preference), then municipality
  // groups for the long tail — skipping airports a curated metro already owns.
  const inMetro = new Set();
  const curated = [];
  for (const metro of METRO_AREAS) {
    const members = metro.airports
      .filter((iata) => byIata.has(iata))
      .map((iata) => ({
        iata,
        isHub: byIata.get(iata).size === "large",
      }));
    if (members.length < 2) continue;
    for (const m of members) inMetro.add(m.iata);
    curated.push({
      key: `${slugify(metro.name)}-${metro.country.toLowerCase()}`,
      name: metro.name,
      country: metro.country,
      airports: members,
    });
  }

  const byCity = new Map();
  for (const a of airports) {
    if (!a.city || inMetro.has(a.iata)) continue;
    const key = `${slugify(a.city)}-${a.country.toLowerCase()}`;
    const group = byCity.get(key) ?? {
      key,
      name: a.city,
      country: a.country,
      airports: [],
    };
    group.airports.push({ iata: a.iata, isHub: a.size === "large" });
    byCity.set(key, group);
  }
  const curatedKeys = new Set(curated.map((c) => c.key));
  const cities = [
    ...curated,
    ...[...byCity.values()]
      .filter((c) => c.airports.length >= 2 && !curatedKeys.has(c.key))
      .map((c) => ({
        ...c,
        airports: [...c.airports].sort(
          (x, y) => Number(y.isHub) - Number(x.isHub),
        ),
      })),
  ].sort((a, b) => b.airports.length - a.airports.length);

  const large = airports.filter((a) => a.size === "large").length;
  return {
    airports,
    cities,
    large,
    medium: airports.length - large,
    parsed: rows.length - 1,
  };
}

const csvText = await download();
const { airports, cities, large, medium, parsed } = main(csvText);

await mkdir(DATA_DIR, { recursive: true });
await writeFile(AIRPORTS_PATH, JSON.stringify(airports), "utf8");
await writeFile(CITIES_PATH, JSON.stringify(cities), "utf8");

console.log(
  `Parsed ${parsed} CSV rows -> ${airports.length} airports ` +
    `(${large} large, ${medium} medium) -> ${AIRPORTS_PATH}\n` +
    `Metro groups: ${cities.length} cities with 2+ airports -> ${CITIES_PATH}`,
);
