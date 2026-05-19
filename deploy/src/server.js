/**
 * Express server for the cafeteria monitor.
 *
 * Responsibilities:
 * - BioStar2 event ingestion
 * - realtime read-only monitor feed
 * - passcode-gated history access
 * - admin-managed devices, time slots, options, and user permissions
 */

const crypto = require('crypto');
const express = require('express');
const path = require('path');
require('dotenv').config();

const AuthStore = require('./auth-store');
const BiostarClient = require('./biostar');
const ConfigStore = require('./config-store');
const EventFilter = require('./filter');
const LogStore = require('./db');

const app = express();
const store = new LogStore();
const configStore = new ConfigStore();
const authStore = new AuthStore();
const sessions = new Map();

let config = configStore.getConfig();
let filter = buildFilter(config);
let biostar = buildBiostar(config);

function buildFilter(nextConfig) {
  const enabledDevices = nextConfig.devices.filter(device => device.enabled !== false);
  const nextFilter = new EventFilter(enabledDevices, nextConfig.timeSlots, nextConfig.options);
  nextFilter.hydrate(store.getSeenRecords());
  return nextFilter;
}

function buildBiostar(nextConfig) {
  const client = new BiostarClient(nextConfig.biostar);
  client.on('event', handleBiostarEvent);
  client.on('connected', () => broadcastSystem({ type: 'biostar_connected' }));
  client.on('disconnected', () => broadcastSystem({ type: 'biostar_disconnected' }));
  client.on('error', () => {});
  return client;
}

function reloadRuntime({ restartBiostar = false } = {}) {
  config = configStore.getConfig();
  filter = buildFilter(config);

  if (restartBiostar) {
    biostar.stop();
    biostar = buildBiostar(config);
    if (config.options.startBiostar) {
      biostar.start().catch(err => {
        console.error('[Server] Failed to restart BioStar2 client:', err.message);
      });
    }
  }
}

function handleBiostarEvent(rawEvent) {
  const result = filter.process(rawEvent);
  if (!result) return;

  const record = store.insert(result);
  broadcast(record);

  const status = record.allowed ? 'ALLOW' : 'DENY';
  console.log(
    `[Event] ${status} | ${record.deviceName} | ${record.userName} (${record.userId}) | ${record.slotLabel ?? 'no-slot'} | ${record.reason}`
  );
}

function parseCookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf('=');
      if (index >= 0) cookies[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
      return cookies;
    }, {});
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    userId: user.id,
    createdAt: Date.now(),
    historyUnlockedUntil: 0
  });
  return token;
}

