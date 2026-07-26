#!/usr/bin/env node
/**
 * Soar iMessage agent (study clone of flysoar's "text us" concierge).
 *
 * A local daemon that reads incoming iMessages from the Mac's Messages
 * database, runs an agent loop against the clone's own APIs (search,
 * details, book, cancel — Duffel TEST mode only), and replies in the
 * thread via AppleScript. With ANTHROPIC_API_KEY set it's a natural-
 * language Claude agent; without it, a plain command mode still works.
 *
 *   node scripts/imessage-agent.mjs --repl    terminal REPL (no Messages)
 *   node scripts/imessage-agent.mjs           Messages daemon
 *
 * .env keys:
 *   SOAR_BASE               app origin        default http://localhost:3000
 *   SOAR_AGENT_EMAIL        booking account   optional -> search-only
 *   SOAR_AGENT_PASSWORD
 *   ANTHROPIC_API_KEY       optional -> natural language mode
 *   SOAR_AGENT_MODEL        default claude-sonnet-5
 *   SOAR_AGENT_ALLOW        comma-separated handles (phone/email) allowed to
 *                           command the agent — REQUIRED in daemon mode.
 *                           "*" opens it to everyone (1:1 iMessage threads
 *                           only — group chats, SMS and short codes are
 *                           ignored, and senders are rate-limited). Keep
 *                           your own handle listed alongside "*" if you
 *                           text the agent from your own Apple ID.
 *   SOAR_AGENT_RATE         open-mode per-sender messages/hour (default 30)
 *   SOAR_AGENT_RATE_GLOBAL  open-mode total messages/hour (default 120)
 *   SOAR_AGENT_MARKER       reply prefix, default "✈️ " (self-chat loop guard)
 *   SOAR_AGENT_POLL_MS      default 3000
 *
 * macOS setup (daemon mode): Messages signed in; the terminal running this
 * needs Full Disk Access (chat.db) and Automation → Messages (first send
 * prompts). Booking always requires an explicit "yes" from the sender and
 * refuses live-mode offers.
 */

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/* --------------------------------- env ---------------------------------- */

function loadEnv() {
  const out = { ...process.env };
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
    }
  } catch {
    // No .env — rely on process env.
  }
  return out;
}

const env = loadEnv();
const BASE = env.SOAR_BASE ?? "http://localhost:3000";
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const MODEL = env.SOAR_AGENT_MODEL ?? "claude-sonnet-5";
const MARKER = env.SOAR_AGENT_MARKER ?? "✈️ ";
const POLL_MS = Number(env.SOAR_AGENT_POLL_MS ?? 3000);
const REPL = process.argv.includes("--repl");
const PROJECT_REF = SUPA_URL ? new URL(SUPA_URL).hostname.split(".")[0] : "";

/* ------------------------- Supabase agent session ------------------------ */

let session = null; // { access_token, refresh_token, expires_at }

async function grant(body) {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=${body.grant_type}`, {
    method: "POST",
    headers: { apikey: SUPA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return json.access_token ? json : null;
}

async function ensureSession() {
  if (!env.SOAR_AGENT_EMAIL || !env.SOAR_AGENT_PASSWORD) return null;
  const fresh = session && session.expires_at * 1000 - Date.now() > 60_000;
  if (fresh) return session;
  if (session?.refresh_token) {
    session = await grant({ grant_type: "refresh_token", refresh_token: session.refresh_token });
    if (session) return session;
  }
  session = await grant({
    grant_type: "password",
    email: env.SOAR_AGENT_EMAIL,
    password: env.SOAR_AGENT_PASSWORD,
  });
  return session;
}

/** The app reads Supabase cookies; hand it our session in cookie form. */
function cookieHeader() {
  if (!session) return "";
  const value = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `sb-${PROJECT_REF}-auth-token=base64-${value}`;
}

async function api(path, init = {}) {
  await ensureSession();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { cookie: cookieHeader() } : {}),
      ...(init.headers ?? {}),
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // Stream or empty — callers that need raw use fetch directly.
  }
  return { ok: res.ok, status: res.status, body };
}

async function rest(path) {
  await ensureSession();
  if (!session) return null;
  const res = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${session.access_token}` },
  });
  return res.ok ? res.json() : null;
}

