import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BellOff,
  ChevronDown,
  ChevronUp,
  Copy,
  Filter,
  LineChart as LineChartIcon,
  Lock,
  LogIn,
  LogOut,
  Pencil,
  Pause,
  Play,
  Plus,
  Power,
  RefreshCw,
  Search,
  Sparkles,
  Tag as TagIcon,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Unlock,
  UserPlus,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';

/* ============================================================================
 * Polymarket AutoTrader — single-file React dashboard
 * Dark trading-terminal aesthetic. UI-only with a realistic simulation engine.
 * Real Polymarket gamma-api is polled for market data (best-effort, falls
 * back gracefully when offline / blocked).
 * ============================================================================ */

const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'HYPE', 'BNB'];
const TIMEFRAMES = ['5MIN', '15MIN', '1HOUR', '4HOUR'];
const TIMEFRAME_SECONDS = { '5MIN': 300, '15MIN': 900, '1HOUR': 3600, '4HOUR': 14400 };
const TAGS_PALETTE = ['#00ff88', '#00c4ff', '#ff4757', '#ffb800', '#a855f7', '#ec4899', '#22d3ee', '#f97316'];
const COIN_COLORS = {
  BTC: '#f7931a',
  ETH: '#8a92b2',
  SOL: '#9945ff',
  XRP: '#7fb1d3',
  DOGE: '#c2a633',
  HYPE: '#00ff88',
  BNB: '#f3ba2f',
};

const STORAGE_KEY = 'polymarket-autotrader-state-v1';
const MAX_LOG_LINES = 250;
const WALLET_COLORS = ['#00ff88', '#00c4ff', '#ffb800', '#a855f7', '#ec4899', '#22d3ee', '#f97316', '#ff4757'];

