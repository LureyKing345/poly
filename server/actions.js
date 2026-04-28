// All write operations go through here. Both the REST API and the Telegram
// bot dispatch actions, so logic stays in one place.
import {
  getState,
  setState,
  pushLog,
  uid,
  todayKey,
  baseStrategy,
  baseCopy,
  newSalt,
  hashPwd,
  verifyPwd,
} from './stateStore.js';

const WALLET_COLORS = ['#00ff88', '#00c4ff', '#ffb800', '#a855f7', '#ec4899', '#22d3ee', '#f97316', '#ff4757'];

function ensureUniqueId(prefix, existing) {
  let id = `${prefix}${uid()}`;
  while (existing.some((x) => x.id === id)) id = `${prefix}${uid()}`;
  return id;
}

/* ---------- mode --------------------------------------------------- */
export function setMode(mode) {
  if (mode !== 'DEMO' && mode !== 'LIVE') return { ok: false, error: 'invalid mode' };
  setState((s) => { s.mode = mode; });
  return { ok: true };
}

/* ---------- wallets ------------------------------------------------ */
export function addWallet(patch = {}) {
  const s = getState();
  if (s.wallets.length >= 8) return { ok: false, error: 'wallet limit (8) reached' };
  const i = s.wallets.length;
  const w = {
    id: ensureUniqueId('w_', s.wallets),
    label: patch.label || `Trader ${i + 1}`,
    address: patch.address || '',
    color: patch.color || WALLET_COLORS[i % WALLET_COLORS.length],
    demoBalance: 1000,
    startingBalance: 1000,
    passwordHash: null,
    passwordSalt: null,
    createdAt: Date.now(),
  };
  setState((st) => { st.wallets.push(w); });
  return { ok: true, wallet: w };
}

export function updateWallet(walletId, patch, actor) {
  const s = getState();
  const w = s.wallets.find((x) => x.id === walletId);
  if (!w) return { ok: false, error: 'wallet not found' };
  // Only the owner (signed-in via password) or wallets with no password yet
  // can be edited. Telegram sessions count as signed-in for their wallet.
  if (w.passwordHash && actor !== walletId) return { ok: false, error: 'not your wallet' };
  setState((st) => {
    const x = st.wallets.find((y) => y.id === walletId);
    if (!x) return;
    if (patch.label !== undefined) x.label = patch.label;
    if (patch.address !== undefined) x.address = patch.address;
    if (patch.color !== undefined) x.color = patch.color;
    if (patch.demoBalance !== undefined) x.demoBalance = +patch.demoBalance;
  });
  return { ok: true };
}

export function removeWallet(walletId, actor) {
  const s = getState();
  if (s.wallets.length <= 1) return { ok: false, error: 'must keep at least one wallet' };
  const target = s.wallets.find((x) => x.id === walletId);
  if (!target) return { ok: false, error: 'wallet not found' };
  if (target.passwordHash && actor !== walletId) return { ok: false, error: 'not your wallet' };
  const fallback = s.wallets.find((x) => x.id !== walletId)?.id || null;
  setState((st) => {
    st.strategies = st.strategies.map((x) => x.walletId === walletId ? { ...x, walletId: fallback } : x);
    st.copies = st.copies.map((x) => x.walletId === walletId ? { ...x, walletId: fallback } : x);
    st.wallets = st.wallets.filter((x) => x.id !== walletId);
    if (st.activeWalletId === walletId) st.activeWalletId = null;
    // Clear Telegram sessions pointing at this wallet
    for (const k of Object.keys(st.telegramSessions)) {
      if (st.telegramSessions[k]?.walletId === walletId) delete st.telegramSessions[k];
    }
  });
  return { ok: true };
}

export function setActiveWalletId(walletId) {
  setState((s) => {
    if (walletId && !s.wallets.some((w) => w.id === walletId)) return;
    s.activeWalletId = walletId;
  });
  return { ok: true };
}

/* ---------- auth (passwords) -------------------------------------- */
export function registerWalletPassword(walletId, password) {
  const s = getState();
  const w = s.wallets.find((x) => x.id === walletId);
  if (!w) return { ok: false, error: 'wallet not found' };
  if (w.passwordHash) return { ok: false, error: 'password already set — use change-password' };
  if (!password || password.length < 6) return { ok: false, error: 'password must be at least 6 characters' };
  const salt = newSalt();
  const hash = hashPwd(password, salt);
  setState((st) => {
    const x = st.wallets.find((y) => y.id === walletId);
    if (!x) return;
    x.passwordHash = hash;
    x.passwordSalt = salt;
  });
  return { ok: true };
}

export function checkPassword(walletId, password) {
  const s = getState();
  const w = s.wallets.find((x) => x.id === walletId);
  if (!w) return { ok: false, error: 'wallet not found' };
  if (!w.passwordHash) return { ok: false, error: 'no password set — register first' };
  if (!verifyPwd(password, w.passwordSalt, w.passwordHash)) return { ok: false, error: 'wrong password' };
  return { ok: true };
}

