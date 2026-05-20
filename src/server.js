/**
 * server.js  (updated)
 * Additions over the original:
 *   - cookie-parser + express-session middleware
 *   - /api/unlock  (iPad lock-screen PIN check)
 *   - /api/admin/* (admin console routes)
 *   - SSE event: config_changed  (broadcast after admin mutations)
 *   - Admin seed on startup (creates default admin/admin + PIN 123456 if data/admin.json absent)
 *
 * Original files (biostar.js, filter.js, db.js) are unchanged — drop them in as-is.
 */

'use strict';
require('dotenv').config();

const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const cookieParser = require('cookie-parser');
const session      = require('express-session');

const { initBiostar } = require('./biostar');
const { processEvent } = require('./filter');
const db               = require('./db');

const { router: adminRouter, unlockHandler, setBroadcast, seedIfNeeded } = require('./admin');

/* ── Config ──────────────────────────────────────────── */
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'config.json');
let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

/* Session secret: prefer env var, fall back to config, then a startup-generated value.
   In production always set SESSION_SECRET in your environment. */
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  config.sessionSecret ||
  (() => {
    const s = require('crypto').randomBytes(32).toString('hex');
    console.warn('[Server] ⚠  No SESSION_SECRET set — using a random one. Sessions will not survive restart.');
    return s;
  })();

/* ── App ─────────────────────────────────────────────── */
const app  = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'cafmon.sid',
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,          // set to true when terminating TLS in front of this server
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  },
}));

/* Serve the frontend (public/index.html + admin-panel.html). */
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

/* ── SSE clients + broadcast ─────────────────────────── */
const clients = new Set();

function broadcast(event, data) {
  const chunk = event === 'message'
    ? `data: ${JSON.stringify(data)}\n\n`
    : `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try { client.write(chunk); } catch {}
  }
}

/* Wire broadcast into admin router so config_changed works. */
setBroadcast(broadcast);

/* ── SSE endpoint ────────────────────────────────────── */
app.get('/events', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if proxied
  res.flushHeaders();

  /* Send today's snapshot so a fresh iPad gets filled in immediately. */
  const today = new Date().toISOString().slice(0, 10);
  try {
    const logs = await db.getByDate(today);
    res.write(`event: init\ndata: ${JSON.stringify(logs)}\n\n`);
  } catch {}

  clients.add(res);
  console.log(`[SSE] Client connected — total: ${clients.size}`);

  /* Keep-alive ping every 25 s to prevent proxy timeouts. */
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 25_000);

  req.on('close', () => {
    clients.delete(res);
    clearInterval(ping);
    console.log(`[SSE] Client disconnected — total: ${clients.size}`);
  });
});

/* ── Public API: config + logs ───────────────────────── */
app.get('/api/config', (req, res) => {
  /* Re-read config from the in-memory object (admin mutations update it in place). */
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  res.json({ devices: cfg.devices || [], timeSlots: cfg.timeSlots || [] });
});

app.get('/api/logs/today', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const logs = await db.getByDate(today);
    res.json(logs);
  } catch (err) {
    console.error('[Server] /api/logs/today error', err);
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

/* ── Unlock (iPad PIN) ───────────────────────────────── */
app.post('/api/unlock', unlockHandler);

/* ── Admin console routes ────────────────────────────── */
app.use('/api/admin', adminRouter);

/* ── Biostar2 integration ────────────────────────────── */
initBiostar(
  config.biostar,

  /* onEvent: called for each filtered scan */
  async (event) => {
    /* Re-read config each time so filter uses up-to-date device list. */
    const currentConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const processed = processEvent(event, currentConfig);
    if (!processed) return;
    try { await db.save(processed); } catch (err) { console.error('[DB] save error', err); }
    broadcast('message', processed);
  },

  /* onConnectionChange: notifies iPads of Biostar2 up/down */
  (connected) => {
    broadcast('system', { type: connected ? 'biostar_connected' : 'biostar_disconnected' });
    console.log(`[BioStar] ${connected ? 'Connected' : 'Disconnected'}`);
  }
);

/* ── Start ───────────────────────────────────────────── */
seedIfNeeded().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`[Server] Cafeteria Monitor running on http://${HOST}:${PORT}`);
    console.log(`[Server] Admin panel → http://${HOST}:${PORT}/admin-panel.html`);
  });
}).catch(err => {
  console.error('[Server] Startup failed:', err);
  process.exit(1);
});