/* ------------------------------ clone tools ------------------------------ */

async function resolvePlace(q) {
  if (/^[A-Za-z]{3}$/.test(q.trim())) return { iata: q.trim().toUpperCase() };
  const res = await fetch(`${BASE}/api/places?q=${encodeURIComponent(q)}`);
  if (!res.ok) return null;
  const { places } = await res.json();
  const hit = places?.[0];
  if (!hit) return null;
  if (hit.kind === "city") return { iata: hit.primary, cityKey: hit.key, label: hit.name };
  return { iata: hit.iata, label: hit.city || hit.name };
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function offerLine(offer, i) {
  const s = offer.slices[0];
  const stops = s.stops === 0 ? "direct" : `${s.stops} stop${s.stops > 1 ? "s" : ""}`;
  const dur = `${Math.floor(s.durationMinutes / 60)}h${String(s.durationMinutes % 60).padStart(2, "0")}`;
  const kind = offer.slices.length > 1 ? "round trip" : "one way";
  return `${i + 1}) ${offer.ownerName} · ${fmtTime(s.departure)}→${fmtTime(s.arrival)} · ${stops} · ${dur} · $${Math.round(offer.displayUSD)} ${kind}`;
}

async function searchFlights(state, args) {
  const from = await resolvePlace(args.origin);
  const to = await resolvePlace(args.destination);
  if (!from || !to) return { error: "Couldn't resolve those places — try airport codes like CEB or HND." };
  const params = new URLSearchParams({
    origin: from.iata,
    destination: to.iata,
    departDate: args.depart_date,
    tripType: args.return_date ? "round_trip" : "one_way",
    adults: String(args.adults ?? 1),
    cabin: args.cabin ?? "economy",
  });
  if (args.return_date) params.set("returnDate", args.return_date);
  if (from.cityKey) params.set("origin_any", from.cityKey);
  if (to.cityKey) params.set("destination_any", to.cityKey);

  const res = await fetch(`${BASE}/api/search/stream?${params}`);
  if (!res.ok || !res.body) return { error: `Search failed (${res.status}).` };
  const offers = new Map();
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      try {
        const event = JSON.parse(dataLine.slice(6));
        if (event.type === "offer") offers.set(event.offer.id, event.offer);
      } catch {
        // Partial frame — skip.
      }
    }
  }
  // Same-itinerary offers collapse to the cheapest (results UI parity).
  const byItinerary = new Map();
  for (const offer of offers.values()) {
    const key = offer.dedupeKey ?? offer.id;
    const kept = byItinerary.get(key);
    if (!kept || offer.displayUSD < kept.displayUSD) byItinerary.set(key, offer);
  }
  const sorted = [...byItinerary.values()]
    .sort((a, b) => a.displayUSD - b.displayUSD)
    .slice(0, 40);
  state.offers = sorted;
  if (sorted.length === 0) return { error: "No flights found for that search." };
  return {
    route: `${from.iata}→${to.iata} ${args.depart_date}${args.return_date ? ` / ${args.return_date}` : ""}`,
    count: sorted.length,
    top: sorted.slice(0, 8).map(offerLine),
  };
}

async function offerDetails(state, index) {
  const offer = state.offers[index - 1];
  if (!offer) return { error: `No option ${index} — search first.` };
  const { ok, body } = await api(`/api/offers/${offer.id}`);
  if (!ok) return { error: "That offer expired — search again for fresh prices." };
  const bags = (body.services ?? []).filter((s) => s.type === "baggage").length;
  return {
    option: index,
    airline: offer.ownerName,
    total_usd: offer.displayUSD,
    live_mode: offer.liveMode,
    refundable: body.offer?.conditions?.refundBeforeDeparture?.allowed ?? null,
    add_on_bags_available: bags,
    passengers_required: (body.passengers ?? []).length,
    identity_documents_required: body.offer?.passengerIdentityDocumentsRequired ?? false,
  };
}

const protectFee = (usd) => Math.min(149, Math.max(19, Math.round(usd * 0.05)));

