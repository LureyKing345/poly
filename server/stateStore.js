// Demo-only shared state. Persists to a JSON file alongside the server.
// All passwords are stored as { hash, salt } pairs and never sent to clients.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_PATH = process.env.STATE_PATH || path.join(__dirname, 'state.json');
const MAX_LOG_LINES = 500;

function uid() {
  return crypto.randomBytes(5).toString('hex');
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function fmtDay(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ---------- password hashing (PBKDF2, demo-grade but real) ----------- */
export function newSalt() {
  return crypto.randomBytes(16).toString('hex');
}
export function hashPwd(password, salt) {
  return crypto
    .pbkdf2Sync(password || '', salt || '', 50_000, 32, 'sha256')
    .toString('hex');
}
export function verifyPwd(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const got = hashPwd(password, salt);
  // length-safe equality
  if (got.length !== expectedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expectedHash));
}

/* ---------- defaults / seed ----------------------------------------- */
const COIN_DEFAULTS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'HYPE', 'BNB'];

const seedTags = () => [
  { id: 't_sniper', name: 'Sniper', color: '#00ff88', profitTarget: 25, lossLimit: 15, triggered: null },
  { id: 't_scalp', name: 'Scalp', color: '#00c4ff', profitTarget: null, lossLimit: 20, triggered: null },
  { id: 't_whales', name: 'Copy Whales', color: '#a855f7', profitTarget: 50, lossLimit: 30, triggered: null },
];

const seedWallets = () => [
  { id: 'w_alice', label: 'Trader A', address: '0x1aA1bC2dD3eE4fF5aA6bB7cC8dD9eE0fF1aB2c9d', color: '#00ff88', demoBalance: 1000, startingBalance: 1000, passwordHash: null, passwordSalt: null, createdAt: Date.now() },
  { id: 'w_bob', label: 'Trader B', address: '0x2bB2cD3eE4fF5aA6bB7cC8dD9eE0fF1aA2b3c4e7', color: '#00c4ff', demoBalance: 1000, startingBalance: 1000, passwordHash: null, passwordSalt: null, createdAt: Date.now() },
  { id: 'w_chad', label: 'Trader C', address: '0x3cC3dE4fF5aA6bB7cC8dD9eE0fF1aA2b3c4d5f8a', color: '#ffb800', demoBalance: 1000, startingBalance: 1000, passwordHash: null, passwordSalt: null, createdAt: Date.now() },
];

const baseStrategy = () => ({
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
  fires: 0,
  wins: 0,
  losses: 0,
  pnl: 0,
  budgetSpent: 0,
  firesToday: 0,
  firesTodayKey: todayKey(),
  autoPaused: false,
});

