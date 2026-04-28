# Wallet Guide — Connect, Deposit & Withdraw

This guide answers two everyday questions for a trader using the dashboard:

1. **How do I connect my wallet?**
2. **How do I deposit / withdraw funds?**

It covers what the current build supports today (DEMO mode, address-only
"connect") and what a real on-chain integration looks like (LIVE mode, when
you wire up a signing backend — see `SETUP.md` § *Going Live*).

> TL;DR: in DEMO the wallet "address" is just a label and a paper balance
> tracker — nothing leaves your browser. To send / receive **real** USDC you
> need MetaMask (or another wallet), Polygon mainnet, and the live-mode
> backend described in `SETUP.md`.

---

## 1. The two modes at a glance

| | **DEMO mode** (default) | **LIVE mode** (planned) |
| --- | --- | --- |
| What "connect" means | paste your address as a label | sign in with MetaMask / WalletConnect via the live backend |
| Balance source | $1,000 paper, stored in `localStorage` | on-chain USDC on Polygon mainnet |
| Trade execution | simulated locally, real Polymarket prices | real CLOB orders signed by your wallet |
| Withdraw | reset the paper balance from the wallet strip | move USDC out of Polymarket → your wallet → CEX / fiat |
| Risk | zero | real money |

You can always practise everything in DEMO first. No private key is ever asked
for.

---

## 2. Connect a wallet (DEMO mode — current build)

### 2.1 The very first time you open the dashboard

1. The **Lock Screen** loads with three pre-seeded traders (A / B / C).
2. Pick one (or hit **+ Add new trader** to create a fresh one).
3. Set a password (min 6 chars, confirm). This logs you in.
4. The dashboard opens. Your wallet pill in the top strip will show
   **`YOU`**.

### 2.2 Set / update your wallet address

> In DEMO this is purely cosmetic — used as a label and to show in the
> wallet pill. Nothing is signed or broadcast.

1. Click **manage** in the wallet strip → **Wallet Manager** opens.
2. Find your row (highlighted, has a **`me`** badge).
3. Paste your Polygon address into the address field. Format:
   `0x` + 40 hex chars (`0x1234…abcd`).
4. Optional: change the label, color (click the swatch to cycle), and DEMO
   paper balance.
5. Click **Done**.

If you want to switch traders, hit the **sign-out** icon next to your name in
the header → you'll go back to the Lock Screen → sign in as another wallet.

### 2.3 Add a brand-new trader (e.g. for a friend)

- From Lock Screen → **+ Add new trader** → register password.
- Or from inside the app → wallet strip **+ add** → opens an empty wallet that
  the new trader will register the next time they sign in.
- Maximum **8 wallets** per dashboard.

---

## 3. Connect a wallet for real (LIVE mode — once you wire the backend)

LIVE wallet connection is **not in this repo's UI yet**. The dashboard has
the LIVE toggle and confirmation modal, but actual signing requires the small
backend described in `SETUP.md` § *Going Live*. The intended user flow:

### 3.1 What the trader needs

| Item | Where | Notes |
| --- | --- | --- |
| MetaMask / Rabby / Trust / hardware wallet (Ledger) | browser extension or device | any EVM wallet works |
| Polygon mainnet network configured | wallet → networks | RPC: `https://polygon-rpc.com`, Chain ID `137` |
| **MATIC** for gas | a few dollars worth | needed to approve / sign |
| **USDC** for trading collateral | your wallet on Polygon | this is what you actually trade with |

### 3.2 Connecting the wallet inside the dashboard (planned UI)

Once the backend is live:

1. Toggle the dashboard to **LIVE** (header) → confirm in the warning modal.
2. Open Wallet Manager → click **Connect wallet** on your row.
3. MetaMask pops up → choose the account → **Connect**.
4. The dashboard reads your address back, asks you to **sign a one-time
   login message** (no gas, no transaction — just a signature for CLOB
   credentials).
5. Backend exchanges that signature for a Polymarket CLOB API key it caches
   server-side. The browser only sees an opaque session token.

After this, the wallet pill turns green-bordered and your real on-chain USDC
balance shows instead of the DEMO paper balance.

### 3.3 Disconnecting

- **Sign out** of the dashboard → backend revokes the session token.
- In MetaMask → menu → *Connected sites* → remove the dashboard.

---

## 4. Deposit funds (LIVE)

Polymarket trades in **USDC on Polygon (PoS)**. To go from "I have money in a
bank / on Binance" to "I can place a trade":

