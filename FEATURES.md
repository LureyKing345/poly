# Features — Polymarket AutoTrader

A complete, opinionated catalogue of everything the dashboard ships with.
For installation steps see [`SETUP.md`](./SETUP.md).

---

## 1. Authentication & multi-trader support

### Lock screen

- Full-screen branded lock view appears whenever no user is signed in.
- Ticker of live Polymarket prices is shown so you can see the market is
  reachable before logging in.
- List of every wallet (Trader A / B / C plus any traders you add).
- Each wallet card shows:
  - color dot + label
  - shortened address
  - status pill: **`sign in`** (password-protected) or **`register`**
    (no password set yet)

### Register flow

- Triggered automatically the first time a wallet is selected from the lock
  screen (when no password exists yet).
- Asks for a password + confirmation.
- Live **password strength meter** (5 levels: too weak / weak / okay / good /
  strong).
- Minimum length 6 characters; mismatch and length errors show inline.

### Sign-in flow

- Standard password prompt.
- Wrong-password / unknown-wallet errors are shown inline; no information is
  leaked about whether the wallet exists.

### Session

- Successful sign-in / register sets the **current user** for the whole app.
- Session persists across page reloads (lives in `localStorage`).
- Header shows a green "signed in" pill with the user's color + label, plus
  two icons: **change password** and **sign out**.
- **Change password** modal: requires current password, asks for new password
  twice, shows the same strength meter.
- **Sign out** instantly returns to the lock screen.

### Password storage

- Passwords are **never sent anywhere**.
- Each wallet has a fresh per-account salt (16+ chars).
- The hash is `djb2` repeated 4096 rounds over `salt|password`. This is
  intentionally slow on a single thread to deter dictionary attacks; for
  production-grade auth you should move to a real backend with bcrypt /
  argon2.

### Ownership rules

A user that signed in as wallet `X` can:

| Action | Allowed on `X` | Allowed on others |
| --- | --- | --- |
| View strategies / copy-trades / logs | ✅ | ✅ (read-only) |
| Edit / delete / pause / clone a strategy | ✅ | ❌ — buttons disabled, "read-only" badge |
| Create a new strategy | ✅ (auto-assigned to `X`) | (n/a) |
| Edit wallet label / color / address | ✅ | ❌ |
| Change wallet password | ✅ | ❌ |
| Delete wallet | ✅ (if more than one wallet exists) | ❌ |
| Reset paper balance for active filter | ✅ | ❌ unless filter is "All" |

Defense in depth: ownership checks run **both** in the UI (disabled buttons)
**and** in the state mutators, so even programmatic attempts to modify another
trader's items are dropped.

---

## 2. Multi-wallet system

- Up to **8 wallets** per dashboard, each with its own:
  - color, label, on-chain address
  - paper balance + starting balance (for DEMO mode)
  - password hash + salt
  - created-at timestamp
- **Wallet strip** below the header:
  - horizontal pill list of every wallet
  - each pill: balance, Δpnl, item count, locked-icon for protected wallets
  - **`YOU`** badge on the signed-in user's pill
  - click any pill to filter the entire dashboard by that wallet
  - inline buttons: `+ add`, `manage`, `reset`
- **Wallet manager modal**:
  - colored swatch (click to cycle) for your row only
  - editable label, address, paper balance for your row only
  - other rows show their data read-only with locked badges
  - per-row counts (e.g. "3 strat · 1 copy")
  - inline delete confirmation; protected by minimum-1-wallet rule
- **Three pre-seeded traders** (Trader A green, Trader B cyan, Trader C gold)
  with realistic dummy addresses and $1,000 paper balance each.

---

## 3. Live / Demo mode

- Prominent **DEMO ↔ LIVE** toggle in the header.
- DEMO badge across all simulated trades.
- LIVE switch opens a confirmation modal warning that all configured wallets
  will trade with real funds (LIVE order placement is *not* yet implemented —
  see `SETUP.md`).
- **DEMO mode**:
  - Each wallet starts with its own $1,000 paper balance.
  - Real Polymarket prices fetched every 5 s from the public Gamma API.
  - Trade outcomes resolved locally (4–12 s settlement delay).
  - Reset button (per-wallet when filtered, global when on "All").
- **LIVE mode**:
  - Address is read from each wallet's stored field.
  - Toggle is one-way per session — you must confirm to switch in.

---

## 4. AutoTrade strategies

Each strategy card has 12+ configurable fields:

| Field | Description |
| --- | --- |
| Label | strategy name |
| Executing wallet | which trader runs it (locked to current user) |
| Tags | multi-select; used for filter & per-tag auto-pause |
| Coins | multi-select among **BTC · ETH · SOL · XRP · DOGE · HYPE · BNB** |
| Direction | `UP` or `DOWN` |
| Timeframe | `5MIN · 15MIN · 1HOUR · 4HOUR` |
| Buy window | `MM:SS` "from" → "until" — when in the candle to fire |
| Price range | min/max in cents (1–99) for the YES share |
| Per-trade amount | dollars per fire |
| Total budget | hard cap; auto-pauses at 80 % spent |
| Stop loss | % drop before exit |
| Take profit | optional % up before exit |
| Min / Max move filter | only fire if last candle moved within this $ range |
| Slippage tolerance | % |
| Max trades per day | hard limit + today's count |

### Card display

- Coloured neon border that matches the executing wallet
- Status dot (green active / amber paused) and `SAFETY` chip when budget
  auto-paused
- Per-card stats: fires, W/L, win-%, PnL, budget bar
- Inline action row: **Activate / Pause · Edit · Clone · Delete** (with a
  two-step confirmation)
- Read-only "lock" badge whenever the card belongs to another trader

### Form

- Inline form for create / edit; pre-filled when editing
- All fields validated with on-the-fly error messages

---

## 5. Copy-trade setups

Each copy card has 9+ configurable fields:

| Field | Description |
| --- | --- |
| Label | nickname for the target |
| Executing wallet | your wallet (locked to current user) |
| Target wallet | the 0x address you mirror (validated `0x[hex]+`) |
| Tags | same global tag system |
| Trade size mode | `Percentage` (% of follower size) or `Fixed` ($ amount) |
| Max trades per market | dedupe cap per market |
| Price mode | `Exact` match or `Slippage ±N%` |
| Timeframe / Coin filters | restrict which mirrored trades are taken |
| Total budget | with the same auto-pause guard |

Card UI mirrors the strategy cards (collapse, stats, budget bar, inline
edit/delete, ownership lock).

---

## 6. Tag system

- Global, multi-assign tags shared between strategies and copy-trades.
- Add a tag from any form, or from the tag bar.
- Filter chips at the top filter the AutoTrade and Copy tabs in real time.
- Three pre-seeded tags: **Sniper · Scalp · Copy Whales**.

### Per-tag auto-pause

- Each tag carries a **profit target** and a **loss limit** (USD, optional).
- A `runSimTick` pass aggregates PnL across every strategy + copy that wears
  the tag.
- If aggregate PnL ≥ profit target → all matching items pause and a
  `TAG-TARGET` event is logged.
- If aggregate PnL ≤ −loss limit → same thing, with a `TAG-LOSS` event.
- A tag's **`triggered`** flag is reflected as a pulsing chip in the tag bar
  and cleared automatically when the user manually re-activates an affected
  item (or hits **Resume** in the tag manager).

### Tag manager (toggleable from the tag bar)

- Tabular row per tag: name, items count, live aggregate PnL, editable profit
  target, editable loss limit, status pill, resume button.
- Inline progress bars showing how close each tag is to its trigger.

---

## 7. Portfolio tab

- **Aggregate stat grid** — Total PnL, Total Fires, Overall Win %, Active
  Strategies, Total Budget Spent / Allocated, Best & Worst performing
  strategy.
- **Per-Wallet panel** — one card per trader showing:
  - paper balance + Δ from start
  - items, fires, win %, PnL
  - aggregated budget bar
- **Daily PnL chart** — SVG area chart of the last N days (in-memory).
- **Per-strategy breakdown table** with columns: Strategy · Wallet · Type ·
  Coins · Direction · Fires · W/L · Win % · PnL · Budget · Status.

When a wallet filter is active, the totals + table scope down to that wallet
while the per-wallet panel still shows everyone (so you can compare).

---

## 8. Live Log

- Real-time auto-scrolling feed (capped at 250 lines).
- Each entry: timestamp · **wallet pill** · source (AUTO / COPY) · coin · dir ·
  timeframe · entry price · amount · PnL · status · strategy label.
- Color-coded rows:
  - blue = `PLACED`
  - green = `WON`
  - red = `LOST`
  - amber = `AUTO-PAUSED` (budget guard)
  - cyan glow = `TAG-TARGET`
  - red glow = `TAG-LOSS`
- Filter dropdowns: **WALLET · COIN · TAG · SOURCE · STATUS** + free-text
  search.
- System events (auto-pauses, tag triggers) are exempt from the wallet filter
  so they're never hidden.

---

## 9. Persistence

- **Standalone mode** — everything (mode, wallets, passwords, strategies,
  copies, logs, daily PnL, sound preference, current user, active filter) is
  persisted in `localStorage` under a single key.
