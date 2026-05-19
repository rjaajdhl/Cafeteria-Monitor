'use strict';
/**
 * test-biostar.js — BioStar 2 connection test CLI
 *
 * Usage:
 *   node test-biostar.js <host> <username> <password> [port]
 *
 * Example:
 *   node test-biostar.js 192.168.0.20 admin yourpassword
 *   node test-biostar.js 192.168.0.20 admin yourpassword 443
 *
 * Tests:
 *   [1] Login        → POST /api/login
 *   [2] WebSocket    → wss://host/wsapi + send bs-session-id
 *   [3] Event start  → POST /api/events/start
 *   [4] Streaming    → waits 60s for real-time log events
 */

const https     = require('https');
const WebSocket = require('ws');

/* ── CLI args ─────────────────────────────────────────── */
const [,, host, username, password, portArg] = process.argv;
if (!host || !username || !password) {
  console.log('Usage: node test-biostar.js <host> <username> <password> [port]');
  console.log('Example: node test-biostar.js 192.168.0.20 admin yourpassword');
  process.exit(1);
}
const port     = Number(portArg) || 443;
const API_BASE = `https://${host}:${port}`;
const WS_URI   = `wss://${host}:${port}/wsapi`;
const agent    = new https.Agent({ rejectUnauthorized: false });

/* ── Colours ──────────────────────────────────────────── */
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};
const ok   = (msg) => console.log(`${c.green}  ✓${c.reset} ${msg}`);
const fail = (msg) => console.log(`${c.red}  ✗${c.reset} ${msg}`);
const info = (msg) => console.log(`${c.gray}    ${msg}${c.reset}`);
const step = (n, msg) => console.log(`\n${c.bold}${c.cyan}[${n}]${c.reset}${c.bold} ${msg}${c.reset}`);
const warn = (msg) => console.log(`${c.yellow}  ⚠${c.reset} ${msg}`);

/* ── Helpers ──────────────────────────────────────────── */
function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ ...options, agent }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/* ── Main ─────────────────────────────────────────────── */
async function run() {
  console.log(`\n${c.bold}BioStar 2 Connection Test${c.reset}`);
  console.log(`${c.gray}Target: ${API_BASE}${c.reset}`);
  console.log(`${c.gray}User:   ${username}${c.reset}`);

  /* ── Step 1: Login ────────────────────────────────────── */
  step(1, 'Login  →  POST /api/login');
  let sessionId;
  try {
    const body = JSON.stringify({ User: { login_id: username, password } });
    const res  = await request(
      { hostname: host, port, path: '/api/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      body
    );
    info(`HTTP ${res.status}`);
    if (res.status !== 200) {
      fail(`Login failed — HTTP ${res.status}`);
      info(`Response body: ${res.body.slice(0, 200)}`);
      process.exit(1);
    }
    sessionId = res.headers['bs-session-id'];
    if (!sessionId) {
      fail('HTTP 200 but no bs-session-id header in response');
      info(`Headers: ${JSON.stringify(res.headers, null, 2)}`);
      process.exit(1);
    }
    ok(`Logged in — bs-session-id: ${sessionId}`);
  } catch (err) {
    fail(`Network error: ${err.message}`);
    process.exit(1);
  }

  /* ── Step 2: WebSocket connect + authenticate ─────────── */
  step(2, `WebSocket  →  ${WS_URI}`);
  const ws = new WebSocket(WS_URI, { rejectUnauthorized: false });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('WebSocket open timeout (10s)')), 10_000);
    ws.on('open', () => {
      clearTimeout(t);
      ok('WebSocket connected');
      info(`Sending: bs-session-id=${sessionId}`);
      ws.send('bs-session-id=' + sessionId);
      ok('Session ID sent over WebSocket');
      resolve();
    });
    ws.on('error', (err) => { clearTimeout(t); reject(err); });
  }).catch((err) => {
    fail(`WebSocket error: ${err.message}`);
    process.exit(1);
  });

  /* ── Step 3: POST /api/events/start ──────────────────── */
  step(3, 'Event start  →  POST /api/events/start');
  await new Promise(r => setTimeout(r, 1000)); // match Suprema's 1s delay
  try {
    const res = await request({
      hostname: host, port, path: '/api/events/start', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'bs-session-id': sessionId },
    });
    info(`HTTP ${res.status}  body: ${res.body.slice(0, 120)}`);
    if (res.status === 200) {
      ok('Event stream started — BioStar will now push real-time events');
    } else {
      warn(`Unexpected status ${res.status} — events may still arrive, continuing...`);
    }
  } catch (err) {
    fail(`events/start error: ${err.message}`);
    process.exit(1);
  }

  /* ── Step 4: Listen for events ───────────────────────── */
  step(4, 'Streaming  →  waiting 60s for real-time events (scan a device now)');
  console.log(`${c.gray}    Press Ctrl+C to stop early${c.reset}`);

  let msgCount = 0;
  ws.on('message', (raw) => {
    msgCount++;
    const str = String(raw);
    console.log(`\n${c.green}  ► Message #${msgCount} received${c.reset}`);
    info(`Raw (first 500 chars): ${str.slice(0, 500)}`);

    try {
      const data = JSON.parse(str);
      info(`Parsed keys: ${Object.keys(data).join(', ')}`);

      const ev =
        data.EventLog ||
        data.EventLogs?.EventLog?.[0] ||
        data.Logs?.EventLog?.[0] ||
        null;

      if (ev) {
        ok('Event shape recognised!');
        info(`  user_id:    ${ev.user_id?.user_id ?? ev.user_id ?? '—'}`);
        info(`  device_id:  ${ev.device_id?.id ?? ev.device_id ?? '—'}`);
        info(`  datetime:   ${ev.datetime ?? '—'}`);
        info(`  event_type: ${ev.event_type?.code ?? ev.event_type ?? '—'}`);
      } else {
        warn('Unknown shape — full object:');
        info(JSON.stringify(data, null, 2).split('\n').slice(0, 30).join('\n'));
      }
    } catch {
      warn('Message is not JSON — raw text:');
      info(str.slice(0, 300));
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`\n${c.yellow}  WebSocket closed${c.reset} (code ${code} ${reason})`);
    summarise();
  });

  await new Promise(r => setTimeout(r, 60_000));
  ws.close();
  summarise();

  function summarise() {
    console.log(`\n${c.bold}── Summary ──────────────────────────────────${c.reset}`);
    ok('Login:          passed');
    ok('WebSocket:      connected');
    ok('events/start:   called');
    if (msgCount > 0) {
      ok(`Messages received: ${msgCount}`);
    } else {
      warn('No messages received in 60s');
      info('Possible causes:');
      info('  • No scans happened on any device during the test');
      info('  • /api/events/start returned non-200 (check Step 3 above)');
      info('  • BioStar device is offline or not pushing to this server');
      info('  • Try visiting https://' + host + '/real-time in a browser');
      info('    while this script runs to confirm BioStar is producing events');
    }
    process.exit(0);
  }
}

run().catch((err) => {
  console.error(`\n${c.red}Fatal:${c.reset}`, err.message);
  process.exit(1);
});