```text
bank/CEX  ──>  Polygon USDC in your wallet  ──>  USDC inside Polymarket
   (1)                    (2)                              (3)
```

### 4.1 Get USDC into your Polygon wallet

Pick whichever is easiest for you:

- **From a centralized exchange** (Binance, Coinbase, Kraken, OKX, Bybit)
  - Buy / hold USDC.
  - Withdraw → choose **Polygon** as the network → paste your wallet address
    → confirm.
  - Wait 2–10 minutes for the transfer.
- **Bridge from Ethereum** (if you already have USDC on L1)
  - Use the official Polygon Bridge (`https://portal.polygon.technology`),
    Bungee, or LiFi.
  - Bridges take 10–30 minutes. Always **send a $5 test first**.
- **On-ramp directly with a card** (Transak, MoonPay, Ramp inside MetaMask)
  - Quick but the spreads + fees are higher.

### 4.2 Approve & deposit into Polymarket

Polymarket's CLOB doesn't custody your USDC; it operates via the **Conditional
Token Framework (CTF)** smart contracts on Polygon. Two one-time
transactions:

1. **Approve USDC spending** for the Polymarket CTF exchange contract.
2. **Approve CTF position transfers** for the same contract.

Both are gas-paid in MATIC and only need to happen once per wallet. The
dashboard's planned UI will trigger them automatically the first time you hit
**Place trade** in LIVE mode.

After approvals, every trade just signs an off-chain order — no per-trade gas
cost.

### 4.3 Verify the deposit

- Wallet Manager will show your **on-chain USDC balance** (instead of the
  paper balance) once LIVE mode is connected.
