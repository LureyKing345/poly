#!/usr/bin/env node

/**
 * Polymarket AutoTrader setup status checker.
 *
 * Run:
 *   node scripts/check-setup-status.js
 *
 * It reports which deployment details are filled and which are still pending.
 * It never prints full secrets; tokens are masked.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const COLORS = process.stdout.isTTY
  ? {
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      red: '\x1b[31m',
      cyan: '\x1b[36m',
      dim: '\x1b[2m',
      reset: '\x1b[0m',
    }
  : { green: '', yellow: '', red: '', cyan: '', dim: '', reset: '' };

let pass = 0;
let warn = 0;
let fail = 0;

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function readText(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

function readJson(rel) {
  try {
    return JSON.parse(readText(rel));
  } catch {
    return null;
  }
}

function row(status, label, detail = '') {
  const color =
    status === 'DONE' ? COLORS.green :
    status === 'WARN' ? COLORS.yellow :
    status === 'TODO' ? COLORS.red :
    COLORS.cyan;

  if (status === 'DONE') pass += 1;
  if (status === 'WARN') warn += 1;
  if (status === 'TODO') fail += 1;

  const left = `${color}[${status}]${COLORS.reset}`;
  console.log(`${left} ${label}${detail ? ` ${COLORS.dim}- ${detail}${COLORS.reset}` : ''}`);
}

function section(title) {
  console.log('');
  console.log(`${COLORS.cyan}${title}${COLORS.reset}`);
  console.log('-'.repeat(title.length));
}

function parseEnvFile(rel) {
  const raw = readText(rel);
  const env = {};
  if (!raw) return env;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function isFilled(value) {
  if (value == null) return false;
  const v = String(value).trim();
  if (!v) return false;
  if (/^(your_|<|replace|changeme|todo|xxx)/i.test(v)) return false;
  return true;
}

function mask(value) {
  if (!isFilled(value)) return '';
  const v = String(value);
  if (v.length <= 8) return '***';
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

function validTelegramToken(v) {
  return /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(String(v || '').trim());
}

function parseChatIds(v) {
  return String(v || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function hasBadChatIds(ids) {
  return ids.some((id) => !/^-?\d{5,}$/.test(id));
}

function safePackageScript(pkg, name) {
  return pkg?.scripts && Object.prototype.hasOwnProperty.call(pkg.scripts, name);
}

function main() {
  console.log('');
  console.log(`${COLORS.cyan}Polymarket AutoTrader Setup Status${COLORS.reset}`);
  console.log('==================================');
  console.log(`Project: ${ROOT}`);

  const pkg = readJson('package.json');
  const serverEnv = parseEnvFile('server/.env');
  const clientEnv = parseEnvFile('.env.local');
  const state = readJson('server/state.json');

  section('Required Project Files');
  row(exists('package.json') ? 'DONE' : 'TODO', 'package.json', exists('package.json') ? 'found' : 'missing');
  row(exists('src/PolymarketAutoTrader.jsx') ? 'DONE' : 'TODO', 'React dashboard file', 'src/PolymarketAutoTrader.jsx');
  row(exists('server/index.js') ? 'DONE' : 'TODO', 'Backend entry', 'server/index.js');
  row(exists('server/telegramBot.js') ? 'DONE' : 'TODO', 'Telegram bot file', 'server/telegramBot.js');
  row(exists('server/demoEngine.js') ? 'DONE' : 'TODO', 'Paper-trading engine', 'server/demoEngine.js');
  row(exists('server/actions.js') ? 'DONE' : 'TODO', 'Shared action layer', 'server/actions.js');

  section('Package Scripts');
  if (!pkg) {
    row('TODO', 'package.json parse', 'file missing or invalid JSON');
  } else {
    row(safePackageScript(pkg, 'dev:client') ? 'DONE' : 'TODO', 'dev:client script', pkg.scripts?.['dev:client'] || 'missing');
    row(safePackageScript(pkg, 'dev:server') ? 'DONE' : 'TODO', 'dev:server script', pkg.scripts?.['dev:server'] || 'missing');
    row(safePackageScript(pkg, 'dev:all') ? 'DONE' : 'WARN', 'dev:all script', pkg.scripts?.['dev:all'] || 'optional but useful');
    row(safePackageScript(pkg, 'build') ? 'DONE' : 'TODO', 'build script', pkg.scripts?.build || 'missing');
    row(safePackageScript(pkg, 'start') ? 'DONE' : 'TODO', 'start script', pkg.scripts?.start || 'missing');
  }

  section('Install / Build Status');
  row(exists('node_modules') ? 'DONE' : 'TODO', 'Dependencies installed', exists('node_modules') ? 'node_modules found' : 'run: npm install');
  row(exists('package-lock.json') ? 'DONE' : 'WARN', 'Lock file', exists('package-lock.json') ? 'package-lock.json found' : 'will be created by npm install');
  row(exists('dist/index.html') ? 'DONE' : 'WARN', 'Production build', exists('dist/index.html') ? 'dist/index.html found' : 'run: npm run build before VPS production');

  section('Server Env: server/.env');
  if (!exists('server/.env')) {
    row('TODO', 'server/.env', 'copy server/.env.example to server/.env and fill values');
  } else {
    row('DONE', 'server/.env', 'found');
  }

  const port = serverEnv.PORT || '4317';
  row(isFilled(port) ? 'DONE' : 'WARN', 'PORT', `using ${port || '4317 default'}`);

  if (validTelegramToken(serverEnv.TELEGRAM_BOT_TOKEN)) {
    row('DONE', 'TELEGRAM_BOT_TOKEN', `filled (${mask(serverEnv.TELEGRAM_BOT_TOKEN)})`);
  } else if (isFilled(serverEnv.TELEGRAM_BOT_TOKEN)) {
    row('WARN', 'TELEGRAM_BOT_TOKEN', 'filled but format does not look like a BotFather token');
  } else {
    row('TODO', 'TELEGRAM_BOT_TOKEN', 'create bot via @BotFather and paste token');
  }

  const chatIds = parseChatIds(serverEnv.TELEGRAM_ALLOWED_CHAT_IDS);
  if (chatIds.length && !hasBadChatIds(chatIds)) {
    row('DONE', 'TELEGRAM_ALLOWED_CHAT_IDS', `${chatIds.length} chat id(s) filled`);
  } else if (chatIds.length) {
    row('WARN', 'TELEGRAM_ALLOWED_CHAT_IDS', `some IDs look invalid: ${chatIds.join(', ')}`);
  } else {
    row('TODO', 'TELEGRAM_ALLOWED_CHAT_IDS', 'add comma-separated Telegram chat IDs');
  }

  if (isFilled(serverEnv.API_TOKEN)) {
    row('DONE', 'API_TOKEN', `filled (${mask(serverEnv.API_TOKEN)})`);
  } else {
    row('WARN', 'API_TOKEN', 'optional, but recommended on public hosting');
  }

  row(
    isFilled(serverEnv.STATE_PATH) ? 'DONE' : 'WARN',
    'STATE_PATH',
    isFilled(serverEnv.STATE_PATH) ? serverEnv.STATE_PATH : 'optional; default is server/state.json'
  );

  row(
    isFilled(serverEnv.GAMMA_API_URL) ? 'DONE' : 'WARN',
    'GAMMA_API_URL',
    isFilled(serverEnv.GAMMA_API_URL) ? 'custom URL filled' : 'optional; default Polymarket Gamma API will be used'
  );

  section('Client Env: .env.local');
  if (!exists('.env.local')) {
    row('WARN', '.env.local', 'optional; needed only for separate frontend host or API_TOKEN');
  } else {
    row('DONE', '.env.local', 'found');
  }

  if (isFilled(clientEnv.VITE_CLOUD_API)) {
    row('DONE', 'VITE_CLOUD_API', clientEnv.VITE_CLOUD_API);
  } else {
    row('WARN', 'VITE_CLOUD_API', 'blank is OK if dashboard and backend are same domain');
  }

  if (isFilled(serverEnv.API_TOKEN)) {
    if (clientEnv.VITE_CLOUD_TOKEN === serverEnv.API_TOKEN) {
      row('DONE', 'VITE_CLOUD_TOKEN', 'matches API_TOKEN');
    } else if (isFilled(clientEnv.VITE_CLOUD_TOKEN)) {
      row('TODO', 'VITE_CLOUD_TOKEN', 'filled but does not match server API_TOKEN');
    } else {
      row('TODO', 'VITE_CLOUD_TOKEN', 'required because server API_TOKEN is set');
    }
  } else {
    row(isFilled(clientEnv.VITE_CLOUD_TOKEN) ? 'WARN' : 'DONE', 'VITE_CLOUD_TOKEN', isFilled(clientEnv.VITE_CLOUD_TOKEN) ? 'filled, but server API_TOKEN is empty' : 'not needed');
  }

  section('Shared State');
  if (!state) {
    row('WARN', 'server/state.json', 'not created yet; server creates it on first start');
  } else {
    row('DONE', 'server/state.json', 'found and valid JSON');
    const wallets = Array.isArray(state.wallets) ? state.wallets : [];
    const protectedWallets = wallets.filter((w) => w.passwordHash).length;
    row(wallets.length ? 'DONE' : 'WARN', 'Wallets', `${wallets.length} wallet(s), ${protectedWallets} password-protected`);
    row(Array.isArray(state.strategies) ? 'DONE' : 'WARN', 'Strategies', `${state.strategies?.length || 0} saved`);
    row(Array.isArray(state.copies) ? 'DONE' : 'WARN', 'Copy setups', `${state.copies?.length || 0} saved`);
    row(Array.isArray(state.tags) ? 'DONE' : 'WARN', 'Tags', `${state.tags?.length || 0} saved`);
    if (wallets.length && protectedWallets < wallets.length) {
      row('WARN', 'Wallet passwords', `${wallets.length - protectedWallets} wallet(s) still need registration/password`);
    }
  }

  section('Docs');
  row(exists('SETUP.md') ? 'DONE' : 'TODO', 'SETUP.md', exists('SETUP.md') ? 'found' : 'missing');
  row(exists('FEATURES.md') ? 'DONE' : 'TODO', 'FEATURES.md', exists('FEATURES.md') ? 'found' : 'missing');
  row(exists('WALLET_GUIDE.md') ? 'DONE' : 'TODO', 'WALLET_GUIDE.md', exists('WALLET_GUIDE.md') ? 'found' : 'missing');
  row(exists('TELEGRAM_BOT_GUIDE.md') ? 'DONE' : 'TODO', 'TELEGRAM_BOT_GUIDE.md', exists('TELEGRAM_BOT_GUIDE.md') ? 'found' : 'missing');

  section('Next Commands');
  if (!exists('server/.env')) {
    console.log('1. cp server/.env.example server/.env');
    console.log('2. Fill TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_CHAT_IDS');
  }
  if (!exists('node_modules')) console.log('3. npm install');
  if (!exists('dist/index.html')) console.log('4. npm run build');
  console.log('5. npm run dev:server   # backend + Telegram bot');
  console.log('6. npm run dev:client   # dashboard');

  section('Summary');
  console.log(`DONE: ${pass} | WARN: ${warn} | TODO: ${fail}`);
  if (fail === 0) {
    console.log(`${COLORS.green}RESULT: Required details are filled. Review WARN items before production.${COLORS.reset}`);
    process.exit(0);
  }
  console.log(`${COLORS.red}RESULT: Some required details are still pending.${COLORS.reset}`);
  process.exit(1);
}

main();