async function bookFlight(state, args) {
  if (!env.SOAR_AGENT_EMAIL) {
    return { error: "Booking account not configured (SOAR_AGENT_EMAIL/PASSWORD in .env)." };
  }
  const offer = state.offers[(args.index ?? 0) - 1];
  if (!offer) return { error: `No option ${args.index} — search first.` };
  if (offer.liveMode) return { error: "Refusing: that offer is live-mode. This clone books test fares only." };
  if (args.confirmed !== true) {
    const fee = args.protect ? protectFee(offer.displayUSD) : 0;
    return {
      needs_confirmation: true,
      total_usd: offer.displayUSD + fee,
      message: `Ask the traveler to reply "yes" to book option ${args.index} for $${offer.displayUSD + fee}${args.protect ? ` (incl. $${fee} Protect)` : ""}.`,
    };
  }
  const detail = await api(`/api/offers/${offer.id}`);
  if (!detail.ok) return { error: "Offer expired — search again before booking." };
  const ids = (detail.body.passengers ?? []).map((p) => p.id);
  const profile = (await rest("/profiles?select=email,phone"))?.[0] ?? {};
  const fee = args.protect ? protectFee(offer.displayUSD) : 0;
  const booked = await api("/api/book", {
    method: "POST",
    body: JSON.stringify({
      offerId: offer.id,
      passengers: ids.map((id) => ({
        id,
        title: args.gender === "m" ? "mr" : "ms",
        given_name: args.given_name,
        family_name: args.family_name,
        born_on: args.born_on,
        gender: args.gender,
        email: args.email || profile.email || env.SOAR_AGENT_EMAIL,
        phone_number: args.phone || profile.phone || "+14155550123",
      })),
      services: [],
      protect: Boolean(args.protect),
      protectFeeUSD: fee,
      displayTotalUSD: offer.displayUSD + fee,
    }),
  });
  if (!booked.ok) return { error: `Booking failed: ${booked.body?.error ?? booked.status}` };
  return {
    booked: true,
    pnr: booked.body.bookingReference,
    order_id: booked.body.orderId,
    charged: `${booked.body.totalAmount} ${booked.body.totalCurrency} (test balance)`,
  };
}

async function myFlights() {
  const rows = await rest(
    "/orders?select=duffel_order_id,booking_reference,status,total_amount,total_currency,created_at&order=created_at.desc&limit=8",
  );
  if (!rows) return { error: "Sign-in for the agent account failed — check .env credentials." };
  if (rows.length === 0) return { flights: [] };
  return {
    flights: rows.map(
      (r) =>
        `${r.booking_reference} · ${r.status} · ${r.total_amount} ${r.total_currency} · order ${r.duffel_order_id}`,
    ),
  };
}

async function cancelOrder(args) {
  if (args.confirmed !== true) {
    const quote = await api(`/api/orders/${args.order_id}/cancel`, { method: "POST" });
    if (!quote.ok) return { error: `Cancel quote failed: ${quote.body?.error ?? quote.status}` };
    return {
      needs_confirmation: true,
      cancellation_id: quote.body.cancellationId,
      refund: `${quote.body.refundAmount ?? "per fare rules"} ${quote.body.refundCurrency ?? ""}`.trim(),
      message: 'Ask the traveler to reply "yes" to confirm the cancellation.',
    };
  }
  const done = await api(`/api/orders/${args.order_id}/cancel/confirm`, {
    method: "POST",
    body: JSON.stringify({ cancellationId: args.cancellation_id }),
  });
  if (!done.ok) return { error: `Cancel failed: ${done.body?.error ?? done.status}` };
  return { cancelled: true };
}

/* ----------------------------- Claude agent ------------------------------ */

