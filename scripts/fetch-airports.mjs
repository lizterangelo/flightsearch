/**
 * Fetch the OurAirports dataset and distill it into src/data/airports.json:
 * scheduled-service large/medium airports with real IATA codes, for the
 * origin/destination autocomplete. Plain Node (>=18) ESM, no dependencies.
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

const OUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "data",
  "airports.json",
);

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

    const entry = {
      iata,
      name: r[cName].trim(),
      city: (r[cCity] ?? "").trim(),
      country: r[cCountry].trim(),
      size: type === "large_airport" ? "large" : "medium",
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

  const large = airports.filter((a) => a.size === "large").length;
  return { airports, large, medium: airports.length - large, parsed: rows.length - 1 };
}

const csvText = await download();
const { airports, large, medium, parsed } = main(csvText);

await mkdir(path.dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, JSON.stringify(airports), "utf8");

console.log(
  `Parsed ${parsed} CSV rows -> ${airports.length} airports ` +
    `(${large} large, ${medium} medium) -> ${OUT_PATH}`,
);
