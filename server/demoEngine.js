// Server-side paper trading engine. Pulls real Polymarket prices, simulates
// trade resolution, updates state, and emits events for Telegram alerts.
import { EventEmitter } from 'events';
import {
  getState,
  setState,
  pushLog,
  bumpDailyPnl,
  uid,
  todayKey,
  COIN_DEFAULTS,
} from './stateStore.js';

const GAMMA_API_URL =
  process.env.GAMMA_API_URL ||
  'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=40&order=volume24hr&ascending=false&tag=crypto';

const TICK_MS = 3500;
const PRICE_MS = 5000;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function timeframeMinutes(tf) {
  if (tf === '5MIN') return 5;
  if (tf === '15MIN') return 15;
  if (tf === '1HOUR') return 60;
  if (tf === '4HOUR') return 240;
  return 5;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function fmtClock12(d) {
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${pad2(h)}:${pad2(d.getMinutes())} ${ampm}`;
}

function candleInfo(ts, timeframe) {
  const mins = timeframeMinutes(timeframe);
  const sizeMs = mins * 60 * 1000;
  const start = Math.floor(ts / sizeMs) * sizeMs;
  const end = start + sizeMs;
  const sd = new Date(start);
  const ed = new Date(end);
  return {
    key: `${timeframe}:${start}`,
    start,
    end,
    label: `${fmtClock12(sd)}-${fmtClock12(ed)}`,
  };
}

export const events = new EventEmitter();

/* ---------- price poller -------------------------------------------- */
async function pollPrices() {
  try {
    const res = await fetch(GAMMA_API_URL, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('http ' + res.status);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.markets || [];
    const next = {};
    for (const m of list) {
      const q = `${m.question || m.title || ''}`.toUpperCase();
      for (const c of COIN_DEFAULTS) {
        if (q.includes(c) && !next[c]) {
          let yes = null;
          try {
            const arr = JSON.parse(m.outcomePrices || m.outcome_prices || '[]');
            yes = parseFloat(arr[0]);
          } catch {
            yes = null;
          }
          if (Number.isFinite(yes)) {
            next[c] = { yesCents: clamp(yes * 100, 1, 99), market: m.question || m.title || '' };
          }
        }
      }
    }
    setState((s) => {
      for (const c of COIN_DEFAULTS) {
        if (next[c]) s.polyPrices[c] = next[c];
        else if (!s.polyPrices[c]) s.polyPrices[c] = { yesCents: 35 + Math.random() * 50, market: 'Simulated' };
        else s.polyPrices[c].yesCents = clamp(s.polyPrices[c].yesCents + (Math.random() - 0.5) * 1.4, 1, 99);
      }
      s.apiStatus = 'ok';
    });
  } catch (e) {
    setState((s) => {
      for (const c of COIN_DEFAULTS) {
        const cur = s.polyPrices[c]?.yesCents ?? 30 + Math.random() * 50;
        s.polyPrices[c] = { yesCents: clamp(cur + (Math.random() - 0.5) * 2, 1, 99), market: 'Offline simulation' };
      }
      s.apiStatus = 'error';
    });
  }
}

/* ---------- trade resolution --------------------------------------- */
function resolveTrade({
  source,
  sourceId,
  sourceLabel,
  coin,
  direction,
  timeframe,
  entryPrice,
  amount,
  tagIds,
  walletId,
  candle,
}) {
  const implied = entryPrice / 100;
  const winProb = clamp(implied * 0.92 + 0.08, 0.05, 0.95);
  const win = Math.random() < winProb;
  const placedAt = Date.now();
  const placedId = uid();
  const secondsBeforeClose = candle?.end
    ? Math.max(0, Math.floor((candle.end - placedAt) / 1000))
    : null;

  pushLog({
    id: placedId,
    ts: placedAt,
    coin,
    direction,
    timeframe,
    entryPrice,
    exitPrice: null,
    amount,
    secondsBeforeClose,
    pnlPct: null,
    candleKey: candle?.key,
    candleLabel: candle?.label,
    candleStart: candle?.start,
    candleEnd: candle?.end,
    status: 'PLACED',
    source,
    sourceId,
    sourceLabel,
    tagIds,
    walletId,
    mode: getState().mode,
  });
  events.emit('trade-placed', { coin, direction, timeframe, entryPrice, amount, source, sourceLabel, walletId, candle });

  const settleMs = 4000 + Math.floor(Math.random() * 8000);
  setTimeout(() => {
    const exitPrice = win ? 100 : 0;
    const grossWin = amount * (100 / entryPrice - 1);
    const pnl = win ? grossWin : -amount;
    const pnlPct = amount > 0 ? (pnl / amount) * 100 : 0;

    pushLog({
      ts: Date.now(),
      coin,
      direction,
      timeframe,
      entryPrice,
      exitPrice,
      amount,
      secondsBeforeClose,
      candleKey: candle?.key,
      candleLabel: candle?.label,
      candleStart: candle?.start,
      candleEnd: candle?.end,
      status: win ? 'WON' : 'LOST',
      pnl,
      pnlPct,
      source,
      sourceId,
      sourceLabel,
      tagIds,
      walletId,
      mode: getState().mode,
    });

    setState((s) => {
      const list = source === 'AUTO' ? s.strategies : s.copies;
      const item = list.find((x) => x.id === sourceId);
      if (item) {
        item.wins = (item.wins || 0) + (win ? 1 : 0);
        item.losses = (item.losses || 0) + (win ? 0 : 1);
        item.pnl = +((item.pnl || 0) + pnl).toFixed(4);
      }
      if (s.mode === 'DEMO' && walletId) {
        const w = s.wallets.find((x) => x.id === walletId);
        if (w) w.demoBalance = +((w.demoBalance || 0) + pnl).toFixed(4);
      }
    });

    bumpDailyPnl(pnl);
    events.emit('trade-resolved', {
      coin,
      direction,
      timeframe,
      entryPrice,
      amount,
      win,
      pnl,
      pnlPct,
      exitPrice,
      secondsBeforeClose,
      source,
      sourceLabel,
      walletId,
      candle,
    });
  }, settleMs);
}

/* ---------- main tick ---------------------------------------------- */
function tick() {
  const newKey = todayKey();
  setState((s) => {
    // Roll over per-day fire counts and apply 80% budget auto-pause guard.
    for (const st of s.strategies) {
      if (st.firesTodayKey !== newKey) {
        st.firesTodayKey = newKey;
        st.firesToday = 0;
      }
      if (
        st.totalBudget > 0 &&
        st.budgetSpent / st.totalBudget >= 0.8 &&
        st.status === 'ACTIVE' &&
        !st.autoPaused
      ) {
        st.status = 'PAUSED';
        st.autoPaused = true;
        s.logs.unshift({
          id: uid(),
          ts: Date.now(),
          status: 'AUTO-PAUSED',
          source: 'AUTO',
          sourceId: st.id,
          sourceLabel: st.label,
          walletId: st.walletId,
          tagIds: st.tagIds,
          message: '80% budget reached',
        });
        events.emit('auto-paused', { kind: 'strategy', id: st.id, label: st.label, walletId: st.walletId, reason: 'budget' });
      }
    }
    for (const cp of s.copies) {
      if (
        cp.totalBudget > 0 &&
        cp.budgetSpent / cp.totalBudget >= 0.8 &&
        cp.status === 'ACTIVE' &&
        !cp.autoPaused
      ) {
        cp.status = 'PAUSED';
        cp.autoPaused = true;
        s.logs.unshift({
          id: uid(),
          ts: Date.now(),
          status: 'AUTO-PAUSED',
          source: 'COPY',
          sourceId: cp.id,
          sourceLabel: cp.label,
          walletId: cp.walletId,
          tagIds: cp.tagIds,
          message: '80% budget reached',
        });
        events.emit('auto-paused', { kind: 'copy', id: cp.id, label: cp.label, walletId: cp.walletId, reason: 'budget' });
      }
    }

    // Per-tag aggregate auto-pause.
    for (const t of s.tags) {
      const sList = s.strategies.filter((x) => (x.tagIds || []).includes(t.id));
      const cList = s.copies.filter((x) => (x.tagIds || []).includes(t.id));
      const agg = sList.reduce((a, x) => a + (x.pnl || 0), 0) + cList.reduce((a, x) => a + (x.pnl || 0), 0);
      const all = [...sList, ...cList];
      if (!all.length) continue;
      if (t.profitTarget != null && agg >= t.profitTarget && t.triggered !== 'profit') {
        t.triggered = 'profit';
        for (const x of all) if (x.status === 'ACTIVE') {
          x.status = 'PAUSED';
          x.autoPaused = true;
        }
        s.logs.unshift({
          id: uid(),
          ts: Date.now(),
          status: 'TAG-TARGET',
          message: `Tag "${t.name}" hit profit target $${t.profitTarget}`,
          tagIds: [t.id],
        });
        events.emit('tag-trigger', { tag: t, kind: 'profit', agg });
      } else if (t.lossLimit != null && agg <= -t.lossLimit && t.triggered !== 'loss') {
        t.triggered = 'loss';
        for (const x of all) if (x.status === 'ACTIVE') {
          x.status = 'PAUSED';
          x.autoPaused = true;
        }
        s.logs.unshift({
          id: uid(),
          ts: Date.now(),
          status: 'TAG-LOSS',
          message: `Tag "${t.name}" hit loss limit $${t.lossLimit}`,
          tagIds: [t.id],
        });
        events.emit('tag-trigger', { tag: t, kind: 'loss', agg });
      }
    }
  });

  // Decide which trades to fire (pure read).
  const s = getState();
  const polyPrices = s.polyPrices;
  const fallbackWalletId = s.wallets[0]?.id || null;

  for (const st of s.strategies) {
    if (st.status !== 'ACTIVE') continue;
    if (st.budgetSpent + st.perTrade > st.totalBudget) continue;
    if (st.firesToday >= st.maxTradesPerDay) continue;
    if (!st.coins?.length) continue;
    const candle = candleInfo(Date.now(), st.timeframe);
    if (st.lastCandleKey === candle.key) continue;
    if (Math.random() > 0.45) continue;

    const coin = st.coins[Math.floor(Math.random() * st.coins.length)];
    const polyPrice = polyPrices[coin]?.yesCents ?? 50;
    if (polyPrice < st.priceMin - st.slippage || polyPrice > st.priceMax + st.slippage) continue;

    const target = clamp(polyPrice, st.priceMin, st.priceMax);
    const jitter = (Math.random() - 0.5) * (st.slippage || 1);
    const entry = clamp(target + jitter, st.priceMin, st.priceMax);
    const amount = +st.perTrade;

    setState((s2) => {
      const x = s2.strategies.find((z) => z.id === st.id);
      if (!x) return;
      x.fires = (x.fires || 0) + 1;
      x.firesToday = (x.firesToday || 0) + 1;
      x.budgetSpent = +((x.budgetSpent || 0) + amount).toFixed(4);
      x.lastTradeAt = Date.now();
      x.lastCandleKey = candle.key;
      x.lastCandleLabel = candle.label;
    });
    resolveTrade({
      source: 'AUTO',
      sourceId: st.id,
      sourceLabel: st.label,
      coin,
      direction: st.direction,
      timeframe: st.timeframe,
      entryPrice: +entry.toFixed(1),
      amount,
      tagIds: st.tagIds,
      walletId: st.walletId || fallbackWalletId,
      candle,
    });
  }

  for (const cp of s.copies) {
    if (cp.status !== 'ACTIVE') continue;
    const amt = cp.sizeMode === 'PERCENTAGE' ? +(cp.sizePct * 0.1).toFixed(2) : +cp.sizeFixed;
    if (cp.budgetSpent + amt > cp.totalBudget) continue;
    if (!cp.coins?.length || !cp.timeframes?.length) continue;
    if (Math.random() > 0.34) continue;

    const coin = cp.coins[Math.floor(Math.random() * cp.coins.length)];
    const tf = cp.timeframes[Math.floor(Math.random() * cp.timeframes.length)];
    const candle = candleInfo(Date.now(), tf);
    if (cp.lastCandleKey === candle.key) continue;
    const polyPrice = polyPrices[coin]?.yesCents ?? 50;
    const slip = cp.priceMode === 'EXACT' ? 0 : (Math.random() - 0.5) * (cp.slippage || 1);
    const entry = clamp(polyPrice + slip, 1, 99);

    setState((s2) => {
      const x = s2.copies.find((z) => z.id === cp.id);
      if (!x) return;
      x.trades = (x.trades || 0) + 1;
      x.budgetSpent = +((x.budgetSpent || 0) + amt).toFixed(4);
      x.lastTradeAt = Date.now();
      x.lastCandleKey = candle.key;
      x.lastCandleLabel = candle.label;
    });
    resolveTrade({
      source: 'COPY',
      sourceId: cp.id,
      sourceLabel: cp.label || cp.walletAddress?.slice(0, 8) || 'copy',
      coin,
      direction: Math.random() > 0.5 ? 'UP' : 'DOWN',
      timeframe: tf,
      entryPrice: +entry.toFixed(1),
      amount: amt,
      tagIds: cp.tagIds,
      walletId: cp.walletId || fallbackWalletId,
      candle,
    });
  }
}

let tickTimer = null;
let priceTimer = null;

export function start() {
  if (tickTimer) return;
  pollPrices();
  priceTimer = setInterval(pollPrices, PRICE_MS);
  tickTimer = setInterval(tick, TICK_MS);
  console.log('[engine] paper trading engine started');
}

export function stop() {
  if (tickTimer) clearInterval(tickTimer);
  if (priceTimer) clearInterval(priceTimer);
  tickTimer = null;
  priceTimer = null;
}