const baseCopy = () => ({
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

const seedStrategies = () => [
  { ...baseStrategy(), id: 's_btc_sniper', label: 'BTC Sniper', walletId: 'w_alice', tagIds: ['t_sniper'], coins: ['BTC'], timeframe: '5MIN', direction: 'UP', buyFrom: '04:00', buyUntil: '04:30', priceMin: 78, priceMax: 92, perTrade: 1, totalBudget: 50, fires: 0, wins: 0, losses: 0, pnl: 0, budgetSpent: 0 },
  { ...baseStrategy(), id: 's_eth_scalp', label: 'ETH Scalp', walletId: 'w_bob', tagIds: ['t_scalp'], coins: ['ETH'], timeframe: '15MIN', direction: 'DOWN', buyFrom: '14:00', buyUntil: '14:45', priceMin: 65, priceMax: 85, perTrade: 2, totalBudget: 100, fires: 0, wins: 0, losses: 0, pnl: 0, budgetSpent: 0 },
  { ...baseStrategy(), id: 's_sol_swing', label: 'SOL Swing', walletId: 'w_chad', tagIds: ['t_sniper', 't_scalp'], coins: ['SOL', 'HYPE'], timeframe: '1HOUR', direction: 'UP', buyFrom: '55:00', buyUntil: '59:30', priceMin: 60, priceMax: 80, perTrade: 1.5, totalBudget: 75, status: 'PAUSED', fires: 0, wins: 0, losses: 0, pnl: 0, budgetSpent: 0 },
];

const seedCopies = () => [
  { ...baseCopy(), id: 'c_alpha', walletId: 'w_alice', walletAddress: '0x4f8b2a91c0d3e6f7a8b9c0d1e2f3a4b5c6d78a2', label: 'AlphaWhale', tagIds: ['t_whales'], sizeMode: 'PERCENTAGE', sizePct: 5, maxTradesPerMarket: 2, priceMode: 'SLIPPAGE', slippage: 2, timeframes: ['5MIN', '15MIN', '1HOUR'], coins: ['BTC', 'ETH', 'SOL'], totalBudget: 200 },
  { ...baseCopy(), id: 'c_degen', walletId: 'w_bob', walletAddress: '0x9c2e1f5d3a4b6c7d8e9f0a1b2c3d4e5f6a7b8c9d', label: 'DegenKing', tagIds: ['t_whales'], sizeMode: 'FIXED', sizeFixed: 1, maxTradesPerMarket: 1, priceMode: 'EXACT', slippage: 0, timeframes: ['5MIN'], coins: ['BTC', 'DOGE', 'HYPE'], totalBudget: 60 },
];

function freshState() {
  return {
    version: 3,
    mode: 'DEMO',
    wallets: seedWallets(),
    activeWalletId: null,
    tags: seedTags(),
    strategies: seedStrategies(),
    copies: seedCopies(),
    logs: [],
    dailyPnl: [],
    soundOn: true,
    polyPrices: {},
    apiStatus: 'idle',
    // Telegram session state: walletId per chat (so each Telegram user can choose a wallet)
    telegramSessions: {}, // chatId -> { walletId, signedIn: bool }
    updatedAt: Date.now(),
  };
}

/* ---------- file IO ------------------------------------------------- */
let state = null;
let saveTimer = null;
let dirty = false;

function safeReadJson(p) {
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[state] failed to read', p, e.message);
    return null;
  }
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function load() {
  if (state) return state;
  const onDisk = safeReadJson(STATE_PATH);
  if (onDisk && onDisk.wallets) {
    state = onDisk;
    // forward-compat tweaks: ensure required fields
    state.telegramSessions = state.telegramSessions || {};
    state.dailyPnl = state.dailyPnl || [];
    state.logs = state.logs || [];
    state.polyPrices = state.polyPrices || {};
    state.apiStatus = state.apiStatus || 'idle';
  } else {
    state = freshState();
    persistNow();
  }
  return state;
}

function persistNow() {
  if (!state) return;
  ensureDir(STATE_PATH);
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  dirty = false;
}

export function persist() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (dirty) persistNow();
  }, 500);
}

export function getState() {
  if (!state) load();
  return state;
}

export function setState(mutator) {
  if (!state) load();
  mutator(state);
  state.updatedAt = Date.now();
  persist();
  return state;
}

/* ---------- public-safe view (no password hashes) ------------------- */
export function publicView(s = getState()) {
  return {
    version: s.version,
    mode: s.mode,
    wallets: s.wallets.map(stripWalletSecrets),
    activeWalletId: s.activeWalletId,
    tags: s.tags,
    strategies: s.strategies,
    copies: s.copies,
    logs: s.logs.slice(0, 200),
    dailyPnl: s.dailyPnl,
    soundOn: s.soundOn,
    polyPrices: s.polyPrices,
    apiStatus: s.apiStatus,
    updatedAt: s.updatedAt,
  };
}

export function stripWalletSecrets(w) {
  const { passwordHash, passwordSalt, ...rest } = w;
  return { ...rest, hasPassword: !!passwordHash };
}

/* ---------- log helpers --------------------------------------------- */
export function pushLog(entry) {
  setState((s) => {
    s.logs.unshift({ id: uid(), ts: Date.now(), ...entry });
    if (s.logs.length > MAX_LOG_LINES) s.logs.length = MAX_LOG_LINES;
  });
}

export function bumpDailyPnl(delta) {
  const k = todayKey();
  setState((s) => {
    const idx = s.dailyPnl.findIndex((d) => d.key === k);
    if (idx >= 0) s.dailyPnl[idx].pnl = +(s.dailyPnl[idx].pnl + delta).toFixed(4);
    else s.dailyPnl.push({ key: k, day: fmtDay(Date.now()), pnl: delta, ts: Date.now() });
  });
}

/* ---------- exports for engine ------------------------------------- */
export {
  uid,
  todayKey,
  baseStrategy,
  baseCopy,
  COIN_DEFAULTS,
  STATE_PATH,
};
