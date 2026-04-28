// Telegram bot — full demo control.
// Commands authenticate via password (per-wallet) and are restricted to a
// chat-id allowlist. Multi-step wizards live in `wizardState[chatId]`.
import TelegramBot from 'node-telegram-bot-api';
import { getState } from './stateStore.js';
import * as A from './actions.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ALLOW_RAW = process.env.TELEGRAM_ALLOWED_CHAT_IDS || '';
const ALLOWED = new Set(
  ALLOW_RAW.split(',').map((s) => s.trim()).filter(Boolean).map(String)
);

let bot = null;
const wizards = {}; // chatId -> { type, step, data }
const subscribers = new Set(); // chatIds that opted into alerts via /subscribe
const COIN_DEFAULTS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'HYPE', 'BNB'];
const TIMEFRAMES = ['5MIN', '15MIN', '1HOUR', '4HOUR'];

/* ---------- helpers ----------------------------------------------- */
function isAllowed(chatId) {
  if (ALLOWED.size === 0) return true; // open mode (single tenant); strongly recommend setting allowlist
  return ALLOWED.has(String(chatId));
}

function fmtUSD(n) {
  if (!Number.isFinite(n)) return '$0.00';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}
function fmtPnl(n) {
  if (!Number.isFinite(n)) return '$0.00';
  return `${n >= 0 ? '+' : ''}${fmtUSD(n)}`;
}
function shortAddr(a) {
  if (!a) return '';
  return a.length <= 12 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}