export function changePassword(walletId, oldPwd, newPwd) {
  const s = getState();
  const w = s.wallets.find((x) => x.id === walletId);
  if (!w) return { ok: false, error: 'wallet not found' };
  if (w.passwordHash && !verifyPwd(oldPwd, w.passwordSalt, w.passwordHash)) {
    return { ok: false, error: 'wrong current password' };
  }
  if (!newPwd || newPwd.length < 6) return { ok: false, error: 'new password must be at least 6 characters' };
  const salt = newSalt();
  const hash = hashPwd(newPwd, salt);
  setState((st) => {
    const x = st.wallets.find((y) => y.id === walletId);
    if (!x) return;
    x.passwordHash = hash;
    x.passwordSalt = salt;
  });
  return { ok: true };
}

/* ---------- strategies -------------------------------------------- */
function isOwner(walletId, actor) {
  return actor && walletId === actor;
}

export function upsertStrategy(strategy, actor) {
  const s = getState();
  const idx = s.strategies.findIndex((x) => x.id === strategy.id);
  if (idx === -1) {
    const next = {
      ...baseStrategy(),
      ...strategy,
      id: strategy.id || ensureUniqueId('s_', s.strategies),
      walletId: actor || strategy.walletId,
      firesTodayKey: todayKey(),
    };
    if (!next.walletId) return { ok: false, error: 'walletId required' };
    setState((st) => { st.strategies.unshift(next); });
    return { ok: true, strategy: next };
  }
  const prev = s.strategies[idx];
  if (!isOwner(prev.walletId, actor)) return { ok: false, error: 'not your strategy' };
  const merged = { ...prev, ...strategy, walletId: prev.walletId, id: prev.id };
  setState((st) => { st.strategies[idx] = merged; });
  return { ok: true, strategy: merged };
}

export function removeStrategy(id, actor) {
  const s = getState();
  const target = s.strategies.find((x) => x.id === id);
  if (!target) return { ok: false, error: 'strategy not found' };
  if (!isOwner(target.walletId, actor)) return { ok: false, error: 'not your strategy' };
  setState((st) => { st.strategies = st.strategies.filter((x) => x.id !== id); });
  return { ok: true };
}

export function duplicateStrategy(id, actor) {
  const s = getState();
  const src = s.strategies.find((x) => x.id === id);
  if (!src) return { ok: false, error: 'strategy not found' };
  if (!isOwner(src.walletId, actor)) return { ok: false, error: 'not your strategy' };
  const clone = {
    ...src,
    id: ensureUniqueId('s_', s.strategies),
    label: src.label + ' (copy)',
    fires: 0,
    wins: 0,
    losses: 0,
    pnl: 0,
    budgetSpent: 0,
    firesToday: 0,
    autoPaused: false,
    status: 'PAUSED',
  };
  setState((st) => { st.strategies.unshift(clone); });
  return { ok: true, strategy: clone };
}

export function toggleStrategyStatus(id, actor) {
  const s = getState();
  const target = s.strategies.find((x) => x.id === id);
  if (!target) return { ok: false, error: 'strategy not found' };
  if (!isOwner(target.walletId, actor)) return { ok: false, error: 'not your strategy' };
  setState((st) => {
    const t = st.strategies.find((x) => x.id === id);
    if (!t) return;
    if (t.status === 'PAUSED' && t.tagIds?.length) {
      const ids = new Set(t.tagIds);
      st.tags = st.tags.map((tag) => (ids.has(tag.id) ? { ...tag, triggered: null } : tag));
    }
    t.status = t.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    t.autoPaused = false;
  });
  return { ok: true };
}

/* ---------- copies ------------------------------------------------ */
export function upsertCopy(copy, actor) {
  const s = getState();
  const idx = s.copies.findIndex((x) => x.id === copy.id);
  if (idx === -1) {
    const next = {
      ...baseCopy(),
      ...copy,
      id: copy.id || ensureUniqueId('c_', s.copies),
      walletId: actor || copy.walletId,
    };
    if (!next.walletId) return { ok: false, error: 'walletId required' };
    setState((st) => { st.copies.unshift(next); });
    return { ok: true, copy: next };
  }
  const prev = s.copies[idx];
  if (!isOwner(prev.walletId, actor)) return { ok: false, error: 'not your copy' };
  const merged = { ...prev, ...copy, walletId: prev.walletId, id: prev.id };
  setState((st) => { st.copies[idx] = merged; });
  return { ok: true, copy: merged };
}

export function removeCopy(id, actor) {
  const s = getState();
  const target = s.copies.find((x) => x.id === id);
  if (!target) return { ok: false, error: 'copy not found' };
  if (!isOwner(target.walletId, actor)) return { ok: false, error: 'not your copy' };
  setState((st) => { st.copies = st.copies.filter((x) => x.id !== id); });
  return { ok: true };
}