- You can cross-check on
  [polygonscan.com](https://polygonscan.com/address/) by pasting your
  address and looking at the **USDC** token balance.

---

## 5. Withdraw funds (LIVE)

Withdrawing from Polymarket has **three legs** and the dashboard helps with
the first one. Plan for ~15–60 minutes end-to-end if you want fiat in your
bank.

```text
   Polymarket position(s)  ──>  USDC in your wallet  ──>  USDC on CEX  ──>  bank
            (1)                          (2)                    (3)              (4)
```

### 5.1 Step 1 — exit your positions inside Polymarket

There are two ways your USDC ends up "in your wallet" on Polymarket:

| Path | What happens | Time |
| --- | --- | --- |
| Sell open shares | place a sell order on the YES/NO position; collateral is released | seconds (if there's a buyer) |
| Wait for market resolution | winning shares auto-redeem 1:1 to USDC; losers go to 0 | until market resolves |

The dashboard's planned LIVE flow:

1. Open the strategy / copy card → **Close all** button → confirm.
2. The backend signs sell-orders for every open share at the best bid.
3. Once filled, the released USDC sits in your **Polymarket account
   balance** (still in the CTF contracts, but redeemable to your wallet).

> Auto-pause + manual pause **stop new trades**, but they don't sell open
> positions. Use **Close all** for that.

### 5.2 Step 2 — withdraw to your wallet (planned UI)

Once you have a positive Polymarket balance:

1. Wallet strip → click your wallet pill → **Withdraw** (planned button next
   to **Reset**).
2. A modal opens:
   - **Amount** — defaults to *Max* (your Polymarket balance).
   - **Destination** — pre-filled with the connected wallet address. You can
     paste a different Polygon address if you want to send to a hardware
     wallet.
   - **Network fee** — small MATIC gas estimate.
3. Click **Confirm**. MetaMask pops up — sign the on-chain withdrawal.
4. ~30 seconds later the USDC lands in your wallet on Polygon.

The Live Log will show the withdrawal as a row tagged `WITHDRAW` so every
trader on the same dashboard can audit who pulled how much.

### 5.3 Step 3 — off-ramp (USDC → fiat)

The dashboard cannot move USDC to a bank — that step is always done outside.

- **Via CEX** (most common, cheapest)
  1. Open Binance / Coinbase / OKX → Deposit → choose **USDC on Polygon**.
  2. Copy the deposit address.
  3. From MetaMask, send USDC to that address on Polygon.
  4. Once it credits, sell USDC for INR / USD / EUR on the spot market.
  5. Withdraw fiat to your bank.
- **Via direct off-ramp** (Transak, MoonPay, Ramp Network)
  - Faster but higher fees (~3–5 %).
- **Via P2P** (Binance P2P, OKX P2P, KuCoin P2P)
  - Useful in countries where direct fiat withdrawal is restricted.

### 5.4 In DEMO mode

There's nothing to withdraw — the paper balance is local-only. The closest
equivalent is the **Reset** button in the wallet strip / wallet manager,
which sets your wallet's paper balance back to the starting amount and
zeroes its strategy stats.

---

## 6. Multi-trader withdrawals (3-friend setup)

Because every wallet has its own password and ownership rules:

- Trader A logs in → sees Trader B's stats but **cannot** trigger a withdrawal
  for B's wallet.
- The **Withdraw** button is only enabled on the row that matches
  `currentUser`. Other rows show the locked badge instead.
- If you all share the same browser (e.g. on a VPS dashboard), **only one
  trader is signed in at a time** — log out, log the next trader in. Their
  wallet, their funds, their decisions.
- Audit trail: the Live Log records who connected, signed in, signed out, and
  withdrew, with timestamps and the wallet pill on every row.

---

## 7. Security checklist

Treat this exactly the way you'd treat a hot exchange wallet:

- ✅ **Use a dedicated trading wallet.** Don't connect your long-term cold
  storage. Fund the trading wallet with only what you're willing to risk.
- ✅ **Hardware wallet for big balances.** Ledger / Trezor over MetaMask the
  moment your balance is meaningful. The dashboard is wallet-agnostic — any
  EVM signer works through the same flow.
- ✅ **Never paste a private key** anywhere in the dashboard. The UI asks for
  an *address* (`0x…`) and a *password*. The password is for the dashboard
  itself; it never touches the chain.
- ✅ **Bookmark the dashboard URL.** Phishing clones are the #1 way people
  lose funds.
- ✅ **Verify chain + contract** before approving USDC. The legitimate
  Polymarket contracts on Polygon are listed on
  [docs.polymarket.com](https://docs.polymarket.com/).
- ✅ **Set sensible per-strategy budgets.** The 80 % auto-pause guard saves
  you when something is mispriced or a script bugs out.
- ✅ **Test withdraw with a small amount first** (e.g. $5) the first time you
  go LIVE.
- ❌ **Do not store the trading wallet's seed phrase on the same machine** as
  the dashboard. Paper backup, in a safe.
- ❌ **Do not share your dashboard password** with the other traders. Each
  trader has their own; that's the whole point of the multi-wallet system.

---

## 8. FAQ / Troubleshooting

**Q: I see "API unavailable" on the lock screen.**
A: The Polymarket Gamma API blocked your IP / a browser extension is
blocking it. The dashboard falls back to a local price simulator — DEMO
features still work. For LIVE you'll need the API reachable from the VPS.

**Q: My wallet address shows but the balance is still $1,000 paper.**
A: You're in DEMO mode. Toggle to LIVE in the header (and complete the
backend integration in `SETUP.md`) to see on-chain balances.

**Q: I forgot my dashboard password.**
A: Sign in as another trader → Wallet Manager → delete the locked wallet →
re-create it from the lock screen with a new password. Strategies/copies
attached to the deleted wallet move to the next available wallet
automatically. **All paper-balance history for that wallet is lost.** In
LIVE mode this does **not** affect on-chain funds — those are still in your
on-chain wallet, you just need to reconnect.

**Q: Withdraw is greyed out.**
A: Either you're in DEMO (nothing to withdraw — use Reset), the wallet
isn't yours (only the signed-in trader can withdraw their own funds), or
LIVE mode isn't fully wired up yet (see `SETUP.md`).

**Q: Can I deposit from a Bitcoin wallet?**
A: Not directly. Polymarket only accepts USDC on Polygon. You'd need to
swap BTC → USDC on a CEX and withdraw to Polygon as in § 4.1.

**Q: Are funds custodial?**
A: No. Polymarket uses non-custodial CTF contracts. Your USDC sits in smart
contracts you control via your wallet's signature. The dashboard never
touches your private key.

---

## 9. Quick reference

| Want to… | DEMO | LIVE (after backend wired) |
| --- | --- | --- |
| Connect a wallet | Wallet Manager → paste address | header → LIVE → MetaMask popup → sign login message |
| Deposit | not applicable | CEX → USDC on Polygon → approve once → trade |
| Withdraw | wallet strip → **Reset** | wallet strip → **Withdraw** → confirm in MetaMask |
| Switch trader | Sign out → pick another wallet on Lock Screen | same |
| Reset password | sign in as another trader → delete wallet → re-register | same |
| Audit who did what | Live Log tab | Live Log tab |

---

For installation, VPS deploy, env vars and the LIVE-mode backend sketch, see
[`SETUP.md`](./SETUP.md). For the complete feature catalogue, see
[`FEATURES.md`](./FEATURES.md).
