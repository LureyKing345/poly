<?php
// Polymarket AutoTrader hosting compatibility checker.
//
// Use this only for temporary diagnostics:
// 1. Upload this file to the hosting plan's public web folder.
// 2. Open it in browser: https://your-domain.com/check-hosting.php
// 3. Compare the result with your other hosting plan.
// 4. Delete this file after testing.

header('Content-Type: text/html; charset=utf-8');

$pass = 0;
$warn = 0;
$fail = 0;

function row($status, $label, $detail = '') {
    global $pass, $warn, $fail;
    if ($status === 'PASS') $pass++;
    if ($status === 'WARN') $warn++;
    if ($status === 'FAIL') $fail++;
    $class = strtolower($status);
    echo '<tr class="' . htmlspecialchars($class) . '">';
    echo '<td><strong>' . htmlspecialchars($status) . '</strong></td>';
    echo '<td>' . htmlspecialchars($label) . '</td>';
    echo '<td>' . htmlspecialchars($detail) . '</td>';
    echo '</tr>';
}

function can_shell() {
    if (!function_exists('shell_exec')) return false;
    $disabled = ini_get('disable_functions');
    return stripos(',' . $disabled . ',', ',shell_exec,') === false;
}

function run_cmd($cmd) {
    if (!can_shell()) return null;
    $out = @shell_exec($cmd . ' 2>&1');
    return is_string($out) ? trim($out) : null;
}

function version_major($version) {
    if (preg_match('/v?(\d+)/', $version, $m)) return intval($m[1]);
    return 0;
}

function http_ok($url) {
    $ctx = stream_context_create([
        'http' => [
            'method' => 'HEAD',
            'timeout' => 10,
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);
    $fp = @fopen($url, 'r', false, $ctx);
    if ($fp) {
        fclose($fp);
        return true;
    }
    return false;
}

?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Polymarket AutoTrader Hosting Check</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      background: #0a0c10;
      color: #d7dde7;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .wrap { max-width: 980px; margin: 0 auto; }
    h1 { color: #00ff88; margin-bottom: 8px; }
    .muted { color: #8a94a6; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #1f2633; padding: 10px; vertical-align: top; }
    th { background: #111722; color: #00c4ff; text-align: left; }
    tr.pass td:first-child { color: #00ff88; }
    tr.warn td:first-child { color: #ffb800; }
    tr.fail td:first-child { color: #ff4757; }
    .result {
      border: 1px solid #1f2633;
      padding: 16px;
      border-radius: 10px;
      background: #111722;
      margin-top: 20px;
    }
    code { color: #00c4ff; }
  </style>
</head>
<body>
<div class="wrap">
  <h1>Polymarket AutoTrader Hosting Check</h1>
  <p class="muted">
    This checks whether this hosting can run the Node.js backend + Telegram bot.
    Delete this file after testing.
  </p>

  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Check</th>
        <th>Detail</th>
      </tr>
    </thead>
    <tbody>
<?php

row('PASS', 'PHP web checker is running', 'PHP ' . PHP_VERSION);

if (can_shell()) {
    row('PASS', 'shell_exec available', 'Can inspect node/npm from PHP');
} else {
    row('WARN', 'shell_exec unavailable', 'Cannot detect node/npm from PHP. Use SSH script if possible.');
}

$node = run_cmd('node -v');
if ($node) {
    $major = version_major($node);
    if ($major >= 18) {
        row('PASS', 'Node.js available', $node);
    } else {
        row('FAIL', 'Node.js too old', $node . ' — need Node 18+');
    }
} else {
    row('FAIL', 'Node.js not detected', 'Backend and Telegram bot need Node.js 18+');
}

$npm = run_cmd('npm -v');
if ($npm) {
    row('PASS', 'npm available', $npm);
} else {
    row('FAIL', 'npm not detected', 'Need npm install/npm ci to install dependencies');
}

$pm2 = run_cmd('pm2 -v');
if ($pm2) {
    row('PASS', 'PM2 available', $pm2);
} else {
    $systemctl = run_cmd('systemctl --version');
    $supervisor = run_cmd('supervisorctl version');
    if ($systemctl) {
        row('WARN', 'PM2 not found', 'systemd detected; you can run the Node process via systemd or install PM2');
    } elseif ($supervisor) {
        row('WARN', 'PM2 not found', 'Supervisor detected; you may run the Node process via Supervisor');
    } else {
        row('FAIL', 'Always-on process manager not detected', 'Telegram bot needs a 24/7 Node process');
    }
}

$stateFile = __DIR__ . '/pmt-write-test.json';
if (@file_put_contents($stateFile, '{"ok":true}') !== false) {
    @unlink($stateFile);
    row('PASS', 'Disk write access', 'Can write state file near this script');
} else {
    row('FAIL', 'Disk write access', 'server/state.json must be writable');
}

if (http_ok('https://gamma-api.polymarket.com/markets?limit=1')) {
    row('PASS', 'Outbound HTTPS to Polymarket', 'gamma-api.polymarket.com reachable');
} else {
    row('FAIL', 'Outbound HTTPS to Polymarket', 'Cannot reach gamma-api.polymarket.com');
}

if (http_ok('https://api.telegram.org')) {
    row('PASS', 'Outbound HTTPS to Telegram', 'api.telegram.org reachable');
} else {
    row('FAIL', 'Outbound HTTPS to Telegram', 'Cannot reach api.telegram.org');
}

if (function_exists('stream_socket_server')) {
    $port = getenv('PORT') ?: '4317';
    $errNo = 0;
    $errStr = '';
    $server = @stream_socket_server('tcp://0.0.0.0:' . $port, $errNo, $errStr);
    if ($server) {
        fclose($server);
        row('PASS', 'Can bind HTTP port', 'Port ' . $port . ' bind OK');
    } else {
        row('WARN', 'Could not bind HTTP port', 'Some shared hosts block custom ports. Use platform-assigned PORT or reverse proxy. Error: ' . $errStr);
    }
} else {
    row('WARN', 'Port bind check skipped', 'stream_socket_server unavailable');
}

$mem = ini_get('memory_limit');
row('WARN', 'PHP memory limit', $mem . ' (Node server should ideally have 512 MB+ RAM)');

?>
    </tbody>
  </table>

  <div class="result">
    <h2>Summary</h2>
    <p>
      PASS: <strong><?php echo intval($pass); ?></strong> |
      WARN: <strong><?php echo intval($warn); ?></strong> |
      FAIL: <strong><?php echo intval($fail); ?></strong>
    </p>
<?php if ($fail === 0): ?>
    <p style="color:#00ff88"><strong>RESULT:</strong> This hosting looks ready for the cloud demo + Telegram bot.</p>
<?php else: ?>
    <p style="color:#ff4757"><strong>RESULT:</strong> This hosting is not ready yet.</p>
    <p>Minimum required: <code>Node.js 18+</code>, <code>npm</code>, outbound HTTPS, writable disk, and an always-on Node process.</p>
<?php endif; ?>
  </div>
</div>
</body>
</html>