export function toggleCopyStatus(id, actor) {
  const s = getState();
  const target = s.copies.find((x) => x.id === id);
  if (!target) return { ok: false, error: 'copy not found' };
  if (!isOwner(target.walletId, actor)) return { ok: false, error: 'not your copy' };
  setState((st) => {
    const t = st.copies.find((x) => x.id === id);
    if (!t) return;
    if (t.status === 'PAUSED' && t.tagIds?.length) {
      const ids = new Set(t.tagIds);
      st.tags = st.tags.map((tag) => (ids.has(tag.id) ? { ...tag, triggered: null } : tag));
    }
    t.status = t.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    t.autoPaused = false;
  });
  return { ok: true };
}

/* ---------- tags --------------------------------------------------- */
const TAGS_PALETTE = ['#00ff88', '#00c4ff', '#ff4757', '#ffb800', '#a855f7', '#ec4899', '#22d3ee', '#f97316'];

export function addTag(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return { ok: false, error: 'name required' };
  const s = getState();
  const existing = s.tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return { ok: true, tag: existing };
  const tag = {
    id: 'tag_' + uid(),
    name: trimmed,
    color: TAGS_PALETTE[s.tags.length % TAGS_PALETTE.length],
    profitTarget: null,
    lossLimit: null,
    triggered: null,
  };
  setState((st) => { st.tags.push(tag); });
  return { ok: true, tag };
}

export function updateTag(id, patch) {
  setState((s) => {
    const t = s.tags.find((x) => x.id === id);
    if (!t) return;
    if (patch.name !== undefined) t.name = patch.name;
    if (patch.color !== undefined) t.color = patch.color;
    if (patch.profitTarget !== undefined) t.profitTarget = patch.profitTarget == null || patch.profitTarget === '' ? null : +patch.profitTarget;
    if (patch.lossLimit !== undefined) t.lossLimit = patch.lossLimit == null || patch.lossLimit === '' ? null : +patch.lossLimit;
    if (patch.triggered !== undefined) t.triggered = patch.triggered;
  });
  return { ok: true };
}

export function removeTag(id) {
  setState((s) => {
    s.tags = s.tags.filter((x) => x.id !== id);
    s.strategies = s.strategies.map((x) => ({ ...x, tagIds: (x.tagIds || []).filter((t) => t !== id) }));
    s.copies = s.copies.map((x) => ({ ...x, tagIds: (x.tagIds || []).filter((t) => t !== id) }));
  });
  return { ok: true };
}

export function resumeTag(id) {
  setState((s) => {
    const t = s.tags.find((x) => x.id === id);
    if (!t) return;
    t.triggered = null;
    // Resume any auto-paused items wearing this tag.
    for (const x of s.strategies) {
      if ((x.tagIds || []).includes(id) && x.autoPaused) {
        x.status = 'ACTIVE';
        x.autoPaused = false;
      }
    }
    for (const x of s.copies) {
      if ((x.tagIds || []).includes(id) && x.autoPaused) {
        x.status = 'ACTIVE';
        x.autoPaused = false;
      }
    }
  });
  return { ok: true };
}

/* ---------- demo balance ------------------------------------------ */
export function resetDemoBalance(walletId, actor) {
  const s = getState();
  if (walletId === 'all') {
    setState((st) => {
      for (const w of st.wallets) {
        w.demoBalance = w.startingBalance ?? 1000;
      }
      for (const x of st.strategies) { x.fires = 0; x.wins = 0; x.losses = 0; x.pnl = 0; x.budgetSpent = 0; x.firesToday = 0; x.autoPaused = false; }
      for (const x of st.copies) { x.trades = 0; x.wins = 0; x.losses = 0; x.pnl = 0; x.budgetSpent = 0; x.autoPaused = false; }
      st.dailyPnl = [];
      st.logs = [];
    });
    return { ok: true };
  }
  const w = s.wallets.find((x) => x.id === walletId);
  if (!w) return { ok: false, error: 'wallet not found' };
  if (w.passwordHash && actor !== walletId) return { ok: false, error: 'not your wallet' };
  setState((st) => {
    const x = st.wallets.find((y) => y.id === walletId);
    if (!x) return;
    x.demoBalance = x.startingBalance ?? 1000;
    for (const z of st.strategies) {
      if (z.walletId !== walletId) continue;
      z.fires = 0; z.wins = 0; z.losses = 0; z.pnl = 0; z.budgetSpent = 0; z.firesToday = 0; z.autoPaused = false;
    }
    for (const z of st.copies) {
      if (z.walletId !== walletId) continue;
      z.trades = 0; z.wins = 0; z.losses = 0; z.pnl = 0; z.budgetSpent = 0; z.autoPaused = false;
    }
  });
  return { ok: true };
}

/* ---------- telegram session ------------------------------------- */
export function setTelegramWallet(chatId, walletId) {
  const s = getState();
  if (!s.wallets.some((w) => w.id === walletId)) return { ok: false, error: 'wallet not found' };
  setState((st) => {
    const cur = st.telegramSessions[chatId] || {};
    st.telegramSessions[chatId] = { ...cur, walletId };
  });
  return { ok: true };
}

export function getTelegramWallet(chatId) {
  const s = getState();
  return s.telegramSessions[chatId]?.walletId || null;
}

export function clearTelegramSession(chatId) {
  setState((st) => { delete st.telegramSessions[chatId]; });
  return { ok: true };
}