function getSession(req) {
  const token = parseCookies(req).cafmon_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  const user = authStore.findById(session.userId);
  if (!user) return null;
  return { token, session, user };
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `cafmon_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'cafmon_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

function requireAuth(req, res, next) {
  const current = getSession(req);
  if (!current) return res.status(401).json({ error: 'login_required' });
  req.current = current;
  next();
}

function requireAdmin(req, res, next) {
  if (req.current.user.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
  next();
}

function requireHistoryUnlock(req, res, next) {
  if (req.current.session.historyUnlockedUntil < Date.now()) {
    return res.status(403).json({ error: 'history_locked' });
  }
  next();
}

function canViewDevice(user, deviceId) {
  if (user.role === 'admin') return true;
  if (!Array.isArray(user.deviceIds) || user.deviceIds.length === 0) return false;
  return user.deviceIds.includes(String(deviceId));
}

function filterForUser(records, user) {
  return records.filter(record => canViewDevice(user, record.deviceId));
}

function userConfig(user) {
  const safeConfig = {
    devices: config.devices.filter(device => canViewDevice(user, device.id)),
    timeSlots: config.timeSlots,
    options: {
      recentLogMinutes: config.options.recentLogMinutes
    }
  };
  if (user.role === 'admin') safeConfig.admin = config;
  return safeConfig;
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Auth ---

app.post('/api/auth/login', (req, res) => {
  const user = authStore.authenticate(req.body.username, req.body.password);
  if (!user) return res.status(401).json({ error: 'invalid_login' });
  const token = createSession(user);
  setSessionCookie(res, token);
  res.json({ user: authStore.sanitize(user), config: userConfig(user) });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  sessions.delete(req.current.token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    user: authStore.sanitize(req.current.user),
    config: userConfig(req.current.user),
    historyUnlocked: req.current.session.historyUnlockedUntil >= Date.now()
  });
});

app.post('/api/auth/unlock-history', requireAuth, (req, res) => {
  if (!authStore.verifyPasscode(req.current.user.id, req.body.passcode)) {
    return res.status(401).json({ error: 'invalid_passcode' });
  }
  req.current.session.historyUnlockedUntil = Date.now() + 15 * 60 * 1000;
  res.json({ ok: true, unlockedUntil: req.current.session.historyUnlockedUntil });
});

// --- Config visible to signed-in users ---

app.get('/api/config', requireAuth, (req, res) => {
  res.json(userConfig(req.current.user));
});

// --- Logs ---

app.get('/api/logs/recent', requireAuth, (req, res) => {
  const minutes = Number(req.query.minutes || config.options.recentLogMinutes || 5);
  const filters = {};
  if (req.query.deviceId) filters.deviceId = String(req.query.deviceId);
  if (filters.deviceId && !canViewDevice(req.current.user, filters.deviceId)) {
    return res.status(403).json({ error: 'device_forbidden' });
  }
  res.json(filterForUser(store.getRecentLogs(minutes, filters), req.current.user));
});

app.get('/api/logs/today', requireAuth, requireHistoryUnlock, (req, res) => {
  const filters = {};
  if (req.query.deviceId) filters.deviceId = String(req.query.deviceId);
  if (req.query.slotName) filters.slotName = String(req.query.slotName);
  if (req.query.allowed !== undefined) filters.allowed = req.query.allowed === 'true';
  if (filters.deviceId && !canViewDevice(req.current.user, filters.deviceId)) {
    return res.status(403).json({ error: 'device_forbidden' });
  }
  res.json(filterForUser(store.getTodayLogs(filters), req.current.user));
});

app.get('/api/logs/:date', requireAuth, requireHistoryUnlock, (req, res) => {
  const filters = {};
  if (req.query.deviceId) filters.deviceId = String(req.query.deviceId);
  if (req.query.slotName) filters.slotName = String(req.query.slotName);
  if (req.query.allowed !== undefined) filters.allowed = req.query.allowed === 'true';
  if (filters.deviceId && !canViewDevice(req.current.user, filters.deviceId)) {
    return res.status(403).json({ error: 'device_forbidden' });
  }
  res.json(filterForUser(store.getLogsByDate(req.params.date, filters), req.current.user));
});

app.get('/api/summary/:date', requireAuth, requireHistoryUnlock, (req, res) => {
  const summary = store.getSummary(req.params.date).filter(row => canViewDevice(req.current.user, row.deviceId));
  res.json(summary);
});

// --- Admin ---

app.get('/api/admin/config', requireAuth, requireAdmin, (req, res) => {
  res.json(config);
});

app.patch('/api/admin/biostar', requireAuth, requireAdmin, (req, res) => {
  const next = configStore.updateBiostar(req.body);
  reloadRuntime({ restartBiostar: true });
  res.json(next);
});

app.patch('/api/admin/options', requireAuth, requireAdmin, (req, res) => {
  const next = configStore.updateOptions(req.body);
  reloadRuntime();
  res.json(next);
});

app.post('/api/admin/devices', requireAuth, requireAdmin, (req, res) => {
  const next = configStore.upsertDevice(req.body);
  reloadRuntime();
  broadcastConfig();
  res.json(next);
});

app.patch('/api/admin/devices/:id', requireAuth, requireAdmin, (req, res) => {
  const next = configStore.upsertDevice({ ...req.body, id: req.params.id });
  reloadRuntime();
  broadcastConfig();
  res.json(next);
});

app.delete('/api/admin/devices/:id', requireAuth, requireAdmin, (req, res) => {
  const next = configStore.deleteDevice(req.params.id);
  reloadRuntime();
  broadcastConfig();
  res.json(next);
});

app.post('/api/admin/time-slots', requireAuth, requireAdmin, (req, res) => {
  const next = configStore.upsertTimeSlot(req.body);
  reloadRuntime();
  broadcastConfig();
  res.json(next);
});

app.patch('/api/admin/time-slots/:name', requireAuth, requireAdmin, (req, res) => {
  const next = configStore.upsertTimeSlot({ ...req.body, name: req.params.name });
  reloadRuntime();
  broadcastConfig();
  res.json(next);
});

app.delete('/api/admin/time-slots/:name', requireAuth, requireAdmin, (req, res) => {
  const next = configStore.deleteTimeSlot(req.params.name);
  reloadRuntime();
  broadcastConfig();
  res.json(next);
});

// --- Unlock (kiosk PIN — uses the user's passcode) ---
// The iPad is pre-logged-in as a viewer. Entering their passcode unlocks
// the UI controls (station selector etc.) for 5 minutes.
app.post('/api/unlock', requireAuth, (req, res) => {
  const { pin } = req.body || {};
  if (!pin) return res.status(400).json({ ok: false, error: 'PIN required' });
  if (!authStore.verifyPasscode(req.current.user.id, String(pin))) {
    return res.status(401).json({ ok: false, error: 'Wrong PIN' });
  }
  req.current.session.historyUnlockedUntil = Date.now() + 5 * 60 * 1000;
  const token = crypto.randomBytes(16).toString('hex');
  res.json({ ok: true, token, unlockedUntil: req.current.session.historyUnlockedUntil });
});

// --- Admin log export (CSV, no history-unlock required for admin) ---
app.get('/api/admin/logs.csv', requireAuth, requireAdmin, (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const logs = store.getLogsByDate(date, {});
  const cols = ['id', 'timestamp', 'userId', 'userName', 'deviceId', 'deviceName', 'slotName', 'allowed', 'reason'];
  const header = cols.join(',') + '\n';
  const rows = logs.map(l => cols.map(k => JSON.stringify(l[k] ?? '')).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="cafeteria-${date}.csv"`);
  res.send(header + rows);
});

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  res.json(authStore.listUsers());
});

