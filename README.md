# Soar (study clone) ✈️

A pixel-close, feature-complete clone of [flysoar.ai](https://flysoar.ai)
built end-to-end on the **Duffel test API** — live streaming search, metro
"Any airport" fan-out, a price-heatmap date picker, flight details with
seat maps / bags / fare rules, OTP sign-in, checkout with sandbox payment,
order management with cancellations, and price watches.

> **Private study project.** Recreated for learning; the Soar branding
> belongs to its owners. Run it locally — don't deploy it publicly.
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
```

## iMessage agent

flysoar has a "text us" concierge; the clone ships a local equivalent:
`scripts/imessage-agent.mjs`, a daemon that reads incoming iMessages from
the Mac's `~/Library/Messages/chat.db`, runs an agent loop against this
app's own APIs (search → details → book → cancel, **test fares only**),
and replies in-thread via AppleScript. No new dependencies — it uses the
macOS-bundled `sqlite3` and `osascript`.

```bash
node scripts/imessage-agent.mjs --repl   # try it in the terminal first
node scripts/imessage-agent.mjs          # the real Messages daemon
```

Setup (`.env`):

- `SOAR_AGENT_EMAIL` / `SOAR_AGENT_PASSWORD` — the Supabase account the
  agent books on (email+password user; create one in the dashboard under
  Authentication → Users → Add user → auto-confirm).
- `ANTHROPIC_API_KEY` — enables natural language ("find me something to
  Tokyo mid-September, book the cheapest direct"). Without it the agent
  still works with plain commands (`search CEB HND 2026-09-04`,
  `book 1 First Last 1990-04-01 f`, `flights`, `cancel <order id>`, `yes`).
  `SOAR_AGENT_MODEL` overrides the default `claude-sonnet-5`.
- `SOAR_AGENT_ALLOW` — comma-separated phone/email handles allowed to
  command the daemon. Required; everyone else is ignored.
- `NEXT_PUBLIC_IMESSAGE_HANDLE` — optional; shows the iMessage chip in the
  homepage footer linking to your agent's handle.

macOS permissions (daemon mode only): sign the Mac into Messages; give
your terminal **Full Disk Access** (System Settings → Privacy & Security)
so it can read `chat.db`; approve the **Automation → Messages** prompt on
first send. Texting the agent from the same Apple ID (a self-chat) works —
replies are prefixed `✈️` and the daemon skips its own messages.

Safety rails: the agent only answers allow-listed handles, always asks for
an explicit "yes" (stating the exact total) before booking or cancelling,
and refuses live-mode offers outright — the dev server and Duffel test
token mean nothing real is ever ticketed.

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
The account modal (avatar → `#/account/...`) mirrors the original's nine
tabs: Account, Details, Loyalty & Points, Friends, Notifications, Billing,
Receipts, Beta, and Settings (theme, display currency, Confirm Before
Booking, Summary Cards, Power Saver, account deletion).
