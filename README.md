# zerodha-midcap-trading-bot

Intraday algorithmic trading bot for NSE Nifty Midcap 150, using Zerodha Kite
Connect. Runs locally (macOS), TypeScript/Node.js, no leverage, capital-capped
at ₹10,000 (₹5,000 long / ₹5,000 short).

**Status: Phase 6 - risk engine.** The app authenticates, confirms
connectivity, runs the market data demo, scans the real Nifty Midcap 150
universe, and now sizes a risk plan (quantity, 1% stop-loss, 2.2% target)
for both legs of the signal. Still no orders - Phase 6 only calculates and
logs. See "Development Phases" below.

## ⚠️ Safety model (read this first)

This bot is designed to place **real money orders** on a live account once
fully built. Two layers of protection exist from day one:

1. **`LIVE_TRADING_ENABLED`** - an explicit env var, defaulting to `false`.
   Every order-placement function (added in Phase 7) must check this first.
   When `false`, order functions will log what *would* have been sent and
   return a blocked result - they will never call Zerodha's order API.
2. **Broker-side stop-loss as primary protection** - once trading begins
   (Phase 7+), the stop-loss will be placed as a real SL-M order on
   Zerodha's servers immediately after entry, specifically so a position is
   protected even if this Node process crashes, the Mac sleeps, or the
   internet drops. The Node app's own target-monitoring is a secondary,
   best-effort mechanism, not the safety net.

`LIVE_TRADING_ENABLED` will only be flipped to `true` when you explicitly
ask for it, after reviewing the relevant phase.

## Phase 1-6 contents