- **Cloud-demo mode** — the optional Express backend keeps authoritative
  state in `server/state.json`. The dashboard becomes a thin view; on every
  reload it re-syncs from the server. `localStorage` writes are skipped while
  cloud is connected so we don't shadow shared state.
- **Migrations**:
  - v1 → v2: single `walletAddress` / `demoBalance` is upgraded to a
    `wallets[]` array of one entry.
  - v2 → v3: every wallet is given `passwordHash`, `passwordSalt`,
    `createdAt`. Existing wallets become "open" and prompt for registration
    on next sign-in.

---

## 10. Real-time price feed

- Polls `https://gamma-api.polymarket.com/markets` every 5 s.
- Shows a live ticker of every supported coin in the header (and on the lock
  screen).
- Falls back gracefully to local price simulation if the API is unreachable;
  status dot in the demo banner shows `gamma-api connected` /
  `API unavailable — local sim` / `connecting…`.

---

## 11. Notifications

- Optional **beep** on fire / win / loss using `AudioContext`.
- Optional **vibration** on supported devices.
- Single toggle (the bell icon) in the header. Preference persists.

---

## 12. Safety guards

| Guard | Where | Effect |
| --- | --- | --- |
| Budget ≥ 80 % spent | per strategy / copy | auto-pause + amber `SAFETY` chip + log entry |
| Tag profit target hit | per tag | auto-pause every active item with that tag |
| Tag loss limit hit | per tag | same, with red event log |
| Max trades per day | per strategy | blocks further fires until next day |
| Ownership | every mutator | non-owners cannot edit/delete each other's items |
| Live mode | mode toggle | requires explicit confirmation modal |
| Wallet delete | wallet manager | requires inline confirmation, refuses to delete the last wallet |

---

## 13. Visual design

- **Trading-terminal aesthetic**: dark `#0a0c10` base, neon greens / cyans /
  amber / red accents, JetBrains Mono everywhere.
- **Per-wallet color theming** — strategy cards inherit a left border + glow
  in the executing wallet's color, so at a glance you can tell whose item is
  whose.
- **Animated indicators** — pulsing tag chips when triggered, smooth
  collapse/expand cards, live shifting daily PnL chart.
- **Mobile responsive** — dedicated breakpoints at 900 px and 600 px collapse
  the header, tickers, log columns and the wallet manager into a phone-first
  layout.

---

## 14. Telegram demo bot (optional)

The repo ships an optional Express backend in `server/` that runs the paper
trading engine **plus** a Telegram bot. Both the dashboard and the bot read
and write the same `state.json`, so changes from one show up in the other in
under three seconds.

Bot capabilities:

- Per-wallet password sign-in (`/register`, `/signin`, `/signout`,
  `/whoami`).
- Read-only commands: `/status`, `/balance`, `/wallets`, `/logs`,
  `/strategies`, `/copies`, `/tags`, `/report today`, `/report wallet <id>`.
- Write commands (ownership-checked): `/pause`, `/resume`, `/clone`,
  `/delete` (with inline confirmation), `/resetdemo` (with confirmation).
- Tag controls: `/settag <id> profit|loss <amount>`, `/resumetag <id>`.
- Guided wizards: `/newstrategy` (7 steps) and `/newcopy` (6 steps), each
  cancelable with `/cancel`.
- Push alerts: `/subscribe` to receive trade results, auto-pauses, and tag
  triggers; `/unsubscribe` to stop.
- Allowlist: `TELEGRAM_ALLOWED_CHAT_IDS` restricts who the bot answers.

Full setup, command reference and security notes:
[`TELEGRAM_BOT_GUIDE.md`](./TELEGRAM_BOT_GUIDE.md).

---

## 15. Tech / architecture

- **React UI**: `src/PolymarketAutoTrader.jsx` — every component, helper,
  hook, and the entire CSS string lives in one file. Easy to fork.
  Stack: React 18 + Vite 5 + lucide-react. ~70 kB gzipped.
- **Backend** (optional): `server/` — Express, `node-telegram-bot-api`,
  `dotenv`. ~700 LOC, single process, polling Telegram, JSON file state.
  Same paper trade engine as the frontend, ported to Node.
- **State authority**: standalone mode = browser; cloud mode = server. The
  dashboard auto-detects which by probing `/api/health`.

---

## 16. Roadmap (not yet shipped)

- Real on-chain order placement via a separate signing backend (see
  `SETUP.md` § Going Live).
- Discord-bot equivalent of the Telegram bot.
- Importable / exportable JSON dump of all settings.
- WebSocket push instead of polling for the dashboard.