const TOOLS = [
  {
    name: "search_flights",
    description:
      "Search live flights. Origin/destination take city names or 3-letter airport codes. Dates are YYYY-MM-DD.",
    input_schema: {
      type: "object",
      properties: {
        origin: { type: "string" },
        destination: { type: "string" },
        depart_date: { type: "string" },
        return_date: { type: "string" },
        cabin: { type: "string", enum: ["economy", "premium_economy", "business", "first"] },
        adults: { type: "integer" },
      },
      required: ["origin", "destination", "depart_date"],
    },
  },
  {
    name: "offer_details",
    description: "Details for a numbered option from the last search (bags, refundability, requirements).",
    input_schema: {
      type: "object",
      properties: { index: { type: "integer" } },
      required: ["index"],
    },
  },
  {
    name: "book_flight",
    description:
      "Book a numbered option. Set confirmed=true ONLY after the traveler explicitly agreed to the exact total in this conversation. gender is m or f; born_on YYYY-MM-DD.",
    input_schema: {
      type: "object",
      properties: {
        index: { type: "integer" },
        given_name: { type: "string" },
        family_name: { type: "string" },
        born_on: { type: "string" },
        gender: { type: "string", enum: ["m", "f"] },
        email: { type: "string" },
        phone: { type: "string" },
        protect: { type: "boolean" },
        confirmed: { type: "boolean" },
      },
      required: ["index", "given_name", "family_name", "born_on", "gender", "confirmed"],
    },
  },
  { name: "my_flights", description: "List recent bookings on this account.", input_schema: { type: "object", properties: {} } },
  {
    name: "cancel_order",
    description:
      "Cancel a booking by order id. First call without confirmed to get the refund quote; set confirmed=true plus cancellation_id only after the traveler agreed.",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string" },
        cancellation_id: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["order_id"],
    },
  },
];

const SYSTEM = `You are Soar's iMessage travel agent (a private STUDY CLONE running on Duffel's test sandbox — fares are fake, payments use test balance, no real tickets are issued; never claim otherwise).
Today is ${new Date().toISOString().slice(0, 10)}.
Style: text-message short. Plain text only — no markdown, no bullets, at most a few numbered lines. One question at a time.
Flow: resolve vague dates to concrete YYYY-MM-DD (ask if unsure). After searching, show at most 5 numbered options. Before booking you MUST state the exact total and get an explicit yes; only then call book_flight with confirmed=true. Collect passenger given name, family name, date of birth, gender first. Same confirm rule for cancellations.`;

async function runClaude(state, userText) {
  state.history.push({ role: "user", content: userText });
  while (state.history.length > 24) state.history.shift();
  if (state.history[0]?.role !== "user") state.history.shift();

  for (let round = 0; round < 8; round++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: SYSTEM,
        tools: TOOLS,
        messages: state.history,
      }),
    });
    const msg = await res.json();
    if (!res.ok) {
      return `Agent error: ${msg.error?.message ?? res.status}. Check ANTHROPIC_API_KEY.`;
    }
    state.history.push({ role: "assistant", content: msg.content });

    const toolUses = msg.content.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0 || msg.stop_reason !== "tool_use") {
      return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    }
    const results = [];
    for (const use of toolUses) {
      let result;
      try {
        if (use.name === "search_flights") result = await searchFlights(state, use.input);
        else if (use.name === "offer_details") result = await offerDetails(state, use.input.index);
        else if (use.name === "book_flight") result = await bookFlight(state, use.input);
        else if (use.name === "my_flights") result = await myFlights();
        else if (use.name === "cancel_order") result = await cancelOrder(use.input);
        else result = { error: `Unknown tool ${use.name}` };
      } catch (err) {
        result = { error: String(err?.message ?? err) };
      }
      results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(result) });
    }
    state.history.push({ role: "user", content: results });
  }
  return "Sorry — that took too many steps. Try a simpler request.";
}

/* --------------------------- command fallback ---------------------------- */

const HELP = `Soar agent commands:
search <from> <to> <YYYY-MM-DD> [return YYYY-MM-DD]
details <n>
book <n> <First> <Last> <YYYY-MM-DD> <m|f>
flights
cancel <order id>
yes  (confirms a pending booking/cancel)`;