```
zerodha-midcap-trading-bot/
├── src/
│   ├── config/env.ts        # loads & validates .env, typed AppConfig
│   ├── zerodha/
│   │   ├── client.ts          # creates the KiteConnect REST client
│   │   ├── auth.ts             # login URL, local redirect server, token exchange
│   │   ├── session.ts            # persists/loads the daily access token to disk
│   │   ├── account.ts             # read-only profile / margins / positions
│   │   ├── instruments.ts          # instrument list + shared symbol->token resolution
│   │   ├── marketData.ts            # KiteTicker: connect, subscribe, ticks, reconnect logging
│   │   └── orders.ts                 # read-only order list (placement is Phase 7)
│   ├── strategy/
│   │   ├── universe.ts             # real, sourced Nifty Midcap 150 constituent list
│   │   ├── scanner.ts               # eligibility + price + liquidity filters, % change
│   │   ├── signal.ts                 # top gainer / top loser selection
│   │   └── strategy.ts                # orchestrates universe -> scanner -> signal
│   ├── risk/
│   │   ├── positionSizing.ts         # quantity / stop-loss / target price formulas
│   │   └── riskManager.ts             # sizes a full RiskPlan from a ScanSignal
│   ├── trading/                # placeholders for Phase 7-9 (entry, SL, target, reconciliation)
│   ├── scheduler/               # placeholder for the persistent 09:00-15:05 market-hours loop
│   ├── types/trading.ts          # Trade/ScanCandidate/ScanSignal/PlannedTrade types
│   ├── utils/logger.ts            # timestamped structured logger
│   └── index.ts                    # entrypoint: config -> auth -> connectivity -> market data -> scan -> risk plan -> exit
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

`src/zerodha/session.ts` and `src/zerodha/account.ts` are additions beyond
your original file list - see the comment at the top of each file for why.
`trading/` and `scheduler/` are still stubs - intentional, so the structure
exists in Git without pretending logic exists that hasn't been reviewed yet.

## What each file does

- **`package.json`** - dependencies and scripts. `npm run dev` for local
  development (auto-restart via `ts-node-dev`), `npm run build` to compile,
  `npm start` to run the compiled output, `npm run typecheck` for a
  type-only check.
- **`tsconfig.json`** - TypeScript strict mode (`strict: true` plus
  `noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns`) so mistakes in
  the risk/order-state logic get caught at compile time, not at 9:21 AM with
  real money on the line.
- **`.env.example`** - every environment variable the whole project will
  eventually use, documented and defaulted to safe values. Copy to `.env`
  and fill in your real credentials; `.env` is git-ignored.
- **`.gitignore`** - excludes `node_modules`, `dist`, `.env`, and any future
  local state/token files from Git.
- **`src/config/env.ts`** - loads `.env` via `dotenv`, validates required
  vars are present, and returns a single typed `AppConfig` object. Required
  vars (`KITE_API_KEY`, `KITE_API_SECRET`) throw immediately at startup if
  missing, so we fail loudly instead of running with `undefined` credentials.
- **`src/utils/logger.ts`** - a small logger producing `[HH:MM:SS] message`
  lines, matching the log style you specified, with an optional structured
  `meta` object for anything that should be machine-parsable later.
- **`src/types/trading.ts`** - the `Trade` interface and `TradeState` union
  (`ENTRY_PENDING → OPEN → TARGET_EXIT_PENDING / STOP_EXITED / TARGET_EXITED
  / FORCE_EXITED / FAILED / ABORTED`) matching the state machine you
  specified. No code uses these yet - Phase 7/8 will.
- **`src/index.ts`** - Phase 5 entrypoint. Loads config, authenticates, runs
  account/instrument checks, a bounded market data demo, then one 09:20-style
  scan, and stops.
- **`src/zerodha/account.ts`** - read-only `fetchProfile`, `fetchMargins`
  (equity segment), `fetchPositions`. No writes.
- **`src/zerodha/instruments.ts`** - `fetchInstruments(kc, exchange)`
  returns the raw instrument list. Also home to
  `resolveTokensBySymbol(instruments, symbols, exchange)`, the shared
  symbol→token lookup used by both `marketData.ts` (Phase 4) and
  `strategy/universe.ts` (Phase 5).
- **`src/zerodha/orders.ts`** - `fetchOrders(kc)`, a read-only list of
  today's orders. Order *placement* is left as an explicit Phase 7 stub in
  the same file, gated by `LIVE_TRADING_ENABLED`.
- **`src/strategy/universe.ts`** - the real Nifty Midcap 150 constituent
  list (see "Universe data source" below), plus
  `resolveMidcap150Universe(instruments)` mapping it to instrument tokens.
- **`src/strategy/scanner.ts`** - `runScanner(kc, universe, config)`: one
  batch `getQuote()` call for the whole universe, then eligibility checks
  (data present, sane prices), the ₹5,000 price filter, the liquidity
  filter (only enforced when all three thresholds are configured - see
  below), and % change from previous close.
- **`src/strategy/signal.ts`** - `selectSignal(candidates)`: picks the
  single highest gainer and single lowest loser. If only one candidate
  survives filtering, it's kept as the long signal only (can't be both a
  long and short leg on the same stock).
- **`src/strategy/strategy.ts`** - `runMorningScan(kc, instruments, config)`
  orchestrates universe → scanner → signal.
- **`src/risk/positionSizing.ts`** - the three formulas, straight from your
  spec: `calculateQuantity` (`floor(allocatedCapital / price)`, 0 if the
  price is too high or inputs are invalid - no divide-by-zero crash),
  `calculateStopLossPrice` (1% adverse, side-aware), `calculateTargetPrice`
  (2.2% favorable, side-aware).
- **`src/risk/riskManager.ts`** - `planTrade(candidate, side, config)` sizes
  one leg into a `PlannedTrade` (or `null` if quantity would be 0 - that
  stock is skipped, not rounded up). `planFromSignal(signal, config)` sizes
  both legs. The max-1-long+1-short constraint is satisfied by construction
  (a `ScanSignal` only ever carries one candidate per side) - checking
  against positions *already open* at the broker is Phase 7's job, once
  real position state exists to check against.

**Important caveat, called out in the code and worth repeating here:**
`PlannedTrade.referencePrice` is the scanner's last-traded-price at scan
time, not a fill price - none exists yet, since no order has been placed.
Phase 7 must recompute quantity/SL/target from the actual executed fill
price, per the "use actual executed/fill price for final calculations"
requirement. Treat Phase 6's output as a preview, not final sizing.

## Universe data source

`NIFTY_MIDCAP_150` in `src/strategy/universe.ts` was fetched directly from
NSE's own official index constituent file -
`https://nsearchives.nseindia.com/content/indices/ind_niftymidcap150list.csv`
- on 2026-09-04, and verified to contain exactly 150 unique symbols with no
duplicates. It is **not** reconstructed from memory or a secondary source.

**This list goes stale.** NSE reconstitutes Midcap 150 semi-annually
(typically effective late March and late September). There is no
auto-refresh logic - re-fetch that CSV periodically (certainly around each
reconstitution) and regenerate the array. `runMorningScan` logs a warning
if fewer than 150 symbols resolve to instrument tokens, which is one signal
(though not the only possible cause) that the list may be out of date.

