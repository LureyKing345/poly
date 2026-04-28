#!/usr/bin/env bash

# Polymarket AutoTrader hosting compatibility checker.
# Run this on each hosting plan via SSH:
#   bash scripts/check-hosting.sh
#
# It checks the things this project needs for the cloud demo + Telegram bot:
# Node.js, npm, long-running process support, outbound HTTPS, writable disk,
# and the ability to bind an HTTP port.

set -u

PORT="${PORT:-4317}"
TMP_DIR="${TMPDIR:-/tmp}/pmt-hosting-check-$$"
mkdir -p "$TMP_DIR"

pass=0
warn=0
fail=0

green=""
yellow=""
red=""
reset=""
if [ -t 1 ]; then
  green="$(printf '\033[32m')"
  yellow="$(printf '\033[33m')"
  red="$(printf '\033[31m')"
  reset="$(printf '\033[0m')"
fi

ok() {
  pass=$((pass + 1))
  printf "%s[PASS]%s %s\n" "$green" "$reset" "$*"
}

note() {
  warn=$((warn + 1))
  printf "%s[WARN]%s %s\n" "$yellow" "$reset" "$*"
}

bad() {
  fail=$((fail + 1))
  printf "%s[FAIL]%s %s\n" "$red" "$reset" "$*"
}

version_major() {
  printf "%s" "$1" | sed -E 's/^v?([0-9]+).*/\1/'
}

have() {
  command -v "$1" >/dev/null 2>&1
}

http_check() {
  url="$1"
  name="$2"
  if have curl; then
    if curl -Is --max-time 10 "$url" >/dev/null 2>&1; then
      ok "Outbound HTTPS works: $name"
    else
      bad "Cannot reach $name ($url)"
    fi
  elif have wget; then
    if wget --spider -q -T 10 "$url" >/dev/null 2>&1; then
      ok "Outbound HTTPS works: $name"
    else
      bad "Cannot reach $name ($url)"
    fi
  else
    note "curl/wget not found; cannot test outbound HTTPS"
  fi
}

printf "\nPolymarket AutoTrader Hosting Check\n"
printf "===================================\n"
printf "Host: %s\n" "$(hostname 2>/dev/null || printf unknown)"
printf "User: %s\n" "$(whoami 2>/dev/null || printf unknown)"
printf "Path: %s\n" "$(pwd)"
printf "Port tested: %s\n\n" "$PORT"

if have node; then
  node_ver="$(node -v 2>/dev/null || true)"
  node_major="$(version_major "$node_ver")"
  if [ "${node_major:-0}" -ge 18 ]; then
    ok "Node.js available: $node_ver"
  else
    bad "Node.js is too old: ${node_ver:-unknown}. Need Node 18+ (Node 20 recommended)."
  fi
else
  bad "Node.js not found. This project backend and Telegram bot need Node.js."
fi

if have npm; then
  ok "npm available: $(npm -v 2>/dev/null)"
else
  bad "npm not found. Need npm install/npm ci to install dependencies."
fi

if have pm2; then
  ok "PM2 available: $(pm2 -v 2>/dev/null | head -n 1)"
elif have systemctl; then
  note "PM2 not found, but systemd exists. You can run the server via systemd or install PM2."
elif have supervisorctl; then
  note "PM2 not found, but supervisorctl exists. You may run the server via Supervisor."
else
  bad "No PM2/systemd/Supervisor detected. Telegram bot needs an always-on process."
fi

if [ -w "$(pwd)" ]; then
  touch "$TMP_DIR/state-write-test.json" 2>/dev/null && ok "Disk is writable for state.json" || bad "Cannot write test file"
else
  bad "Current directory is not writable. server/state.json must be writable."
fi

http_check "https://gamma-api.polymarket.com/markets?limit=1" "Polymarket Gamma API"
http_check "https://api.telegram.org" "Telegram API"

if have node; then
  node "$TMP_DIR/port-check.js" "$PORT" >"$TMP_DIR/port.out" 2>"$TMP_DIR/port.err" <<'NODE'
const http = require('http');
const port = Number(process.argv[2] || 4317);
const server = http.createServer((_, res) => res.end('ok'));
server.on('error', (err) => {
  console.error(err.code || err.message);
  process.exit(2);
});
server.listen(port, '0.0.0.0', () => {
  server.close(() => process.exit(0));
});
NODE
  port_status=$?
  if [ "$port_status" -eq 0 ]; then
    ok "Can bind HTTP port $PORT"
  else
    note "Could not bind port $PORT ($(cat "$TMP_DIR/port.err" 2>/dev/null)). On some platforms you must use their assigned PORT env var."
  fi
fi

if have node; then
  node "$TMP_DIR/timer-check.js" >"$TMP_DIR/timer.out" 2>"$TMP_DIR/timer.err" <<'NODE'
let ticks = 0;
const id = setInterval(() => {
  ticks += 1;
  if (ticks >= 2) {
    clearInterval(id);
    process.exit(0);
  }
}, 300);
NODE
  if [ "$?" -eq 0 ]; then
    ok "Node timers work (needed for paper-trading engine and bot polling)"
  else
    bad "Node timer test failed"
  fi
fi

if have free; then
  mem_mb="$(free -m | awk '/^Mem:/ {print $2}')"
  if [ "${mem_mb:-0}" -ge 512 ]; then
    ok "Memory looks OK: ${mem_mb} MB"
  else
    note "Low memory: ${mem_mb:-unknown} MB. 512 MB+ recommended."
  fi
else
  note "Cannot detect memory. 512 MB+ recommended."
fi

if have df; then
  avail_kb="$(df -Pk . | awk 'NR==2 {print $4}')"
  if [ "${avail_kb:-0}" -ge 512000 ]; then
    ok "Disk space looks OK: $((avail_kb / 1024)) MB free"
  else
    note "Low disk space: $(( ${avail_kb:-0} / 1024 )) MB free"
  fi
fi

rm -rf "$TMP_DIR"

printf "\nSummary\n"
printf "-------\n"
printf "PASS: %s | WARN: %s | FAIL: %s\n" "$pass" "$warn" "$fail"

if [ "$fail" -eq 0 ]; then
  printf "%sRESULT: This hosting can run the cloud demo + Telegram bot.%s\n" "$green" "$reset"
  exit 0
fi

printf "%sRESULT: Not ready for the Telegram bot backend.%s\n" "$red" "$reset"
printf "Minimum required: Node.js 18+, npm, outbound HTTPS, writable disk, and always-on Node process support.\n"
exit 1