function escMd(s) {
  if (s == null) return '';
  return String(s).replace(/[_*`\[\]]/g, '\\$&');
}

function getActor(chatId) {
  const sess = getState().telegramSessions[chatId];
  return sess?.signedIn ? sess.walletId : null;
}

function ensureSignedIn(chatId) {
  const actor = getActor(chatId);
  if (!actor) {
    bot.sendMessage(chatId, 'Sign in first: /signin <walletId> <password>\nUse /wallets to see wallet IDs.');
    return null;
  }
  return actor;
}

function findItem(id) {
  const s = getState();
  return (
    s.strategies.find((x) => x.id === id) ||
    s.copies.find((x) => x.id === id) ||
    null
  );
}

function itemKind(item) {
  if (!item) return null;
  return getState().strategies.includes(item) ? 'AUTO' : 'COPY';
}

/* ---------- broadcast (alerts) ------------------------------------ */
export function broadcast(msg, opts = {}) {
  if (!bot) return;
  for (const chatId of subscribers) {
    bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', ...opts }).catch(() => {});
  }
}

/* ---------- command handlers -------------------------------------- */
function cmdStart(chatId) {
  bot.sendMessage(
    chatId,
    [
      '*Polymarket AutoTrader — Demo Bot*',
      '',
      'This is a paper-trading sandbox. No real funds.',
      '',
      'Quick start:',
      '1\\. `/wallets` to see available trader IDs',
      '2\\. `/register <walletId> <password>` (first time)',
      '3\\. `/signin <walletId> <password>`',
      '4\\. `/subscribe` to receive trade alerts',
      '5\\. `/help` for the full command list',
    ].join('\n'),
    { parse_mode: 'MarkdownV2' }
  );
}

function cmdHelp(chatId) {
  bot.sendMessage(
    chatId,
    [
      '*Available commands*',
      '',
      'Auth:',
      '  /wallets — list wallets',
      '  /register <walletId> <password>',
      '  /signin <walletId> <password>',
      '  /signout',
      '  /whoami',
      '',
      'Status:',
      '  /status — overall PnL + counts',
      '  /balance — per-wallet balances',
      '  /report today — today PnL & win rate',
      '  /logs [n] — last n events (default 10)',
      '',
      'Strategies:',
      '  /strategies — list',
      '  /pause <id>',
      '  /resume <id>',
      '  /clone <id>',
      '  /delete <id>',
      '  /newstrategy — guided wizard',
      '',
      'Copy trades:',
      '  /copies — list',
      '  /newcopy — guided wizard',
      '',
      'Tags:',
      '  /tags — list with limits',
      '  /settag <tagId> profit <amount>',
      '  /settag <tagId> loss <amount>',
      '  /resumetag <tagId>',
      '',
      'Demo:',
      '  /resetdemo [walletId|all]',
      '  /subscribe — receive alerts',
      '  /unsubscribe — stop alerts',
      '  /cancel — cancel any wizard',
    ].join('\n'),
    { parse_mode: 'Markdown' }
  );
}

function cmdWallets(chatId) {
  const s = getState();
  const lines = ['*Wallets*', ''];
  for (const w of s.wallets) {
    const counts = {
      st: s.strategies.filter((x) => x.walletId === w.id).length,
      cp: s.copies.filter((x) => x.walletId === w.id).length,
    };
    const pwd = w.passwordHash ? '🔒' : '🆕';
    lines.push(`${pwd} \`${w.id}\` *${escMd(w.label)}* — ${fmtUSD(w.demoBalance)} · ${counts.st}s / ${counts.cp}c`);
  }
  lines.push('', 'Use `/register <walletId> <password>` (🆕) or `/signin <walletId> <password>` (🔒)');
  bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

function cmdRegister(chatId, args) {
  const [walletId, password] = args;
  if (!walletId || !password) return bot.sendMessage(chatId, 'Usage: /register <walletId> <password>');
  const r = A.registerWalletPassword(walletId, password);
  if (!r.ok) return bot.sendMessage(chatId, `❌ ${r.error}`);
  // Auto sign-in after register
  A.setTelegramWallet(chatId, walletId);
  getState().telegramSessions[chatId].signedIn = true;
  bot.sendMessage(chatId, `✅ Registered & signed in as \`${walletId}\``, { parse_mode: 'Markdown' });
}

function cmdSignin(chatId, args) {
  const [walletId, password] = args;
  if (!walletId || !password) return bot.sendMessage(chatId, 'Usage: /signin <walletId> <password>');
  const r = A.checkPassword(walletId, password);
  if (!r.ok) return bot.sendMessage(chatId, `❌ ${r.error}`);
  A.setTelegramWallet(chatId, walletId);
  getState().telegramSessions[chatId].signedIn = true;
  bot.sendMessage(chatId, `✅ Signed in as \`${walletId}\``, { parse_mode: 'Markdown' });
}

function cmdSignout(chatId) {
  A.clearTelegramSession(chatId);
  bot.sendMessage(chatId, 'Signed out. /signin to log back in.');
}

function cmdWhoami(chatId) {
  const actor = getActor(chatId);
  if (!actor) return bot.sendMessage(chatId, 'Not signed in.');
  const w = getState().wallets.find((x) => x.id === actor);
  if (!w) return bot.sendMessage(chatId, 'Not signed in.');
  bot.sendMessage(chatId, `Signed in as *${escMd(w.label)}* (\`${w.id}\`)\nBalance: ${fmtUSD(w.demoBalance)}`, { parse_mode: 'Markdown' });
}

function cmdStatus(chatId) {
  const s = getState();
  const totalPnl = [...s.strategies, ...s.copies].reduce((a, x) => a + (x.pnl || 0), 0);
  const activeS = s.strategies.filter((x) => x.status === 'ACTIVE').length;
  const activeC = s.copies.filter((x) => x.status === 'ACTIVE').length;
  const totalBal = s.wallets.reduce((a, w) => a + (w.demoBalance || 0), 0);
  const lines = [
    `*Status* (${s.mode})`,
    `Total balance: ${fmtUSD(totalBal)} across ${s.wallets.length} wallet(s)`,
    `Total PnL: ${fmtPnl(totalPnl)}`,
    `Active: ${activeS} strategies · ${activeC} copy-trades`,
    `API: ${s.apiStatus}`,
  ];
  bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

function cmdBalance(chatId) {
  const s = getState();
  const lines = ['*Wallet balances*', ''];
  for (const w of s.wallets) {
    const delta = (w.demoBalance || 0) - (w.startingBalance ?? 1000);
    lines.push(`*${escMd(w.label)}* (\`${w.id}\`) — ${fmtUSD(w.demoBalance)} (${fmtPnl(delta)})`);
  }
  bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

function cmdLogs(chatId, args) {
  const n = Math.max(1, Math.min(40, parseInt(args[0]) || 10));
  const logs = getState().logs.slice(0, n);
  if (!logs.length) return bot.sendMessage(chatId, 'No log entries yet.');
  const lines = ['*Last ' + logs.length + ' events*', ''];
  for (const l of logs) {
    const t = new Date(l.ts).toLocaleTimeString([], { hour12: false });
    if (l.coin) {
      const pnl = l.pnl != null ? ` ${fmtPnl(l.pnl)}` : '';
      lines.push(`\`${t}\` ${l.status} ${l.coin} ${l.direction || ''} ${l.timeframe || ''} @ ${l.entryPrice}¢ ${fmtUSD(l.amount || 0)}${pnl}`);
    } else {
      lines.push(`\`${t}\` ${l.status} — ${escMd(l.message || '')}`);
    }
  }
  bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

function cmdStrategies(chatId) {
  const actor = getActor(chatId);
  const s = getState();
  const all = s.strategies;
  if (!all.length) return bot.sendMessage(chatId, 'No strategies yet. /newstrategy to add one.');
  const lines = ['*Strategies*', ''];
  for (const x of all) {
    const mine = actor && x.walletId === actor ? '👤' : '  ';
    const dot = x.status === 'ACTIVE' ? '🟢' : '⏸';
    lines.push(`${mine} ${dot} \`${x.id}\` *${escMd(x.label)}* — ${x.coins.join(',')} ${x.direction} ${x.timeframe} · ${fmtPnl(x.pnl)}`);
  }
  lines.push('', '👤 = yours · 🟢 ACTIVE · ⏸ PAUSED');
  bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

function cmdCopies(chatId) {
  const actor = getActor(chatId);
  const s = getState();
  const all = s.copies;
  if (!all.length) return bot.sendMessage(chatId, 'No copy setups yet. /newcopy to add one.');
  const lines = ['*Copy setups*', ''];
  for (const x of all) {
    const mine = actor && x.walletId === actor ? '👤' : '  ';
    const dot = x.status === 'ACTIVE' ? '🟢' : '⏸';
    lines.push(`${mine} ${dot} \`${x.id}\` *${escMd(x.label)}* — ${shortAddr(x.walletAddress)} · ${fmtPnl(x.pnl)}`);
  }
  bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

function cmdToggle(chatId, args, expectActive) {
  const actor = ensureSignedIn(chatId);
  if (!actor) return;
  const id = args[0];
  if (!id) return bot.sendMessage(chatId, `Usage: /${expectActive ? 'pause' : 'resume'} <id>`);
  const item = findItem(id);
  if (!item) return bot.sendMessage(chatId, '❌ id not found');
  const kind = itemKind(item);
  const want = expectActive ? 'PAUSED' : 'ACTIVE';
  if (item.status === want) return bot.sendMessage(chatId, `Already ${want.toLowerCase()}.`);
  const r = kind === 'AUTO' ? A.toggleStrategyStatus(id, actor) : A.toggleCopyStatus(id, actor);
  if (!r.ok) return bot.sendMessage(chatId, `❌ ${r.error}`);
  bot.sendMessage(chatId, `✅ \`${id}\` is now ${want}`, { parse_mode: 'Markdown' });
}

function cmdClone(chatId, args) {
  const actor = ensureSignedIn(chatId);
  if (!actor) return;
  const id = args[0];
  if (!id) return bot.sendMessage(chatId, 'Usage: /clone <id>');
  const r = A.duplicateStrategy(id, actor);
  if (!r.ok) return bot.sendMessage(chatId, `❌ ${r.error}`);
  bot.sendMessage(chatId, `✅ Cloned to \`${r.strategy.id}\` (PAUSED)`, { parse_mode: 'Markdown' });
}

function cmdDelete(chatId, args) {
  const actor = ensureSignedIn(chatId);
  if (!actor) return;
  const id = args[0];
  if (!id) return bot.sendMessage(chatId, 'Usage: /delete <id>');
  const item = findItem(id);
  if (!item) return bot.sendMessage(chatId, '❌ id not found');
  const kind = itemKind(item);
  bot.sendMessage(chatId, `Delete \`${id}\` (${escMd(item.label || '')})? This cannot be undone.`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '❌ Confirm delete', callback_data: `del:${kind}:${id}` },
        { text: 'Cancel', callback_data: 'noop' },
      ]],
    },
  });
}

function cmdResetDemo(chatId, args) {
  const actor = ensureSignedIn(chatId);
  if (!actor) return;
  const target = args[0] || actor;
  bot.sendMessage(chatId, `Reset demo balance for \`${target}\`?`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '🔁 Confirm reset', callback_data: `reset:${target}` },
        { text: 'Cancel', callback_data: 'noop' },
      ]],
    },
  });
}

