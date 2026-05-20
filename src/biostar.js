'use strict';
/**
 * biostar.js
 * Connects to BioStar 2, authenticates, then opens a WebSocket
 * and calls /api/events/start so real-time events are pushed.
 *
 * Flow (from Suprema's own example):
 *   1. POST /api/login                  → get bs-session-id
 *   2. WS connect wss://host/wsapi
 *   3. ws.send('bs-session-id=<id>')    → authenticate the socket
 *   4. POST /api/events/start           → tell BioStar to push events
 *   5. ws.onmessage                     → receive real-time log entries
 */

const https  = require('https');
const WebSocket = require('ws');

const RECONNECT_DELAY_MS = 5_000;
const EVENT_START_DELAY_MS = 1_000; // match Suprema example's setTimeout

/**
 * @param {object}   config          - biostar section of config.json
 * @param {string}   config.host     - e.g. "192.168.0.20"
 * @param {number}   config.port     - e.g. 443
 * @param {string}   config.username
 * @param {string}   config.password
 * @param {Function} onEvent         - called with each parsed event object
 * @param {Function} onConnectionChange - called with (connected: boolean)
 */
function initBiostar(config, onEvent, onConnectionChange) {
  const { host, port = 443, username, password } = config;
  const API_BASE = `https://${host}:${port}`;
  const WS_URI   = `wss://${host}:${port}/wsapi`;

  // Ignore self-signed certs (common on local BioStar installs)
  const agent = new https.Agent({ rejectUnauthorized: false });

  let stopped      = false;
  let sessionId    = null;
  let ws           = null;
  let rcTimer      = null;

  function scheduleReconnect() {
    if (stopped) return;
    clearTimeout(rcTimer);
    rcTimer = setTimeout(connect, RECONNECT_DELAY_MS);
  }

  async function login() {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        User: { login_id: username, password },
      });
      const req = https.request(
        {
          hostname: host,
          port,
          path: '/api/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          agent,
        },
        (res) => {
          const sid = res.headers['bs-session-id'];
          res.resume(); // drain body
          if (!sid) return reject(new Error('Login failed — no bs-session-id in response'));
          resolve(sid);
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  function postEventStart(sid) {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: host,
          port,
          path: '/api/events/start',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'bs-session-id': sid,
          },
          agent,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            console.log('[BioStar] /api/events/start →', res.statusCode, data.slice(0, 120));
            resolve();
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  async function connect() {
    if (stopped) return;

    // Step 1 — login
    try {
      sessionId = await login();
      console.log('[BioStar] Logged in, session:', sessionId);
    } catch (err) {
      console.error('[BioStar] Login error:', err.message);
      scheduleReconnect();
      return;
    }

    // Step 2 — open WebSocket
    ws = new WebSocket(WS_URI, { rejectUnauthorized: false });

    ws.on('open', () => {
      console.log('[BioStar] WebSocket open — authenticating socket...');

      // Step 3 — send session ID as first message (REQUIRED)
      ws.send('bs-session-id=' + sessionId);

      // Step 4 — after 1 s, POST /api/events/start (REQUIRED to trigger push)
      setTimeout(() => {
        postEventStart(sessionId)
          .then(() => {
            console.log('[BioStar] Event stream started');
            onConnectionChange(true);
          })
          .catch((err) => {
            console.error('[BioStar] events/start error:', err.message);
            ws.close();
          });
      }, EVENT_START_DELAY_MS);
    });

    // Step 5 — receive real-time events
    ws.on('message', (raw) => {
      const str = String(raw);
      console.log('[BioStar] Raw message:', str.slice(0, 300));
      try {
        const data = JSON.parse(str);
        // BioStar wraps events in different shapes — normalise here
        const events = data.EventLog
          ? [data.EventLog]
          : Array.isArray(data.EventLogs?.EventLog)
          ? data.EventLogs.EventLog
          : Array.isArray(data.Logs?.EventLog)
          ? data.Logs.EventLog
          : null;

        if (!events) {
          console.log('[BioStar] Unrecognised message shape — keys:', Object.keys(data).join(', '));
          return;
        }

        console.log('[BioStar] Events received:', events.length);
        for (const ev of events) {
          onEvent(ev);
        }
      } catch (err) {
        console.error('[BioStar] Message parse error:', err.message, str.slice(0, 200));
      }
    });

    ws.on('close', (code, reason) => {
      console.warn(`[BioStar] WebSocket closed (${code} ${reason}) — reconnecting in ${RECONNECT_DELAY_MS / 1000}s`);
      onConnectionChange(false);
      scheduleReconnect();
    });

    ws.on('error', (err) => {
      console.error('[BioStar] WebSocket error:', err.message);
      // 'close' fires right after, which schedules the reconnect
    });
  }

  connect();

  return {
    stop() {
      stopped = true;
      clearTimeout(rcTimer);
      ws?.close();
    },
  };
}

module.exports = { initBiostar };