async function runCommands(state, text) {
  const t = text.trim();
  const [cmd, ...rest] = t.split(/\s+/);
  const lower = (cmd ?? "").toLowerCase();

  if (lower === "yes" && state.pending) {
    const pending = state.pending;
    state.pending = null;
    const result =
      pending.kind === "book"
        ? await bookFlight(state, { ...pending.args, confirmed: true })
        : await cancelOrder({ ...pending.args, confirmed: true });
    if (result.error) return result.error;
    if (pending.kind === "book") return `Booked! PNR ${result.pnr} — charged ${result.charged}. Order ${result.order_id}.`;
    return "Cancelled. Any refund follows the quote.";
  }
  if (lower === "search" && rest.length >= 3) {
    const [from, to, dep, ret] = rest;
    const result = await searchFlights(state, {
      origin: from,
      destination: to,
      depart_date: dep,
      return_date: ret,
    });
    if (result.error) return result.error;
    return `${result.route} — ${result.count} found (test fares):\n${result.top.join("\n")}\nReply "details <n>" or "book <n> First Last YYYY-MM-DD m|f".`;
  }
  if (lower === "details" && rest[0]) {
    const result = await offerDetails(state, Number(rest[0]));
    return result.error ?? JSON.stringify(result, null, 1).replace(/[{}",]/g, "").trim();
  }
  if (lower === "book" && rest.length >= 5) {
    const [n, first, last, dob, gender] = rest;
    const args = { index: Number(n), given_name: first, family_name: last, born_on: dob, gender };
    const result = await bookFlight(state, { ...args, confirmed: false });
    if (result.error) return result.error;
    state.pending = { kind: "book", args };
    return `Total $${result.total_usd} (test balance). Reply "yes" to book.`;
  }
  if (lower === "flights") {
    const result = await myFlights();
    if (result.error) return result.error;
    return result.flights.length ? result.flights.join("\n") : "No bookings yet.";
  }
  if (lower === "cancel" && rest[0]) {
    const result = await cancelOrder({ order_id: rest[0] });
    if (result.error) return result.error;
    state.pending = { kind: "cancel", args: { order_id: rest[0], cancellation_id: result.cancellation_id } };
    return `Refund: ${result.refund}. Reply "yes" to confirm cancellation.`;
  }
  return HELP;
}

/* ------------------------------ Messages IO ------------------------------ */

const CHAT_DB = `${homedir()}/Library/Messages/chat.db`;

async function sqlJson(query) {
  const { stdout } = await execFileP("/usr/bin/sqlite3", ["-json", "-readonly", CHAT_DB, query]);
  return stdout.trim() ? JSON.parse(stdout) : [];
}

function decodeAttributedBody(hexStr) {
  if (!hexStr) return "";
  const raw = Buffer.from(hexStr, "hex").toString("latin1");
  const at = raw.indexOf("NSString");
  const slice = at === -1 ? raw : raw.slice(at + 8);
  const runs = slice.match(/[\x20-\x7E -￿]{2,}/g) ?? [];
  return runs.sort((a, b) => b.length - a.length)[0]?.replace(/^[+]+/, "").trim() ?? "";
}

const normalize = (h) => (h ?? "").toLowerCase().replace(/[\s\-()]/g, "");

function allowed(handle, allowList) {
  const n = normalize(handle);
  return allowList.some((a) => {
    const na = normalize(a);
    if (n === na) return true;
    const digits = (s) => s.replace(/\D/g, "");
    return digits(na).length >= 7 && digits(n).endsWith(digits(na).slice(-10));
  });
}

/** Short codes (5–6 digit senders) are automated SMS — never a traveler. */
function isShortCode(handle) {
  const h = normalize(handle);
  return !h.includes("@") && h.replace(/\D/g, "").length < 8;
}

/** Sliding-window rate limiter for open mode. */
function makeLimiter(perSender, global) {
  const bySender = new Map();
  const all = [];
  const prune = (arr, now) => {
    while (arr.length && now - arr[0] > 3600_000) arr.shift();
  };
  return (sender) => {
    const now = Date.now();
    prune(all, now);
    if (all.length >= global) return false;
    const mine = bySender.get(sender) ?? [];
    prune(mine, now);
    if (mine.length >= perSender) return false;
    mine.push(now);
    all.push(now);
    bySender.set(sender, mine);
    return true;
  };
}

async function sendMessage(handle, text) {
  const script = `on run argv
  tell application "Messages"
    set svc to 1st account whose service type = iMessage
    send (item 2 of argv) to participant (item 1 of argv) of svc
  end tell
end run`;
  await execFileP("/usr/bin/osascript", ["-e", script, handle, text]);
}

/* --------------------------------- main ---------------------------------- */

const states = new Map();
const stateFor = (key) => {
  if (!states.has(key)) {
    // Open mode can accumulate stranger threads — drop the oldest.
    if (states.size >= 200) states.delete(states.keys().next().value);
    states.set(key, { history: [], offers: [], pending: null });
  }
  return states.get(key);
};

async function handleText(chatKey, text) {
  const state = stateFor(chatKey);
  try {
    return env.ANTHROPIC_API_KEY
      ? await runClaude(state, text)
      : await runCommands(state, text);
  } catch (err) {
    return `Something broke: ${String(err?.message ?? err).slice(0, 160)}`;
  }
}

async function replLoop() {
  console.log(
    `Soar agent REPL · ${env.ANTHROPIC_API_KEY ? `Claude (${MODEL})` : "command mode (no ANTHROPIC_API_KEY)"} · booking ${env.SOAR_AGENT_EMAIL ? "on" : "off"}`,
  );
  if (!env.ANTHROPIC_API_KEY) console.log(HELP);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt("you> ");
  rl.prompt();
  rl.on("line", async (line) => {
    if (!line.trim()) return rl.prompt();
    const reply = await handleText("repl", line);
    console.log(`\n${MARKER}${reply}\n`);
    rl.prompt();
  });
}

async function daemonLoop() {
  const allowList = (env.SOAR_AGENT_ALLOW ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowList.length === 0) {
    console.error(
      "SOAR_AGENT_ALLOW is required in daemon mode (comma-separated handles, or * to answer everyone).",
    );
    process.exit(1);
  }
  const openMode = allowList.includes("*");
  const explicit = allowList.filter((a) => a !== "*");
  const rateOk = makeLimiter(
    Number(env.SOAR_AGENT_RATE ?? 30),
    Number(env.SOAR_AGENT_RATE_GLOBAL ?? 120),
  );

  let last;
  try {
    last = (await sqlJson("SELECT COALESCE(MAX(ROWID),0) AS m FROM message"))[0].m;
  } catch (err) {
    console.error(
      `Cannot read ${CHAT_DB} — grant Full Disk Access to your terminal (System Settings → Privacy & Security), then retry.\n${err.message}`,
    );
    process.exit(1);
  }
  console.log(
    `Soar iMessage agent up · ${openMode ? "OPEN to everyone (1:1 iMessage only, rate-limited)" : `watching for ${explicit.join(", ")}`} · replies prefixed "${MARKER.trim()}"`,
  );

  setInterval(async () => {
    let rows;
    try {
      rows = await sqlJson(`
        SELECT m.ROWID AS rowid, m.is_from_me, m.text, m.service,
               hex(m.attributedBody) AS ab,
               h.id AS handle, c.chat_identifier AS chat, c.style AS style
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat c ON c.ROWID = cmj.chat_id
        LEFT JOIN handle h ON h.ROWID = m.handle_id
        WHERE m.ROWID > ${Number(last)}
        ORDER BY m.ROWID ASC LIMIT 50`);
    } catch {
      return; // transient lock — next tick
    }
    for (const row of rows) {
      last = Math.max(last, row.rowid);
      const text = (row.text ?? "").trim() || decodeAttributedBody(row.ab);
      if (!text || text.startsWith(MARKER.trim())) continue;
      // DMs only — never speak in group threads (style 43).
      if (row.style !== 45) continue;
      const sender = row.handle ?? row.chat;
      if (row.is_from_me) {
        // Our own outgoing texts count as commands only in an explicitly
        // listed self-chat — never in open mode (those are you texting
        // friends, not the agent).
        if (!allowed(row.chat, explicit)) continue;
      } else if (openMode) {
        if (!allowed(sender, explicit)) {
          if (row.service !== "iMessage") continue; // no SMS/short-code noise
          if (isShortCode(sender)) continue;
          if (!rateOk(normalize(sender))) {
            console.log(`[rate-limited] ${sender}`);
            continue;
          }
        }
      } else if (!allowed(sender, explicit)) {
        continue;
      }
      console.log(`[${new Date().toISOString()}] ${sender}: ${text}`);
      const reply = await handleText(row.chat ?? sender, text);
      try {
        await sendMessage(row.handle ?? row.chat, `${MARKER}${reply}`);
        console.log(`  → ${reply.split("\n")[0]}…`);
      } catch (err) {
        console.error(`  send failed: ${err.message}`);
      }
    }
  }, POLL_MS);
}

if (!SUPA_URL || !SUPA_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}
if (REPL) {
  await replLoop();
} else {
  await daemonLoop();
}