## Liquidity filter status

Still off by default - `LIQUIDITY_MIN_VALUE` / `LIQUIDITY_MAX_SPREAD` /
`LIQUIDITY_MIN_VOLUME` are unset in `.env.example`. `runScanner` checks all
three; if any is missing, it runs without liquidity filtering and logs a
warning every scan rather than silently skipping the check. When all three
are set, it computes traded value (`last_price × volume`), volume, and
best-bid/ask spread percentage from `getQuote`'s market depth - but spread
is only checked when depth data is actually present; a missing depth book
does not fail a stock, since we don't fabricate a spread we can't measure.

## Market data module (Phase 4, for reference)

- **`src/zerodha/marketData.ts`** - `createTicker(apiKey, accessToken)` wraps
  `KiteTicker`. `resolveInstrumentTokens` (now a re-export of
  `resolveTokensBySymbol` from `instruments.ts`, shared with `universe.ts`)
  looks up real instrument tokens from the already-fetched instrument list
  rather than hard-coding token numbers. `wireTicker(ticker, instruments,
  onTick)` wires every documented event (`connect`, `ticks`, `disconnect`,
  `error`, `close`, `reconnect`, `noreconnect`) - auto-reconnect itself is
  the SDK's built-in exponential backoff; we only observe and log it.

`index.ts` still runs the Phase 4 market data check as a short, bounded demo
- connect, subscribe to 5 well-known liquid NSE stocks (not the full Midcap
150, which is what the scanner below uses), listen for ~20 seconds,
disconnect - before running the Phase 5 scan. The persistent 09:00-15:05
process is still deferred to `scheduler/marketSchedule.ts`.

One real thing testing surfaced: the `kiteconnect` package's own type
declares the `close` event callback as `(reason: string)`, but live testing
against `wss://ws.kite.trade` showed it actually passes a WebSocket
`CloseEvent`-like object, not a string. `wireTicker` handles this
defensively (extracts `.code` if present, falls back to `"unknown"`) rather
than trusting the declared type - logging the raw object would otherwise
dump an entire internal WebSocket instance into your logs.

## npm packages added, and why

| Package | Why |
|---|---|
| `kiteconnect` (v5.3.0, official Zerodha package) | The official TypeScript client for Kite Connect - REST (orders, positions, instruments) and the `KiteTicker` WebSocket client for live market data. Verified against the current npm registry listing (repo: `zerodha/kiteconnectjs`) rather than assumed from memory. Ships its own `.d.ts` types, so no separate `@types/kiteconnect` package is needed. |
| `ws` | WebSocket client, a peer/underlying dependency `kiteconnect`'s ticker relies on transitively; included explicitly since the project spec calls out WebSocket usage directly. |
| `dotenv` | Loads `.env` into `process.env` for local development. |
| `typescript`, `@types/node`, `@types/ws` (dev) | Type checking and Node/`ws` type definitions. |
| `ts-node-dev` (dev) | Runs TypeScript directly with auto-restart during development, so you're not manually rebuilding on every change. |

No database, no Redis, no Kafka, no Python - matching your constraints.

## Installing dependencies

```bash
cd zerodha-midcap-trading-bot
npm install
```

## Configuring `.env`

```bash
cp .env.example .env
```

Then fill in:

- `KITE_API_KEY`, `KITE_API_SECRET` - from your Kite Connect app at
  https://developers.kite.trade/apps
- `KITE_ACCESS_TOKEN` - leave blank for now. This is a **daily** token, not a
  one-time secret - Phase 2 implements the login flow that generates it each
  trading day (Kite access tokens expire daily, typically around market
  open). We'll likely end up writing this to `.env` (or a separate
  git-ignored token file) each morning rather than you pasting it in by hand
  every day, but that mechanism is built in Phase 2, not now.
- Leave `LIVE_TRADING_ENABLED=false` until you explicitly tell me to change
  it, and until Phase 7+ actually exists.
- `LIQUIDITY_MIN_VALUE` / `LIQUIDITY_MAX_SPREAD` / `LIQUIDITY_MIN_VOLUME` are
  left blank deliberately - these thresholds aren't calibrated yet. We'll
  set them with real justification when we build the liquidity filter in
  Phase 5, rather than inventing numbers now.

## How Zerodha authentication works (Phase 2)

Kite Connect uses a daily login flow, not a static API key/secret you can
trade with directly. This is implemented as follows:

1. **One-time setup:** register a Redirect URL for your app at
   https://developers.kite.trade/apps that exactly matches
   `http://127.0.0.1:3000/callback` (or whatever `KITE_REDIRECT_PORT` /
   `KITE_REDIRECT_PATH` you set in `.env` - they must match exactly, Kite
   will refuse to redirect anywhere else).
2. **Each run**, `authenticate()` (`src/zerodha/auth.ts`) tries, in order:
   a. `KITE_ACCESS_TOKEN` from `.env`, if you've set one - used as-is,
      nothing else runs. **Not verified against Zerodha in Phase 2** - a
      stale token here will only fail once Phase 3 makes a real API call.
   b. A cached session on disk (`kite-session.state.json`, git-ignored) -
      reused automatically if it hasn't crossed the 6 AM next-day expiry
      that Kite enforces on all access tokens.
   c. Otherwise, a fresh interactive login:
      - the app prints a Kite login URL and starts a local server on
        `KITE_REDIRECT_PORT`/`KITE_REDIRECT_PATH`
      - you open the URL, log in with your Zerodha credentials + 2FA
      - Zerodha redirects your browser back to the local server with a
        `request_token` in the URL
      - the app exchanges `request_token` + `KITE_API_SECRET` for a real
        `access_token` (this is a genuine call to Zerodha's API - it will
        fail with real credentials only if something is actually wrong,
        e.g. mismatched redirect URL or an expired/reused request_token)
      - the resulting session is set on the client and saved to
        `kite-session.state.json` so the next run can skip straight to (b)

`request_token` values are single-use and only valid for a couple of
minutes, so the local server only stays up for the duration of one login
attempt.

## Running locally

Development (auto-restart on file changes):

```bash
npm run dev
```

Production-style (compiled):

```bash
npm run build
npm start
```

Right now, either command validates your `.env`, authenticates with
Zerodha, runs the account/instrument checks, connects to the WebSocket for
a ~20 second demo, runs one 09:20-style scan, and now also sizes and logs
a risk plan (quantity, stop-loss, target) for whatever signal the scan
produced. There is still no persistent scheduler and no orders; those
arrive in Phase 7+.

## How the live-order safety switch works

- `LIVE_TRADING_ENABLED` defaults to `false` if unset, empty, or anything
  other than the exact string `true` - unset/malformed input is treated as
  "safe", never as "live".
- In Phase 1, no order-placement code exists at all, so this switch has no
  effect yet beyond being logged. It's wired up now so the pattern is
  established from the start, and so every phase from here on can rely on
  `config.trading.liveTradingEnabled` already being validated and typed.
- From Phase 7 onward, every function that would call a Zerodha order
  endpoint (`placeOrder`, `modifyOrder`, etc.) must check this flag first.
  If `false`, it logs the intended order (symbol, quantity, side, product,
  order type) prefixed `[ORDER BLOCKED]` and returns without calling Kite.
- Flipping it to `true` will require both the env var being set **and** you
  telling me explicitly to enable live trading - it's never flipped
  implicitly by the code itself.

## Development phases (for reference)

1. ✅ Project setup
2. ✅ Zerodha authentication (no orders)
3. ✅ Account/instrument connectivity (no orders)
4. ✅ Market data via WebSocket (no orders)
5. ✅ Scanner (09:20 gainer/loser selection, no orders)
6. ✅ Risk engine (sizing, SL/target calculation, no orders) ← you are here
7. Execution engine (entry + protective SL, gated by `LIVE_TRADING_ENABLED`)
8. Target manager (bot-managed target exit, SL cancellation, reconciliation)
9. 15:00 force exit
10. Full end-to-end live trading (only after explicit review of all prior phases)

## Known open questions for later phases

- **Liquidity filter thresholds** are unset (see `.env.example`). We'll need
  real Midcap 150 volume/spread data to set these responsibly rather than
  guessing.
- **Transaction cost assumptions** (brokerage, STT, exchange charges, GST,
  stamp duty, slippage) for net P&L will be added as configurable values in
  the risk/P&L work (Phase 6+), not hard-coded guesses.
- **Exact redirect params on a failed login** (e.g. explicit error codes)
  aren't fully documented by Zerodha beyond "status won't be `success`". Our
  handling treats "no `request_token` in the callback" as the failure
  signal, which covers the documented case; if you hit a failure mode that
  doesn't produce a clean error, share the log output and we'll refine it.
