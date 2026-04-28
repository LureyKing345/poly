// Polymarket AutoTrader — demo backend.
// Hosts the shared paper-trading state, the simulation engine, and the
// Telegram bot. Designed for cloud / VPS deployment in polling mode.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { load, getState, publicView } from './stateStore.js';
import * as A from './actions.js';
import * as engine from './demoEngine.js';
import { startBot, broadcast } from './telegramBot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = +(process.env.PORT || 4317);
const API_TOKEN = process.env.API_TOKEN || ''; // optional shared bearer for /api/*

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

load();

/* ---------- auth middleware --------------------------------------- */
function requireApiToken(req, res, next) {
  if (!API_TOKEN) return next(); // open mode
  const auth = req.get('authorization') || '';
  const got = auth.replace(/^Bearer\s+/i, '');
  if (got && got === API_TOKEN) return next();
  return res.status(401).json({ ok: false, error: 'unauthorized' });
}

/* ---------- read endpoints --------------------------------------- */
app.get('/api/health', (_req, res) => res.json({ ok: true, version: 1, t: Date.now() }));

app.get('/api/state', requireApiToken, (_req, res) => {
  res.json(publicView());
});

/* ---------- auth (lock-screen) ----------------------------------- */
app.post('/api/auth/register', requireApiToken, (req, res) => {
  const { walletId, password } = req.body || {};
  res.json(A.registerWalletPassword(walletId, password));
});

app.post('/api/auth/signin', requireApiToken, (req, res) => {
  const { walletId, password } = req.body || {};
  res.json(A.checkPassword(walletId, password));
});

app.post('/api/auth/change-password', requireApiToken, (req, res) => {
  const { walletId, oldPassword, newPassword } = req.body || {};
  res.json(A.changePassword(walletId, oldPassword, newPassword));
});

/* ---------- write endpoint (single dispatch) --------------------- */
// All mutations from the dashboard come through here. The signed-in user is
// the actor for ownership checks. The body shape is { action, payload, actor }
// where actor === walletId of the signed-in dashboard user.
app.post('/api/action', requireApiToken, (req, res) => {
  const { action, payload, actor } = req.body || {};
  const a = (payload || {});
  let r;
  switch (action) {
    case 'setMode':              r = A.setMode(a.mode); break;
    case 'addWallet':            r = A.addWallet(a); break;
    case 'updateWallet':         r = A.updateWallet(a.walletId, a.patch || {}, actor); break;
    case 'removeWallet':         r = A.removeWallet(a.walletId, actor); break;
    case 'setActiveWalletId':    r = A.setActiveWalletId(a.walletId); break;
    case 'upsertStrategy':       r = A.upsertStrategy(a.strategy, actor); break;
    case 'removeStrategy':       r = A.removeStrategy(a.id, actor); break;
    case 'duplicateStrategy':    r = A.duplicateStrategy(a.id, actor); break;
    case 'toggleStrategyStatus': r = A.toggleStrategyStatus(a.id, actor); break;
    case 'upsertCopy':           r = A.upsertCopy(a.copy, actor); break;
    case 'removeCopy':           r = A.removeCopy(a.id, actor); break;
    case 'toggleCopyStatus':     r = A.toggleCopyStatus(a.id, actor); break;
    case 'addTag':               r = A.addTag(a.name); break;
    case 'updateTag':            r = A.updateTag(a.id, a.patch || {}); break;
    case 'removeTag':            r = A.removeTag(a.id); break;
    case 'resumeTag':            r = A.resumeTag(a.id); break;
    case 'resetDemoBalance':     r = A.resetDemoBalance(a.walletId, actor); break;
    default: r = { ok: false, error: 'unknown action ' + action };
  }
  if (!r.ok) return res.status(400).json(r);
  return res.json({ ...r, state: publicView() });
});

/* ---------- static frontend -------------------------------------- */
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next();
  });
});

/* ---------- bring everything up ---------------------------------- */
engine.start();
const bot = startBot({ events: engine.events });

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  if (!API_TOKEN) console.log('[server] WARNING: API_TOKEN unset — /api/* is open');
  if (!bot) console.log('[server] Telegram bot not started — set TELEGRAM_BOT_TOKEN to enable');
});

/* ---------- graceful shutdown ----------------------------------- */
function shutdown() {
  console.log('[server] shutting down…');
  engine.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { broadcast };