function cmdTags(chatId) {
  const s = getState();
  if (!s.tags.length) return bot.sendMessage(chatId, 'No tags.');
  const lines = ['*Tags*', ''];
  for (const t of s.tags) {
    const sList = s.strategies.filter((x) => (x.tagIds || []).includes(t.id));
    const cList = s.copies.filter((x) => (x.tagIds || []).includes(t.id));
    const agg = sList.reduce((a, x) => a + (x.pnl || 0), 0) + cList.reduce((a, x) => a + (x.pnl || 0), 0);
    const triggered = t.triggered ? ` ⚠ ${t.triggered.toUpperCase()}` : '';
    const profit = t.profitTarget != null ? `+${t.profitTarget}` : '—';
    const loss = t.lossLimit != null ? `-${t.lossLimit}` : '—';
    lines.push(`\`${t.id}\` *${escMd(t.name)}* — items: ${sList.length + cList.length} · agg ${fmtPnl(agg)} · target ${profit} · stop ${loss}${triggered}`);
  }
  bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

function cmdSetTag(chatId, args) {
  ensureSignedIn(chatId); // not strictly required for tag limits, but keeps audit trail
  const [tagId, kind, val] = args;
  if (!tagId || !kind || val == null) return bot.sendMessage(chatId, 'Usage: /settag <tagId> profit|loss <amount|null>');
  const num = val === 'null' || val === 'off' ? null : +val;
  const patch = kind === 'profit' ? { profitTarget: num } : kind === 'loss' ? { lossLimit: num } : null;
  if (!patch) return bot.sendMessage(chatId, 'kind must be profit or loss');
  const r = A.updateTag(tagId, patch);
  if (!r.ok) return bot.sendMessage(chatId, `❌ ${r.error}`);
  bot.sendMessage(chatId, `✅ tag updated`);
}

function cmdResumeTag(chatId, args) {
  const id = args[0];
  if (!id) return bot.sendMessage(chatId, 'Usage: /resumetag <tagId>');
  const r = A.resumeTag(id);
  if (!r.ok) return bot.sendMessage(chatId, `❌ ${r.error}`);
  bot.sendMessage(chatId, `✅ tag \`${id}\` cleared, items resumed`, { parse_mode: 'Markdown' });
}

function cmdReport(chatId, args) {
  const sub = (args[0] || 'today').toLowerCase();
  const s = getState();
  if (sub === 'today') {
    const k = `${new Date().getFullYear()}-${new Date().getMonth()}-${new Date().getDate()}`;
    const today = s.dailyPnl.find((d) => d.key === k);
    const fires = s.logs.filter((l) => l.status === 'PLACED' && new Date(l.ts).toDateString() === new Date().toDateString()).length;
    const wins = s.logs.filter((l) => l.status === 'WON' && new Date(l.ts).toDateString() === new Date().toDateString()).length;
    const losses = s.logs.filter((l) => l.status === 'LOST' && new Date(l.ts).toDateString() === new Date().toDateString()).length;
    const wr = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
    bot.sendMessage(chatId, [
      '*Today*',
      `PnL: ${fmtPnl(today?.pnl || 0)}`,
      `Fires: ${fires} · Wins: ${wins} · Losses: ${losses}`,
      `Win rate: ${wr}%`,
    ].join('\n'), { parse_mode: 'Markdown' });
    return;
  }
  if (sub === 'wallet') {
    const id = args[1];
    const w = s.wallets.find((x) => x.id === id);
    if (!w) return bot.sendMessage(chatId, '❌ wallet not found');
    const sList = s.strategies.filter((x) => x.walletId === id);
    const cList = s.copies.filter((x) => x.walletId === id);
    const all = [...sList, ...cList];
    const fires = all.reduce((a, x) => a + ((x.fires || x.trades) || 0), 0);
    const wins = all.reduce((a, x) => a + (x.wins || 0), 0);
    const losses = all.reduce((a, x) => a + (x.losses || 0), 0);
    const pnl = all.reduce((a, x) => a + (x.pnl || 0), 0);
    bot.sendMessage(chatId, [
      `*Wallet: ${escMd(w.label)}* (\`${w.id}\`)`,
      `Balance: ${fmtUSD(w.demoBalance)}`,
      `Items: ${sList.length} strategies · ${cList.length} copies`,
      `Fires: ${fires} · ${wins}W/${losses}L · PnL ${fmtPnl(pnl)}`,
    ].join('\n'), { parse_mode: 'Markdown' });
    return;
  }
  bot.sendMessage(chatId, 'Usage: /report today | /report wallet <id>');
}

/* ---------- /newstrategy wizard --------------------------------- */
function startNewStrategyWizard(chatId) {
  const actor = ensureSignedIn(chatId);
  if (!actor) return;
  wizards[chatId] = {
    type: 'newstrategy',
    step: 'label',
    data: {
      label: '',
      coins: [],
      timeframe: '5MIN',
      direction: 'UP',
      priceMin: 80,
      priceMax: 95,
      perTrade: 1,
      totalBudget: 50,
    },
    actor,
  };
  bot.sendMessage(chatId, 'New strategy — step 1/7\nEnter a *label* (or /cancel):', { parse_mode: 'Markdown' });
}

function startNewCopyWizard(chatId) {
  const actor = ensureSignedIn(chatId);
  if (!actor) return;
  wizards[chatId] = {
    type: 'newcopy',
    step: 'label',
    data: {
      label: '',
      walletAddress: '',
      coins: [],
      timeframes: [],
      sizeMode: 'FIXED',
      sizeFixed: 1,
      totalBudget: 50,
    },
    actor,
  };
  bot.sendMessage(chatId, 'New copy-trade — step 1/6\nEnter a *label* (or /cancel):', { parse_mode: 'Markdown' });
}

function handleStrategyWizard(chatId, text) {
  const w = wizards[chatId];
  if (!w || w.type !== 'newstrategy') return false;
  const reply = (m, opts) => bot.sendMessage(chatId, m, { parse_mode: 'Markdown', ...(opts || {}) });

  switch (w.step) {
    case 'label':
      if (!text.trim()) return reply('Label cannot be empty.');
      w.data.label = text.trim();
      w.step = 'coins';
      reply(`Step 2/7 — coins comma-separated from: ${COIN_DEFAULTS.join(', ')}\nExample: BTC,ETH`);
      return true;
    case 'coins': {
      const list = text.toUpperCase().split(/[,\s]+/).filter(Boolean).filter((c) => COIN_DEFAULTS.includes(c));
      if (!list.length) return reply('Need at least one valid coin.');
      w.data.coins = list;
      w.step = 'timeframe';
      reply(`Step 3/7 — timeframe: ${TIMEFRAMES.join(' / ')}`);
      return true;
    }
    case 'timeframe': {
      const tf = text.trim().toUpperCase();
      if (!TIMEFRAMES.includes(tf)) return reply('Invalid timeframe.');
      w.data.timeframe = tf;
      w.step = 'direction';
      reply('Step 4/7 — direction: UP or DOWN');
      return true;
    }
    case 'direction': {
      const d = text.trim().toUpperCase();
      if (d !== 'UP' && d !== 'DOWN') return reply('Reply UP or DOWN.');
      w.data.direction = d;
      w.step = 'price';
      reply('Step 5/7 — price range in cents (1–99), format `min max`. Example: `78 92`');
      return true;
    }
    case 'price': {
      const [a, b] = text.trim().split(/\s+/).map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b > 99 || a >= b) return reply('Invalid range. Try again.');
      w.data.priceMin = a;
      w.data.priceMax = b;
      w.step = 'pertrade';
      reply('Step 6/7 — per-trade USD amount. Example: `1`');
      return true;
    }
    case 'pertrade': {
      const v = parseFloat(text);
      if (!Number.isFinite(v) || v <= 0) return reply('Need positive number.');
      w.data.perTrade = v;
      w.step = 'budget';
      reply('Step 7/7 — total budget USD. Example: `50`');
      return true;
    }
    case 'budget': {
      const v = parseFloat(text);
      if (!Number.isFinite(v) || v <= 0) return reply('Need positive number.');
      if (v < w.data.perTrade) return reply('Budget must be ≥ per-trade.');
      w.data.totalBudget = v;
      const r = A.upsertStrategy(w.data, w.actor);
      delete wizards[chatId];
      if (!r.ok) return reply(`❌ ${r.error}`);
      reply(`✅ Strategy created: \`${r.strategy.id}\` *${escMd(r.strategy.label)}* — ${r.strategy.coins.join(',')} ${r.strategy.direction} ${r.strategy.timeframe}`);
      return true;
    }
  }
  return false;
}

