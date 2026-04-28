# Polymarket AutoTrader

Dark trading-terminal-style React dashboard for managing Polymarket
auto-trading strategies and copy-trade setups. Every trade is **simulated**
(paper trading) — real Polymarket prices are pulled from
`gamma-api.polymarket.com` every 5 seconds.

Two ways to run it:

1. **Standalone** — open the React app, everything runs in your browser via
   `localStorage` (no backend, no Telegram).
2. **Cloud demo** — run the bundled Node backend in `server/`. The dashboard
   becomes a thin view of the server, **and** a Telegram bot can drive
   strategies, copy-trades, balances and alerts from your phone.

The entire UI lives in **`src/PolymarketAutoTrader.jsx`** as a single
default-exported component. The backend lives in **`server/`**.

## Features

- **AutoTrade** strategies with 12+ configurable fields (coins, timeframe,
  direction, trigger window, dual-slider price range, per-trade & total budget,
  stop loss / take profit, candle move filter, slippage, max trades / day,
  tags). Cards collapse / expand, can be paused, edited inline, cloned and
  deleted (with inline confirm).
- **Copy Trade** setups (wallet, percentage / fixed sizing, max trades /
  market, exact-price vs. slippage mode, timeframe & coin filters, budget).
- **Portfolio** tab with aggregate stats, daily PnL chart (SVG), and a
  per-strategy breakdown table.
- **Live Log** with real-time auto-scrolling feed, color-coded rows
  (green = won, red = lost, blue = placed, yellow = auto-paused) and filters
  by tag / coin / source / status / search.
- **Tag system** — global, multi-assign, used as a filter across every tab.
- **Per-tag auto-pause** — set a profit target / loss limit per tag and every
  strategy or copy-trade carrying that tag is paused automatically when the
  aggregate threshold is hit (managed inline from the tag bar).
- **Multi-wallet** — share the dashboard between multiple traders. Add up to 8
  wallets (each with its own label, color, address and paper balance), assign
  every strategy / copy-trade to a specific wallet, and filter every tab by an
  active wallet from the header strip. The Portfolio tab shows a per-wallet
  breakdown card plus a Wallet column on the breakdown table.
- **Demo / Live mode** toggle persisted in `localStorage`. Demo mode gives each
  wallet its own $1,000 paper balance with per-wallet (or global) reset;
  switching to Live opens a confirm modal that warns about every connected
  wallet.
- Notification beep + vibration on trade fire / win / loss (toggleable).
- Auto-pause guard when a strategy spends ≥ 80 % of its budget.
- Mobile responsive with a dedicated phone layout.
- **Telegram demo bot** (optional) — full demo control: pause/resume, create
  strategies, reset balances, daily reports, live trade alerts. Allowlist-
  protected per chat id. See [`TELEGRAM_BOT_GUIDE.md`](./TELEGRAM_BOT_GUIDE.md).
- React deps: `react`, `react-dom`, `lucide-react`. Backend deps: `express`,
  `cors`, `dotenv`, `node-telegram-bot-api`.

## Run standalone (browser only)

```bash
npm install
npm run dev:client
```

Open <http://localhost:5173> and you'll land on the lock screen. Pick one of
the seeded traders, set a password (Register flow on first run), and you're in.

## Run with Telegram bot + cloud backend

```bash
npm install
cp server/.env.example server/.env       # fill in TELEGRAM_BOT_TOKEN etc
npm run dev:all                          # starts server + dashboard
```

The dashboard's header will switch from `LOCAL` to a green `CLOUD` badge once
the backend is reachable. From Telegram, send `/start` to your bot to begin.

## Build

```bash
npm run build
npm run preview
```

For production VPS, the Express server in `server/` will also serve the built
React app. Run `npm run build && npm start` after configuring `server/.env`.

## More docs

- [`SETUP.md`](./SETUP.md) — full installation, configuration, VPS deploy &
  going-live notes (where API URLs / wallet addresses / private keys belong).
- [`FEATURES.md`](./FEATURES.md) — the complete feature catalogue (auth,
  multi-wallet, AutoTrade, copy trade, tags, portfolio, log, persistence,
  safety guards).
- [`WALLET_GUIDE.md`](./WALLET_GUIDE.md) — how a trader connects a wallet,
  deposits USDC on Polygon, and withdraws back to a CEX / bank, plus security
  checklist and FAQs.
- [`TELEGRAM_BOT_GUIDE.md`](./TELEGRAM_BOT_GUIDE.md) — Telegram bot setup,
  command reference, cloud deploy, security & troubleshooting.