app.post('/api/admin/users', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  res.status(201).json(authStore.createUser(req.body));
}));

app.patch('/api/admin/users/:id', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  res.json(authStore.updateUser(req.params.id, req.body));
}));

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  authStore.deleteUser(req.params.id);
  res.json({ ok: true });
}));

// --- Realtime feed ---

const sseClients = new Map();

function broadcast(record) {
  const payload = JSON.stringify(record);
  for (const [res, client] of sseClients.entries()) {
    if (!canViewDevice(client.user, record.deviceId)) continue;
    if (client.filters.deviceId && client.filters.deviceId !== record.deviceId) continue;
    if (client.filters.slotName && client.filters.slotName !== record.slotName) continue;
    try {
      res.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(res);
    }
  }
}

function broadcastSystem(msg) {
  const payload = JSON.stringify(msg);
  for (const [res] of sseClients.entries()) {
    try {
      res.write(`event: system\ndata: ${payload}\n\n`);
    } catch {
      sseClients.delete(res);
    }
  }
}

// Broadcast updated device/slot config to all connected iPads so they
// hot-swap labels without a page reload.
function broadcastConfig() {
  const cfg = configStore.getConfig();
  const payload = JSON.stringify({ devices: cfg.devices, timeSlots: cfg.timeSlots });
  for (const [res] of sseClients.entries()) {
    try {
      res.write(`event: config_changed\ndata: ${payload}\n\n`);
    } catch {
      sseClients.delete(res);
    }
  }
}

app.get('/events', requireAuth, (req, res) => {
  const filters = {
    deviceId: req.query.deviceId || null,
    slotName: req.query.slotName || null
  };
  if (filters.deviceId && !canViewDevice(req.current.user, filters.deviceId)) {
    return res.status(403).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  sseClients.set(res, {
    filters,
    user: req.current.user
  });

  const minutes = Number(config.options.recentLogMinutes || 5);
  const recent = filterForUser(store.getRecentLogs(minutes, filters), req.current.user);
  res.write(`event: init\ndata: ${JSON.stringify(recent)}\n\n`);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

app.use((err, req, res, next) => {
  console.error('[Server] Request failed:', err.message);
  res.status(400).json({ error: err.message });
});

const PORT = config.options.appPort || 3000;

app.listen(PORT, () => {
  console.log(`[Server] Cafeteria Monitor running on http://0.0.0.0:${PORT}`);
  console.log(`[Server] Default admin is admin/admin123 with passcode 1234 unless ADMIN_* env vars were set before first run.`);
  if (config.options.startBiostar) {
    console.log('[Server] Connecting to BioStar2...');
    biostar.start().catch(err => {
      console.error('[Server] Failed to start BioStar2 client:', err.message);
      console.error('[Server] Check BioStar settings in the admin panel or disable START_BIOSTAR for local UI work.');
    });
  } else {
    console.log('[Server] BioStar2 client disabled by config');
  }
});

module.exports = app;