function handleCopyWizard(chatId, text) {
  const w = wizards[chatId];
  if (!w || w.type !== 'newcopy') return false;
  const reply = (m, opts) => bot.sendMessage(chatId, m, { parse_mode: 'Markdown', ...(opts || {}) });

  switch (w.step) {
    case 'label':
      if (!text.trim()) return reply('Label cannot be empty.');
      w.data.label = text.trim();
      w.step = 'address';
      reply('Step 2/6 — target wallet address (0x…) to mirror:');
      return true;
    case 'address': {
      const a = text.trim();
      if (!/^0x[a-fA-F0-9]{10,}$/.test(a)) return reply('Invalid address.');
      w.data.walletAddress = a;
      w.step = 'coins';
      reply(`Step 3/6 — coins comma-separated from: ${COIN_DEFAULTS.join(', ')}`);
      return true;
    }
    case 'coins': {
      const list = text.toUpperCase().split(/[,\s]+/).filter(Boolean).filter((c) => COIN_DEFAULTS.includes(c));
      if (!list.length) return reply('Need at least one valid coin.');
      w.data.coins = list;
      w.step = 'timeframes';
      reply(`Step 4/6 — timeframes comma-separated from: ${TIMEFRAMES.join(', ')}`);
      return true;
    }
    case 'timeframes': {
      const list = text.toUpperCase().split(/[,\s]+/).filter(Boolean).filter((t) => TIMEFRAMES.includes(t));
      if (!list.length) return reply('Need at least one valid timeframe.');
      w.data.timeframes = list;
      w.step = 'size';
      reply('Step 5/6 — fixed size in USD per trade. Example: `1`');
      return true;
    }
    case 'size': {
      const v = parseFloat(text);
      if (!Number.isFinite(v) || v <= 0) return reply('Need positive number.');
      w.data.sizeFixed = v;
      w.step = 'budget';
      reply('Step 6/6 — total budget USD. Example: `50`');
      return true;
    }
    case 'budget': {
      const v = parseFloat(text);
      if (!Number.isFinite(v) || v <= 0) return reply('Need positive number.');
      if (v < w.data.sizeFixed) return reply('Budget must be ≥ size.');
      w.data.totalBudget = v;
      const r = A.upsertCopy(w.data, w.actor);
      delete wizards[chatId];
      if (!r.ok) return reply(`❌ ${r.error}`);
      reply(`✅ Copy created: \`${r.copy.id}\` *${escMd(r.copy.label)}*`);
      return true;
    }
  }
  return false;
}