/* ---------- helpers ----------------------------------------------------- */
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const fmtUSD = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;
const fmtPct = (n, signed = true) =>
  `${signed && n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const fmtCents = (n) => `${n.toFixed(1)}¢`;
const fmtAddress = (a) =>
  !a ? '' : a.length <= 12 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmtTime = (ts) => {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour12: false });
};
const fmtDay = (ts) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const parseMMSS = (s) => {
  if (!s || typeof s !== 'string') return 0;
  const [m = '0', sec = '0'] = s.split(':');
  return Math.max(0, parseInt(m, 10) || 0) * 60 + Math.max(0, parseInt(sec, 10) || 0);
};
const safeNum = (v, fallback = 0) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : fallback;
};

/* ---------- password hashing -------------------------------------------
 * Demo-grade synchronous hash. NOT for production secrets — for production,
 * move auth to a real backend. This is here so multi-trader lock-screen works
 * with no network and no extra deps.
 * ---------------------------------------------------------------------- */
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}
function hashPwd(password, salt) {
  let s = (salt || '') + '|' + (password || '');
  for (let i = 0; i < 4096; i++) s = djb2(s + ':' + i);
  return s;
}
function newSalt() {
  return uid() + uid() + Date.now().toString(36);
}
function pwdStrength(p) {
  let score = 0;
  if (!p) return { score: 0, label: 'empty', color: '#666' };
  if (p.length >= 6) score++;
  if (p.length >= 10) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  const labels = ['too weak', 'weak', 'okay', 'good', 'strong', 'excellent'];
  const colors = ['#ff4757', '#ff7043', '#ffb800', '#9ccc65', '#00ff88', '#00ff88'];
  return { score, label: labels[score], color: colors[score] };
}

/* ---------- defaults ---------------------------------------------------- */
const defaultWallet = (i = 0) => ({
  id: 'w_' + uid(),
  label: `Trader ${i + 1}`,
  address: '',
  color: WALLET_COLORS[i % WALLET_COLORS.length],
  demoBalance: 1000,
  startingBalance: 1000,
  passwordHash: null,
  passwordSalt: null,
  createdAt: Date.now(),
});

const seedWallets = () => [
  {
    id: 'w_alice',
    label: 'Trader A',
    address: '0x1aA1bC2dD3eE4fF5aA6bB7cC8dD9eE0fF1aB2c9d',
    color: '#00ff88',
    demoBalance: 1000,
    startingBalance: 1000,
    passwordHash: null,
    passwordSalt: null,
    createdAt: Date.now(),
  },
  {
    id: 'w_bob',
    label: 'Trader B',
    address: '0x2bB2cD3eE4fF5aA6bB7cC8dD9eE0fF1aA2b3c4e7',
    color: '#00c4ff',
    demoBalance: 1000,
    startingBalance: 1000,
    passwordHash: null,
    passwordSalt: null,
    createdAt: Date.now(),
  },
  {
    id: 'w_chad',
    label: 'Trader C',
    address: '0x3cC3dE4fF5aA6bB7cC8dD9eE0fF1aA2b3c4d5f8a',
    color: '#ffb800',
    demoBalance: 1000,
    startingBalance: 1000,
    passwordHash: null,
    passwordSalt: null,
    createdAt: Date.now(),
  },
];

const defaultStrategy = () => ({
  id: uid(),
  walletId: null,
  tagIds: [],
  label: 'New Strategy',
  coins: ['BTC'],
  timeframe: '5MIN',
  direction: 'UP',
  buyFrom: '04:00',
  buyUntil: '04:30',
  priceMin: 80,
  priceMax: 95,
  perTrade: 1,
  totalBudget: 50,
  stopLoss: -80,
  takeProfit: 50,
  minMove: 50,
  maxMove: 500,
  slippage: 2,
  maxTradesPerDay: 30,
  status: 'ACTIVE',
  // runtime stats
  fires: 0,
  wins: 0,
  losses: 0,
  pnl: 0,
  budgetSpent: 0,
  firesToday: 0,
  firesTodayKey: todayKey(),
  autoPaused: false,
});

const defaultCopy = () => ({
  id: uid(),
  walletId: null,
  tagIds: [],
  walletAddress: '',
  label: 'Copy Trader',
  sizeMode: 'PERCENTAGE',
  sizePct: 10,
  sizeFixed: 1,
  maxTradesPerMarket: 2,
  priceMode: 'SLIPPAGE',
  slippage: 2,
  timeframes: ['5MIN', '15MIN'],
  coins: ['BTC', 'ETH'],
  totalBudget: 100,
  status: 'ACTIVE',
  trades: 0,
  wins: 0,
  losses: 0,
  pnl: 0,
  budgetSpent: 0,
  autoPaused: false,
});

const seedTags = [
  { id: 't_sniper', name: 'Sniper', color: '#00ff88', profitTarget: 25, lossLimit: 15, triggered: null },
  { id: 't_scalp', name: 'Scalp', color: '#00c4ff', profitTarget: null, lossLimit: 20, triggered: null },
  { id: 't_whales', name: 'Copy Whales', color: '#a855f7', profitTarget: 50, lossLimit: 30, triggered: null },
];

const seedStrategies = () => [
  {
    ...defaultStrategy(),
    id: 's_btc_sniper',
    label: 'BTC Sniper',
    walletId: 'w_alice',
    tagIds: ['t_sniper'],
    coins: ['BTC'],
    timeframe: '5MIN',
    direction: 'UP',
    buyFrom: '04:00',
    buyUntil: '04:30',
    priceMin: 78,
    priceMax: 92,
    perTrade: 1,
    totalBudget: 50,
    stopLoss: -100,
    takeProfit: 30,
    minMove: 40,
    maxMove: 600,
    slippage: 2,
    maxTradesPerDay: 40,
    status: 'ACTIVE',
    fires: 12,
    wins: 8,
    losses: 4,
    pnl: 4.32,
    budgetSpent: 12,
  },
  {
    ...defaultStrategy(),
    id: 's_eth_scalp',
    label: 'ETH Scalp',
    walletId: 'w_bob',
    tagIds: ['t_scalp'],
    coins: ['ETH'],
    timeframe: '15MIN',
    direction: 'DOWN',
    buyFrom: '14:00',
    buyUntil: '14:45',
    priceMin: 65,
    priceMax: 85,
    perTrade: 2,
    totalBudget: 100,
    stopLoss: -80,
    takeProfit: 40,
    minMove: 15,
    maxMove: 200,
    slippage: 3,
    maxTradesPerDay: 25,
    status: 'ACTIVE',
    fires: 7,
    wins: 4,
    losses: 3,
    pnl: -1.4,
    budgetSpent: 14,
  },
  {
    ...defaultStrategy(),
    id: 's_sol_swing',
    label: 'SOL Swing',
    walletId: 'w_chad',
    tagIds: ['t_sniper', 't_scalp'],
    coins: ['SOL', 'HYPE'],
    timeframe: '1HOUR',
    direction: 'UP',
    buyFrom: '55:00',
    buyUntil: '59:30',
    priceMin: 60,
    priceMax: 80,
    perTrade: 1.5,
    totalBudget: 75,
    stopLoss: -90,
    takeProfit: 60,
    minMove: 0.5,
    maxMove: 8,
    slippage: 2,
    maxTradesPerDay: 20,
    status: 'PAUSED',
    fires: 5,
    wins: 2,
    losses: 3,
    pnl: -3.1,
    budgetSpent: 7.5,
  },
];

const seedCopies = () => [
  {
    ...defaultCopy(),
    id: 'c_alpha',
    walletId: 'w_alice',
    walletAddress: '0x4f8b2a91c0d3e6f7a8b9c0d1e2f3a4b5c6d78a2',
    label: 'AlphaWhale',
    tagIds: ['t_whales'],
    sizeMode: 'PERCENTAGE',
    sizePct: 5,
    maxTradesPerMarket: 2,
    priceMode: 'SLIPPAGE',
    slippage: 2,
    timeframes: ['5MIN', '15MIN', '1HOUR'],
    coins: ['BTC', 'ETH', 'SOL'],
    totalBudget: 200,
    trades: 18,
    wins: 11,
    losses: 7,
    pnl: 8.42,
    budgetSpent: 36,
  },
  {
    ...defaultCopy(),
    id: 'c_degen',
    walletId: 'w_bob',
    walletAddress: '0x9c2e1f5d3a4b6c7d8e9f0a1b2c3d4e5f6a7b8c9d',
    label: 'DegenKing',
    tagIds: ['t_whales'],
    sizeMode: 'FIXED',
    sizeFixed: 1,
    maxTradesPerMarket: 1,
    priceMode: 'EXACT',
    slippage: 0,
    timeframes: ['5MIN'],
    coins: ['BTC', 'DOGE', 'HYPE'],
    totalBudget: 60,
    trades: 9,
    wins: 4,
    losses: 5,
    pnl: -2.3,
    budgetSpent: 9,
  },
];

/* ---------- localStorage persistence ------------------------------------ */
function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // v1 → v2 migration: single wallet/balance → wallets[]
    if (!data.wallets) {
      data.wallets = [
        {
          id: 'w_default',
          label: 'Default',
          address: data.walletAddress || '',
          color: '#00ff88',
          demoBalance: data.demoBalance ?? 1000,
          startingBalance: 1000,
          passwordHash: null,
          passwordSalt: null,
          createdAt: Date.now(),
        },
      ];
    }
    // v2 → v3 migration: ensure password fields exist on every wallet
    data.wallets = data.wallets.map((w) => ({
      passwordHash: null,
      passwordSalt: null,
      createdAt: Date.now(),
      ...w,
    }));
    const fallbackWalletId = data.wallets[0]?.id || null;
    if (Array.isArray(data.strategies)) {
      data.strategies = data.strategies.map((s) => ({
        ...s,
        walletId: s.walletId || fallbackWalletId,
      }));
    }
    if (Array.isArray(data.copies)) {
      data.copies = data.copies.map((c) => ({
        ...c,
        walletId: c.walletId || fallbackWalletId,
      }));
    }
    return data;
  } catch {
    return null;
  }
}
function savePersisted(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

/* ---------- audio cue --------------------------------------------------- */
let _audioCtx = null;
function playBeep(kind = 'fire') {
  try {
    if (!_audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      _audioCtx = new Ctx();
    }
    const ctx = _audioCtx;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    if (kind === 'win') {
      o.frequency.setValueAtTime(660, t0);
      o.frequency.exponentialRampToValueAtTime(990, t0 + 0.18);
    } else if (kind === 'loss') {
      o.frequency.setValueAtTime(280, t0);
      o.frequency.exponentialRampToValueAtTime(150, t0 + 0.22);
    } else {
      o.frequency.setValueAtTime(880, t0);
      o.frequency.exponentialRampToValueAtTime(540, t0 + 0.12);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o.start(t0);
    o.stop(t0 + 0.24);
    if (navigator.vibrate) navigator.vibrate(kind === 'fire' ? 18 : 10);
  } catch {
    /* audio is best-effort */
  }
}

/* ============================================================================
 * App
 * ========================================================================== */
export default function App() {
  const persisted = useMemo(() => loadPersisted(), []);

  const [mode, setMode] = useState(persisted?.mode || 'DEMO'); // DEMO | LIVE
  const [wallets, setWallets] = useState(persisted?.wallets || seedWallets());
  const [activeWalletId, setActiveWalletId] = useState(persisted?.activeWalletId || null);
  const [currentUserId, setCurrentUserId] = useState(persisted?.currentUserId || null);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [tags, setTags] = useState(persisted?.tags || seedTags);
  const [strategies, setStrategies] = useState(persisted?.strategies || seedStrategies());
  const [copies, setCopies] = useState(persisted?.copies || seedCopies());
  const [logs, setLogs] = useState(persisted?.logs || []);
  const [dailyPnl, setDailyPnl] = useState(persisted?.dailyPnl || []);
  const [soundOn, setSoundOn] = useState(persisted?.soundOn ?? true);
  const [tab, setTab] = useState('autotrade');
  const [filterTagId, setFilterTagId] = useState(null);
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [polyPrices, setPolyPrices] = useState({});
  const [apiStatus, setApiStatus] = useState('idle');
  const [showNewStrategy, setShowNewStrategy] = useState(false);
  const [showNewCopy, setShowNewCopy] = useState(false);
  const [showWalletMgr, setShowWalletMgr] = useState(false);

  /* ---------- cloud demo client (optional) ----------------------------
   * If a backend is reachable, the dashboard becomes a thin view: state is
   * polled from /api/state and writes are dispatched to /api/action. The
   * Telegram bot also writes via the same backend, so both clients stay
   * in sync. Falls back to fully-local mode if the backend is offline.
   * ----------------------------------------------------------------- */
  const cloudBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CLOUD_API) || ''; // empty = same-origin
  const cloudToken = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CLOUD_TOKEN) || '';
  const [cloud, setCloud] = useState({ status: 'probing', lastSyncedAt: 0, lastError: '' });
  const cloudEnabled = cloud.status === 'ok';
  const cloudEnabledRef = useRef(false);
  useEffect(() => { cloudEnabledRef.current = cloudEnabled; }, [cloudEnabled]);

  const cloudFetch = async (pathname, opts = {}) => {
    const url = (cloudBase || '') + pathname;
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (cloudToken) headers.Authorization = `Bearer ${cloudToken}`;
    return fetch(url, { ...opts, headers });
  };

  const applyServerState = (s) => {
    if (!s) return;
    setMode(s.mode);
    // Server scrubs hashes/salts before sending state. The UI still reads
    // `passwordHash` to decide "is this wallet protected" → keep it truthy
    // (sentinel string) when the server says hasPassword: true.
    const wallets2 = (s.wallets || []).map((w) => ({
      ...w,
      passwordHash: w.passwordHash != null ? w.passwordHash : (w.hasPassword ? '*' : null),
    }));
    setWallets(wallets2);
    setActiveWalletId(s.activeWalletId);
    setTags(s.tags);
    setStrategies(s.strategies);
    setCopies(s.copies);
    setLogs(s.logs || []);
    setDailyPnl(s.dailyPnl || []);
    setPolyPrices(s.polyPrices || {});
    setApiStatus(s.apiStatus || 'idle');
  };

  // probe + poll
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const probe = async () => {
      try {
        const r = await cloudFetch('/api/health');
        if (!r.ok) throw new Error('bad health');
        const j = await r.json();
        if (cancelled || !j.ok) throw new Error('bad health');
        const s = await cloudFetch('/api/state');
        if (!s.ok) {
          if (s.status === 401) throw new Error('cloud: unauthorized — set VITE_CLOUD_TOKEN');
          throw new Error('cloud: state ' + s.status);
        }
        const state = await s.json();
        if (cancelled) return;
        applyServerState(state);
        // The server has no concept of dashboard sessions. If a stale
        // currentUserId is sitting in localStorage from an earlier offline
        // run, force a fresh password prompt before exposing the dashboard.
        setCurrentUserId(null);
        setCloud({ status: 'ok', lastSyncedAt: Date.now(), lastError: '' });
      } catch (e) {
        if (cancelled) return;
        setCloud({ status: 'offline', lastSyncedAt: 0, lastError: e.message || 'probe failed' });
      }
    };
    probe();
    timer = setInterval(async () => {
      if (cancelled) return;
      try {
        const r = await cloudFetch('/api/state');
        if (!r.ok) throw new Error('http ' + r.status);
        const j = await r.json();
        if (cancelled) return;
        applyServerState(j);
        setCloud((c) => ({ ...c, status: 'ok', lastSyncedAt: Date.now(), lastError: '' }));
      } catch (e) {
        if (cancelled) return;
        setCloud((c) => ({ ...c, status: c.status === 'ok' ? 'stale' : 'offline', lastError: e.message || 'sync failed' }));
      }
    }, 2500);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dispatchCloud = async (action, payload) => {
    try {
      const r = await cloudFetch('/api/action', {
        method: 'POST',
        body: JSON.stringify({ action, payload, actor: currentUserId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        return { ok: false, error: j.error || `http ${r.status}` };
      }
      if (j.state) applyServerState(j.state);
      return j;
    } catch (e) {
      return { ok: false, error: e.message || 'network error' };
    }
  };

  useEffect(() => {
    // Local persistence is only meaningful in offline mode. When cloud is
    // authoritative, skip writing localStorage so we don't shadow server state
    // on next reload.
    if (cloudEnabled) return;
    savePersisted({
      mode,
      wallets,
      activeWalletId,
      currentUserId,
      tags,
      strategies,
      copies,
      logs: logs.slice(0, MAX_LOG_LINES),
      dailyPnl,
      soundOn,
    });
  }, [cloudEnabled, mode, wallets, activeWalletId, currentUserId, tags, strategies, copies, logs, dailyPnl, soundOn]);

  // If the persisted current user is now invalid (wallet deleted, etc.), clear it.
  useEffect(() => {
    if (currentUserId && !wallets.some((w) => w.id === currentUserId)) {
      setCurrentUserId(null);
    }
  }, [currentUserId, wallets]);

  /* ---------- live polymarket fetch (best-effort, local only) --------- */
  useEffect(() => {
    if (cloudEnabled) return; // server polls when cloud is authoritative
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      try {
        const url =
          'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=40&order=volume24hr&ascending=false&tag=crypto';
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('http ' + res.status);
        const data = await res.json();
        if (cancelled) return;
        const next = {};
        const list = Array.isArray(data) ? data : data.markets || [];
        for (const m of list) {
          const q = `${m.question || m.title || ''}`.toUpperCase();
          for (const c of COINS) {
            if (q.includes(c) && !next[c]) {
              let yes = null;
              try {
                const arr = JSON.parse(m.outcomePrices || m.outcome_prices || '[]');
                yes = parseFloat(arr[0]);
              } catch {
                yes = null;
              }
              if (!Number.isFinite(yes)) yes = parseFloat(m.lastTradePrice ?? m.last_trade_price ?? '');
              if (Number.isFinite(yes)) {
                next[c] = {
                  yesCents: clamp(yes * 100, 1, 99),
                  market: (m.question || m.title || '').slice(0, 60),
                };
              }
            }
          }
        }
        // Fill gaps with simulated drift so the sparkline always populates.
        setPolyPrices((prev) => {
          const merged = { ...prev };
          for (const c of COINS) {
            if (next[c]) merged[c] = next[c];
            else if (!merged[c]) merged[c] = { yesCents: 35 + Math.random() * 50, market: 'Simulated' };
            else merged[c] = { ...merged[c], yesCents: clamp(merged[c].yesCents + (Math.random() - 0.5) * 1.4, 1, 99) };
          }
          return merged;
        });
        setApiStatus('ok');
      } catch {
        if (cancelled) return;
        setApiStatus('error');
        setPolyPrices((prev) => {
          const merged = { ...prev };
          for (const c of COINS) {
            const cur = merged[c]?.yesCents ?? 30 + Math.random() * 50;
            merged[c] = { yesCents: clamp(cur + (Math.random() - 0.5) * 2, 1, 99), market: 'Offline simulation' };
          }
          return merged;
        });
      }
    };

    tick();
    timer = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [cloudEnabled]);

  /* ---------- simulated trade engine (local-only) -------------------- */
  // Refs let the interval read fresh state without resetting every render.
  const stratRef = useRef(strategies);
  const copyRef = useRef(copies);
  const polyRef = useRef(polyPrices);
  const modeRef = useRef(mode);
  const soundRef = useRef(soundOn);
  const tagsRef = useRef(tags);
  const walletsRef = useRef(wallets);
  useEffect(() => { stratRef.current = strategies; }, [strategies]);
  useEffect(() => { copyRef.current = copies; }, [copies]);
  useEffect(() => { polyRef.current = polyPrices; }, [polyPrices]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { soundRef.current = soundOn; }, [soundOn]);
  useEffect(() => { tagsRef.current = tags; }, [tags]);
  useEffect(() => { walletsRef.current = wallets; }, [wallets]);

  useEffect(() => {
    // The server runs its own engine when cloud sync is on.
    const id = setInterval(() => {
      if (cloudEnabledRef.current) return;
      runSimTick();
    }, 3500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushLog(entry) {
    setLogs((prev) => [entry, ...prev].slice(0, MAX_LOG_LINES));
  }

  function bumpDailyPnl(delta) {
    const k = todayKey();
    setDailyPnl((prev) => {
      const idx = prev.findIndex((d) => d.key === k);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], pnl: next[idx].pnl + delta };
        return next;
      }
      const next = [...prev, { key: k, day: fmtDay(Date.now()), pnl: delta, ts: Date.now() }];
      return next.slice(-30);
    });
  }

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
  }) {
    const implied = entryPrice / 100;
    const winProb = clamp(implied * 0.92 + 0.08, 0.05, 0.95);
    const win = Math.random() < winProb;
    const placedAt = Date.now();
    const placedId = uid();
    const currentMode = modeRef.current;

    pushLog({
      id: placedId,
      ts: placedAt,
      coin,
      direction,
      timeframe,
      entryPrice,
      amount,
      status: 'PLACED',
      source,
      sourceId,
      sourceLabel,
      tagIds,
      walletId,
      mode: currentMode,
    });

    const settleMs = 4000 + Math.floor(Math.random() * 8000);
    setTimeout(() => {
      const grossWin = amount * (100 / entryPrice - 1);
      const pnl = win ? grossWin : -amount;

      pushLog({
        id: uid(),
        ts: Date.now(),
        coin,
        direction,
        timeframe,
        entryPrice,
        amount,
        status: win ? 'WON' : 'LOST',
        pnl,
        source,
        sourceId,
        sourceLabel,
        tagIds,
        walletId,
        mode: modeRef.current,
      });

      if (source === 'AUTO') {
        setStrategies((prev) =>
          prev.map((s) =>
            s.id === sourceId
              ? {
                  ...s,
                  wins: s.wins + (win ? 1 : 0),
                  losses: s.losses + (win ? 0 : 1),
                  pnl: +(s.pnl + pnl).toFixed(4),
                }
              : s
          )
        );
      } else {
        setCopies((prev) =>
          prev.map((c) =>
            c.id === sourceId
              ? {
                  ...c,
                  wins: c.wins + (win ? 1 : 0),
                  losses: c.losses + (win ? 0 : 1),
                  pnl: +(c.pnl + pnl).toFixed(4),
                }
              : c
          )
        );
      }

      bumpDailyPnl(pnl);
      if (modeRef.current === 'DEMO' && walletId) {
        setWallets((prev) =>
          prev.map((w) =>
            w.id === walletId ? { ...w, demoBalance: +(w.demoBalance + pnl).toFixed(4) } : w
          )
        );
      }
      if (soundRef.current) playBeep(win ? 'win' : 'loss');
    }, settleMs);
  }

  function runSimTick() {
    // 1) Roll over today's fire counts and apply auto-pause guard for any
    //    strategy that has spent >= 80% of its budget.
    const newKey = todayKey();
    setStrategies((prev) =>
      prev.map((s) => {
        let next = s;
        if (s.firesTodayKey !== newKey) next = { ...next, firesTodayKey: newKey, firesToday: 0 };
        if (
          next.totalBudget > 0 &&
          next.budgetSpent / next.totalBudget >= 0.8 &&
          next.status === 'ACTIVE' &&
          !next.autoPaused
        ) {
          pushLog({
            id: uid(),
            ts: Date.now(),
            coin: '—',
            direction: '—',
            timeframe: next.timeframe,
            entryPrice: 0,
            amount: 0,
            status: 'AUTO-PAUSED',
            source: 'AUTO',
            sourceId: next.id,
            sourceLabel: next.label,
            tagIds: next.tagIds,
            mode: modeRef.current,
          });
          next = { ...next, status: 'PAUSED', autoPaused: true };
        }
        return next;
      })
    );

    // 2) Tag-level auto-pause: aggregate PnL per tag and pause every active
    //    item with that tag once the configured profit/loss threshold is hit.
    const liveTags = tagsRef.current;
    const allItems = [
      ...stratRef.current.map((s) => ({ ...s, _kind: 'AUTO' })),
      ...copyRef.current.map((c) => ({ ...c, _kind: 'COPY' })),
    ];
    for (const t of liveTags) {
      if (t.profitTarget == null && t.lossLimit == null) continue;
      const items = allItems.filter((x) => (x.tagIds || []).includes(t.id));
      if (!items.length) continue;
      const aggPnl = items.reduce((acc, x) => acc + (x.pnl || 0), 0);

      let trigger = null;
      if (t.profitTarget != null && aggPnl >= +t.profitTarget) trigger = 'profit';
      else if (t.lossLimit != null && aggPnl <= -Math.abs(+t.lossLimit)) trigger = 'loss';

      if (trigger && t.triggered !== trigger) {
        const stratIds = new Set(
          stratRef.current
            .filter((s) => s.status === 'ACTIVE' && (s.tagIds || []).includes(t.id))
            .map((s) => s.id)
        );
        const copyIds = new Set(
          copyRef.current
            .filter((c) => c.status === 'ACTIVE' && (c.tagIds || []).includes(t.id))
            .map((c) => c.id)
        );

        pushLog({
          id: uid(),
          ts: Date.now(),
          coin: '—',
          direction: '—',
          timeframe: '—',
          entryPrice: 0,
          amount: 0,
          status: trigger === 'profit' ? 'TAG-TARGET' : 'TAG-LOSS',
          source: 'AUTO',
          sourceId: t.id,
          sourceLabel: `${t.name} ${trigger === 'profit' ? 'hit target' : 'hit loss'} ${fmtUSD(aggPnl)} · paused ${stratIds.size + copyIds.size} item(s)`,
          tagIds: [t.id],
          mode: modeRef.current,
        });

        if (stratIds.size) {
          setStrategies((prev) =>
            prev.map((s) => (stratIds.has(s.id) ? { ...s, status: 'PAUSED', autoPaused: true } : s))
          );
        }
        if (copyIds.size) {
          setCopies((prev) =>
            prev.map((c) => (copyIds.has(c.id) ? { ...c, status: 'PAUSED', autoPaused: true } : c))
          );
        }
        setTags((prev) => prev.map((x) => (x.id === t.id ? { ...x, triggered: trigger } : x)));
      } else if (!trigger && t.triggered) {
        setTags((prev) => prev.map((x) => (x.id === t.id ? { ...x, triggered: null } : x)));
      }
    }

    // 3) Read latest snapshots from refs to decide which trades to fire.
    const liveStrategies = stratRef.current;
    const liveCopies = copyRef.current;
    const livePoly = polyRef.current;

    for (const s of liveStrategies) {
      if (s.status !== 'ACTIVE') continue;
      if (s.budgetSpent + s.perTrade > s.totalBudget) continue;
      if (s.firesToday >= s.maxTradesPerDay) continue;
      if (!s.coins.length) continue;
      const baseProb = 0.45;
      if (Math.random() > baseProb) continue;

      const coin = s.coins[Math.floor(Math.random() * s.coins.length)];
      const polyPrice = livePoly[coin]?.yesCents ?? 50;
      if (polyPrice < s.priceMin - s.slippage || polyPrice > s.priceMax + s.slippage) continue;

      const target = clamp(polyPrice, s.priceMin, s.priceMax);
      const jitter = (Math.random() - 0.5) * (s.slippage || 1);
      const entry = clamp(target + jitter, s.priceMin, s.priceMax);
      const amount = +s.perTrade;

      setStrategies((prev) =>
        prev.map((x) =>
          x.id === s.id
            ? {
                ...x,
                fires: x.fires + 1,
                firesToday: x.firesToday + 1,
                budgetSpent: +(x.budgetSpent + amount).toFixed(4),
              }
            : x
        )
      );
      if (soundRef.current) playBeep('fire');
      resolveTrade({
        source: 'AUTO',
        sourceId: s.id,
        sourceLabel: s.label,
        coin,
        direction: s.direction,
        timeframe: s.timeframe,
        entryPrice: +entry.toFixed(1),
        amount,
        tagIds: s.tagIds,
        walletId: s.walletId || walletsRef.current[0]?.id || null,
      });
    }

    for (const c of liveCopies) {
      if (c.status !== 'ACTIVE') continue;
      const amt = c.sizeMode === 'PERCENTAGE' ? +(c.sizePct * 0.1).toFixed(2) : +c.sizeFixed;
      if (c.budgetSpent + amt > c.totalBudget) continue;
      if (!c.coins.length || !c.timeframes.length) continue;
      if (Math.random() > 0.34) continue;

      const coin = c.coins[Math.floor(Math.random() * c.coins.length)];
      const tf = c.timeframes[Math.floor(Math.random() * c.timeframes.length)];
      const polyPrice = livePoly[coin]?.yesCents ?? 50;
      const slip = c.priceMode === 'EXACT' ? 0 : (Math.random() - 0.5) * (c.slippage || 1);
      const entry = clamp(polyPrice + slip, 1, 99);

      setCopies((prev) =>
        prev.map((x) =>
          x.id === c.id
            ? {
                ...x,
                trades: x.trades + 1,
                budgetSpent: +(x.budgetSpent + amt).toFixed(4),
              }
            : x
        )
      );
      if (soundRef.current) playBeep('fire');
      resolveTrade({
        source: 'COPY',
        sourceId: c.id,
        sourceLabel: c.label || fmtAddress(c.walletAddress),
        coin,
        direction: Math.random() > 0.5 ? 'UP' : 'DOWN',
        timeframe: tf,
        entryPrice: +entry.toFixed(1),
        amount: amt,
        tagIds: c.tagIds,
        walletId: c.walletId || walletsRef.current[0]?.id || null,
      });
    }
  }

  /* ---------- handlers ------------------------------------------------ */
  const applyMode = (m) => {
    setMode(m);
    if (cloudEnabled) dispatchCloud('setMode', { mode: m });
  };
  const handleSetMode = (m) => {
    if (m === 'LIVE' && mode !== 'LIVE') {
      setShowLiveConfirm(true);
    } else {
      applyMode(m);
    }
  };

  const confirmLive = () => {
    applyMode('LIVE');
    setShowLiveConfirm(false);
  };

  const resetDemoBalance = () => {
    if (cloudEnabled) {
      dispatchCloud('resetDemoBalance', { walletId: activeWalletId || 'all' });
      setResetConfirm(false);
      return;
    }
    if (activeWalletId) {
      setWallets((prev) =>
        prev.map((w) =>
          w.id === activeWalletId ? { ...w, demoBalance: w.startingBalance ?? 1000 } : w
        )
      );
      // Reset stats only on items belonging to that wallet
      setStrategies((prev) =>
        prev.map((s) =>
          s.walletId === activeWalletId
            ? { ...s, fires: 0, wins: 0, losses: 0, pnl: 0, budgetSpent: 0, firesToday: 0, autoPaused: false }
            : s
        )
      );
      setCopies((prev) =>
        prev.map((c) =>
          c.walletId === activeWalletId
            ? { ...c, trades: 0, wins: 0, losses: 0, pnl: 0, budgetSpent: 0, autoPaused: false }
            : c
        )
      );
    } else {
      setWallets((prev) => prev.map((w) => ({ ...w, demoBalance: w.startingBalance ?? 1000 })));
      setStrategies((prev) =>
        prev.map((s) => ({ ...s, fires: 0, wins: 0, losses: 0, pnl: 0, budgetSpent: 0, firesToday: 0, autoPaused: false }))
      );
      setCopies((prev) =>
        prev.map((c) => ({ ...c, trades: 0, wins: 0, losses: 0, pnl: 0, budgetSpent: 0, autoPaused: false }))
      );
      setLogs([]);
      setDailyPnl([]);
    }
    setTags((prev) => prev.map((t) => ({ ...t, triggered: null })));
    setResetConfirm(false);
  };

  /* ---------- wallet CRUD --------------------------------------------- */
  const addWallet = async () => {
    if (cloudEnabled) {
      const r = await dispatchCloud('addWallet', {});
      if (r?.ok && r.wallet) return r.wallet;
      // Fallback: pick the wallet in latest state we don't already have.
      const latestWallets = r?.state?.wallets || wallets;
      const known = new Set(wallets.map((x) => x.id));
      return latestWallets.find((x) => !known.has(x.id)) || latestWallets.slice(-1)[0] || defaultWallet(wallets.length);
    }
    const w = defaultWallet(wallets.length);
    setWallets((prev) => [...prev, w]);
    return w;
  };
  const updateWallet = (id, patch) => {
    if (cloudEnabled) {
      dispatchCloud('updateWallet', { walletId: id, patch });
      return;
    }
    setWallets((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        if (w.passwordHash && currentUserId !== id) return w;
        return { ...w, ...patch };
      })
    );
  };
  const removeWallet = (id) => {
    if (cloudEnabled) {
      dispatchCloud('removeWallet', { walletId: id });
      if (currentUserId === id) setCurrentUserId(null);
      return;
    }
    if (wallets.length <= 1) return;
    const target = wallets.find((w) => w.id === id);
    if (!target) return;
    if (target.passwordHash && currentUserId !== id) return;
    const fallback = wallets.find((w) => w.id !== id)?.id || null;
    setStrategies((prev) =>
      prev.map((s) => (s.walletId === id ? { ...s, walletId: fallback } : s))
    );
    setCopies((prev) =>
      prev.map((c) => (c.walletId === id ? { ...c, walletId: fallback } : c))
    );
    setWallets((prev) => prev.filter((w) => w.id !== id));
    if (activeWalletId === id) setActiveWalletId(null);
    if (currentUserId === id) setCurrentUserId(null);
  };
  const walletById = (id) => wallets.find((w) => w.id === id);

  /* ---------- auth (cloud-aware) -------------------------------------- */
  const registerWallet = async (walletId, password) => {
    if (cloudEnabled) {
      const r = await cloudFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ walletId, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) return { ok: false, error: j.error || `http ${r.status}` };
      setCurrentUserId(walletId);
      setActiveWalletId(walletId);
      return { ok: true };
    }
    const salt = newSalt();
    const hash = hashPwd(password, salt);
    setWallets((prev) =>
      prev.map((w) => (w.id === walletId ? { ...w, passwordHash: hash, passwordSalt: salt } : w))
    );
    setCurrentUserId(walletId);
    setActiveWalletId(walletId);
    return { ok: true };
  };

  const signIn = async (walletId, password) => {
    if (cloudEnabled) {
      const r = await cloudFetch('/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ walletId, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) return { ok: false, error: j.error || `http ${r.status}` };
      setCurrentUserId(walletId);
      setActiveWalletId(walletId);
      return { ok: true };
    }
    const w = wallets.find((x) => x.id === walletId);
    if (!w) return { ok: false, error: 'wallet not found' };
    if (!w.passwordHash) return { ok: false, error: 'no password set — register first' };
    const hash = hashPwd(password, w.passwordSalt);
    if (hash !== w.passwordHash) return { ok: false, error: 'wrong password' };
    setCurrentUserId(walletId);
    setActiveWalletId(walletId);
    return { ok: true };
  };

  const signOut = () => {
    setCurrentUserId(null);
    setActiveWalletId(null);
  };

  const changePassword = async (walletId, oldPwd, newPwd) => {
    if (cloudEnabled) {
      const r = await cloudFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ walletId, oldPassword: oldPwd, newPassword: newPwd }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) return { ok: false, error: j.error || `http ${r.status}` };
      return { ok: true };
    }
    const w = wallets.find((x) => x.id === walletId);
    if (!w) return { ok: false, error: 'wallet not found' };
    if (w.passwordHash) {
      const oldHash = hashPwd(oldPwd, w.passwordSalt);
      if (oldHash !== w.passwordHash) return { ok: false, error: 'wrong current password' };
    }
    const salt = newSalt();
    const hash = hashPwd(newPwd, salt);
    setWallets((prev) =>
      prev.map((x) => (x.id === walletId ? { ...x, passwordHash: hash, passwordSalt: salt } : x))
    );
    return { ok: true };
  };

  const currentUser = wallets.find((w) => w.id === currentUserId) || null;
  const isOwner = (walletId) => currentUserId && walletId === currentUserId;

  const upsertStrategy = (st) => {
    if (cloudEnabled) {
      dispatchCloud('upsertStrategy', { strategy: st });
      return;
    }
    setStrategies((prev) => {
      const idx = prev.findIndex((x) => x.id === st.id);
      if (idx === -1) {
        const next = { ...st, walletId: currentUserId || st.walletId };
        return [next, ...prev];
      }
      if (!isOwner(prev[idx].walletId)) return prev;
      const next = prev.slice();
      next[idx] = { ...st, walletId: prev[idx].walletId };
      return next;
    });
  };
  const removeStrategy = (id) => {
    if (cloudEnabled) { dispatchCloud('removeStrategy', { id }); return; }
    setStrategies((prev) => {
      const target = prev.find((x) => x.id === id);
      if (!target || !isOwner(target.walletId)) return prev;
      return prev.filter((x) => x.id !== id);
    });
  };
  const duplicateStrategy = (s) => {
    if (cloudEnabled) { dispatchCloud('duplicateStrategy', { id: s.id }); return; }
    if (!isOwner(s.walletId)) return;
    setStrategies((prev) => [
      {
        ...s,
        id: uid(),
        label: s.label + ' (copy)',
        walletId: currentUserId,
        fires: 0,
        wins: 0,
        losses: 0,
        pnl: 0,
        budgetSpent: 0,
        firesToday: 0,
        autoPaused: false,
        status: 'PAUSED',
      },
      ...prev,
    ]);
  };
  const toggleStrategyStatus = (id) => {
    if (cloudEnabled) { dispatchCloud('toggleStrategyStatus', { id }); return; }
    setStrategies((prev) => {
      const target = prev.find((x) => x.id === id);
      if (!target || !isOwner(target.walletId)) return prev;
      if (target.status === 'PAUSED' && target.tagIds?.length) {
        const ids = new Set(target.tagIds);
        setTags((tprev) => tprev.map((t) => (ids.has(t.id) ? { ...t, triggered: null } : t)));
      }
      return prev.map((x) =>
        x.id === id
          ? { ...x, status: x.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE', autoPaused: false }
          : x
      );
    });
  };

  const upsertCopy = (c) => {
    if (cloudEnabled) { dispatchCloud('upsertCopy', { copy: c }); return; }
    setCopies((prev) => {
      const idx = prev.findIndex((x) => x.id === c.id);
      if (idx === -1) {
        const next = { ...c, walletId: currentUserId || c.walletId };
        return [next, ...prev];
      }
      if (!isOwner(prev[idx].walletId)) return prev;
      const next = prev.slice();
      next[idx] = { ...c, walletId: prev[idx].walletId };
      return next;
    });
  };
  const removeCopy = (id) => {
    if (cloudEnabled) { dispatchCloud('removeCopy', { id }); return; }
    setCopies((prev) => {
      const target = prev.find((x) => x.id === id);
      if (!target || !isOwner(target.walletId)) return prev;
      return prev.filter((x) => x.id !== id);
    });
  };
  const toggleCopyStatus = (id) => {
    if (cloudEnabled) { dispatchCloud('toggleCopyStatus', { id }); return; }
    setCopies((prev) => {
      const target = prev.find((x) => x.id === id);
      if (!target || !isOwner(target.walletId)) return prev;
      if (target.status === 'PAUSED' && target.tagIds?.length) {
        const ids = new Set(target.tagIds);
        setTags((tprev) => tprev.map((t) => (ids.has(t.id) ? { ...t, triggered: null } : t)));
      }
      return prev.map((x) =>
        x.id === id
          ? { ...x, status: x.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE', autoPaused: false }
          : x
      );
    });
  };

  const addTag = async (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const existing = tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    if (cloudEnabled) {
      const r = await dispatchCloud('addTag', { name: trimmed });
      if (r?.ok && r.tag) return r.tag;
      // Fallback: pull the tag back out of the latest server state by name.
      const latestTags = r?.state?.tags || [];
      const found = latestTags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
      return found || null;
    }
    const t = {
      id: 'tag_' + uid(),
      name: trimmed,
      color: TAGS_PALETTE[tags.length % TAGS_PALETTE.length],
      profitTarget: null,
      lossLimit: null,
      triggered: null,
    };
    setTags((prev) => [...prev, t]);
    return t;
  };

  const updateTag = (id, patch) => {
    if (cloudEnabled) { dispatchCloud('updateTag', { id, patch }); return; }
    setTags((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const setActiveWalletIdCloud = (walletId) => {
    setActiveWalletId(walletId);
    if (cloudEnabled) dispatchCloud('setActiveWalletId', { walletId });
  };

  const removeTagApp = (id) => {
    if (cloudEnabled) {
      dispatchCloud('removeTag', { id });
      if (filterTagId === id) setFilterTagId(null);
      return;
    }
    setTags((prev) => prev.filter((t) => t.id !== id));
    setStrategies((prev) => prev.map((s) => ({ ...s, tagIds: (s.tagIds || []).filter((t) => t !== id) })));
    setCopies((prev) => prev.map((c) => ({ ...c, tagIds: (c.tagIds || []).filter((t) => t !== id) })));
    if (filterTagId === id) setFilterTagId(null);
  };

  /* ---------- derived stats ------------------------------------------ */
  const totals = useMemo(() => {
    const allFires = strategies.reduce((a, s) => a + s.fires, 0);
    const allWins = strategies.reduce((a, s) => a + s.wins, 0);
    const allLosses = strategies.reduce((a, s) => a + s.losses, 0);
    const copyTrades = copies.reduce((a, c) => a + c.trades, 0);
    const copyWins = copies.reduce((a, c) => a + c.wins, 0);
    const copyLosses = copies.reduce((a, c) => a + c.losses, 0);
    const stratPnl = strategies.reduce((a, s) => a + s.pnl, 0);
    const copyPnl = copies.reduce((a, c) => a + c.pnl, 0);
    const budgetAlloc = strategies.reduce((a, s) => a + s.totalBudget, 0) + copies.reduce((a, c) => a + c.totalBudget, 0);
    const budgetSpent = strategies.reduce((a, s) => a + s.budgetSpent, 0) + copies.reduce((a, c) => a + c.budgetSpent, 0);
    const totalFires = allFires + copyTrades;
    const totalWins = allWins + copyWins;
    const totalLosses = allLosses + copyLosses;
    const overallWR = totalWins + totalLosses > 0 ? (totalWins / (totalWins + totalLosses)) * 100 : 0;
    const activeStrategies = strategies.filter((s) => s.status === 'ACTIVE').length;
    const stratWithPnL = [...strategies, ...copies].filter((x) => (x.fires || x.trades || 0) > 0);
    let best = null;
    let worst = null;
    for (const x of stratWithPnL) {
      if (best === null || x.pnl > best.pnl) best = x;
      if (worst === null || x.pnl < worst.pnl) worst = x;
    }
    return {
      totalPnl: stratPnl + copyPnl,
      totalFires,
      overallWR,
      activeStrategies,
      budgetAlloc,
      budgetSpent,
      best,
      worst,
      autoPnl: stratPnl,
      copyPnl,
    };
  }, [strategies, copies]);

  /* ---------- filtering by tag + active wallet ----------------------- */
  const filteredStrategies = strategies.filter((s) => {
    if (filterTagId && !s.tagIds.includes(filterTagId)) return false;
    if (activeWalletId && s.walletId !== activeWalletId) return false;
    return true;
  });
  const filteredCopies = copies.filter((c) => {
    if (filterTagId && !c.tagIds.includes(filterTagId)) return false;
    if (activeWalletId && c.walletId !== activeWalletId) return false;
    return true;
  });

  /* =================== render ======================================== */
  if (!currentUser) {
    return (
      <div className="pmt">
        <style>{CSS}</style>
        <LockScreen
          wallets={wallets}
          apiStatus={apiStatus}
          polyPrices={polyPrices}
          onSignIn={signIn}
          onRegister={registerWallet}
          onAddWallet={addWallet}
        />
      </div>
    );
  }

  return (
    <div className="pmt">
      <style>{CSS}</style>

      <Header
        mode={mode}
        onSetMode={handleSetMode}
        soundOn={soundOn}
        setSoundOn={setSoundOn}
        apiStatus={apiStatus}
        polyPrices={polyPrices}
        totalPnl={totals.totalPnl}
        walletsTotal={wallets.reduce((a, w) => a + w.demoBalance, 0)}
        walletsCount={wallets.length}
        currentUser={currentUser}
        onSignOut={signOut}
        onChangePwd={() => setShowChangePwd(true)}
        cloud={cloud}
      />

      <WalletStrip
        wallets={wallets}
        activeWalletId={activeWalletId}
        setActiveWalletId={setActiveWalletIdCloud}
        strategies={strategies}
        copies={copies}
        mode={mode}
        onAdd={addWallet}
        onManage={() => setShowWalletMgr(true)}
        onReset={() => setResetConfirm(true)}
        currentUserId={currentUserId}
      />

      {mode === 'DEMO' && (
        <div className="banner">
          <Sparkles size={14} /> Demo Mode — {wallets.length} wallet{wallets.length === 1 ? '' : 's'} · ${wallets.reduce((a, w) => a + w.demoBalance, 0).toFixed(2)} total paper balance · Real Polymarket prices
          <span className="banner-sep">·</span>
          <span className={`api-dot ${apiStatus === 'ok' ? 'ok' : apiStatus === 'error' ? 'err' : ''}`} />
          <span className="muted">
            {apiStatus === 'ok' ? 'gamma-api connected' : apiStatus === 'error' ? 'API unavailable — local sim' : 'connecting…'}
          </span>
        </div>
      )}

      <Tabs tab={tab} setTab={setTab} totals={totals} logsCount={logs.length} />

      <TagBar
        tags={tags}
        filterTagId={filterTagId}
        setFilterTagId={setFilterTagId}
        addTag={addTag}
        setTags={setTags}
        removeTag={removeTagApp}
        strategies={strategies}
        copies={copies}
        updateTag={updateTag}
        toggleStrategyStatus={toggleStrategyStatus}
        toggleCopyStatus={toggleCopyStatus}
      />

      <main className="content">
        {tab === 'autotrade' && (
          <AutoTradeTab
            strategies={filteredStrategies}
            allStrategies={strategies}
            tags={tags}
            addTag={addTag}
            polyPrices={polyPrices}
            mode={mode}
            wallets={wallets}
            activeWalletId={activeWalletId}
            currentUserId={currentUserId}
            onUpsert={upsertStrategy}
            onRemove={removeStrategy}
            onDuplicate={duplicateStrategy}
            onToggle={toggleStrategyStatus}
            showNew={showNewStrategy}
            setShowNew={setShowNewStrategy}
          />
        )}
        {tab === 'copy' && (
          <CopyTradeTab
            copies={filteredCopies}
            tags={tags}
            addTag={addTag}
            mode={mode}
            wallets={wallets}
            activeWalletId={activeWalletId}
            currentUserId={currentUserId}
            onUpsert={upsertCopy}
            onRemove={removeCopy}
            onToggle={toggleCopyStatus}
            showNew={showNewCopy}
            setShowNew={setShowNewCopy}
          />
        )}
        {tab === 'portfolio' && (
          <PortfolioTab
            totals={totals}
            strategies={strategies}
            copies={copies}
            tags={tags}
            wallets={wallets}
            activeWalletId={activeWalletId}
            dailyPnl={dailyPnl}
          />
        )}
        {tab === 'log' && (
          <LiveLogTab
            logs={logs}
            tags={tags}
            wallets={wallets}
            activeWalletId={activeWalletId}
          />
        )}
      </main>

      {showWalletMgr && (
        <WalletManager
          wallets={wallets}
          mode={mode}
          strategies={strategies}
          copies={copies}
          currentUserId={currentUserId}
          onUpdate={updateWallet}
          onAdd={addWallet}
          onRemove={removeWallet}
          onClose={() => setShowWalletMgr(false)}
        />
      )}

      {showChangePwd && currentUser && (
        <ChangePasswordModal
          wallet={currentUser}
          onClose={() => setShowChangePwd(false)}
          onSubmit={(oldPwd, newPwd) => changePassword(currentUser.id, oldPwd, newPwd)}
        />
      )}

      {showLiveConfirm && (
        <Modal onClose={() => setShowLiveConfirm(false)}>
          <div className="modal-icon warn">
            <AlertTriangle size={32} />
          </div>
          <h3>Switch to LIVE mode?</h3>
          <p className="muted">
            Real funds will be used through every wallet you've configured ({wallets.length} wallet
            {wallets.length === 1 ? '' : 's'}). Each strategy / copy-trade fires from its assigned wallet.
            Trades placed in LIVE mode are irreversible.
          </p>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setShowLiveConfirm(false)}>Cancel</button>
            <button className="btn danger" onClick={confirmLive}>
              <Power size={14} /> Confirm LIVE
            </button>
          </div>
        </Modal>
      )}

      {resetConfirm && (
        <Modal onClose={() => setResetConfirm(false)}>
          <div className="modal-icon warn">
            <RefreshCw size={32} />
          </div>
          <h3>{activeWalletId ? `Reset ${wallets.find((w) => w.id === activeWalletId)?.label}?` : 'Reset all wallets?'}</h3>
          <p className="muted">
            {activeWalletId
              ? 'Resets paper balance & per-strategy stats only for the selected wallet. Other wallets and the global log are untouched.'
              : `Resets paper balances back to start for all ${wallets.length} wallets and clears every PnL/win/loss counter. Strategies & copy setups are kept.`}
          </p>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setResetConfirm(false)}>Cancel</button>
            <button className="btn primary" onClick={resetDemoBalance}>
              <RefreshCw size={14} /> Reset
            </button>
          </div>
        </Modal>
      )}

      <footer className="footer muted">
        <span>polymarket://autotrader · single-file react · {strategies.length} strategies · {copies.length} copy setups · {logs.length} log lines</span>
      </footer>
    </div>
  );
}

/* ============================================================================
 * Header
 * ========================================================================== */
function Header({
  mode,
  onSetMode,
  soundOn,
  setSoundOn,
  apiStatus,
  polyPrices,
  totalPnl,
  walletsTotal,
  walletsCount,
  currentUser,
  onSignOut,
  onChangePwd,
  cloud,
}) {
  const cloudBadge = cloud
    ? cloud.status === 'ok'
      ? { text: 'CLOUD', cls: 'cloud-on', title: 'Connected to backend — Telegram bot is in sync' }
      : cloud.status === 'stale'
        ? { text: 'CLOUD ?', cls: 'cloud-stale', title: 'Lost server, retrying — ' + (cloud.lastError || '') }
        : cloud.status === 'probing'
          ? { text: 'PROBE', cls: 'cloud-probe', title: 'Looking for backend…' }
          : { text: 'LOCAL', cls: 'cloud-off', title: 'Standalone mode — Telegram bot disabled' }
    : null;
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark">
          <Activity size={18} />
        </div>
        <div className="brand-title">
          <div className="brand-name">
            POLYMARKET<span className="dim">/AUTOTRADER</span>
            {cloudBadge && (
              <span className={`cloud-badge ${cloudBadge.cls}`} title={cloudBadge.title}>
                {cloudBadge.text}
              </span>
            )}
          </div>
          <div className="brand-sub muted">terminal · v2.0 · {apiStatus === 'ok' ? 'mainnet feed' : apiStatus === 'error' ? 'offline sim' : 'connecting…'} · {walletsCount}-wallet</div>
        </div>
      </div>

      <div className="ticker">
        {COINS.map((c) => {
          const p = polyPrices[c]?.yesCents;
          return (
            <div key={c} className="ticker-cell" title={polyPrices[c]?.market || ''}>
              <span className="t-coin" style={{ color: COIN_COLORS[c] }}>{c}</span>
              <span className="t-price">{Number.isFinite(p) ? fmtCents(p) : '—'}</span>
            </div>
          );
        })}
      </div>

      <div className="header-right">
        <ModeToggle mode={mode} onSetMode={onSetMode} />
        <div className="balance-block">
          <div className="balance-label muted">{mode === 'DEMO' ? 'TOTAL BALANCE' : 'NET PNL'}</div>
          <div className={`balance-amount ${(mode === 'DEMO' ? walletsTotal - 1000 * walletsCount : totalPnl) >= 0 ? 'pos' : 'neg'}`}>
            {mode === 'DEMO' ? fmtUSD(walletsTotal) : fmtUSD(totalPnl)}
          </div>
          <div className="balance-sub muted">
            {mode === 'DEMO' ? `Δ ${fmtUSD(walletsTotal - 1000 * walletsCount)} · ${walletsCount} wallets` : 'live multi-wallet'}
          </div>
        </div>

        {currentUser && (
          <div className="signed-in" style={{ borderColor: `${currentUser.color}55` }} title="signed in">
            <span className="dot" style={{ background: currentUser.color, boxShadow: `0 0 8px ${currentUser.color}` }} />
            <div className="signed-in-name" style={{ color: currentUser.color }}>{currentUser.label}</div>
            <button className="icon-btn small" onClick={onChangePwd} title="Change password">
              <Lock size={12} />
            </button>
            <button className="icon-btn small" onClick={onSignOut} title="Sign out">
              <LogOut size={12} />
            </button>
          </div>
        )}

        <button
          className={`icon-btn ${soundOn ? 'on' : ''}`}
          onClick={() => setSoundOn((v) => !v)}
          title={soundOn ? 'Sound on' : 'Sound off'}
        >
          {soundOn ? <Bell size={16} /> : <BellOff size={16} />}
        </button>
      </div>
    </header>
  );
}

/* ---------- Wallet strip (always visible below header) ----------------- */
function WalletStrip({ wallets, activeWalletId, setActiveWalletId, strategies, copies, mode, onAdd, onManage, onReset, currentUserId }) {
  const aggForWallet = (id) => {
    const s = strategies.filter((x) => x.walletId === id);
    const c = copies.filter((x) => x.walletId === id);
    const pnl = s.reduce((a, x) => a + (x.pnl || 0), 0) + c.reduce((a, x) => a + (x.pnl || 0), 0);
    const fires = s.reduce((a, x) => a + (x.fires || 0), 0) + c.reduce((a, x) => a + (x.trades || 0), 0);
    return { pnl, fires, items: s.length + c.length };
  };

  return (
    <div className="wallet-strip">
      <div className="wallet-strip-label muted">
        <Wallet size={12} /> WALLETS
      </div>
      <button
        className={`wallet-pill all ${activeWalletId === null ? 'active' : ''}`}
        onClick={() => setActiveWalletId(null)}
      >
        <Users size={11} /> All
        <span className="muted small">· {wallets.length}</span>
      </button>
      {wallets.map((w) => {
        const agg = aggForWallet(w.id);
        const active = activeWalletId === w.id;
        const balance = w.demoBalance;
        const pnl = balance - (w.startingBalance ?? 1000);
        const isMe = currentUserId === w.id;
        return (
          <button
            key={w.id}
            className={`wallet-pill ${active ? 'active' : ''} ${isMe ? 'me' : ''}`}
            onClick={() => setActiveWalletId(active ? null : w.id)}
            style={{
              borderColor: active ? w.color : `${w.color}55`,
              background: active ? `${w.color}18` : 'transparent',
            }}
            title={w.address || 'no address set'}
          >
            <span className="dot" style={{ background: w.color, boxShadow: `0 0 8px ${w.color}` }} />
            <span className="wallet-pill-label" style={{ color: w.color }}>{w.label}</span>
            {isMe && <span className="me-pill">YOU</span>}
            {!isMe && (w.passwordHash
              ? <Lock size={9} className="muted" />
              : <AlertTriangle size={9} className="warn-text" />)}
            <span className="wallet-pill-bal mono">
              {mode === 'DEMO' ? fmtUSD(balance) : fmtAddress(w.address) || '—'}
            </span>
            <span className={`wallet-pill-pnl small mono ${pnl >= 0 ? 'pos' : 'neg'}`}>
              {mode === 'DEMO' ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}` : ''}
            </span>
            <span className="muted small wallet-pill-items">· {agg.items}</span>
          </button>
        );
      })}
      <button className="wallet-pill add" onClick={onAdd} title="Add new wallet">
        <Plus size={11} /> add
      </button>
      <button className="wallet-pill add" onClick={onManage} title="Manage wallets">
        <Pencil size={11} /> manage
      </button>
      {mode === 'DEMO' && (
        <button
          className="wallet-pill add"
          onClick={onReset}
          title={activeWalletId ? 'Reset this wallet' : 'Reset all wallets'}
        >
          <RefreshCw size={11} /> reset
        </button>
      )}
    </div>
  );
}

