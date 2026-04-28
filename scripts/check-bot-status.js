#!/usr/bin/env node

/**
 * Telegram bot + cloud API diagnostic script.
 *
 * Local / Render Shell:
 *   node scripts/check-bot-status.js
 *
 * With deployed URL:
 *   node scripts/check-bot-status.js https://poly-jhi3.onrender.com
 *
 * Optional test message to first allowed chat:
 *   node scripts/check-bot-status.js https://poly-jhi3.onrender.com --send-test
 *
 * This never prints full secrets.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const deployedUrl = args.find((x) => /^https?:\/\//i.test(x)) || process.env.RENDER_EXTERNAL_URL || '';
const sendTest = args.includes('--send-test');

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

function section(title) {
  console.log('');
  console.log(`${COLORS.cyan}${title}${COLORS.reset}`);
  console.log('-'.repeat(title.length));
}

function row(status, label, detail = '') {
  const color =
    status === 'PASS' ? COLORS.green :
    status === 'WARN' ? COLORS.yellow :
    status === 'FAIL' ? COLORS.red :
    COLORS.cyan;

  if (status === 'PASS') pass += 1;
  if (status === 'WARN') warn += 1;
  if (status === 'FAIL') fail += 1;

  console.log(`${color}[${status}]${COLORS.reset} ${label}${detail ? ` ${COLORS.dim}- ${detail}${COLORS.reset}` : ''}`);
}

function readText(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
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

function envValue(name, fileEnv) {
  return process.env[name] || fileEnv[name] || '';
}

function isFilled(v) {
  return v != null && String(v).trim() !== '';
}

function mask(v) {
  if (!isFilled(v)) return '';
  const s = String(v);
  if (s.length <= 10) return '***';
  return `${s.slice(0, 5)}…${s.slice(-5)}`;
}

function parseChatIds(v) {
  return String(v || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function validToken(v) {
  return /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(String(v || '').trim());
}

function validChatId(id) {
  return /^-?\d{5,}$/.test(String(id || '').trim());
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

function apiUrl(base, pathName) {
  return `${base.replace(/\/+$/, '')}${pathName}`;
}

async function main() {
  const fileEnv = parseEnvFile('server/.env');
  const token = envValue('TELEGRAM_BOT_TOKEN', fileEnv).trim();
  const allowedRaw = envValue('TELEGRAM_ALLOWED_CHAT_IDS', fileEnv).trim();
  const apiToken = envValue('API_TOKEN', fileEnv).trim();
  const statePath = envValue('STATE_PATH', fileEnv).trim();

  console.log('');
  console.log(`${COLORS.cyan}Telegram Bot Diagnostic${COLORS.reset}`);
  console.log('=======================');
  console.log(`Project: ${ROOT}`);
  if (deployedUrl) console.log(`URL:     ${deployedUrl}`);

  section('Environment');
  if (validToken(token)) {
    row('PASS', 'TELEGRAM_BOT_TOKEN', `looks valid (${mask(token)})`);
  } else if (isFilled(token)) {
    row('FAIL', 'TELEGRAM_BOT_TOKEN', `filled but format looks wrong (${mask(token)})`);
  } else {
    row('FAIL', 'TELEGRAM_BOT_TOKEN', 'missing');
  }

  const chatIds = parseChatIds(allowedRaw);
  if (!chatIds.length) {
    row('FAIL', 'TELEGRAM_ALLOWED_CHAT_IDS', 'missing; bot may reject you or run open depending config');
  } else {
    const bad = chatIds.filter((id) => !validChatId(id));
    if (bad.length) row('FAIL', 'TELEGRAM_ALLOWED_CHAT_IDS', `invalid IDs: ${bad.join(', ')}`);
    else row('PASS', 'TELEGRAM_ALLOWED_CHAT_IDS', `${chatIds.length} valid chat id(s): ${chatIds.join(', ')}`);
  }

  if (apiToken) row('PASS', 'API_TOKEN', `filled (${mask(apiToken)})`);
  else row('WARN', 'API_TOKEN', 'empty; /api/state is public');

  if (statePath) row('PASS', 'STATE_PATH', statePath);
  else row('WARN', 'STATE_PATH', 'default server/state.json; on Render this may reset after redeploy unless you add a disk');

  section('Telegram API');
  if (validToken(token)) {
    try {
      const r = await fetchJson(`https://api.telegram.org/bot${token}/getMe`);
      if (r.json?.ok) {
        const b = r.json.result;
        row('PASS', 'Bot token works', `@${b.username} (${b.first_name})`);
      } else {
        row('FAIL', 'Bot token rejected', r.json?.description || r.text.slice(0, 140));
      }
    } catch (e) {
      row('FAIL', 'Cannot reach Telegram getMe', e.message);
    }

    try {
      const r = await fetchJson(`https://api.telegram.org/bot${token}/getWebhookInfo`);
      if (!r.json?.ok) {
        row('WARN', 'Webhook info unavailable', r.json?.description || r.text.slice(0, 140));
      } else {
        const info = r.json.result || {};
        if (info.url) {
          row('WARN', 'Webhook is set', `${info.url}. Polling bot may not receive messages until webhook is removed.`);
        } else {
          row('PASS', 'Webhook status', 'no webhook set; polling mode OK');
        }
        if (info.last_error_message) {
          row('WARN', 'Telegram webhook last error', info.last_error_message);
        }
      }
    } catch (e) {
      row('WARN', 'Cannot read webhook info', e.message);
    }

    try {
      const r = await fetchJson(`https://api.telegram.org/bot${token}/getUpdates?limit=1&timeout=0`);
      if (r.json?.ok) {
        row('PASS', 'getUpdates access', `OK (${r.json.result.length} pending update sample)`);
      } else {
        const desc = r.json?.description || r.text.slice(0, 180);
        if (/conflict/i.test(desc)) {
          row('FAIL', 'Polling conflict', 'Another server/process is already using this same bot token.');
        } else if (/webhook/i.test(desc)) {
          row('WARN', 'getUpdates blocked by webhook', desc);
        } else {
          row('WARN', 'getUpdates not OK', desc);
        }
      }
    } catch (e) {
      row('WARN', 'Cannot test getUpdates', e.message);
    }

    if (sendTest) {
      const firstChat = chatIds[0];
      if (!firstChat) {
        row('FAIL', '--send-test', 'no allowed chat id to send to');
      } else {
        try {
          const msg = `Bot diagnostic test OK: ${new Date().toISOString()}`;
          const r = await fetchJson(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: firstChat, text: msg }),
          });
          if (r.json?.ok) row('PASS', 'Test message sent', `sent to ${firstChat}`);
          else row('FAIL', 'Test message failed', r.json?.description || r.text.slice(0, 180));
        } catch (e) {
          row('FAIL', 'Test message failed', e.message);
        }
      }
    } else {
      row('WARN', 'Test message', 'skipped. Add --send-test to verify Telegram delivery.');
    }
  }

  section('Cloud API');
  if (!deployedUrl) {
    row('WARN', 'Deployed URL', 'not supplied. Run: node scripts/check-bot-status.js https://your-app.onrender.com');
  } else {
    try {
      const r = await fetchJson(apiUrl(deployedUrl, '/api/health'));
      if (r.res.ok && r.json?.ok) row('PASS', '/api/health', `OK version=${r.json.version ?? '?'}`);
      else row('FAIL', '/api/health', `HTTP ${r.res.status}: ${r.text.slice(0, 180)}`);
    } catch (e) {
      row('FAIL', '/api/health', e.message);
    }

    try {
      const headers = apiToken ? { Authorization: `Bearer ${apiToken}` } : {};
      const r = await fetchJson(apiUrl(deployedUrl, '/api/state'), { headers });
      if (r.res.ok && r.json?.wallets) {
        row('PASS', '/api/state', `${r.json.wallets.length} wallets, ${r.json.strategies?.length || 0} strategies, apiStatus=${r.json.apiStatus}`);
      } else if (r.res.status === 401) {
        row('FAIL', '/api/state unauthorized', 'API_TOKEN is set but request token failed/missing. Check API_TOKEN and VITE_CLOUD_TOKEN match.');
      } else {
        row('FAIL', '/api/state', `HTTP ${r.res.status}: ${r.text.slice(0, 180)}`);
      }
    } catch (e) {
      row('FAIL', '/api/state', e.message);
    }
  }

  section('Most Common Fixes');
  console.log('1. If bot says nothing: check Render logs for "Telegram bot started (polling)".');
  console.log('2. If "restricted": put your exact numeric chat id in TELEGRAM_ALLOWED_CHAT_IDS.');
  console.log('3. If conflict: only one Render service/local script can use the same TELEGRAM_BOT_TOKEN.');
  console.log('4. If CLOUD badge flips: check /api/state authorization and Render service sleeping/restarting.');
  console.log('5. If state resets: add Render Disk and set STATE_PATH=/var/data/state.json.');

  section('Summary');
  console.log(`PASS: ${pass} | WARN: ${warn} | FAIL: ${fail}`);
  if (fail === 0) {
    console.log(`${COLORS.green}RESULT: Bot/API config looks OK. Review warnings if bot still does not answer.${COLORS.reset}`);
    process.exit(0);
  }
  console.log(`${COLORS.red}RESULT: Bot/API has blocking issues above.${COLORS.reset}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
