# Soar (study clone) ✈️

A pixel-close, feature-complete clone of [flysoar.ai](https://flysoar.ai)
built end-to-end on the **Duffel test API** — live streaming search, metro
"Any airport" fan-out, a price-heatmap date picker, flight details with
seat maps / bags / fare rules, Google sign-in, checkout with sandbox
payment, order management with cancellations, price watches, and an
iMessage concierge agent.

> **Private study project.** Recreated for learning; the Soar name, logo
> and assets belong to their owners — keep this to yourself and your own
> testers rather than promoting it, and rebrand before any public use.
> Test mode only: sandbox fares, unlimited test balance, no real tickets.

Built with Next.js 16 (App Router, Turbopack), TypeScript, Tailwind v4,
Supabase (Postgres + Google auth), and the official `@duffel/api` SDK.
No scrapers, no other data providers.

## Quick start

```bash
npm install
cp .env.local.example .env    # DUFFEL_API_TOKEN + the two Supabase vars
node scripts/fetch-airports.mjs   # regenerate airport/metro datasets (optional; committed)
npm run dev
```

Open http://localhost:3000 and search something like `LHR → JFK`.
Sign-in is **Google via Supabase Auth**: enable the Google provider in the
Supabase dashboard (Authentication → Providers → Google) with an OAuth
client whose redirect URI is
`https://<project-ref>.supabase.co/auth/v1/callback`, and add
`http://localhost:3000/**` to Authentication → URL Configuration →
Redirect URLs.

## How it works

- **Search** — `GET /api/search/stream` (SSE). One Duffel **Batch Offer
  Request** per airport pair, long-polled; each batch streams `created` /
  `batch` / `offer` events. Metro picks ("Tokyo (any)") fan out to one
  request per member airport (capped at 4). Falls back to plain offer
  requests automatically (`DUFFEL_BATCH=0` forces it). 60s result cache
  absorbs refreshes; offers stay bookable because Duffel ids expire fast.
- **Results** — offers dedupe on Duffel slice comparison keys, re-rank live
  (Best = price/duration/stops blend; Cheapest; Fastest), filter by stops /
  airlines+alliances / dual-handle time ranges, paginate client-side.
  Displayed prices are `$1` under the fare ("Soar Undercut" — the payment
  always uses the exact Duffel total).
- **Details** — fresh offer + `available_services`; fare-rules / refund /
  price-breakdown popovers, per-segment timelines with layovers and cabin
  amenities (Duffel data, aircraft-table fallback), bags steppers, Duffel
  **seat maps** (reliable on Duffel Airways `ZZ`), Protect Flight (5%,
  $19–$149), share link, Watch.
- **Auth** — Google OAuth via Supabase; sessions are Supabase cookies and
  every table is row-level-secured to `auth.uid()`.
- **Checkout** — passenger forms (passport block when the offer requires
  identity documents), seats/bags re-priced server-side from the fresh
  offer, balance payment, order + offer snapshot stored in Supabase.
- **My Flights** — upcoming/past orders, order detail with itinerary,
  cancellation via Duffel quote → confirm (Protect bookings message the
  full-minus-fee refund), price watches with visit-triggered re-pricing.
- **Calendar** — every search upserts cheapest-per-day observations
  (round trips halved per direction); the date modal tints days
  cheap/medium/expensive vs the rolling average. `CALENDAR_FILL=1` lets
  sparse routes backfill with a few capped one-way searches.

## Useful commands

```bash
npm run dev          # dev server (Turbopack)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
node scripts/smoke.mjs [base]          # stream smoke (2 routes)
node scripts/smoke.mjs --book [base]   # + full sandbox booking incl. seat,
                                       #   bag, protect, then cancel (refuses
                                       #   live-mode offers)
node scripts/imessage-agent.mjs --repl # chat with the concierge in a terminal
```

## iMessage agent

flysoar has a "text us" concierge; the clone has one too, and it runs in
the cloud — **no Mac involved**. It lives in a sibling repo,
[`../soar-imessage-agent`](../soar-imessage-agent), built on
[Sendblue](https://sendblue.com) (hosts the iMessage line and posts
inbound texts as webhooks) + Nitro + Vercel Workflow, deployed alongside
this app on Vercel. Its brain (`server/utils/agent-core.mjs`) talks to
this app's own HTTP APIs, so the two deploy independently.

It covers the whole product surface (**test fares only**): search · offer
details · seat maps · booking with bags, seats, passports, Protect,
multi-traveler and auto-attached loyalty · orders + order detail ·
cancellation (quote → confirm) · price calendar · price watches ·
profile editing · saved friends · loyalty programmes · display-only card
vault · feedback. Account deletion is deliberately not offered — that
stays in the web app.

**How it identifies you.** Every inbound text carries the sender's number,
resolved in this order:

1. a verified link — the sender tapped a one-time `/agent-link?token=…`
   URL and signed in with Google, binding that number to their account
   (`agent_links`);
2. a **profile phone match** — the number matches `profiles.phone`, so
   saving your number on the Account tab is enough to be recognized (this
   is why the site's "Message Agent" button asks for a phone number first
   when yours is empty);
3. otherwise the number is an *owner* handle from `SOAR_AGENT_ALLOW` and
   drives the shared agent account, or it's a stranger and gets a
   sign-in link.

Recognized travelers get bookings on **their own** account — orders carry
`on_behalf_user_id` and appear in their web My Flights, contact details
prefill from their profile, and they only ever see their own trips.
Profile editing, friends, loyalty, cards and watches stay web-side for
them; owners keep full control of the agent account.

Setup lives in that repo's `README-SOAR.md`; the short version:

- Deploy it (`pnpm dlx vercel`), then point the Sendblue dashboard's
  inbound webhook at `https://<agent-app>.vercel.app/api/webhooks/sendblue`.
- Env: `SOAR_BASE` (this app's URL), the two `NEXT_PUBLIC_SUPABASE_*`
  values, `SOAR_AGENT_EMAIL`/`SOAR_AGENT_PASSWORD` (the Supabase account
  the agent books on), `SOAR_AGENT_ALLOW` (owner handles),
  `SENDBLUE_API_KEY`/`SENDBLUE_API_SECRET`/`SENDBLUE_FROM_NUMBER`, and one
  model key.
- Model: `GEMINI_API_KEY` (Google AI Studio, free tier —
  `gemini-2.5-flash`) or `ANTHROPIC_API_KEY` (pay-as-you-go API, separate
  from any Claude subscription; `claude-sonnet-5`). With neither, it falls
  back to plain commands (`search CEB HND 2026-09-04`, `flights`, `yes`).
- Sendblue's free tier is a shared line that only messages **verified
  contacts** (10 slots in their dashboard); a dedicated number anyone can
  text is their paid plan.

On this side, set `NEXT_PUBLIC_IMESSAGE_HANDLE` to the agent's number so
the homepage footer chip and the Account tab's "Message Agent" button open
the thread.

Safety rails: an explicit "yes" (with the exact total stated) is required
before any booking or cancellation, live-mode offers are refused outright,
the card vault never accepts full card numbers, and the Duffel test token
means nothing real is ever ticketed.

<details>
<summary>Legacy: the Mac daemon</summary>

`scripts/imessage-agent.mjs` was the original edition — a local daemon
reading `~/Library/Messages/chat.db` and replying via AppleScript, with no
dependencies beyond macOS's own `sqlite3` and `osascript`. It shares the
same tools, gates and Supabase tables as the cloud agent (both were kept
in sync), and it still works: `node scripts/imessage-agent.mjs --repl` is
a handy terminal REPL for exercising the agent without any messaging
provider. It needs the Mac awake, Full Disk Access for the terminal, and
the Automation → Messages permission. The cloud edition replaced it for
day-to-day use.

</details>

## Duffel test-mode notes

- Sandbox carriers: Duffel Airways (`ZZ`) plus airline sandboxes; prices
  are fabricated.
- Seat maps: dependable on `ZZ` only — the UI shows a friendly empty state
  elsewhere.
- `available_services` (bags) often exist on `ZZ`, rarely elsewhere.
- Test balance is unlimited; cancellations work and may quote full refunds.
- Batch offer requests expire ~60s after creation — the server polls them
  immediately, never lazily.

## Data

`src/data/airports.json` (3.2k airports with coords) and
`src/data/cities.json` (86 metro groups, curated majors + municipality
grouping) are generated by `scripts/fetch-airports.mjs` from the
OurAirports public-domain dataset. Alliances and the aircraft-amenities
fallback are small hand-maintained tables in `src/data/`.

## Persistence

Everything lives in the Supabase project (`soar-clone`): profiles (contact,
travel documents, preferences, points, referral credit), friends, loyalty
programmes, a display-only card vault (brand + last4), orders with offer
snapshots, watches, price observations, and feedback — all behind RLS.
The iMessage agent shares the same database: `agent_links` (phone →
account), `agent_link_tokens` (one-time sign-in tokens, 15-minute expiry)
and `agent_threads` (per-conversation state, since the cloud agent is
serverless and remembers nothing between texts).
The account modal (avatar → `#/account/...`) mirrors the original's nine
tabs: Account, Details, Loyalty & Points, Friends, Notifications, Billing,
Receipts, Beta, and Settings (theme, display currency, Confirm Before
Booking, Summary Cards, Power Saver, account deletion).
