# Setup Guide — Polymarket AutoTrader

This guide walks through installing the dashboard locally, running it on a
VPS, and explains exactly **what is required, what is optional, and where to
put each piece of configuration**.

> The dashboard is currently a **single-file React app** that simulates
> trading and pulls **live market prices** from Polymarket's public Gamma API.
> Real on-chain order placement is **not** wired up yet — that requires a
> server / signer (instructions in the *Going Live* section).

---

## 1. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | **18 LTS or newer** (20+ recommended) | required to run Vite |
| npm / pnpm / yarn | latest | npm ships with Node |
| A modern browser | Chrome 110+, Firefox 110+, Edge, Safari 16+ | for `crypto`, `localStorage`, `Audio` |

Optional (for VPS deploy):

- A Linux VPS (Ubuntu 22.04 LTS or similar)
- Domain pointed at the VPS (so you can have HTTPS via Let's Encrypt)
- Nginx or Caddy as a reverse proxy

---

## 2. Local development (your laptop)

```bash
git clone <your-fork-url> polymarket
cd polymarket

# install dependencies
npm install

# start the dev server (hot reload on http://localhost:5173)
npm run dev
```

That's it. Open `http://localhost:5173`, you will land on the **Lock Screen**.
Pick one of the seeded wallets (Trader A / B / C), set a password the first
time (Register flow), and sign in.

### File layout

```text
polymarket/
├─ index.html                       ← HTML entry, font + favicon
├─ package.json                     ← deps and scripts
├─ vite.config.js                   ← dev/build config
├─ src/
│  ├─ main.jsx                      ← React mount point
│  ├─ index.css                     ← global resets + scrollbar
│  └─ PolymarketAutoTrader.jsx      ← the entire app (UI + logic + CSS)
├─ SETUP.md                         ← this file
├─ FEATURES.md                      ← full feature list
└─ README.md                        ← short overview
```

---

## 3. Configuration — what you may need to change

### 3.1 Currently required: NOTHING

Out-of-the-box the app is fully self-contained:

- ✅ Polymarket prices come from `https://gamma-api.polymarket.com/markets`
  which is **public and key-less**. No env var needed.
- ✅ All trades are **simulated locally**. No private key, no wallet signer.
- ✅ All state (wallets, strategies, copy setups, logs, passwords) lives in the
  browser's `localStorage`. No database, no backend.

You can deploy it as a static site and three traders can register their own
passwords from the lock screen.

### 3.2 Environment variables (`.env.local`)

Create a `.env.local` file in the project root **only** if you want to override
defaults. Vite exposes any variable starting with `VITE_` to the client:

```env
# .env.local — all values OPTIONAL

# Point the dashboard at a remote demo backend (leave empty for same-origin)
VITE_CLOUD_API=https://pmt.yourdomain.com

# Shared bearer token if the backend requires one (must match server/.env API_TOKEN)
VITE_CLOUD_TOKEN=

# Override the public Polymarket data API
VITE_GAMMA_API_URL=https://gamma-api.polymarket.com

# (Reserved for future on-chain integration — not used yet)
VITE_CLOB_API_URL=https://clob.polymarket.com
VITE_POLYGON_RPC_URL=https://polygon-rpc.com
VITE_USDC_CONTRACT=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
```

Restart `npm run dev` after adding/changing env vars.

> ⚠️ **Never commit `.env.local`** — add it to `.gitignore` (Vite's default
> `.gitignore` already does this).

### 3.2b Backend `.env` (for cloud demo + Telegram bot)

If you want the Telegram bot and shared cloud demo, copy `server/.env.example`
to `server/.env`:

```env
PORT=4317
API_TOKEN=                              # optional shared bearer for /api/*
TELEGRAM_BOT_TOKEN=                      # from @BotFather
TELEGRAM_ALLOWED_CHAT_IDS=               # comma-separated chat ids
# STATE_PATH=/var/lib/polymarket/state.json   # optional
# GAMMA_API_URL=...                          # optional override
```

Full Telegram setup walkthrough lives in [`TELEGRAM_BOT_GUIDE.md`](./TELEGRAM_BOT_GUIDE.md).

### 3.3 Where wallet addresses live

Wallet addresses are **NOT** in env vars. Each trader manages their own wallet
inside the app:

1. Sign in with your wallet (or register a fresh one).
2. Open **Wallet Manager** (top strip → `manage` button).
3. Edit your row: label, color, address, and (in DEMO mode) starting paper
   balance.

Other traders' wallets are **read-only** for you. You can only edit / delete
your own.

---

## 4. Production build & VPS deployment

You have two options now:

- **Static-only** — build the React app and host the `dist/` folder anywhere
  (Nginx, Vercel, Netlify, etc). No Telegram bot, no cross-device sync.
- **Cloud demo** — run the bundled Express backend in `server/`. The same
  process serves both the API and the static dashboard, and runs the
  Telegram bot in polling mode.

### 4.1 Build the bundle

On your laptop or in CI:

```bash
npm install
npm run build
```

This produces a `dist/` folder with `index.html`, `assets/*.js`,
`assets/*.css`. That folder is everything you need.

### 4.2 Option A — quick deploy via SCP + Nginx

```bash
# from your laptop
scp -r dist/* youruser@your-vps:/var/www/polymarket/
```

Minimal Nginx config (`/etc/nginx/sites-available/polymarket`):

```nginx
server {
    listen 80;
    server_name polymarket.yourdomain.com;

    root /var/www/polymarket;
    index index.html;

    # SPA fallback — every unknown route serves index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Long cache for hashed assets
    location /assets/ {
        expires 1y;
        access_log off;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable + reload:

```bash
sudo ln -s /etc/nginx/sites-available/polymarket /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Get HTTPS (recommended):

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d polymarket.yourdomain.com
```

### 4.3 Option B — run from the VPS itself (build there)

```bash
# on the VPS
sudo apt update
sudo apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
git clone <your-repo-url> /opt/polymarket
cd /opt/polymarket
npm ci
npm run build

# point Nginx at /opt/polymarket/dist (same config as Option A)
```

### 4.4 Option C — Vercel / Netlify / Cloudflare Pages

The project works on every static host:

- **Vercel / Netlify** — auto-detects Vite. Build command: `npm run build`,
  output: `dist`.
- **Cloudflare Pages** — same.
- **GitHub Pages** — push `dist/` to a `gh-pages` branch.

No server-side env is needed; if you want to override the gamma API URL, set
`VITE_GAMMA_API_URL` in the host's "Environment Variables" UI before building.

### 4.5 Option D — cloud demo with Telegram bot (recommended for shared use)

Run the Express backend (`server/`) on a small VPS. It serves the dashboard
**and** the API **and** the Telegram bot from a single Node process.

```bash
# on the VPS
sudo apt update && sudo apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
git clone <your-repo-url> /opt/polymarket
cd /opt/polymarket
npm ci
npm run build

cp server/.env.example server/.env
$EDITOR server/.env                       # set TELEGRAM_BOT_TOKEN, allowlist, API_TOKEN

# run as a service via PM2
sudo npm i -g pm2
pm2 start server/index.js --name pmt
pm2 save && pm2 startup                   # follow printed command
```

Front it with Nginx + HTTPS (`certbot --nginx -d pmt.yourdomain.com`) and
proxy `/` and `/api/*` to `127.0.0.1:4317` (the default port).

State persists to `server/state.json` (or `STATE_PATH` if set). Deleting that
file resets every wallet, strategy, and log.

For Telegram-bot specific configuration and command reference, see
[`TELEGRAM_BOT_GUIDE.md`](./TELEGRAM_BOT_GUIDE.md).

---

## 5. Going Live (real on-chain trades — optional / advanced)

The current build does **not** place real orders. To wire up real trading on
Polymarket you need three pieces *outside* this UI:

1. **Wallet with funds**
   - Polygon-mainnet account holding **USDC** (the trading collateral).
   - You only need each trader's address inside the dashboard. The **private
     key never goes into the dashboard.**

2. **A signing backend** (you build / host this)
   - A small Node service that signs CLOB orders. Reasons:
     - Browser-side private keys are unsafe.
     - Polymarket's CLOB needs EIP-712 signatures.
   - Recommended stack: Node.js + `ethers` + the official Polymarket
     `@polymarket/clob-client`.
   - Where to put credentials: in the **server's** `.env`, never in the
     browser. The browser only ever calls your backend.

3. **CLOB API credentials**
   - Generated server-side from the wallet's signature. The dashboard talks to
     your backend, not directly to the CLOB.

Sketch of the backend env file (`/etc/polymarket-bot/.env`):

```env
TRADER_A_PRIVATE_KEY=0x...         # NEVER ship to the browser
TRADER_A_ADDRESS=0x...
TRADER_B_PRIVATE_KEY=0x...
TRADER_B_ADDRESS=0x...
TRADER_C_PRIVATE_KEY=0x...
TRADER_C_ADDRESS=0x...

POLYGON_RPC_URL=https://polygon-rpc.com
CLOB_API_URL=https://clob.polymarket.com
PORT=8787
```

Then expose a small REST surface (`POST /trade`, `POST /cancel`,
`GET /balance/:address`) and replace the simulated `runSimTick()` calls in the
dashboard with `fetch` calls to your backend (only when `mode === 'LIVE'`).

> Until you build that backend, **leave the app in DEMO mode** — it's safe,
> uses real prices, and gives every feature including multi-wallet, copy
> trading, tags, auto-pause, etc.

---

## 6. Updating the app

```bash
git pull
npm install            # in case deps changed
npm run build
# re-deploy the new dist/ folder
```

Saved data (wallets, passwords, strategies, logs) lives in `localStorage` per
browser, so updating the bundle does **not** erase user data. A persisted v1
dashboard is auto-migrated to v2/v3 schemas on first load.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Lock screen shows "API unavailable" | Polymarket gamma API blocked / CORS | the app falls back to a local price simulator — features still work |
| Refresh kicks me back to lock screen | `localStorage` was cleared (incognito? privacy extension?) | use a regular profile, allow site data |
| "wrong password" but I'm sure it's right | passwords are case-sensitive and per-browser | reset by signing in as another trader and deleting that wallet from Wallet Manager — then re-register |
| Nothing fires in DEMO mode | every active strategy is filtered by tag/wallet that has nothing matching | clear filters; check the strategy's *Buy window* (default 0:00→1:00) and *Price range* (1¢–99¢) |
| `npm install` errors on Node 16 | Vite 5 needs Node 18+ | upgrade Node to 18 LTS or 20 LTS |

---

## 8. Quick reference — what to put where

| Concern | Goes in |
| --- | --- |
| Wallet address (per trader) | Wallet Manager, in-app |
| Wallet color / label | Wallet Manager, in-app |
| Wallet **password** | Lock Screen → Register, then changeable from header |
| Polymarket Gamma URL override | `.env.local` → `VITE_GAMMA_API_URL` |
| Strategy parameters | AutoTrade tab → New / Edit |
| Copy-target wallet address | Copy Trade tab → New / Edit (the *Target wallet* field) |
| Tag colors / auto-pause limits | Tag bar → Auto-pause manager |
| Real-money private keys | **NOT in this repo** — keep them on a separate signing backend |
