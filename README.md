# Fly now, explain later. ✈️

A flight search engine that hunts **real fares** across Google Flights, Skiplagged
(hidden-city), Aviasales, airline sites, and a **browser agent** driving real
Chrome — then badges anything **cheaper than Google Flights**. Optional in-site
booking via Duffel (no redirect).

Built with Next.js 16 (App Router), TypeScript, Tailwind v4, the Vercel AI SDK
(Gemini), and Stagehand.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # fill in whatever keys you have (or none)
npm run dev                        # http://localhost:3000
```

**The app works with zero keys**: Google data comes from the free
`fast-flights-ts` RPC path and Skiplagged's public API (routed through your
local Chrome when Cloudflare blocks plain fetch). Each key you add lights up
another source — the landing page footer shows what's active.

## Keys (all free tiers, see .env.local.example)

| Key | Unlocks | Where |
|---|---|---|
| `SERPAPI_KEY` | Primary Google Flights data, 250 searches/mo free | [serpapi.com](https://serpapi.com/users/sign_up) |
| `TRAVELPAYOUTS_TOKEN` | Aviasales cached-fare context | [travelpayouts.com](https://www.travelpayouts.com/) → Profile → API token |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Browser-agent LLM extraction (Trip.com, Google fallback) + natural-language search | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `DUFFEL_API_TOKEN` | **In-site booking** (checkout without redirect) | [duffel.com](https://duffel.com) — `duffel_test_…` demos instantly; real tickets need KYC + live token + topped-up balance |
| `RAPIDAPI_KEY` + `ENABLE_SKYSCANNER=true` | Skyscanner cross-check (~100 req/mo) | rapidapi.com (sky-scrapper) |

## How it beats Google Flights

Google is the **baseline, not the ceiling**. Every search streams two tiers
over one SSE connection (`/api/search`):

- **Tier 1 (seconds):** SerpAPI Google Flights (`deep_search`, browser-identical)
  or the zero-key `fast-flights-ts` RPC → sets the *"Google price"* baseline.
  In parallel: Skiplagged (hidden-city fares — the structural way to beat listed
  prices), Travelpayouts cache, optional Skyscanner, Duffel.
- **Tier 2 (10–30s):** the browser agent (Stagehand v3 LOCAL + your real Chrome
  + Gemini) scrapes Frontier direct (GoWild fares) and Trip.com (promo
  undercuts), streaming results in as they land.

Anything at least $1 below the baseline gets the green
**"Cheaper than Google Flights · save $X"** badge. Hidden-city fares carry an
amber warning (carry-on only, ticketed beyond your stop, airline-ToS risk) and
are rank-penalized so they never masquerade as normal fares.

Results dedupe across sources on carrier + origin + departure-minute; the card
shows every agreeing source ("via Google · Skiplagged") and keeps the cheapest
price.

Real examples from verification (July 2026): LGA→ORD Google $109 vs
hidden-city **$89 (save $20)**; DEN→MCO Google $185 vs Skiplagged **$155
(save $30)**.

**Two more cheap-fare levers** (both modeled on Soar's approach):
- **Split-ticketing** — for round trips, prices the outbound and return as two
  independent one-ways and combines the cheapest of each *across sources*
  (e.g. outbound on Skiplagged, return on Google). When the sum beats the best
  round-trip it's surfaced as a "Split ticket · save $X" card with two Book
  buttons, plus a caveat (two bookings, no through-protection). Wins are real
  but data-dependent — they need ≥2 live price sources.
- **Price calendar** — a cheapest-fare-by-day strip (Travelpayouts, cached)
  under the search bar; click a day to shift the search, round-trip length
  preserved. Hides itself without a Travelpayouts token.

## Booking

- Offers from **Duffel** show *"Instant booking — no redirect"* → `/book/[offerId]`:
  passenger details + confirm, paid from your **prepaid Duffel balance** (card
  data never touches this app). Test tokens produce clearly-labeled sandbox
  fares that can't earn badges or mix with real prices.
- Everything else deep-links to the source (Google Flights, Skiplagged, airline).

## Architecture

```
src/lib/types.ts          the FlightOffer contract every source maps into
src/lib/orchestrator.ts   two-tier fan-out, baseline chain, budgets (180s wall)
src/lib/providers/*       serpapi · fast-flights · travelpayouts · skiplagged ·
                          skyscanner-rapidapi · duffel  (+ provider.ts guard:
                          timeout, cache, circuit breaker, status normalization)
src/lib/agent/*           Stagehand pool (2 real-Chrome instances, idle shutdown),
                          zod extraction schemas, targets: frontier · trip-com ·
                          google-fallback · navitaire (Allegiant, experimental)
src/app/api/search        the SSE stream
src/app/api/book*         Duffel offer refresh + order creation
src/hooks/useFlightSearch client stream consumer: merge → dedupe → live re-rank
```

- **Cache:** memory + `.cache/search/` files (survives dev reloads — protects
  the SerpAPI quota). TTLs: SerpAPI 1h, Travelpayouts 24h, Skiplagged/agent 20m.
- **Failure model:** a provider can time out, get blocked, or hit a CAPTCHA and
  the stream never breaks — it becomes a status tick in the UI. Two consecutive
  failures open a 30-minute circuit breaker.
- **Ranking:** Cheapest (price), Fastest (duration), Best
  (`0.55·price + 0.30·duration + 0.15·stops` normalized min→P90, with penalties
  for hidden-city/cached/return-pending/test fares).

## Useful commands

```bash
node scripts/smoke.mjs            # stream 3 canned routes, print provider table
node scripts/fetch-airports.mjs   # regenerate src/data/airports.json (OurAirports)
MOCK_FIXTURES=1 npm run dev       # replay .cache/fixtures/* (UI work, zero quota)
```

Env toggles: `ENABLE_BROWSER_AGENT=false` (kill switch) ·
`AGENT_TARGETS=frontier,trip-com[,navitaire]` · `AGENT_HEADLESS=true` ·
`SKIPLAGGED_ENABLED=false` · `AGENT_MODEL=google/gemini-2.5-flash`.

## Dead APIs — do not resurrect

Verified July 2026: **Amadeus Self-Service was decommissioned 2026-07-17**
(DNS gone; the `amadeus` npm package is stale but not flagged — never install
it). Kiwi Tequila is invitation-only. Official Skyscanner API is partner-only.
`playwright-extra`/stealth is dead and detected — this project uses
**patchright** instead. Spirit Airlines ceased operations May 2026.

## Honest limitations

- Hidden-city fares: real but risky (no checked bags, one-way use, airlines
  prohibit it in their ToS) — always labeled, never auto-picked as "Best".
- Skiplagged/Trip.com/Google scraping is unofficial; blocks surface as muted
  status ticks, never crashes. Home/residential IP works best (that's why the
  agent runs your real local Chrome).
- Duffel test mode shows fake sandbox fares — labeled amber, excluded from
  price comparisons. Real ticketing requires Duffel KYC verification.
- This is a local dev app: the browser agent needs a real Chrome install and
  won't deploy to serverless (Chromium ≫ function size limits).