/* ---------- callback queries (confirmations) -------------------- */
function handleCallback(query) {
  const chatId = query.message?.chat?.id;
  if (!chatId) return;
  const data = query.data || '';
  bot.answerCallbackQuery(query.id).catch(() => {});

  if (data === 'noop') {
    bot.editMessageText('Cancelled.', { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
    return;
  }
  if (data.startsWith('del:')) {
    const [, kind, id] = data.split(':');
    const actor = getActor(chatId);
    if (!actor) return bot.sendMessage(chatId, 'Sign in first.');
    const r = kind === 'AUTO' ? A.removeStrategy(id, actor) : A.removeCopy(id, actor);
    bot.editMessageText(r.ok ? `✅ Deleted \`${id}\`` : `❌ ${r.error}`, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
    }).catch(() => {});
    return;
  }
  if (data.startsWith('reset:')) {
    const [, target] = data.split(':');
    const actor = getActor(chatId);
    if (!actor) return bot.sendMessage(chatId, 'Sign in first.');
    const r = A.resetDemoBalance(target, actor);
    bot.editMessageText(r.ok ? `✅ Reset \`${target}\`` : `❌ ${r.error}`, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
    }).catch(() => {});
    return;
  }
}

/* ---------- bot bootstrap --------------------------------------- */
export function startBot({ events } = {}) {
  if (!TOKEN) {
    return null;
  }
  bot = new TelegramBot(TOKEN, { polling: true });

  bot.on('polling_error', (e) => console.warn('[bot] polling error', e?.message || e));

  bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();
    if (!isAllowed(chatId)) {
      bot.sendMessage(chatId, `Sorry, this bot is restricted.\nYour chat id: \`${chatId}\``, { parse_mode: 'Markdown' });
      return;
    }
    // Wizard input takes precedence over commands (except /cancel)
    if (text === '/cancel' && wizards[chatId]) {
      delete wizards[chatId];
      bot.sendMessage(chatId, 'Wizard cancelled.');
      return;
    }
    if (wizards[chatId] && !text.startsWith('/')) {
      const w = wizards[chatId];
      if (w.type === 'newstrategy' && handleStrategyWizard(chatId, text)) return;
      if (w.type === 'newcopy' && handleCopyWizard(chatId, text)) return;
    }

    if (!text.startsWith('/')) return;
    const [head, ...args] = text.split(/\s+/);
    const cmd = head.toLowerCase().replace(/@.*$/, '');

    try {
      switch (cmd) {
        case '/start':         return cmdStart(chatId);
        case '/help':          return cmdHelp(chatId);
        case '/wallets':       return cmdWallets(chatId);
        case '/register':      return cmdRegister(chatId, args);
        case '/signin':        return cmdSignin(chatId, args);
        case '/signout':       return cmdSignout(chatId);
        case '/whoami':        return cmdWhoami(chatId);
        case '/status':        return cmdStatus(chatId);
        case '/balance':       return cmdBalance(chatId);
        case '/logs':          return cmdLogs(chatId, args);
        case '/strategies':    return cmdStrategies(chatId);
        case '/copies':        return cmdCopies(chatId);
        case '/pause':         return cmdToggle(chatId, args, true);
        case '/resume':        return cmdToggle(chatId, args, false);
        case '/clone':         return cmdClone(chatId, args);
        case '/delete':        return cmdDelete(chatId, args);
        case '/newstrategy':   return startNewStrategyWizard(chatId);
        case '/newcopy':       return startNewCopyWizard(chatId);
        case '/resetdemo':     return cmdResetDemo(chatId, args);
        case '/tags':          return cmdTags(chatId);
        case '/settag':        return cmdSetTag(chatId, args);
        case '/resumetag':     return cmdResumeTag(chatId, args);
        case '/report':        return cmdReport(chatId, args);
        case '/subscribe':     subscribers.add(chatId); return bot.sendMessage(chatId, '🔔 alerts ON');
        case '/unsubscribe':   subscribers.delete(chatId); return bot.sendMessage(chatId, '🔕 alerts OFF');
        default: bot.sendMessage(chatId, 'Unknown command. /help');
      }
    } catch (e) {
      console.warn('[bot] command error', e);
      bot.sendMessage(chatId, '❌ command failed: ' + (e.message || 'unknown')).catch(() => {});
    }
  });

  bot.on('callback_query', (q) => {
    if (!isAllowed(q.message?.chat?.id)) return;
    handleCallback(q);
  });

  if (events) {
    events.on('trade-resolved', ({
      coin,
      win,
      pnl,
      pnlPct,
      entryPrice,
      exitPrice,
      secondsBeforeClose,
      source,
      sourceLabel,
      walletId,
      candle,
    }) => {
      const w = getState().wallets.find((x) => x.id === walletId);
      const wlabel = w ? `${w.label}` : '';
      const emoji = win ? '✅' : '❌';
      const candleText = candle?.label ? ` · candle ${escMd(candle.label)}` : '';
      const priceText = Number.isFinite(entryPrice) && Number.isFinite(exitPrice)
        ? ` · ${entryPrice.toFixed(1)}¢→${exitPrice.toFixed(1)}¢`
        : '';
      const pctText = Number.isFinite(pnlPct) ? ` (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)` : '';
      const leftText = Number.isFinite(secondsBeforeClose) ? ` · ${secondsBeforeClose}s before close` : '';
      broadcast(`${emoji} *${escMd(sourceLabel || source)}* ${coin} ${win ? 'WON' : 'LOST'} ${fmtPnl(pnl)}${pctText}${priceText}${candleText}${leftText}${wlabel ? ` · ${escMd(wlabel)}` : ''}`);
    });
    events.on('auto-paused', ({ kind, label, reason }) => {
      broadcast(`⚠️ *${escMd(label)}* (${kind}) auto-paused — ${escMd(reason)}`);
    });
    events.on('tag-trigger', ({ tag, kind, agg }) => {
      broadcast(`🏷 Tag *${escMd(tag.name)}* hit ${kind}-trigger at ${fmtPnl(agg)}`);
    });
  }

  console.log('[bot] Telegram bot started (polling)');
  if (ALLOWED.size === 0) console.log('[bot] WARNING: TELEGRAM_ALLOWED_CHAT_IDS is empty — bot accepts all chats');
  return bot;
}