/* ---------- Wallet manager modal --------------------------------------- */
function WalletManager({ wallets, mode, strategies, copies, currentUserId, onUpdate, onAdd, onRemove, onClose }) {
  const [confirmDel, setConfirmDel] = useState(null);

  const itemCounts = (id) => {
    const s = strategies.filter((x) => x.walletId === id).length;
    const c = copies.filter((x) => x.walletId === id).length;
    return { s, c };
  };

  return (
    <Modal onClose={onClose}>
      <div className="wallet-mgr">
        <div className="wallet-mgr-head">
          <div>
            <div className="pane-title small"><Wallet size={14} /> Wallet Manager</div>
            <div className="muted small">
              you can only edit / delete your own wallet · others are read-only
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="wallet-mgr-list">
          {wallets.map((w, i) => {
            const counts = itemCounts(w.id);
            const isMe = currentUserId === w.id;
            const hasPwd = !!w.passwordHash;
            return (
              <div key={w.id} className={`wallet-mgr-row ${isMe ? 'me' : ''}`}>
                <button
                  className="color-swatch"
                  style={{ background: w.color }}
                  disabled={!isMe}
                  onClick={() => {
                    if (!isMe) return;
                    const idx = WALLET_COLORS.indexOf(w.color);
                    onUpdate(w.id, {
                      color: WALLET_COLORS[(idx + 1) % WALLET_COLORS.length],
                    });
                  }}
                  title={isMe ? 'Click to cycle color' : 'locked — sign in as this wallet to edit'}
                />
                <input
                  className="input"
                  value={w.label}
                  disabled={!isMe}
                  onChange={(e) => onUpdate(w.id, { label: e.target.value })}
                  placeholder={`Trader ${i + 1}`}
                />
                <input
                  className="input mono small"
                  value={w.address || ''}
                  disabled={!isMe}
                  onChange={(e) => onUpdate(w.id, { address: e.target.value })}
                  placeholder="0x…"
                  spellCheck={false}
                />
                {mode === 'DEMO' ? (
                  <input
                    className="input mono"
                    type="number"
                    step="1"
                    value={w.demoBalance}
                    disabled={!isMe}
                    onChange={(e) => onUpdate(w.id, { demoBalance: +e.target.value })}
                  />
                ) : (
                  <div className="muted small">{fmtAddress(w.address) || 'no address'}</div>
                )}
                <span className="muted small wallet-mgr-count">
                  {counts.s} strat · {counts.c} copy
                </span>
                <span
                  className={`auth-pill ${isMe ? 'me' : hasPwd ? 'protected' : 'open'}`}
                  title={isMe ? 'currently signed in' : hasPwd ? 'password protected' : 'no password set'}
                >
                  {isMe ? <><Unlock size={10} /> me</> : hasPwd ? <><Lock size={10} /> locked</> : <><AlertTriangle size={10} /> open</>}
                </span>
                {isMe ? (
                  confirmDel === w.id ? (
                    <div className="confirm-inline">
                      <span className="muted small">delete?</span>
                      <button
                        className="btn small danger"
                        disabled={wallets.length <= 1}
                        onClick={() => {
                          onRemove(w.id);
                          setConfirmDel(null);
                        }}
                      >
                        Yes
                      </button>
                      <button className="btn small ghost" onClick={() => setConfirmDel(null)}>
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn small danger ghost"
                      disabled={wallets.length <= 1}
                      onClick={() => setConfirmDel(w.id)}
                      title={wallets.length <= 1 ? 'must keep at least one wallet' : 'delete wallet'}
                    >
                      <Trash2 size={12} />
                    </button>
                  )
                ) : (
                  <span className="muted small" title="sign in as this wallet to manage it">—</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="wallet-mgr-foot">
          <button
            className="btn ghost"
            onClick={onAdd}
            disabled={wallets.length >= 8}
            title="adds a fresh wallet — sign out and sign in to set its password"
          >
            <Plus size={14} /> Add wallet
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="muted small">
          Tip: a newly added wallet starts open (no password). Sign out, pick that wallet on the lock
          screen and run the <strong>Register</strong> flow to set its password.
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Lock screen + change-password modal ----------------------- */
function LockScreen({ wallets, apiStatus, polyPrices, onSignIn, onRegister, onAddWallet }) {
  const [selectedId, setSelectedId] = useState(wallets[0]?.id || null);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [err, setErr] = useState('');

  const sel = wallets.find((w) => w.id === selectedId) || null;
  const isRegister = sel && !sel.passwordHash;
  const strength = pwdStrength(pwd);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!sel) {
      setErr('pick a wallet first');
      return;
    }
    if (!pwd) {
      setErr('password required');
      return;
    }
    if (isRegister) {
      if (pwd.length < 6) {
        setErr('password must be at least 6 characters');
        return;
      }
      if (pwd !== pwd2) {
        setErr('passwords do not match');
        return;
      }
      const r = await onRegister(sel.id, pwd);
      if (!r.ok) {
        setErr(r.error || 'registration failed');
        return;
      }
    } else {
      const r = await onSignIn(sel.id, pwd);
      if (!r.ok) {
        setErr(r.error || 'sign-in failed');
        return;
      }
    }
    setPwd('');
    setPwd2('');
    setErr('');
  };

  const onPick = (id) => {
    setSelectedId(id);
    setPwd('');
    setPwd2('');
    setErr('');
  };

  return (
    <div className="lock-root">
      <div className="lock-bg" />
      <div className="lock-card">
        <div className="lock-brand">
          <div className="brand-mark"><Activity size={18} /></div>
          <div>
            <div className="brand-name">POLYMARKET<span className="dim">/AUTOTRADER</span></div>
            <div className="brand-sub muted">terminal · v2.0 · {apiStatus === 'ok' ? 'mainnet feed' : apiStatus === 'error' ? 'offline sim' : 'connecting…'}</div>
          </div>
        </div>

        <div className="lock-ticker">
          {COINS.map((c) => {
            const p = polyPrices[c]?.yesCents;
            return (
              <div key={c} className="ticker-cell">
                <span className="t-coin" style={{ color: COIN_COLORS[c] }}>{c}</span>
                <span className="t-price">{Number.isFinite(p) ? fmtCents(p) : '—'}</span>
              </div>
            );
          })}
        </div>

        <div className="lock-grid">
          <div className="lock-pickers">
            <div className="lock-section-title muted">CHOOSE TRADER</div>
            <div className="lock-wallet-list">
              {wallets.map((w) => {
                const protectedFlag = !!w.passwordHash;
                return (
                  <button
                    key={w.id}
                    className={`lock-wallet-card ${selectedId === w.id ? 'active' : ''}`}
                    onClick={() => onPick(w.id)}
                    style={{
                      borderColor: selectedId === w.id ? w.color : `${w.color}55`,
                      background: selectedId === w.id ? `${w.color}14` : 'transparent',
                    }}
                  >
                    <div className="lock-wallet-card-head">
                      <span className="dot" style={{ background: w.color, boxShadow: `0 0 10px ${w.color}` }} />
                      <span style={{ color: w.color, fontWeight: 700 }}>{w.label}</span>
                      <span className={`auth-pill ${protectedFlag ? 'protected' : 'open'}`}>
                        {protectedFlag ? <><Lock size={9} /> sign in</> : <><AlertTriangle size={9} /> register</>}
                      </span>
                    </div>
                    <div className="muted mono small">{fmtAddress(w.address) || '— no address —'}</div>
                  </button>
                );
              })}
              <button
                className="lock-wallet-card add"
                onClick={async () => {
                  const w = await onAddWallet();
                  if (w?.id) setSelectedId(w.id);
                }}
              >
                <Plus size={14} /> Add new trader
              </button>
            </div>
          </div>

          <form className="lock-form" onSubmit={submit}>
            {!sel ? (
              <div className="muted">Select a wallet on the left to continue.</div>
            ) : (
              <>
                <div className="lock-form-head">
                  {isRegister ? <UserPlus size={16} /> : <LogIn size={16} />}
                  <h3>
                    {isRegister ? 'Register ' : 'Sign in to '}
                    <span style={{ color: sel.color }}>{sel.label}</span>
                  </h3>
                </div>
                <div className="muted small">
                  {isRegister
                    ? 'No password is set yet for this wallet. Pick one and confirm — you will need it every time you log in.'
                    : 'Enter the password you set when you registered this wallet.'}
                </div>

                <div className="form-row">
                  <label>Password</label>
                  <input
                    type="password"
                    className={`input ${err ? 'err' : ''}`}
                    value={pwd}
                    onChange={(e) => { setPwd(e.target.value); setErr(''); }}
                    placeholder={isRegister ? 'min 6 characters' : '••••••••'}
                    autoFocus
                  />
                </div>

                {isRegister && (
                  <>
                    <div className="form-row">
                      <label>Confirm password</label>
                      <input
                        type="password"
                        className={`input ${err ? 'err' : ''}`}
                        value={pwd2}
                        onChange={(e) => { setPwd2(e.target.value); setErr(''); }}
                        placeholder="retype password"
                      />
                    </div>
                    <div className="pwd-strength">
                      <div className="pwd-bar"><span style={{ width: `${(strength.score / 5) * 100}%`, background: strength.color }} /></div>
                      <span className="small mono" style={{ color: strength.color }}>{strength.label}</span>
                    </div>
                  </>
                )}

                {err && <div className="form-err"><AlertTriangle size={12} /> {err}</div>}

                <div className="lock-actions">
                  <button type="submit" className="btn primary">
                    {isRegister ? <><UserPlus size={14} /> Register</> : <><LogIn size={14} /> Sign in</>}
                  </button>
                </div>

                <div className="muted small">
                  Passwords are hashed locally with a salted PBKDF and stored in your browser. They never
                  leave the device. Lose the password and the only way back is to delete that wallet from
                  another signed-in account.
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({ wallet, onClose, onSubmit }) {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const strength = pwdStrength(newPwd);

  const submit = async (e) => {
    e.preventDefault();
    if (newPwd.length < 6) return setErr('new password must be at least 6 characters');
    if (newPwd !== newPwd2) return setErr('new passwords do not match');
    const r = await onSubmit(oldPwd, newPwd);
    if (!r.ok) return setErr(r.error || 'failed');
    setErr('');
    setOk(true);
    setOldPwd('');
    setNewPwd('');
    setNewPwd2('');
    setTimeout(onClose, 900);
  };

  return (
    <Modal onClose={onClose}>
      <form className="wallet-mgr" onSubmit={submit} style={{ width: 'min(440px, 92vw)' }}>
        <div className="wallet-mgr-head">
          <div>
            <div className="pane-title small"><Lock size={14} /> Change password</div>
            <div className="muted small">for <strong style={{ color: wallet.color }}>{wallet.label}</strong></div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="form-row">
          <label>Current password</label>
          <input type="password" className="input" value={oldPwd} onChange={(e) => { setOldPwd(e.target.value); setErr(''); }} autoFocus />
        </div>
        <div className="form-row">
          <label>New password</label>
          <input type="password" className="input" value={newPwd} onChange={(e) => { setNewPwd(e.target.value); setErr(''); }} placeholder="min 6 characters" />
        </div>
        <div className="form-row">
          <label>Confirm new password</label>
          <input type="password" className="input" value={newPwd2} onChange={(e) => { setNewPwd2(e.target.value); setErr(''); }} />
        </div>
        <div className="pwd-strength">
          <div className="pwd-bar"><span style={{ width: `${(strength.score / 5) * 100}%`, background: strength.color }} /></div>
          <span className="small mono" style={{ color: strength.color }}>{strength.label}</span>
        </div>
        {err && <div className="form-err"><AlertTriangle size={12} /> {err}</div>}
        {ok && <div className="form-ok">Password updated.</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary"><Lock size={14} /> Update password</button>
        </div>
      </form>
    </Modal>
  );
}

function ModeToggle({ mode, onSetMode }) {
  return (
    <div className={`mode-toggle ${mode === 'LIVE' ? 'live' : 'demo'}`}>
      <button
        className={`mode-btn ${mode === 'DEMO' ? 'active' : ''}`}
        onClick={() => onSetMode('DEMO')}
      >
        <span className="dot yellow" /> DEMO
      </button>
      <button
        className={`mode-btn ${mode === 'LIVE' ? 'active' : ''}`}
        onClick={() => onSetMode('LIVE')}
      >
        <span className={`dot green ${mode === 'LIVE' ? 'pulse' : ''}`} /> LIVE
      </button>
    </div>
  );
}

/* ============================================================================
 * Tabs
 * ========================================================================== */
function Tabs({ tab, setTab, totals, logsCount }) {
  const items = [
    { id: 'autotrade', label: 'AutoTrade', icon: <Zap size={14} /> },
    { id: 'copy', label: 'Copy Trade', icon: <Users size={14} /> },
    { id: 'portfolio', label: 'Portfolio', icon: <BarChart3 size={14} /> },
    { id: 'log', label: 'Live Log', icon: <Activity size={14} /> },
  ];
  return (
    <nav className="tabs">
      {items.map((it) => (
        <button
          key={it.id}
          className={`tab ${tab === it.id ? 'active' : ''}`}
          onClick={() => setTab(it.id)}
        >
          {it.icon}
          <span>{it.label}</span>
          {it.id === 'autotrade' && <span className="tab-badge">{totals.activeStrategies}</span>}
          {it.id === 'log' && <span className="tab-badge">{logsCount}</span>}
        </button>
      ))}
    </nav>
  );
}

/* ============================================================================
 * Tag bar
 * ========================================================================== */
function TagBar({
  tags,
  filterTagId,
  setFilterTagId,
  addTag,
  setTags,
  removeTag,
  strategies,
  copies,
  updateTag,
  toggleStrategyStatus,
  toggleCopyStatus,
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [editingTagId, setEditingTagId] = useState(null);
  const [editName, setEditName] = useState('');
  const [showManager, setShowManager] = useState(false);

  const submit = async () => {
    if (!name.trim()) return setAdding(false);
    await addTag(name.trim());
    setName('');
    setAdding(false);
  };

  return (
    <>
      <div className="tagbar">
        <div className="tagbar-label muted"><Filter size={12} /> FILTER BY TAG</div>
        <button
          className={`chip ${filterTagId === null ? 'active' : ''}`}
          onClick={() => setFilterTagId(null)}
          style={{ borderColor: filterTagId === null ? '#2a3340' : 'transparent' }}
        >
          All
        </button>
        {tags.map((t) => (
          <div key={t.id} className="chip-wrap">
            {editingTagId === t.id ? (
              <input
                className="chip-edit"
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => {
                  if (editName.trim()) {
                    updateTag(t.id, { name: editName.trim() });
                  }
                  setEditingTagId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setEditingTagId(null);
                }}
              />
            ) : (
              <button
                className={`chip ${filterTagId === t.id ? 'active' : ''} ${t.triggered ? 'triggered' : ''}`}
                onClick={() => setFilterTagId(filterTagId === t.id ? null : t.id)}
                onDoubleClick={() => {
                  setEditingTagId(t.id);
                  setEditName(t.name);
                }}
                style={{
                  borderColor: filterTagId === t.id ? t.color : `${t.color}55`,
                  color: t.color,
                  background: filterTagId === t.id ? `${t.color}20` : 'transparent',
                }}
                title={
                  t.triggered === 'profit'
                    ? `Hit profit target — auto-paused`
                    : t.triggered === 'loss'
                    ? `Hit loss limit — auto-paused`
                    : 'Double-click to rename'
                }
              >
                <span className="dot" style={{ background: t.color }} />
                {t.name}
                {t.triggered && (
                  <span
                    className="trigger-mark"
                    style={{
                      color: t.triggered === 'profit' ? '#00ff88' : '#ff4757',
                      borderColor: t.triggered === 'profit' ? '#00ff88' : '#ff4757',
                    }}
                  >
                    {t.triggered === 'profit' ? <Target size={9} /> : <AlertTriangle size={9} />}
                  </span>
                )}
                <span className="chip-x" onClick={(e) => { e.stopPropagation(); removeTag(t.id); }}>
                  <X size={10} />
                </span>
              </button>
            )}
          </div>
        ))}
        {adding ? (
          <input
            className="chip-edit"
            autoFocus
            placeholder="tag name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') setAdding(false);
            }}
          />
        ) : (
          <button className="chip add" onClick={() => setAdding(true)}>
            <Plus size={10} /> tag
          </button>
        )}
        <button
          className={`chip add ${showManager ? 'on' : ''}`}
          onClick={() => setShowManager((v) => !v)}
          title="Manage tag auto-pause thresholds"
        >
          <Target size={10} /> Auto-pause {showManager ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
      </div>

      {showManager && (
        <TagManager
          tags={tags}
          strategies={strategies}
          copies={copies}
          updateTag={updateTag}
          toggleStrategyStatus={toggleStrategyStatus}
          toggleCopyStatus={toggleCopyStatus}
          setTags={setTags}
        />
      )}
    </>
  );
}

function TagManager({ tags, strategies, copies, updateTag, toggleStrategyStatus, toggleCopyStatus, setTags }) {
  const allItems = [
    ...strategies.map((s) => ({ ...s, _kind: 'AUTO' })),
    ...copies.map((c) => ({ ...c, _kind: 'COPY' })),
  ];

  const reactivateTag = (tagId) => {
    const items = allItems.filter((x) => (x.tagIds || []).includes(tagId));
    items.forEach((x) => {
      if (x.status === 'PAUSED' && x.autoPaused) {
        if (x._kind === 'AUTO') toggleStrategyStatus(x.id);
        else toggleCopyStatus(x.id);
      }
    });
    updateTag(tagId, { triggered: null });
  };

  return (
    <div className="tag-manager">
      <div className="tag-manager-head">
        <div className="panel-title">
          <Target size={14} /> Per-Tag Auto-Pause
        </div>
        <div className="muted small">
          aggregate PnL across every strategy &amp; copy with the tag · empty = no limit
        </div>
      </div>

      {tags.length === 0 ? (
        <div className="empty small muted">no tags yet</div>
      ) : (
        <div className="tag-mgr-grid">
          <div className="tag-mgr-row head muted small">
            <span>TAG</span>
            <span>ITEMS</span>
            <span>LIVE PNL</span>
            <span>PROFIT TARGET ($)</span>
            <span>LOSS LIMIT ($)</span>
            <span>STATUS</span>
            <span>RESET</span>
          </div>
          {tags.map((t) => {
            const items = allItems.filter((x) => (x.tagIds || []).includes(t.id));
            const aggPnl = items.reduce((a, x) => a + (x.pnl || 0), 0);
            const pausedByTag = items.filter((x) => x.autoPaused && x.status === 'PAUSED').length;
            const pctP = t.profitTarget ? clamp((aggPnl / +t.profitTarget) * 100, 0, 100) : 0;
            const pctL = t.lossLimit ? clamp((-aggPnl / Math.abs(+t.lossLimit)) * 100, 0, 100) : 0;
            return (
              <div key={t.id} className={`tag-mgr-row ${t.triggered ? 'triggered ' + t.triggered : ''}`}>
                <span className="tag-mgr-name">
                  <span className="dot" style={{ background: t.color }} />
                  <span style={{ color: t.color, fontWeight: 700 }}>{t.name}</span>
                </span>
                <span className="muted mono small">{items.length}</span>
                <span className={`mono small ${aggPnl >= 0 ? 'pos' : 'neg'}`}>{fmtUSD(aggPnl)}</span>
                <span className="tag-mgr-input">
                  <input
                    type="number"
                    placeholder="—"
                    className="input mini"
                    value={t.profitTarget == null ? '' : t.profitTarget}
                    onChange={(e) =>
                      updateTag(t.id, {
                        profitTarget: e.target.value === '' ? null : Math.max(0, +e.target.value),
                        triggered: null,
                      })
                    }
                  />
                  {t.profitTarget != null && (
                    <div className="tiny-bar">
                      <div className="tiny-fill green" style={{ width: `${pctP}%` }} />
                    </div>
                  )}
                </span>
                <span className="tag-mgr-input">
                  <input
                    type="number"
                    placeholder="—"
                    className="input mini"
                    value={t.lossLimit == null ? '' : t.lossLimit}
                    onChange={(e) =>
                      updateTag(t.id, {
                        lossLimit: e.target.value === '' ? null : Math.max(0, +e.target.value),
                        triggered: null,
                      })
                    }
                  />
                  {t.lossLimit != null && (
                    <div className="tiny-bar">
                      <div className="tiny-fill red" style={{ width: `${pctL}%` }} />
                    </div>
                  )}
                </span>
                <span>
                  {t.triggered === 'profit' && (
                    <span className="status-tag won"><Target size={9} /> TARGET HIT</span>
                  )}
                  {t.triggered === 'loss' && (
                    <span className="status-tag lost"><AlertTriangle size={9} /> LOSS HIT</span>
                  )}
                  {!t.triggered && t.profitTarget == null && t.lossLimit == null && (
                    <span className="muted small">no limits</span>
                  )}
                  {!t.triggered && (t.profitTarget != null || t.lossLimit != null) && (
                    <span className="status-tag active">RUNNING</span>
                  )}
                  {pausedByTag > 0 && (
                    <span className="muted small" style={{ marginLeft: 6 }}>
                      · {pausedByTag} paused
                    </span>
                  )}
                </span>
                <span>
                  {(t.triggered || pausedByTag > 0) && (
                    <button
                      className="btn small ghost"
                      onClick={() => reactivateTag(t.id)}
                      title="Re-activate paused items and clear trigger"
                    >
                      <RefreshCw size={11} /> Resume
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * AutoTrade tab
 * ========================================================================== */
function AutoTradeTab({
  strategies,
  allStrategies,
  tags,
  addTag,
  polyPrices,
  mode,
  wallets,
  activeWalletId,
  currentUserId,
  onUpsert,
  onRemove,
  onDuplicate,
  onToggle,
  showNew,
  setShowNew,
}) {
  return (
    <div className="tab-pane">
      <div className="pane-head">
        <div>
          <div className="pane-title">AutoTrade Strategies</div>
          <div className="pane-sub muted">
            {strategies.length} of {allStrategies.length} shown · simulated firing every ~3.5s
            {activeWalletId && (
              <> · filtered by <strong>{wallets.find((w) => w.id === activeWalletId)?.label}</strong></>
            )}
          </div>
        </div>
        <button className="btn primary" onClick={() => setShowNew(true)}>
          <Plus size={14} /> New Strategy
        </button>
      </div>

      {showNew && (
        <StrategyForm
          initial={{ ...defaultStrategy(), walletId: currentUserId || wallets[0]?.id || null }}
          tags={tags}
          addTag={addTag}
          wallets={wallets}
          currentUserId={currentUserId}
          onCancel={() => setShowNew(false)}
          onSave={(s) => {
            onUpsert(s);
            setShowNew(false);
          }}
          isNew
        />
      )}

      {strategies.length === 0 ? (
        <Empty
          icon={<Target size={28} />}
          title="No strategies match this filter"
          hint="Clear the tag/wallet filter or create a new strategy."
        />
      ) : (
        <div className="cards-grid">
          {strategies.map((s) => (
            <StrategyCard
              key={s.id}
              strategy={s}
              tags={tags}
              addTag={addTag}
              wallets={wallets}
              polyPrices={polyPrices}
              mode={mode}
              currentUserId={currentUserId}
              onUpsert={onUpsert}
              onRemove={onRemove}
              onDuplicate={onDuplicate}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StrategyCard({ strategy: s, tags, addTag, wallets, polyPrices, mode, currentUserId, onUpsert, onRemove, onDuplicate, onToggle }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const winRate = s.wins + s.losses > 0 ? (s.wins / (s.wins + s.losses)) * 100 : 0;
  const isActive = s.status === 'ACTIVE';
  const wallet = wallets.find((w) => w.id === s.walletId);
  const canEdit = !s.walletId || s.walletId === currentUserId;

  if (editing) {
    return (
      <StrategyForm
        initial={s}
        tags={tags}
        addTag={addTag}
        wallets={wallets}
        onCancel={() => setEditing(false)}
        onSave={(next) => {
          onUpsert(next);
          setEditing(false);
        }}
      />
    );
  }

  const tagObjs = s.tagIds.map((id) => tags.find((t) => t.id === id)).filter(Boolean);

  return (
    <div
      className={`card strat ${isActive ? 'active-card' : 'paused-card'}`}
      style={isActive && wallet ? { borderLeftColor: wallet.color, boxShadow: `0 0 0 1px ${wallet.color}10, 0 0 22px ${wallet.color}10` } : undefined}
    >
      <div className="card-head" onClick={() => setOpen((v) => !v)}>
        <div className="card-head-l">
          <div className={`status-dot ${isActive ? 'active' : 'paused'}`} style={isActive && wallet ? { background: wallet.color, boxShadow: `0 0 8px ${wallet.color}` } : undefined} />
          <div className="card-title">
            <span className="strat-label">{s.label}</span>
            {wallet && (
              <span
                className="wallet-pill-inline"
                style={{ borderColor: `${wallet.color}55`, color: wallet.color, background: `${wallet.color}10` }}
                title={wallet.address || ''}
              >
                <Wallet size={9} /> {wallet.label}
              </span>
            )}
            {mode === 'DEMO' && <span className="badge demo">DEMO</span>}
            {s.autoPaused && <span className="badge warn"><AlertTriangle size={10} /> SAFETY</span>}
          </div>
        </div>
        <div className="card-head-r">
          <div className="head-tags">
            {tagObjs.map((t) => (
              <span key={t.id} className="tag-pill" style={{ background: `${t.color}20`, color: t.color, borderColor: `${t.color}55` }}>
                <TagIcon size={9} /> {t.name}
              </span>
            ))}
          </div>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      <div className="card-meta">
        <div className="meta-coins">
          {s.coins.map((c) => (
            <span key={c} className="coin-chip" style={{ borderColor: COIN_COLORS[c] + '88', color: COIN_COLORS[c] }}>{c}</span>
          ))}
        </div>
        <div className="meta-pieces">
          <span className={`dir-pill ${s.direction === 'UP' ? 'up' : 'down'}`}>
            {s.direction === 'UP' ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {s.direction}
          </span>
          <span className="tf-pill">{s.timeframe}</span>
          <span className="range-pill">
            {fmtCents(s.priceMin)}–{fmtCents(s.priceMax)}
          </span>
        </div>
      </div>

      <div className="card-stats">
        <Stat label="FIRES" value={s.fires} />
        <Stat label="W/L" value={`${s.wins}/${s.losses}`} />
        <Stat label="WIN%" value={`${winRate.toFixed(0)}%`} accent={winRate >= 50 ? 'green' : 'red'} />
        <Stat
          label="PNL"
          value={fmtUSD(s.pnl)}
          accent={s.pnl >= 0 ? 'green' : 'red'}
        />
      </div>

      <BudgetBar spent={s.budgetSpent} total={s.totalBudget} />

      {open && (
        <div className="card-expanded">
          <FieldGrid>
            <Field label="Wallet" value={wallet ? `${wallet.label} · ${fmtAddress(wallet.address) || 'no addr'}` : '—'} />
            <Field label="Tag(s)" value={tagObjs.length ? tagObjs.map((t) => t.name).join(', ') : '—'} />
            <Field label="Direction" value={s.direction} />
            <Field label="Timeframe" value={s.timeframe} />
            <Field label="Buy window" value={`${s.buyFrom} → ${s.buyUntil}`} />
            <Field label="Price range" value={`${fmtCents(s.priceMin)} – ${fmtCents(s.priceMax)}`} />
            <Field label="Per trade" value={fmtUSD(s.perTrade)} />
            <Field label="Total budget" value={fmtUSD(s.totalBudget)} />
            <Field label="Stop loss" value={`${s.stopLoss}%`} />
            <Field label="Take profit" value={s.takeProfit === '' || s.takeProfit == null ? '—' : `${s.takeProfit}%`} />
            <Field label="Move filter" value={`$${s.minMove} – $${s.maxMove}`} />
            <Field label="Slippage" value={`${s.slippage}%`} />
            <Field label="Max trades / day" value={`${s.maxTradesPerDay} (today: ${s.firesToday})`} />
          </FieldGrid>
          <div className="live-row muted">
            <span>Live: {s.coins.map((c) => `${c} ${polyPrices[c]?.yesCents?.toFixed(1) ?? '–'}¢`).join(' · ')}</span>
          </div>
        </div>
      )}

      <div className="card-actions">
        <button
          className={`btn small ${isActive ? 'warn' : 'primary'}`}
          onClick={() => onToggle(s.id)}
          disabled={!canEdit}
          title={canEdit ? '' : `owned by ${wallet?.label || 'another trader'}`}
        >
          {isActive ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Activate</>}
        </button>
        <button
          className="btn small ghost"
          onClick={() => setEditing(true)}
          disabled={!canEdit}
          title={canEdit ? '' : `read-only · owned by ${wallet?.label || 'another trader'}`}
        >
          <Pencil size={12} /> Edit
        </button>
        <button
          className="btn small ghost"
          onClick={() => onDuplicate(s)}
          disabled={!canEdit}
          title={canEdit ? '' : `read-only · owned by ${wallet?.label || 'another trader'}`}
        >
          <Copy size={12} /> Clone
        </button>
        {confirmDel ? (
          <div className="confirm-inline">
            <span className="muted">Confirm delete?</span>
            <button className="btn small danger" onClick={() => onRemove(s.id)}>Yes</button>
            <button className="btn small ghost" onClick={() => setConfirmDel(false)}>No</button>
          </div>
        ) : (
          <button
            className="btn small danger ghost"
            onClick={() => setConfirmDel(true)}
            disabled={!canEdit}
            title={canEdit ? '' : `read-only · owned by ${wallet?.label || 'another trader'}`}
          >
            <Trash2 size={12} /> Delete
          </button>
        )}
        {!canEdit && (
          <span className="lock-badge muted small" title="locked"><Lock size={10} /> read-only</span>
        )}
      </div>
    </div>
  );
}

/* -------- Strategy form (used for create + edit) ----------------------- */
function StrategyForm({ initial, tags, addTag, wallets = [], currentUserId, onCancel, onSave, isNew }) {
  // Users can only ever route a strategy to their own wallet.
  const eligibleWallets = currentUserId
    ? wallets.filter((w) => w.id === currentUserId)
    : wallets;
  const [s, setS] = useState({
    ...initial,
    walletId: initial.walletId || eligibleWallets[0]?.id || wallets[0]?.id || null,
  });
  const [errors, setErrors] = useState({});
  const [tagInput, setTagInput] = useState('');

  const set = (patch) => setS((prev) => ({ ...prev, ...patch }));
  const toggleCoin = (c) =>
    set({ coins: s.coins.includes(c) ? s.coins.filter((x) => x !== c) : [...s.coins, c] });
  const toggleTag = (id) =>
    set({ tagIds: s.tagIds.includes(id) ? s.tagIds.filter((x) => x !== id) : [...s.tagIds, id] });

  const validate = () => {
    const e = {};
    if (!s.label?.trim()) e.label = 'required';
    if (wallets.length && !s.walletId) e.wallet = 'pick a wallet';
    if (!s.coins.length) e.coins = 'pick at least one';
    if (parseMMSS(s.buyFrom) >= parseMMSS(s.buyUntil)) e.window = 'from must be < until';
    const pmin = safeNum(s.priceMin),
      pmax = safeNum(s.priceMax);
    if (pmin < 0 || pmax > 100 || pmin >= pmax) e.range = 'invalid range (1–99 cents)';
    if (safeNum(s.perTrade) <= 0) e.perTrade = '> 0';
    if (safeNum(s.totalBudget) <= 0) e.budget = '> 0';
    if (safeNum(s.totalBudget) < safeNum(s.perTrade)) e.budget = 'must be ≥ per trade';
    if (safeNum(s.minMove) < 0) e.move = 'invalid';
    if (safeNum(s.maxMove) < safeNum(s.minMove)) e.move = 'max < min';
    if (safeNum(s.slippage) < 0) e.slippage = '≥ 0';
    if (safeNum(s.maxTradesPerDay) <= 0) e.maxTrades = '> 0';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    onSave({
      ...s,
      label: s.label.trim(),
      priceMin: +s.priceMin,
      priceMax: +s.priceMax,
      perTrade: +s.perTrade,
      totalBudget: +s.totalBudget,
      stopLoss: +s.stopLoss,
      takeProfit: s.takeProfit === '' || s.takeProfit == null ? null : +s.takeProfit,
      minMove: +s.minMove,
      maxMove: +s.maxMove,
      slippage: +s.slippage,
      maxTradesPerDay: +s.maxTradesPerDay,
    });
  };

  return (
    <div className="card form">
      <div className="form-head">
        <div>
          <div className="pane-title small">{isNew ? 'New Strategy' : 'Edit Strategy'}</div>
          <div className="muted small">All fields validated · saves to in-memory state</div>
        </div>
        <button className="icon-btn" onClick={onCancel}><X size={16} /></button>
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label>Strategy label</label>
          <input
            className={`input ${errors.label ? 'err' : ''}`}
            value={s.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="e.g. BTC Sniper"
          />
        </div>

        {eligibleWallets.length > 0 && (
          <div className="form-row">
            <label>Executing wallet {errors.wallet && <span className="err-text">· {errors.wallet}</span>}</label>
            <div className="form-tags">
              {eligibleWallets.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={`chip ${s.walletId === w.id ? 'active' : ''}`}
                  style={{
                    borderColor: s.walletId === w.id ? w.color : `${w.color}55`,
                    color: w.color,
                    background: s.walletId === w.id ? `${w.color}20` : 'transparent',
                  }}
                  onClick={() => set({ walletId: w.id })}
                >
                  <span className="dot" style={{ background: w.color }} />
                  <Wallet size={10} /> {w.label}
                </button>
              ))}
              {eligibleWallets.length === 1 && (
                <span className="muted small">strategies can only be assigned to your signed-in wallet</span>
              )}
            </div>
          </div>
        )}

        <div className="form-row">
          <label>Tags</label>
          <div className="form-tags">
            {tags.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`chip ${s.tagIds.includes(t.id) ? 'active' : ''}`}
                style={{
                  borderColor: s.tagIds.includes(t.id) ? t.color : `${t.color}55`,
                  color: t.color,
                  background: s.tagIds.includes(t.id) ? `${t.color}20` : 'transparent',
                }}
                onClick={() => toggleTag(t.id)}
              >
                <span className="dot" style={{ background: t.color }} />
                {t.name}
              </button>
            ))}
            <input
              className="chip-edit"
              placeholder="+ tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  const t = await addTag(tagInput.trim());
                  if (t) toggleTag(t.id);
                  setTagInput('');
                }
              }}
            />
          </div>
        </div>

        <div className="form-row">
          <label>Coins {errors.coins && <span className="err-text">· {errors.coins}</span>}</label>
          <div className="form-tags">
            {COINS.map((c) => (
              <button
                key={c}
                type="button"
                className={`coin-chip-toggle ${s.coins.includes(c) ? 'on' : ''}`}
                style={{
                  borderColor: s.coins.includes(c) ? COIN_COLORS[c] : `${COIN_COLORS[c]}55`,
                  color: s.coins.includes(c) ? COIN_COLORS[c] : '#8b95a3',
                  background: s.coins.includes(c) ? `${COIN_COLORS[c]}18` : 'transparent',
                }}
                onClick={() => toggleCoin(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row split">
          <div>
            <label>Timeframe</label>
            <Segmented
              options={TIMEFRAMES}
              value={s.timeframe}
              onChange={(v) => set({ timeframe: v })}
            />
          </div>
          <div>
            <label>Direction</label>
            <Segmented
              options={['UP', 'DOWN']}
              value={s.direction}
              onChange={(v) => set({ direction: v })}
              renderItem={(v) =>
                v === 'UP' ? <><TrendingUp size={12} /> UP</> : <><TrendingDown size={12} /> DOWN</>
              }
              colors={{ UP: '#00ff88', DOWN: '#ff4757' }}
            />
          </div>
        </div>

        <div className="form-row split">
          <div>
            <label>Buy from (MM:SS) {errors.window && <span className="err-text">· {errors.window}</span>}</label>
            <input
              className={`input ${errors.window ? 'err' : ''}`}
              value={s.buyFrom}
              onChange={(e) => set({ buyFrom: e.target.value })}
              placeholder="04:00"
            />
          </div>
          <div>
            <label>Buy until (MM:SS)</label>
            <input
              className={`input ${errors.window ? 'err' : ''}`}
              value={s.buyUntil}
              onChange={(e) => set({ buyUntil: e.target.value })}
              placeholder="04:30"
            />
          </div>
        </div>

        <div className="form-row">
          <label>Price range (cents) {errors.range && <span className="err-text">· {errors.range}</span>}</label>
          <DualSlider
            min={1}
            max={99}
            valueMin={+s.priceMin}
            valueMax={+s.priceMax}
            onChange={(a, b) => set({ priceMin: a, priceMax: b })}
            err={!!errors.range}
          />
        </div>

        <div className="form-row split">
          <div>
            <label>Per trade ($) {errors.perTrade && <span className="err-text">· {errors.perTrade}</span>}</label>
            <input
              type="number"
              step="0.1"
              className={`input ${errors.perTrade ? 'err' : ''}`}
              value={s.perTrade}
              onChange={(e) => set({ perTrade: e.target.value })}
            />
          </div>
          <div>
            <label>Total budget ($) {errors.budget && <span className="err-text">· {errors.budget}</span>}</label>
            <input
              type="number"
              step="1"
              className={`input ${errors.budget ? 'err' : ''}`}
              value={s.totalBudget}
              onChange={(e) => set({ totalBudget: e.target.value })}
            />
          </div>
        </div>

        <div className="form-row split">
          <div>
            <label>Stop loss (%)</label>
            <input
              type="number"
              className="input"
              value={s.stopLoss}
              onChange={(e) => set({ stopLoss: e.target.value })}
            />
          </div>
          <div>
            <label>Take profit (%) <span className="muted">optional</span></label>
            <input
              type="number"
              className="input"
              value={s.takeProfit ?? ''}
              onChange={(e) => set({ takeProfit: e.target.value })}
              placeholder="—"
            />
          </div>
        </div>

        <div className="form-row split">
          <div>
            <label>Min move ($) {errors.move && <span className="err-text">· {errors.move}</span>}</label>
            <input
              type="number"
              className={`input ${errors.move ? 'err' : ''}`}
              value={s.minMove}
              onChange={(e) => set({ minMove: e.target.value })}
            />
          </div>
          <div>
            <label>Max move ($)</label>
            <input
              type="number"
              className={`input ${errors.move ? 'err' : ''}`}
              value={s.maxMove}
              onChange={(e) => set({ maxMove: e.target.value })}
            />
          </div>
        </div>

        <div className="form-row split">
          <div>
            <label>Slippage tolerance (%) {errors.slippage && <span className="err-text">· {errors.slippage}</span>}</label>
            <input
              type="number"
              step="0.1"
              className={`input ${errors.slippage ? 'err' : ''}`}
              value={s.slippage}
              onChange={(e) => set({ slippage: e.target.value })}
            />
          </div>
          <div>
            <label>Max trades / day {errors.maxTrades && <span className="err-text">· {errors.maxTrades}</span>}</label>
            <input
              type="number"
              className={`input ${errors.maxTrades ? 'err' : ''}`}
              value={s.maxTradesPerDay}
              onChange={(e) => set({ maxTradesPerDay: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="form-foot">
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={submit}>
          {isNew ? <><Plus size={14} /> Create</> : <><Pencil size={14} /> Save</>}
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
 * CopyTrade tab
 * ========================================================================== */
function CopyTradeTab({ copies, tags, addTag, mode, wallets, activeWalletId, currentUserId, onUpsert, onRemove, onToggle, showNew, setShowNew }) {
  return (
    <div className="tab-pane">
      <div className="pane-head">
        <div>
          <div className="pane-title">Copy Trade</div>
          <div className="pane-sub muted">
            {copies.length} setups · mirror trades from any Polymarket wallet
            {activeWalletId && (
              <> · executed by <strong>{wallets.find((w) => w.id === activeWalletId)?.label}</strong></>
            )}
          </div>
        </div>
        <button className="btn primary" onClick={() => setShowNew(true)}>
          <Plus size={14} /> New Copy Trade
        </button>
      </div>

      {showNew && (
        <CopyForm
          initial={{ ...defaultCopy(), walletId: currentUserId || wallets[0]?.id || null }}
          tags={tags}
          addTag={addTag}
          wallets={wallets}
          currentUserId={currentUserId}
          isNew
          onCancel={() => setShowNew(false)}
          onSave={(c) => {
            onUpsert(c);
            setShowNew(false);
          }}
        />
      )}

      {copies.length === 0 ? (
        <Empty
          icon={<Users size={28} />}
          title="No copy setups"
          hint="Add a wallet address to start mirroring trades."
        />
      ) : (
        <div className="cards-grid">
          {copies.map((c) => (
            <CopyCard
              key={c.id}
              copy={c}
              tags={tags}
              addTag={addTag}
              wallets={wallets}
              mode={mode}
              currentUserId={currentUserId}
              onUpsert={onUpsert}
              onRemove={onRemove}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CopyCard({ copy: c, tags, addTag, wallets, mode, currentUserId, onUpsert, onRemove, onToggle }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const isActive = c.status === 'ACTIVE';
  const winRate = c.wins + c.losses > 0 ? (c.wins / (c.wins + c.losses)) * 100 : 0;
  const wallet = wallets.find((w) => w.id === c.walletId);
  const canEdit = !c.walletId || c.walletId === currentUserId;

  if (editing) {
    return (
      <CopyForm
        initial={c}
        tags={tags}
        addTag={addTag}
        wallets={wallets}
        onCancel={() => setEditing(false)}
        onSave={(next) => {
          onUpsert(next);
          setEditing(false);
        }}
      />
    );
  }

  const tagObjs = c.tagIds.map((id) => tags.find((t) => t.id === id)).filter(Boolean);

  return (
    <div
      className={`card strat ${isActive ? 'active-card' : 'paused-card'}`}
      style={isActive && wallet ? { borderLeftColor: wallet.color, boxShadow: `0 0 0 1px ${wallet.color}10, 0 0 22px ${wallet.color}10` } : undefined}
    >
      <div className="card-head" onClick={() => setOpen((v) => !v)}>
        <div className="card-head-l">
          <div className={`status-dot ${isActive ? 'active' : 'paused'}`} style={isActive && wallet ? { background: wallet.color, boxShadow: `0 0 8px ${wallet.color}` } : undefined} />
          <div className="card-title">
            <span className="strat-label">{c.label || 'Copy Trader'}</span>
            {wallet && (
              <span
                className="wallet-pill-inline"
                style={{ borderColor: `${wallet.color}55`, color: wallet.color, background: `${wallet.color}10` }}
                title={`Executed by ${wallet.label}`}
              >
                <Wallet size={9} /> {wallet.label}
              </span>
            )}
            <span className="addr-pill" title={c.walletAddress}>{fmtAddress(c.walletAddress) || 'no target'}</span>
            {mode === 'DEMO' && <span className="badge demo">DEMO</span>}
          </div>
        </div>
        <div className="card-head-r">
          <div className="head-tags">
            {tagObjs.map((t) => (
              <span key={t.id} className="tag-pill" style={{ background: `${t.color}20`, color: t.color, borderColor: `${t.color}55` }}>
                <TagIcon size={9} /> {t.name}
              </span>
            ))}
          </div>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      <div className="card-meta">
        <div className="meta-coins">
          {c.coins.map((x) => (
            <span key={x} className="coin-chip" style={{ borderColor: COIN_COLORS[x] + '88', color: COIN_COLORS[x] }}>{x}</span>
          ))}
        </div>
        <div className="meta-pieces">
          <span className="tf-pill">
            {c.sizeMode === 'PERCENTAGE' ? `${c.sizePct}%` : `$${c.sizeFixed}`}
          </span>
          <span className="tf-pill">{c.priceMode === 'EXACT' ? 'EXACT' : `±${c.slippage}%`}</span>
          <span className="tf-pill">{c.timeframes.join('/') || '—'}</span>
        </div>
      </div>

      <div className="card-stats">
        <Stat label="TRADES" value={c.trades} />
        <Stat label="W/L" value={`${c.wins}/${c.losses}`} />
        <Stat label="WIN%" value={`${winRate.toFixed(0)}%`} accent={winRate >= 50 ? 'green' : 'red'} />
        <Stat label="PNL" value={fmtUSD(c.pnl)} accent={c.pnl >= 0 ? 'green' : 'red'} />
      </div>

      <BudgetBar spent={c.budgetSpent} total={c.totalBudget} />

      {open && (
        <div className="card-expanded">
          <FieldGrid>
            <Field label="Executing wallet" value={wallet ? `${wallet.label} · ${fmtAddress(wallet.address) || 'no addr'}` : '—'} />
            <Field label="Target wallet" value={c.walletAddress || '—'} mono />
            <Field label="Tags" value={tagObjs.length ? tagObjs.map((t) => t.name).join(', ') : '—'} />
            <Field label="Size mode" value={c.sizeMode === 'PERCENTAGE' ? `Percentage (${c.sizePct}%)` : `Fixed ($${c.sizeFixed})`} />
            <Field label="Max trades / market" value={c.maxTradesPerMarket} />
            <Field label="Price mode" value={c.priceMode === 'EXACT' ? 'Exact match' : `Slippage ±${c.slippage}%`} />
            <Field label="Timeframes" value={c.timeframes.join(', ') || '—'} />
            <Field label="Coins" value={c.coins.join(', ') || '—'} />
            <Field label="Total budget" value={fmtUSD(c.totalBudget)} />
          </FieldGrid>
        </div>
      )}

      <div className="card-actions">
        <button
          className={`btn small ${isActive ? 'warn' : 'primary'}`}
          onClick={() => onToggle(c.id)}
          disabled={!canEdit}
          title={canEdit ? '' : `owned by ${wallet?.label || 'another trader'}`}
        >
          {isActive ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Activate</>}
        </button>
        <button
          className="btn small ghost"
          onClick={() => setEditing(true)}
          disabled={!canEdit}
          title={canEdit ? '' : `read-only · owned by ${wallet?.label || 'another trader'}`}
        >
          <Pencil size={12} /> Edit
        </button>
        {confirmDel ? (
          <div className="confirm-inline">
            <span className="muted">Confirm delete?</span>
            <button className="btn small danger" onClick={() => onRemove(c.id)}>Yes</button>
            <button className="btn small ghost" onClick={() => setConfirmDel(false)}>No</button>
          </div>
        ) : (
          <button
            className="btn small danger ghost"
            onClick={() => setConfirmDel(true)}
            disabled={!canEdit}
            title={canEdit ? '' : `read-only · owned by ${wallet?.label || 'another trader'}`}
          >
            <Trash2 size={12} /> Delete
          </button>
        )}
        {!canEdit && (
          <span className="lock-badge muted small" title="locked"><Lock size={10} /> read-only</span>
        )}
      </div>
    </div>
  );
}

function CopyForm({ initial, tags, addTag, wallets = [], currentUserId, onCancel, onSave, isNew }) {
  const eligibleWallets = currentUserId
    ? wallets.filter((w) => w.id === currentUserId)
    : wallets;
  const [c, setC] = useState({
    ...initial,
    walletId: initial.walletId || eligibleWallets[0]?.id || wallets[0]?.id || null,
  });
  const [errors, setErrors] = useState({});
  const [tagInput, setTagInput] = useState('');

  const set = (patch) => setC((prev) => ({ ...prev, ...patch }));
  const toggleCoin = (x) =>
    set({ coins: c.coins.includes(x) ? c.coins.filter((y) => y !== x) : [...c.coins, x] });
  const toggleTf = (x) =>
    set({ timeframes: c.timeframes.includes(x) ? c.timeframes.filter((y) => y !== x) : [...c.timeframes, x] });
  const toggleTag = (id) =>
    set({ tagIds: c.tagIds.includes(id) ? c.tagIds.filter((y) => y !== id) : [...c.tagIds, id] });

  const validate = () => {
    const e = {};
    const w = (c.walletAddress || '').trim();
    if (!w) e.wallet = 'required';
    else if (!/^0x[a-fA-F0-9]{6,}$/.test(w)) e.wallet = 'invalid 0x address';
    if (wallets.length && !c.walletId) e.executor = 'pick a wallet';
    if (!c.coins.length) e.coins = 'pick at least one';
    if (!c.timeframes.length) e.timeframes = 'pick at least one';
    if (c.sizeMode === 'PERCENTAGE') {
      if (safeNum(c.sizePct) <= 0 || safeNum(c.sizePct) > 100) e.size = '0–100%';
    } else if (safeNum(c.sizeFixed) <= 0) {
      e.size = '> 0';
    }
    if (safeNum(c.maxTradesPerMarket) <= 0) e.mtp = '> 0';
    if (c.priceMode === 'SLIPPAGE' && safeNum(c.slippage) < 0) e.slip = '≥ 0';
    if (safeNum(c.totalBudget) <= 0) e.budget = '> 0';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    onSave({
      ...c,
      walletAddress: c.walletAddress.trim(),
      sizePct: +c.sizePct,
      sizeFixed: +c.sizeFixed,
      maxTradesPerMarket: +c.maxTradesPerMarket,
      slippage: +c.slippage,
      totalBudget: +c.totalBudget,
    });
  };

  return (
    <div className="card form">
      <div className="form-head">
        <div>
          <div className="pane-title small">{isNew ? 'New Copy Trade' : 'Edit Copy Trade'}</div>
          <div className="muted small">Mirror a Polymarket wallet — local simulation</div>
        </div>
        <button className="icon-btn" onClick={onCancel}><X size={16} /></button>
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label>Label</label>
          <input
            className="input"
            value={c.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="e.g. AlphaWhale"
          />
        </div>

        {eligibleWallets.length > 0 && (
          <div className="form-row">
            <label>Executing wallet (yours) {errors.executor && <span className="err-text">· {errors.executor}</span>}</label>
            <div className="form-tags">
              {eligibleWallets.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={`chip ${c.walletId === w.id ? 'active' : ''}`}
                  style={{
                    borderColor: c.walletId === w.id ? w.color : `${w.color}55`,
                    color: w.color,
                    background: c.walletId === w.id ? `${w.color}20` : 'transparent',
                  }}
                  onClick={() => set({ walletId: w.id })}
                >
                  <span className="dot" style={{ background: w.color }} />
                  <Wallet size={10} /> {w.label}
                </button>
              ))}
              {eligibleWallets.length === 1 && (
                <span className="muted small">copy-trade can only run from your signed-in wallet</span>
              )}
            </div>
          </div>
        )}

        <div className="form-row">
          <label>Target wallet (the one you copy) {errors.wallet && <span className="err-text">· {errors.wallet}</span>}</label>
          <input
            className={`input mono ${errors.wallet ? 'err' : ''}`}
            value={c.walletAddress}
            onChange={(e) => set({ walletAddress: e.target.value })}
            placeholder="0x4f8b2a91c0d3e6f7a8b9c0d1e2f3a4b5c6d78a2"
            spellCheck={false}
          />
        </div>

        <div className="form-row">
          <label>Tags</label>
          <div className="form-tags">
            {tags.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`chip ${c.tagIds.includes(t.id) ? 'active' : ''}`}
                style={{
                  borderColor: c.tagIds.includes(t.id) ? t.color : `${t.color}55`,
                  color: t.color,
                  background: c.tagIds.includes(t.id) ? `${t.color}20` : 'transparent',
                }}
                onClick={() => toggleTag(t.id)}
              >
                <span className="dot" style={{ background: t.color }} />
                {t.name}
              </button>
            ))}
            <input
              className="chip-edit"
              placeholder="+ tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  const t = await addTag(tagInput.trim());
                  if (t) toggleTag(t.id);
                  setTagInput('');
                }
              }}
            />
          </div>
        </div>

        <div className="form-row split">
          <div>
            <label>Trade size mode</label>
            <Segmented
              options={['PERCENTAGE', 'FIXED']}
              value={c.sizeMode}
              onChange={(v) => set({ sizeMode: v })}
              renderItem={(v) => (v === 'PERCENTAGE' ? '% of trader' : 'Fixed $')}
            />
          </div>
          <div>
            <label>
              {c.sizeMode === 'PERCENTAGE' ? 'Percent of their bet (%)' : 'Fixed amount ($)'}
              {errors.size && <span className="err-text"> · {errors.size}</span>}
            </label>
            <input
              type="number"
              step="0.1"
              className={`input ${errors.size ? 'err' : ''}`}
              value={c.sizeMode === 'PERCENTAGE' ? c.sizePct : c.sizeFixed}
              onChange={(e) =>
                c.sizeMode === 'PERCENTAGE'
                  ? set({ sizePct: e.target.value })
                  : set({ sizeFixed: e.target.value })
              }
            />
          </div>
        </div>

        <div className="form-row split">
          <div>
            <label>Max trades per market {errors.mtp && <span className="err-text">· {errors.mtp}</span>}</label>
            <input
              type="number"
              className={`input ${errors.mtp ? 'err' : ''}`}
              value={c.maxTradesPerMarket}
              onChange={(e) => set({ maxTradesPerMarket: e.target.value })}
            />
          </div>
          <div>
            <label>Total budget ($) {errors.budget && <span className="err-text">· {errors.budget}</span>}</label>
            <input
              type="number"
              className={`input ${errors.budget ? 'err' : ''}`}
              value={c.totalBudget}
              onChange={(e) => set({ totalBudget: e.target.value })}
            />
          </div>
        </div>

        <div className="form-row split">
          <div>
            <label>Price mode</label>
            <Segmented
              options={['EXACT', 'SLIPPAGE']}
              value={c.priceMode}
              onChange={(v) => set({ priceMode: v })}
              renderItem={(v) => (v === 'EXACT' ? 'Exact price' : 'Allow slippage')}
            />
          </div>
          <div>
            <label>Slippage (%) {errors.slip && <span className="err-text">· {errors.slip}</span>}</label>
            <input
              type="number"
              step="0.1"
              disabled={c.priceMode === 'EXACT'}
              className={`input ${errors.slip ? 'err' : ''}`}
              value={c.slippage}
              onChange={(e) => set({ slippage: e.target.value })}
            />
          </div>
        </div>

        <div className="form-row">
          <label>Timeframe filter {errors.timeframes && <span className="err-text">· {errors.timeframes}</span>}</label>
          <div className="form-tags">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                className={`chip ${c.timeframes.includes(tf) ? 'active' : ''}`}
                onClick={() => toggleTf(tf)}
                style={{
                  borderColor: c.timeframes.includes(tf) ? '#00c4ff' : '#00c4ff55',
                  color: '#00c4ff',
                  background: c.timeframes.includes(tf) ? '#00c4ff20' : 'transparent',
                }}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row">
          <label>Coin filter {errors.coins && <span className="err-text">· {errors.coins}</span>}</label>
          <div className="form-tags">
            {COINS.map((x) => (
              <button
                key={x}
                type="button"
                className={`coin-chip-toggle ${c.coins.includes(x) ? 'on' : ''}`}
                style={{
                  borderColor: c.coins.includes(x) ? COIN_COLORS[x] : `${COIN_COLORS[x]}55`,
                  color: c.coins.includes(x) ? COIN_COLORS[x] : '#8b95a3',
                  background: c.coins.includes(x) ? `${COIN_COLORS[x]}18` : 'transparent',
                }}
                onClick={() => toggleCoin(x)}
              >
                {x}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="form-foot">
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={submit}>
          {isNew ? <><Plus size={14} /> Create</> : <><Pencil size={14} /> Save</>}
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
 * Portfolio tab
 * ========================================================================== */
function PortfolioTab({ totals, strategies, copies, tags, wallets, activeWalletId, dailyPnl }) {
  const filterWallet = (x) => !activeWalletId || x.walletId === activeWalletId;
  const filteredS = strategies.filter(filterWallet);
  const filteredC = copies.filter(filterWallet);
  const all = [
    ...filteredS.map((s) => ({ ...s, _kind: 'AUTO' })),
    ...filteredC.map((c) => ({ ...c, _kind: 'COPY' })),
  ];

  const perWallet = wallets.map((w) => {
    const ws = strategies.filter((s) => s.walletId === w.id);
    const wc = copies.filter((c) => c.walletId === w.id);
    const fires = ws.reduce((a, s) => a + s.fires, 0) + wc.reduce((a, c) => a + c.trades, 0);
    const wins = ws.reduce((a, s) => a + s.wins, 0) + wc.reduce((a, c) => a + c.wins, 0);
    const losses = ws.reduce((a, s) => a + s.losses, 0) + wc.reduce((a, c) => a + c.losses, 0);
    const pnl = ws.reduce((a, s) => a + s.pnl, 0) + wc.reduce((a, c) => a + c.pnl, 0);
    const wr = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
    const budgetAlloc = ws.reduce((a, s) => a + s.totalBudget, 0) + wc.reduce((a, c) => a + c.totalBudget, 0);
    const budgetSpent = ws.reduce((a, s) => a + s.budgetSpent, 0) + wc.reduce((a, c) => a + c.budgetSpent, 0);
    return { wallet: w, fires, wins, losses, pnl, wr, items: ws.length + wc.length, budgetAlloc, budgetSpent };
  });

  return (
    <div className="tab-pane">
      <div className="pane-head">
        <div>
          <div className="pane-title">Portfolio</div>
          <div className="pane-sub muted">
            aggregate performance · across AutoTrade and Copy Trade
            {activeWalletId && (
              <> · scoped to <strong>{wallets.find((w) => w.id === activeWalletId)?.label}</strong></>
            )}
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <BigStat
          label="TOTAL PNL"
          value={fmtUSD(totals.totalPnl)}
          accent={totals.totalPnl >= 0 ? 'green' : 'red'}
          sub={`auto ${fmtUSD(totals.autoPnl)} · copy ${fmtUSD(totals.copyPnl)}`}
        />
        <BigStat label="TOTAL FIRES" value={totals.totalFires} sub="executed orders" />
        <BigStat
          label="OVERALL WIN RATE"
          value={`${totals.overallWR.toFixed(1)}%`}
          accent={totals.overallWR >= 50 ? 'green' : 'red'}
          sub="across all strategies"
        />
        <BigStat label="ACTIVE STRATEGIES" value={totals.activeStrategies} sub={`${strategies.length} total`} />
        <BigStat
          label="BUDGET USED"
          value={`${fmtUSD(totals.budgetSpent)} / ${fmtUSD(totals.budgetAlloc)}`}
          sub={`${totals.budgetAlloc ? ((totals.budgetSpent / totals.budgetAlloc) * 100).toFixed(1) : 0}% deployed`}
        />
        <BigStat
          label="BEST PERFORMER"
          value={totals.best ? totals.best.label : '—'}
          accent="green"
          sub={totals.best ? fmtUSD(totals.best.pnl) : ''}
        />
        <BigStat
          label="WORST PERFORMER"
          value={totals.worst ? totals.worst.label : '—'}
          accent="red"
          sub={totals.worst ? fmtUSD(totals.worst.pnl) : ''}
        />
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title"><Users size={14} /> Per-Wallet</div>
          <div className="muted small">{wallets.length} traders</div>
        </div>
        <div className="wallet-port-grid">
          {perWallet.map(({ wallet: w, fires, wins, losses, pnl, wr, items, budgetAlloc, budgetSpent }) => (
            <div
              key={w.id}
              className="wallet-port-card"
              style={{ borderTop: `2px solid ${w.color}`, boxShadow: `0 0 22px ${w.color}10` }}
            >
              <div className="wallet-port-head">
                <span className="dot" style={{ background: w.color, boxShadow: `0 0 8px ${w.color}` }} />
                <span style={{ color: w.color, fontWeight: 700 }}>{w.label}</span>
                <span className="muted small mono">{fmtAddress(w.address) || '—'}</span>
              </div>
              <div className="wallet-port-balance">
                <span className="muted small">PAPER BALANCE</span>
                <span className="balance-amount mono">{fmtUSD(w.demoBalance)}</span>
                <span className={`small mono ${(w.demoBalance - (w.startingBalance || 1000)) >= 0 ? 'pos' : 'neg'}`}>
                  Δ {fmtUSD(w.demoBalance - (w.startingBalance || 1000))}
                </span>
              </div>
              <div className="wallet-port-stats">
                <Stat label="ITEMS" value={items} />
                <Stat label="FIRES" value={fires} />
                <Stat label="WIN%" value={`${wr.toFixed(0)}%`} accent={wr >= 50 ? 'green' : 'red'} />
                <Stat label="PNL" value={fmtUSD(pnl)} accent={pnl >= 0 ? 'green' : 'red'} />
              </div>
              {budgetAlloc > 0 && <BudgetBar spent={budgetSpent} total={budgetAlloc} />}
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title"><LineChartIcon size={14} /> Daily PnL</div>
          <div className="muted small">last {dailyPnl.length} days · in-memory</div>
        </div>
        <PnLChart data={dailyPnl} />
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title"><BarChart3 size={14} /> Per-strategy breakdown</div>
          <div className="muted small">{all.length} rows</div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Wallet</th>
                <th>Type</th>
                <th>Coins</th>
                <th>Direction</th>
                <th>Fires</th>
                <th>W/L</th>
                <th>Win%</th>
                <th>PnL</th>
                <th>Budget</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {all.length === 0 && (
                <tr><td colSpan={11} className="muted center">no strategies yet</td></tr>
              )}
              {all.map((s) => {
                const fires = s._kind === 'AUTO' ? s.fires : s.trades;
                const wr = s.wins + s.losses > 0 ? (s.wins / (s.wins + s.losses)) * 100 : 0;
                const tagObjs = (s.tagIds || []).map((id) => tags.find((t) => t.id === id)).filter(Boolean);
                const w = wallets.find((x) => x.id === s.walletId);
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-tag">
                        <span className="strat-label">{s.label}</span>
                        <div className="head-tags">
                          {tagObjs.map((t) => (
                            <span key={t.id} className="tag-pill" style={{ background: `${t.color}20`, color: t.color, borderColor: `${t.color}55` }}>
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td>
                      {w ? (
                        <span
                          className="wallet-pill-inline"
                          style={{ borderColor: `${w.color}55`, color: w.color, background: `${w.color}10` }}
                        >
                          <Wallet size={9} /> {w.label}
                        </span>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td><span className={`type-pill ${s._kind === 'AUTO' ? 'auto' : 'copy'}`}>{s._kind}</span></td>
                    <td>
                      <div className="meta-coins">
                        {s.coins.map((c) => (
                          <span key={c} className="coin-chip small" style={{ borderColor: COIN_COLORS[c] + '88', color: COIN_COLORS[c] }}>{c}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {s._kind === 'AUTO' ? (
                        <span className={`dir-pill small ${s.direction === 'UP' ? 'up' : 'down'}`}>{s.direction}</span>
                      ) : <span className="muted">mirror</span>}
                    </td>
                    <td>{fires}</td>
                    <td>{s.wins}/{s.losses}</td>
                    <td className={wr >= 50 ? 'pos' : 'neg'}>{wr.toFixed(0)}%</td>
                    <td className={s.pnl >= 0 ? 'pos' : 'neg'}>{fmtUSD(s.pnl)}</td>
                    <td>
                      <div className="cell-budget">
                        <BudgetBar spent={s.budgetSpent} total={s.totalBudget} compact />
                      </div>
                    </td>
                    <td>
                      <span className={`status-tag ${s.status === 'ACTIVE' ? 'active' : 'paused'}`}>{s.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PnLChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="empty small muted">no PnL data yet — fire some trades…</div>;
  }
  const W = 720;
  const H = 180;
  const padX = 36;
  const padY = 16;
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.pnl)));
  const stepX = data.length > 1 ? (W - padX * 2) / (data.length - 1) : 0;
  const yFor = (v) => H / 2 - (v / maxAbs) * (H / 2 - padY);

  let cum = 0;
  const cumulative = data.map((d) => {
    cum += d.pnl;
    return { ...d, cum };
  });
  const cumMaxAbs = Math.max(1, ...cumulative.map((d) => Math.abs(d.cum)));
  const yForCum = (v) => H / 2 - (v / cumMaxAbs) * (H / 2 - padY);

  const path = cumulative
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${padX + i * stepX} ${yForCum(d.cum)}`)
    .join(' ');

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart">
        <defs>
          <linearGradient id="pnlFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#00ff88" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#00ff88" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={padX} y1={H / 2} x2={W - padX} y2={H / 2} stroke="#1f2630" strokeDasharray="3 3" />
        {/* bars (per-day) */}
        {data.map((d, i) => {
          const x = padX + i * stepX - 8;
          const y = d.pnl >= 0 ? yFor(d.pnl) : H / 2;
          const h = Math.max(1, Math.abs(yFor(d.pnl) - H / 2));
          return (
            <rect
              key={d.key}
              x={x}
              y={y}
              width={16}
              height={h}
              fill={d.pnl >= 0 ? '#00ff8855' : '#ff475755'}
              stroke={d.pnl >= 0 ? '#00ff88' : '#ff4757'}
              strokeWidth="1"
            />
          );
        })}
        {/* cumulative path */}
        {cumulative.length > 1 && (
          <>
            <path d={`${path} L ${padX + (cumulative.length - 1) * stepX} ${H} L ${padX} ${H} Z`} fill="url(#pnlFill)" />
            <path d={path} fill="none" stroke="#00ff88" strokeWidth="2" />
          </>
        )}
        {data.map((d, i) => (
          <text
            key={'lbl' + d.key}
            x={padX + i * stepX}
            y={H - 2}
            textAnchor="middle"
            fontSize="9"
            fill="#6b7785"
          >
            {d.day}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ============================================================================
 * Live Log tab
 * ========================================================================== */
function LiveLogTab({ logs, tags, wallets, activeWalletId }) {
  const [filterCoin, setFilterCoin] = useState('ALL');
  const [filterTag, setFilterTag] = useState('ALL');
  const [filterSrc, setFilterSrc] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterWallet, setFilterWallet] = useState('ALL');
  const [search, setSearch] = useState('');

  const effectiveWalletFilter = activeWalletId || (filterWallet === 'ALL' ? null : filterWallet);

  const filtered = logs.filter((l) => {
    if (filterCoin !== 'ALL' && l.coin !== filterCoin) return false;
    if (filterSrc !== 'ALL' && l.source !== filterSrc) return false;
    if (filterStatus !== 'ALL' && l.status !== filterStatus) return false;
    if (filterTag !== 'ALL' && !(l.tagIds || []).includes(filterTag)) return false;
    if (effectiveWalletFilter && l.walletId && l.walletId !== effectiveWalletFilter) return false;
    if (search && !(`${l.coin} ${l.sourceLabel} ${l.status}`.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  return (
    <div className="tab-pane">
      <div className="pane-head">
        <div>
          <div className="pane-title">Live Log</div>
          <div className="pane-sub muted">real-time order feed · {filtered.length} of {logs.length} entries</div>
        </div>
      </div>

      <div className="log-filters">
        <div className="log-filter">
          <span className="muted small">WALLET</span>
          <select
            value={activeWalletId ? activeWalletId : filterWallet}
            onChange={(e) => setFilterWallet(e.target.value)}
            disabled={!!activeWalletId}
            className="select"
          >
            <option value="ALL">All</option>
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
        <div className="log-filter">
          <span className="muted small">COIN</span>
          <select value={filterCoin} onChange={(e) => setFilterCoin(e.target.value)} className="select">
            <option value="ALL">All</option>
            {COINS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="log-filter">
          <span className="muted small">TAG</span>
          <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="select">
            <option value="ALL">All</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="log-filter">
          <span className="muted small">SOURCE</span>
          <select value={filterSrc} onChange={(e) => setFilterSrc(e.target.value)} className="select">
            <option value="ALL">All</option>
            <option value="AUTO">AutoTrade</option>
            <option value="COPY">Copy Trade</option>
          </select>
        </div>
        <div className="log-filter">
          <span className="muted small">STATUS</span>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="select">
            <option value="ALL">All</option>
            <option value="PLACED">Placed</option>
            <option value="WON">Won</option>
            <option value="LOST">Lost</option>
            <option value="AUTO-PAUSED">Auto-paused (budget)</option>
            <option value="TAG-TARGET">Tag · target hit</option>
            <option value="TAG-LOSS">Tag · loss hit</option>
          </select>
        </div>
        <div className="log-filter grow">
          <span className="muted small"><Search size={10} /> SEARCH</span>
          <input className="select" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="filter…" />
        </div>
      </div>

      <div className="panel">
        <div className="log-head">
          <span className="muted small">TIME</span>
          <span className="muted small">WALLET</span>
          <span className="muted small">SRC</span>
          <span className="muted small">COIN</span>
          <span className="muted small">DIR</span>
          <span className="muted small">TF</span>
          <span className="muted small">ENTRY</span>
          <span className="muted small">AMT</span>
          <span className="muted small">PNL</span>
          <span className="muted small">STATUS</span>
          <span className="muted small">STRATEGY</span>
        </div>
        <div className="log-list">
          {filtered.length === 0 && <div className="empty small muted">waiting for trades…</div>}
          {filtered.map((l) => {
            const w = wallets.find((x) => x.id === l.walletId);
            return (
              <div key={l.id} className={`log-row status-${(l.status || '').toLowerCase()}`}>
                <span className="mono small">{fmtTime(l.ts)}</span>
                <span>
                  {w ? (
                    <span
                      className="wallet-pill-inline"
                      style={{ borderColor: `${w.color}55`, color: w.color, background: `${w.color}10` }}
                    >
                      <span className="dot" style={{ background: w.color }} />
                      {w.label}
                    </span>
                  ) : <span className="muted small">—</span>}
                </span>
                <span className={`type-pill small ${l.source === 'AUTO' ? 'auto' : 'copy'}`}>{l.source}</span>
                <span className="coin-chip small" style={{ borderColor: COIN_COLORS[l.coin] + '88', color: COIN_COLORS[l.coin] }}>{l.coin}</span>
                <span className={`dir-pill small ${l.direction === 'UP' ? 'up' : l.direction === 'DOWN' ? 'down' : 'muted'}`}>
                  {l.direction === 'UP' ? <ArrowUpRight size={10} /> : l.direction === 'DOWN' ? <ArrowDownRight size={10} /> : '–'}
                </span>
                <span className="tf-pill small">{l.timeframe}</span>
                <span className="mono small">{l.entryPrice ? fmtCents(l.entryPrice) : '—'}</span>
                <span className="mono small">{l.amount ? fmtUSD(l.amount) : '—'}</span>
                <span className={`mono small ${l.pnl >= 0 ? 'pos' : 'neg'}`}>{l.pnl != null ? fmtUSD(l.pnl) : ''}</span>
                <span className={`status-tag ${(l.status || '').toLowerCase()}`}>{l.status}</span>
                <span className="log-source muted small" title={l.sourceLabel}>{l.sourceLabel || ''}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * Reusable bits
 * ========================================================================== */
function Stat({ label, value, accent }) {
  return (
    <div className="stat">
      <div className="stat-label muted">{label}</div>
      <div className={`stat-value ${accent || ''}`}>{value}</div>
    </div>
  );
}

function BigStat({ label, value, accent, sub }) {
  return (
    <div className="bigstat">
      <div className="bigstat-label muted">{label}</div>
      <div className={`bigstat-value ${accent || ''}`}>{value}</div>
      {sub && <div className="bigstat-sub muted">{sub}</div>}
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div className="field">
      <div className="field-label muted">{label}</div>
      <div className={`field-value ${mono ? 'mono' : ''}`}>{value}</div>
    </div>
  );
}

function FieldGrid({ children }) {
  return <div className="field-grid">{children}</div>;
}

function BudgetBar({ spent, total, compact }) {
  const pct = total > 0 ? clamp((spent / total) * 100, 0, 100) : 0;
  const tone = pct >= 80 ? 'red' : pct >= 50 ? 'yellow' : 'green';
  return (
    <div className={`budget ${compact ? 'compact' : ''}`}>
      <div className="budget-bar">
        <div className={`budget-fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      {!compact && (
        <div className="budget-labels">
          <span className="muted small">Budget</span>
          <span className="mono small">{fmtUSD(spent)} / {fmtUSD(total)} · {pct.toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}

function Segmented({ options, value, onChange, renderItem, colors }) {
  return (
    <div className="segmented">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`seg ${value === opt ? 'active' : ''}`}
          onClick={() => onChange(opt)}
          style={value === opt && colors?.[opt] ? { color: colors[opt], borderColor: colors[opt], background: `${colors[opt]}18` } : undefined}
        >
          {renderItem ? renderItem(opt) : opt}
        </button>
      ))}
    </div>
  );
}

function DualSlider({ min, max, valueMin, valueMax, onChange, err }) {
  const a = clamp(valueMin, min, max);
  const b = clamp(valueMax, min, max);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const pctLo = ((lo - min) / (max - min)) * 100;
  const pctHi = ((hi - min) / (max - min)) * 100;

  return (
    <div className={`dual ${err ? 'err' : ''}`}>
      <div className="dual-track">
        <div className="dual-fill" style={{ left: `${pctLo}%`, width: `${pctHi - pctLo}%` }} />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={lo}
        onChange={(e) => onChange(clamp(+e.target.value, min, hi - 0.5), hi)}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={hi}
        onChange={(e) => onChange(lo, clamp(+e.target.value, lo + 0.5, max))}
      />
      <div className="dual-inputs">
        <div className="dual-input">
          <span className="muted small">MIN</span>
          <input
            type="number"
            min={min}
            max={max}
            step="0.5"
            value={lo}
            onChange={(e) => onChange(clamp(+e.target.value, min, hi - 0.5), hi)}
          />
          <span className="muted small">¢</span>
        </div>
        <div className="dual-input">
          <span className="muted small">MAX</span>
          <input
            type="number"
            min={min}
            max={max}
            step="0.5"
            value={hi}
            onChange={(e) => onChange(lo, clamp(+e.target.value, lo + 0.5, max))}
          />
          <span className="muted small">¢</span>
        </div>
      </div>
    </div>
  );
}

function Empty({ icon, title, hint }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      <div className="empty-hint muted">{hint}</div>
    </div>
  );
}

function Modal({ children, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* ============================================================================
 * CSS — injected once at the top of <App />
 * ========================================================================== */
const CSS = `
:root {
  --bg: #0a0c10;
  --bg2: #0d1117;
  --card: #11161e;
  --card2: #161b22;
  --border: #1f2630;
  --border-strong: #2a3340;
  --text: #e6e9ef;
  --muted: #6b7785;
  --green: #00ff88;
  --green-dim: #00ff8830;
  --red: #ff4757;
  --red-dim: #ff475730;
  --blue: #00c4ff;
  --blue-dim: #00c4ff30;
  --yellow: #ffb800;
  --yellow-dim: #ffb80030;
  --purple: #a855f7;
}

.pmt {
  min-height: 100vh;
  background:
    radial-gradient(1200px 600px at 80% -10%, rgba(0, 196, 255, 0.05), transparent 60%),
    radial-gradient(900px 500px at 5% 0%, rgba(0, 255, 136, 0.04), transparent 60%),
    var(--bg);
  color: var(--text);
  display: flex;
  flex-direction: column;
}

.muted { color: var(--muted); }
.small { font-size: 11px; }
.mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.center { text-align: center; }
.pos { color: var(--green); }
.neg { color: var(--red); }
.dim { color: var(--muted); font-weight: 400; }

/* ---------- Header --------------------------------------------------- */
.header {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 18px;
  background: linear-gradient(180deg, rgba(13,17,23,0.96), rgba(13,17,23,0.86));
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(8px);
  flex-wrap: wrap;
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand-mark {
  width: 32px; height: 32px;
  display: grid; place-items: center;
  background: linear-gradient(135deg, var(--green), var(--blue));
  color: #001;
  border-radius: 8px;
  box-shadow: 0 0 20px rgba(0, 255, 136, 0.4);
}
.brand-name { font-weight: 800; letter-spacing: 1px; font-size: 13px; }
.brand-sub { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; }

.ticker {
  display: flex; gap: 6px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  padding: 4px 0;
}
.ticker::-webkit-scrollbar { height: 6px; }
.ticker-cell {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 11px;
  white-space: nowrap;
}
.t-coin { font-weight: 700; }
.t-price { color: var(--text); font-feature-settings: "tnum"; }

.header-right {
  display: flex; align-items: center; gap: 10px;
  flex-wrap: wrap;
}
.balance-block {
  display: flex; flex-direction: column;
  align-items: flex-end;
  padding: 6px 12px;
  border-left: 1px solid var(--border);
}
.balance-label { font-size: 9px; letter-spacing: 1.4px; }
.balance-amount {
  font-size: 18px; font-weight: 700;
  font-feature-settings: "tnum";
}
.balance-amount.pos { color: var(--green); }
.balance-amount.neg { color: var(--red); }
.balance-sub { font-size: 10px; }

.wallet-input {
  display: flex; align-items: center; gap: 6px;
  background: var(--card);
  border: 1px solid var(--border);
  padding: 6px 10px;
  border-radius: 6px;
}
.wallet-input input {
  background: transparent;
  border: none; outline: none;
  color: var(--text);
  width: 220px;
  font-size: 11px;
}

/* ---------- Mode toggle ---------------------------------------------- */
.mode-toggle {
  display: inline-flex;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 3px;
  position: relative;
}
.mode-toggle.live { border-color: var(--green); box-shadow: 0 0 16px rgba(0,255,136,0.18); }
.mode-toggle.demo { border-color: var(--yellow); box-shadow: 0 0 16px rgba(255,184,0,0.14); }
.mode-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.2px;
  cursor: pointer;
  border-radius: 6px;
  transition: 0.15s;
}
.mode-btn.active { color: var(--text); background: rgba(255,255,255,0.04); }
.mode-toggle.live .mode-btn.active { color: var(--green); }
.mode-toggle.demo .mode-btn.active { color: var(--yellow); }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.green { background: var(--green); box-shadow: 0 0 8px var(--green); }
.dot.yellow { background: var(--yellow); box-shadow: 0 0 8px var(--yellow); }
.dot.pulse { animation: pulse 1.6s infinite; }

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0,255,136, .6); }
  50% { box-shadow: 0 0 0 6px rgba(0,255,136, 0); }
}

/* ---------- Banner --------------------------------------------------- */
.banner {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 18px;
  background: linear-gradient(90deg, rgba(255,184,0,0.10), rgba(255,184,0,0.02));
  border-bottom: 1px solid rgba(255,184,0,0.25);
  color: var(--yellow);
  font-size: 11px;
  letter-spacing: 0.6px;
}
.banner-sep { color: var(--muted); }
.api-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--muted);
}
.api-dot.ok { background: var(--green); box-shadow: 0 0 6px var(--green); }
.api-dot.err { background: var(--red); box-shadow: 0 0 6px var(--red); }

/* ---------- Tabs ----------------------------------------------------- */
.tabs {
  display: flex;
  gap: 4px;
  padding: 8px 14px 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg2);
  overflow-x: auto;
}
.tab {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.6px;
  transition: 0.15s;
  white-space: nowrap;
}
.tab:hover { color: var(--text); }
.tab.active { color: var(--green); border-bottom-color: var(--green); }
.tab-badge {
  background: var(--card);
  border: 1px solid var(--border);
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  color: var(--muted);
}
.tab.active .tab-badge { color: var(--green); border-color: var(--green-dim); }

/* ---------- TagBar --------------------------------------------------- */
.tagbar {
  display: flex; gap: 6px; align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
  background: var(--bg);
}
.tagbar-label {
  font-size: 9px; letter-spacing: 1.4px;
  display: inline-flex; align-items: center; gap: 4px;
  margin-right: 6px;
}
.chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 16px;
  font-size: 11px;
  cursor: pointer;
  transition: 0.15s;
}
.chip:hover { background: var(--card); }
.chip.active { background: rgba(255,255,255,0.04); }
.chip.add { color: var(--muted); border-style: dashed; }
.chip-x {
  display: inline-flex; align-items: center;
  margin-left: 2px;
  opacity: 0.6;
}
.chip-x:hover { opacity: 1; color: var(--red); }
.chip-edit {
  background: var(--card);
  border: 1px dashed var(--border-strong);
  color: var(--text);
  padding: 4px 8px;
  border-radius: 14px;
  font-size: 11px;
  outline: none;
  width: 110px;
}
.chip-wrap { display: inline-flex; }

.chip.add.on { color: var(--green); border-color: var(--green); border-style: solid; }
.chip.triggered { animation: tagPulse 1.4s ease-in-out infinite; }
@keyframes tagPulse {
  0%, 100% { box-shadow: 0 0 0 0 currentColor; }
  50% { box-shadow: 0 0 8px currentColor; }
}
.trigger-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px;
  border: 1px solid;
  border-radius: 50%;
  margin-left: 2px;
}

/* ---------- Tag manager --------------------------------------------- */
.tag-manager {
  background: var(--card);
  border-bottom: 1px solid var(--border);
  padding: 12px 14px;
  display: flex; flex-direction: column; gap: 10px;
  animation: fade 0.18s ease-out;
}
.tag-manager-head {
  display: flex; justify-content: space-between; align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.tag-mgr-grid {
  display: flex; flex-direction: column;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.tag-mgr-row {
  display: grid;
  grid-template-columns: minmax(120px, 1.2fr) 60px 90px 1.4fr 1.4fr minmax(140px, 1.4fr) auto;
  gap: 10px;
  padding: 8px 12px;
  align-items: center;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  transition: background 0.15s;
}
.tag-mgr-row:last-child { border-bottom: none; }
.tag-mgr-row.head {
  background: rgba(255,255,255,0.02);
  font-size: 9px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
}
.tag-mgr-row.triggered.profit { background: rgba(0,255,136,0.06); }
.tag-mgr-row.triggered.loss { background: rgba(255,71,87,0.06); }
.tag-mgr-name {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px;
}
.tag-mgr-input {
  display: flex; flex-direction: column; gap: 4px;
  min-width: 0;
}
.input.mini {
  padding: 5px 8px;
  font-size: 11px;
  width: 100%;
  background: var(--card);
}
.tiny-bar {
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}
.tiny-fill {
  height: 100%;
  transition: width 0.3s;
}
.tiny-fill.green { background: var(--green); }
.tiny-fill.red { background: var(--red); }

.status-tag.tag-target { color: var(--green); border-color: var(--green); background: var(--green-dim); display: inline-flex; align-items: center; gap: 3px; }
.status-tag.tag-loss { color: var(--red); border-color: var(--red); background: var(--red-dim); display: inline-flex; align-items: center; gap: 3px; }
.log-row.status-tag-target { background: rgba(0,255,136,0.08); }
.log-row.status-tag-loss { background: rgba(255,71,87,0.08); }

/* ---------- Layout --------------------------------------------------- */
.content {
  flex: 1;
  padding: 18px;
  max-width: 1500px;
  width: 100%;
  margin: 0 auto;
}
.tab-pane { display: flex; flex-direction: column; gap: 18px; }

.pane-head {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  flex-wrap: wrap;
}
.pane-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.pane-title.small { font-size: 13px; }
.pane-sub { font-size: 11px; }

.cards-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
}

/* ---------- Card ----------------------------------------------------- */
.card {
  background: linear-gradient(180deg, var(--card) 0%, var(--card2) 100%);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  display: flex; flex-direction: column;
  gap: 10px;
  transition: 0.2s;
  position: relative;
}
.card.strat { padding: 12px; }
.card.active-card {
  border-left: 3px solid var(--green);
  box-shadow: 0 0 0 1px rgba(0,255,136,0.06), 0 0 22px rgba(0,255,136,0.06);
}
.card.paused-card {
  border-left: 3px solid var(--border-strong);
  opacity: 0.92;
}
.card-head {
  display: flex; justify-content: space-between; align-items: center;
  cursor: pointer;
  gap: 8px;
}
.card-head-l { display: flex; align-items: center; gap: 8px; min-width: 0; }
.card-head-r { display: flex; align-items: center; gap: 8px; }
.card-title {
  display: flex; align-items: center; gap: 6px;
  flex-wrap: wrap;
}
.strat-label {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.4px;
}
.status-dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--muted);
  flex-shrink: 0;
}
.status-dot.active {
  background: var(--green);
  box-shadow: 0 0 8px var(--green);
  animation: pulse 1.8s infinite;
}
.status-dot.paused { background: var(--muted); }

.head-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.tag-pill {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 7px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 600;
  border: 1px solid;
}
.badge {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid;
}
.badge.demo { color: var(--yellow); border-color: var(--yellow); background: var(--yellow-dim); }
.badge.warn {
  color: var(--red); border-color: var(--red); background: var(--red-dim);
  display: inline-flex; align-items: center; gap: 3px;
}

.card-meta {
  display: flex; justify-content: space-between; align-items: center;
  flex-wrap: wrap; gap: 6px;
}
.meta-coins { display: flex; gap: 4px; flex-wrap: wrap; }
.meta-pieces { display: flex; gap: 6px; flex-wrap: wrap; }

.coin-chip {
  display: inline-block;
  padding: 2px 7px;
  border: 1px solid;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.coin-chip.small { padding: 1px 5px; font-size: 9px; }
.coin-chip-toggle {
  padding: 4px 10px;
  border: 1px solid;
  border-radius: 6px;
  background: transparent;
  font-weight: 700;
  font-size: 11px;
  cursor: pointer;
  transition: 0.15s;
  letter-spacing: 0.5px;
}

.dir-pill {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 700;
  padding: 2px 7px;
  border: 1px solid;
  border-radius: 4px;
}
.dir-pill.up { color: var(--green); border-color: var(--green); background: var(--green-dim); }
.dir-pill.down { color: var(--red); border-color: var(--red); background: var(--red-dim); }
.dir-pill.small { font-size: 9px; padding: 1px 5px; }

.tf-pill {
  font-size: 10px;
  padding: 2px 7px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  color: var(--blue);
  background: var(--blue-dim);
}
.tf-pill.small { font-size: 9px; padding: 1px 5px; }

.range-pill {
  font-size: 10px;
  padding: 2px 7px;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--muted);
}

.addr-pill {
  font-size: 10px;
  padding: 2px 7px;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
}

/* ---------- Stats ---------------------------------------------------- */
.card-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.stat { display: flex; flex-direction: column; align-items: flex-start; }
.stat-label { font-size: 9px; letter-spacing: 1px; }
.stat-value {
  font-size: 13px; font-weight: 700;
  font-feature-settings: "tnum";
}
.stat-value.green { color: var(--green); }
.stat-value.red { color: var(--red); }

/* ---------- Budget bar ---------------------------------------------- */
.budget { display: flex; flex-direction: column; gap: 4px; }
.budget.compact { gap: 0; }
.budget-bar {
  height: 6px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}
.budget.compact .budget-bar { height: 4px; }
.budget-fill {
  height: 100%;
  transition: width 0.3s;
  background: var(--green);
}
.budget-fill.green { background: linear-gradient(90deg, #00ff88, #00c98c); }
.budget-fill.yellow { background: linear-gradient(90deg, #ffb800, #ffd35c); }
.budget-fill.red { background: linear-gradient(90deg, #ff4757, #ff7a83); }
.budget-labels {
  display: flex; justify-content: space-between;
}

/* ---------- Card actions -------------------------------------------- */
.card-actions {
  display: flex; gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  transition: 0.15s;
}
.btn:hover { background: var(--card2); border-color: var(--border-strong); }
.btn.small { padding: 5px 9px; font-size: 11px; }
.btn.primary {
  border-color: var(--green); color: var(--green);
  background: var(--green-dim);
}
.btn.primary:hover { background: rgba(0,255,136,0.18); }
.btn.danger {
  border-color: var(--red); color: var(--red); background: var(--red-dim);
}
.btn.danger:hover { background: rgba(255,71,87,0.18); }
.btn.warn {
  border-color: var(--yellow); color: var(--yellow); background: var(--yellow-dim);
}
.btn.warn:hover { background: rgba(255,184,0,0.18); }
.btn.ghost {
  background: transparent; color: var(--muted);
}
.btn.ghost:hover { color: var(--text); border-color: var(--border-strong); background: var(--card); }
.btn.danger.ghost { background: transparent; color: var(--red); }
.btn.danger.ghost:hover { background: var(--red-dim); }

.icon-btn {
  width: 32px; height: 32px;
  display: inline-grid; place-items: center;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  color: var(--muted);
  transition: 0.15s;
}
.icon-btn.on { color: var(--green); border-color: var(--green); }
.icon-btn:hover { color: var(--text); border-color: var(--border-strong); }

.confirm-inline {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--red-dim);
  border: 1px dashed var(--red);
  padding: 3px 6px;
  border-radius: 6px;
}

/* ---------- Card expanded section ----------------------------------- */
.card-expanded {
  display: flex; flex-direction: column; gap: 8px;
  padding: 8px 0;
  border-top: 1px dashed var(--border);
  border-bottom: 1px dashed var(--border);
  animation: fade 0.18s ease-in;
}
@keyframes fade {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: translateY(0); }
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px 16px;
}
.field { display: flex; flex-direction: column; }
.field-label { font-size: 9px; letter-spacing: 1px; }
.field-value { font-size: 12px; font-weight: 600; }
.live-row { font-size: 10px; padding-top: 4px; border-top: 1px dotted var(--border); }

/* ---------- Form ---------------------------------------------------- */
.card.form {
  border-color: var(--blue-dim);
  box-shadow: 0 0 0 1px rgba(0,196,255,0.08);
}
.form-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 8px;
}
.form-grid { display: flex; flex-direction: column; gap: 12px; }
.form-row { display: flex; flex-direction: column; gap: 6px; }
.form-row.split {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
}
.form-row > label,
.form-row > div > label {
  font-size: 10px; letter-spacing: 1.2px;
  color: var(--muted);
  text-transform: uppercase;
  display: flex; align-items: center; gap: 6px;
}
.input, .select {
  width: 100%;
  background: var(--bg2);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
  transition: 0.15s;
}
.input:focus, .select:focus { border-color: var(--blue); box-shadow: 0 0 0 2px rgba(0,196,255,0.15); }
.input.err { border-color: var(--red); }
.input:disabled { opacity: 0.5; cursor: not-allowed; }
.input.mono { font-family: 'JetBrains Mono', monospace; }
.err-text { color: var(--red); font-size: 10px; font-weight: 600; }

.form-tags {
  display: flex; gap: 6px; flex-wrap: wrap;
}

.segmented {
  display: inline-flex;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px;
  flex-wrap: wrap;
}
.seg {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  display: inline-flex; align-items: center; gap: 4px;
  letter-spacing: 0.4px;
}
.seg.active {
  background: rgba(255,255,255,0.04);
  color: var(--text);
  border-color: var(--border-strong);
}

.dual {
  display: flex; flex-direction: column; gap: 8px;
  padding: 4px 0;
  position: relative;
}
.dual-track {
  position: relative;
  height: 6px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 3px;
}
.dual-fill {
  position: absolute; top: 0; bottom: 0;
  background: linear-gradient(90deg, var(--green), var(--blue));
  border-radius: 2px;
}
.dual input[type=range] {
  position: absolute;
  width: 100%;
  background: transparent;
  -webkit-appearance: none;
  pointer-events: none;
  margin: 0;
  top: 4px;
  height: 6px;
}
.dual input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: var(--green);
  border: 2px solid var(--bg);
  pointer-events: auto;
  cursor: pointer;
  box-shadow: 0 0 6px var(--green);
}
.dual input[type=range]::-moz-range-thumb {
  width: 16px; height: 16px;
  border-radius: 50%;
  background: var(--green);
  border: 2px solid var(--bg);
  pointer-events: auto;
  cursor: pointer;
  box-shadow: 0 0 6px var(--green);
}
.dual.err .dual-fill { background: linear-gradient(90deg, var(--red), var(--yellow)); }

.dual-inputs { display: flex; gap: 12px; margin-top: 14px; }
.dual-input {
  display: flex; align-items: center; gap: 6px;
  background: var(--bg2);
  border: 1px solid var(--border);
  padding: 4px 8px;
  border-radius: 6px;
  flex: 1;
}
.dual-input input {
  background: transparent;
  border: none; outline: none;
  color: var(--text);
  width: 60px;
  font-size: 12px;
  font-feature-settings: "tnum";
}

.form-foot {
  display: flex; justify-content: flex-end; gap: 8px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

/* ---------- Portfolio ----------------------------------------------- */
.stats-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}
.bigstat {
  background: linear-gradient(180deg, var(--card), var(--card2));
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  display: flex; flex-direction: column;
  gap: 4px;
}
.bigstat-label { font-size: 10px; letter-spacing: 1.4px; }
.bigstat-value {
  font-size: 22px; font-weight: 800;
  font-feature-settings: "tnum";
  word-break: break-all;
}
.bigstat-value.green { color: var(--green); }
.bigstat-value.red { color: var(--red); }
.bigstat-sub { font-size: 11px; }

.panel {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  display: flex; flex-direction: column;
  gap: 8px;
}
.panel-head {
  display: flex; justify-content: space-between; align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.panel-title {
  display: inline-flex; align-items: center; gap: 6px;
  font-weight: 700; font-size: 12px; letter-spacing: 0.6px;
}

.chart-wrap { width: 100%; }
.chart { width: 100%; height: 200px; }

.table-wrap { overflow-x: auto; }
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.table th, .table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.table th {
  font-size: 9px;
  letter-spacing: 1.2px;
  color: var(--muted);
  text-transform: uppercase;
  font-weight: 600;
}
.table tr:hover td { background: var(--bg2); }
.cell-tag { display: flex; flex-direction: column; gap: 4px; }
.cell-budget { min-width: 120px; }
.type-pill {
  font-size: 9px; font-weight: 700; letter-spacing: 1px;
  padding: 2px 6px; border-radius: 3px;
  border: 1px solid;
}
.type-pill.small { font-size: 8px; }
.type-pill.auto { color: var(--green); border-color: var(--green); background: var(--green-dim); }
.type-pill.copy { color: var(--purple); border-color: var(--purple); background: rgba(168,85,247,0.18); }

.status-tag {
  font-size: 9px; font-weight: 700;
  letter-spacing: 1px;
  padding: 2px 7px;
  border-radius: 3px;
  border: 1px solid;
}
.status-tag.active { color: var(--green); border-color: var(--green); background: var(--green-dim); }
.status-tag.paused { color: var(--muted); border-color: var(--border-strong); background: var(--card2); }
.status-tag.placed { color: var(--blue); border-color: var(--blue); background: var(--blue-dim); }
.status-tag.won { color: var(--green); border-color: var(--green); background: var(--green-dim); }
.status-tag.lost { color: var(--red); border-color: var(--red); background: var(--red-dim); }
.status-tag.auto-paused { color: var(--yellow); border-color: var(--yellow); background: var(--yellow-dim); }

/* ---------- Live Log ------------------------------------------------ */
.log-filters {
  display: flex; gap: 10px;
  flex-wrap: wrap;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
}
.log-filter {
  display: flex; flex-direction: column; gap: 3px;
  min-width: 120px;
}
.log-filter.grow { flex: 1; }
.log-filter .small {
  display: inline-flex; align-items: center; gap: 4px;
  letter-spacing: 1.2px;
}

.log-head, .log-row {
  display: grid;
  grid-template-columns: 60px 90px 50px 50px 30px 60px 60px 60px 70px 70px 1fr;
  gap: 8px;
  padding: 7px 10px;
  align-items: center;
  font-size: 11px;
}
.log-head {
  border-bottom: 1px solid var(--border);
  background: var(--bg2);
  border-radius: 4px;
}
.log-list {
  max-height: 60vh;
  overflow-y: auto;
  display: flex; flex-direction: column;
}
.log-row {
  border-bottom: 1px solid var(--border);
  animation: rowIn 0.2s ease-out;
}
.log-row:hover { background: var(--bg2); }
.log-row.status-won { background: rgba(0,255,136,0.04); }
.log-row.status-lost { background: rgba(255,71,87,0.04); }
.log-row.status-placed { background: rgba(0,196,255,0.03); }
.log-row.status-auto-paused { background: rgba(255,184,0,0.06); }
.log-source {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@keyframes rowIn {
  from { opacity: 0; transform: translateX(-4px); }
  to { opacity: 1; transform: translateX(0); }
}

/* ---------- Empty / Modal / Footer ---------------------------------- */
.empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center;
  padding: 60px 20px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  color: var(--muted);
  gap: 8px;
}
.empty.small { padding: 30px 10px; }
.empty-icon {
  width: 48px; height: 48px;
  display: grid; place-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
}
.empty-title { font-size: 13px; color: var(--text); font-weight: 600; }
.empty-hint { font-size: 11px; }

.modal-bg {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(4px);
  display: grid; place-items: center;
  z-index: 50;
  animation: fade 0.16s ease-out;
}
.modal {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  max-width: 420px;
  width: calc(100% - 32px);
  display: flex; flex-direction: column;
  gap: 12px;
  text-align: center;
}
.modal-icon {
  width: 56px; height: 56px;
  margin: 0 auto;
  display: grid; place-items: center;
  border-radius: 50%;
  border: 1px solid;
}
.modal-icon.warn { color: var(--yellow); border-color: var(--yellow); background: var(--yellow-dim); }
.modal h3 { margin: 4px 0; font-size: 16px; letter-spacing: 0.4px; }
.modal-actions {
  display: flex; justify-content: center; gap: 8px;
  margin-top: 8px;
}

.footer {
  padding: 14px 18px;
  border-top: 1px solid var(--border);
  font-size: 10px;
  letter-spacing: 0.6px;
  text-align: center;
}

/* ---------- Lock Screen --------------------------------------------- */
.lock-root {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background:
    radial-gradient(1200px 700px at 70% -10%, rgba(0, 196, 255, 0.08), transparent 60%),
    radial-gradient(1200px 700px at -10% 110%, rgba(0, 255, 136, 0.08), transparent 60%),
    var(--bg);
  z-index: 30;
  overflow: auto;
  padding: 20px;
}
.lock-bg {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(0deg, rgba(255,255,255,0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
  background-size: 32px 32px;
  pointer-events: none;
  mask-image: radial-gradient(ellipse at center, black 35%, transparent 75%);
}
.lock-card {
  position: relative;
  width: min(960px, 100%);
  background: linear-gradient(180deg, rgba(13,16,20,0.96), rgba(10,12,16,0.98));
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 22px 22px 20px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,255,136,0.06);
}
.lock-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.lock-ticker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.lock-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  padding-top: 16px;
}
.lock-pickers { display: flex; flex-direction: column; gap: 8px; }
.lock-section-title {
  font-size: 10px;
  letter-spacing: 1.6px;
}
.lock-wallet-list {
  display: flex; flex-direction: column; gap: 8px;
}
.lock-wallet-card {
  display: flex; flex-direction: column; gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 10px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.12s ease, background 0.12s ease;
  color: var(--fg);
}
.lock-wallet-card:hover { transform: translateY(-1px); }
.lock-wallet-card.active { box-shadow: 0 0 18px -6px currentColor; }
.lock-wallet-card-head { display: flex; align-items: center; gap: 8px; }
.lock-wallet-card-head .dot { width: 8px; height: 8px; border-radius: 999px; }
.lock-wallet-card.add {
  border-style: dashed;
  color: var(--muted);
  text-align: center;
  flex-direction: row;
  justify-content: center;
}
.lock-wallet-card.add:hover { color: var(--fg); border-color: var(--fg); }
.lock-form {
  display: flex; flex-direction: column; gap: 12px;
  padding: 16px;
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.lock-form-head { display: flex; align-items: center; gap: 8px; }
.lock-form-head h3 { margin: 0; font-size: 14px; letter-spacing: 0.5px; }
.lock-actions { display: flex; gap: 8px; }
.pwd-strength { display: flex; align-items: center; gap: 8px; }
.pwd-bar {
  flex: 1;
  height: 4px;
  background: rgba(255,255,255,0.06);
  border-radius: 999px;
  overflow: hidden;
}
.pwd-bar > span {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.18s ease, background 0.18s ease;
}
.form-err {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px;
  color: var(--red);
  background: rgba(255, 71, 87, 0.08);
  border: 1px solid rgba(255, 71, 87, 0.3);
  padding: 6px 8px;
  border-radius: 6px;
}
.form-ok {
  font-size: 11px;
  color: var(--green);
  background: rgba(0, 255, 136, 0.08);
  border: 1px solid rgba(0, 255, 136, 0.3);
  padding: 6px 8px;
  border-radius: 6px;
}
.warn-text { color: var(--warn); }

/* ---------- signed-in pill (header) --------------------------------- */
.cloud-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 6px;
  font-size: 9px;
  letter-spacing: 0.6px;
  border-radius: 4px;
  font-weight: 700;
  vertical-align: middle;
  border: 1px solid var(--border);
}
.cloud-badge.cloud-on { color: #001a0c; background: var(--green); border-color: var(--green); }
.cloud-badge.cloud-stale { color: var(--warn); background: rgba(255, 184, 0, 0.1); border-color: rgba(255, 184, 0, 0.4); }
.cloud-badge.cloud-probe { color: var(--blue); background: rgba(0, 196, 255, 0.1); border-color: rgba(0, 196, 255, 0.4); }
.cloud-badge.cloud-off { color: var(--muted); background: transparent; }

.signed-in {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgba(255,255,255,0.02);
}
.signed-in .dot { width: 7px; height: 7px; border-radius: 999px; }
.signed-in-name { font-size: 11px; font-weight: 700; letter-spacing: 0.4px; }
.icon-btn.small { padding: 3px; }

/* auth pill on lock-screen / wallet manager */
.auth-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 6px;
  font-size: 9px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  border-radius: 999px;
  border: 1px solid var(--border);
}
.auth-pill.protected { color: var(--blue); border-color: rgba(0, 196, 255, 0.4); background: rgba(0, 196, 255, 0.08); }
.auth-pill.open { color: var(--warn); border-color: rgba(255, 184, 0, 0.4); background: rgba(255, 184, 0, 0.08); }
.auth-pill.me { color: var(--green); border-color: rgba(0, 255, 136, 0.4); background: rgba(0, 255, 136, 0.1); }

.me-pill {
  display: inline-block;
  padding: 0 4px;
  font-size: 8px;
  letter-spacing: 0.6px;
  background: var(--green);
  color: #001a0c;
  border-radius: 3px;
  font-weight: 800;
}

.lock-badge {
  display: inline-flex; align-items: center; gap: 4px;
  margin-left: auto;
}

.wallet-mgr-row.me {
  border-color: rgba(0, 255, 136, 0.35);
  background: rgba(0, 255, 136, 0.04);
}

/* ---------- Wallet strip (header) ----------------------------------- */
.wallet-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, #0d1014, #0a0c10);
  overflow-x: auto;
  scrollbar-width: thin;
}
.wallet-strip-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  white-space: nowrap;
  margin-right: 4px;
}
.wallet-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg);
  border-radius: 999px;
  cursor: pointer;
  font-size: 11px;
  letter-spacing: 0.4px;
  white-space: nowrap;
  transition: transform 0.12s ease, background 0.12s ease;
}
.wallet-pill:hover { transform: translateY(-1px); }
.wallet-pill.active {
  box-shadow: 0 0 0 1px currentColor inset, 0 0 14px -4px currentColor;
}
.wallet-pill.all {
  color: var(--fg);
  border-color: var(--border);
}
.wallet-pill.all.active { background: rgba(255,255,255,0.05); }
.wallet-pill .dot { width: 7px; height: 7px; border-radius: 999px; }
.wallet-pill-label { font-weight: 700; }
.wallet-pill-bal { font-size: 11px; opacity: 0.95; }
.wallet-pill-pnl { font-size: 10px; }
.wallet-pill-items { font-size: 10px; }
.wallet-pill.add {
  border-style: dashed;
  color: var(--muted);
}
.wallet-pill.add:hover { color: var(--fg); border-color: var(--fg); }

/* ---------- Wallet pill (inline on cards/log/table) ----------------- */
.wallet-pill-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  border: 1px solid;
  border-radius: 999px;
  font-size: 10px;
  letter-spacing: 0.3px;
  white-space: nowrap;
  font-weight: 600;
}
.wallet-pill-inline .dot { width: 5px; height: 5px; border-radius: 999px; }

/* ---------- Wallet manager modal ------------------------------------ */
.wallet-mgr {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: min(720px, 92vw);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 18px;
  color: var(--fg);
}
.wallet-mgr-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.wallet-mgr-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 60vh;
  overflow-y: auto;
}
.wallet-mgr-row {
  display: grid;
  grid-template-columns: 24px 1fr 1.4fr 100px auto auto auto;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.wallet-mgr-row .input { padding: 5px 8px; font-size: 12px; }
.wallet-mgr-count { white-space: nowrap; }
.color-swatch {
  width: 22px; height: 22px;
  border-radius: 6px;
  border: 1px solid var(--border);
  cursor: pointer;
}
.wallet-mgr-foot {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

/* ---------- Per-wallet portfolio panel ------------------------------ */
.wallet-port-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  padding: 14px;
}
.wallet-port-card {
  background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wallet-port-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.wallet-port-head .dot { width: 7px; height: 7px; border-radius: 999px; }
.wallet-port-balance {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  background: rgba(255,255,255,0.02);
  border-radius: 6px;
}
.wallet-port-balance .balance-amount { font-size: 18px; }
.wallet-port-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

/* ---------- Responsive ---------------------------------------------- */
@media (max-width: 900px) {
  .header { gap: 10px; padding: 10px 12px; }
  .ticker { order: 5; width: 100%; flex: 0 0 100%; }
  .balance-block { padding: 4px 8px; border-left: none; border-top: 1px solid var(--border); }
  .header-right { width: 100%; justify-content: space-between; }
  .wallet-input input { width: 140px; }
  .cards-grid { grid-template-columns: 1fr; }
  .form-row.split { grid-template-columns: 1fr; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .log-head, .log-row {
    grid-template-columns: 56px 64px 40px 40px 26px 44px 52px 52px 60px 60px 1fr;
    font-size: 10px;
  }
  .log-source { display: none; }
  .tag-mgr-row {
    grid-template-columns: 1fr 1fr;
    gap: 6px 12px;
  }
  .tag-mgr-row.head { display: none; }
  .tag-mgr-row > span:nth-child(1) { grid-column: span 2; border-bottom: 1px dashed var(--border); padding-bottom: 4px; }
  .wallet-mgr-row {
    grid-template-columns: 24px 1fr 1fr;
    gap: 6px 8px;
  }
  .wallet-mgr-row > :nth-child(4),
  .wallet-mgr-row > :nth-child(5),
  .wallet-mgr-row > :nth-child(6),
  .wallet-mgr-row > :nth-child(7) {
    grid-column: span 3;
    justify-self: stretch;
  }
  .lock-grid { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .content { padding: 12px; }
  .card-stats { grid-template-columns: repeat(2, 1fr); }
  .stats-grid { grid-template-columns: 1fr; }
  .balance-amount { font-size: 16px; }
  .log-head, .log-row {
    grid-template-columns: 56px 70px 1fr 56px 60px 60px 60px;
  }
  .log-row > :nth-child(3),
  .log-head > :nth-child(3) { display: none; }
  .log-row > :nth-child(5),
  .log-head > :nth-child(5) { display: none; }
  .log-row > :nth-child(6),
  .log-head > :nth-child(6) { display: none; }
  .log-source { display: none; }
}
`;
