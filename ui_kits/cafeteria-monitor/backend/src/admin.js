/**
 * admin.js
 * Admin router: auth, account CRUD, device/slot management, PIN change, log export.
 *
 * Mount in server.js:
 *   app.use('/api/admin', adminRouter);
 *   app.post('/api/unlock', unlockHandler);
 */

'use strict';
const express  = require('express');
const bcrypt   = require('bcrypt');
const crypto   = require('crypto');
const fs       = require('fs');
const path     = require('path');

const router = express.Router();

const CONFIG_PATH     = path.join(__dirname, '..', 'config', 'config.json');
const ADMIN_DATA_PATH = path.join(__dirname, '..', 'data', 'admin.json');
const SALT_ROUNDS     = 10;

/* ── In-memory caches ────────────────────────────────── */
let _config    = null;
let _adminData = null;

function loadConfig() {
  if (!_config) _config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return _config;
}
function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(_config, null, 2), 'utf8');
}

function loadAdminData() {
  if (!_adminData) {
    if (fs.existsSync(ADMIN_DATA_PATH)) {
      _adminData = JSON.parse(fs.readFileSync(ADMIN_DATA_PATH, 'utf8'));
    } else {
      _adminData = { admins: [], unlockPinHash: null };
    }
  }
  return _adminData;
}
function saveAdminData() {
  const dir = path.dirname(ADMIN_DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ADMIN_DATA_PATH, JSON.stringify(_adminData, null, 2), 'utf8');
}

/* ── First-boot seed ─────────────────────────────────── */
async function seedIfNeeded() {
  const data = loadAdminData();
  let dirty = false;

  if (!data.admins || data.admins.length === 0) {
    data.admins = [{
      id: 1,
      username: 'admin',
      passwordHash: await bcrypt.hash('admin', SALT_ROUNDS),
      createdAt: new Date().toISOString(),
    }];
    dirty = true;
    console.log('[Admin] ⚠  Created default admin — username: admin  password: admin — CHANGE THIS!');
  }

  if (!data.unlockPinHash) {
    data.unlockPinHash = await bcrypt.hash('123456', SALT_ROUNDS);
    dirty = true;
    console.log('[Admin] ⚠  Created default unlock PIN: 123456 — CHANGE THIS via /admin-panel!');
  }

  if (dirty) saveAdminData();
}

/* ── SSE broadcast hook (wired up by server.js) ─────── */
let _broadcast = null;
function setBroadcast(fn) { _broadcast = fn; }
function broadcastConfig() {
  if (!_broadcast) return;
  const cfg = loadConfig();
  _broadcast('config_changed', { devices: cfg.devices || [], timeSlots: cfg.timeSlots || [] });
}

/* ── Auth middleware ─────────────────────────────────── */
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

/* ── /api/unlock  (public — called by iPad lock screen) ─ */
async function unlockHandler(req, res) {
  const { pin } = req.body || {};
  if (!pin || !/^\d{4,8}$/.test(String(pin))) {
    return res.status(400).json({ ok: false, error: 'Invalid PIN format' });
  }
  const data = loadAdminData();
  if (!data.unlockPinHash) {
    return res.status(503).json({ ok: false, error: 'Server not initialised yet' });
  }
  const ok = await bcrypt.compare(String(pin), data.unlockPinHash);
  if (!ok) return res.status(401).json({ ok: false, error: 'Wrong PIN' });
  const token = crypto.randomBytes(32).toString('hex');
  res.json({ ok: true, token });
}

/* ── Auth ────────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const data  = loadAdminData();
  const admin = (data.admins || []).find(a => a.username === username);
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(String(password), admin.passwordHash);
  if (!ok)    return res.status(401).json({ error: 'Invalid credentials' });
  req.session.adminId       = admin.id;
  req.session.adminUsername = admin.username;
  res.json({ ok: true, user: { id: admin.id, username: admin.username } });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

router.get('/me', requireAdmin, (req, res) => {
  res.json({ id: req.session.adminId, username: req.session.adminUsername });
});

/* ── Admin accounts ──────────────────────────────────── */
router.get('/accounts', requireAdmin, (req, res) => {
  const { admins = [] } = loadAdminData();
  res.json(admins.map(({ id, username, createdAt }) => ({ id, username, createdAt })));
});

router.post('/accounts', requireAdmin, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'Username required, password must be ≥ 8 characters' });
  }
  const data = loadAdminData();
  if ((data.admins || []).some(a => a.username === username)) {
    return res.status(409).json({ error: 'Username already taken' });
  }
  const admin = {
    id: Date.now(),
    username,
    passwordHash: await bcrypt.hash(String(password), SALT_ROUNDS),
    createdAt: new Date().toISOString(),
  };
  data.admins.push(admin);
  saveAdminData();
  res.status(201).json({ id: admin.id, username: admin.username, createdAt: admin.createdAt });
});

router.delete('/accounts/:id', requireAdmin, (req, res) => {
  const id   = Number(req.params.id);
  const data = loadAdminData();
  if (id === req.session.adminId) return res.status(400).json({ error: "You can't delete your own account" });
  if ((data.admins || []).length <= 1) return res.status(400).json({ error: 'Must keep at least one admin account' });
  data.admins = (data.admins || []).filter(a => a.id !== id);
  saveAdminData();
  res.json({ ok: true });
});

/* ── Devices (stations) ──────────────────────────────── */
router.get('/devices', requireAdmin, (req, res) => {
  res.json(loadConfig().devices || []);
});

router.post('/devices', requireAdmin, (req, res) => {
  const { id, name } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: 'id and name are required' });
  const cfg = loadConfig();
  if ((cfg.devices || []).some(d => String(d.id) === String(id))) {
    return res.status(409).json({ error: 'A device with that ID already exists' });
  }
  const device = { id: String(id), name };
  cfg.devices = [...(cfg.devices || []), device];
  saveConfig();
  broadcastConfig();
  res.status(201).json(device);
});

router.put('/devices/:id', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const cfg = loadConfig();
  const d = (cfg.devices || []).find(x => x.id === req.params.id);
  if (!d) return res.status(404).json({ error: 'Device not found' });
  d.name = name;
  saveConfig();
  broadcastConfig();
  res.json(d);
});

router.delete('/devices/:id', requireAdmin, (req, res) => {
  const cfg = loadConfig();
  cfg.devices = (cfg.devices || []).filter(d => d.id !== req.params.id);
  saveConfig();
  broadcastConfig();
  res.json({ ok: true });
});

/* ── Time slots ──────────────────────────────────────── */
router.get('/timeslots', requireAdmin, (req, res) => {
  res.json(loadConfig().timeSlots || []);
});

router.put('/timeslots', requireAdmin, (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected an array of time slots' });
  const cfg = loadConfig();
  cfg.timeSlots = req.body;
  saveConfig();
  broadcastConfig();
  res.json(cfg.timeSlots);
});

/* ── Unlock PIN ──────────────────────────────────────── */
router.put('/pin', requireAdmin, async (req, res) => {
  const { newPin } = req.body || {};
  if (!/^\d{6}$/.test(String(newPin || ''))) {
    return res.status(400).json({ error: 'PIN must be exactly 6 digits' });
  }
  const data = loadAdminData();
  data.unlockPinHash = await bcrypt.hash(String(newPin), SALT_ROUNDS);
  saveAdminData();
  res.json({ ok: true });
});

/* ── Log export ──────────────────────────────────────── */
router.get('/logs.csv', requireAdmin, async (req, res) => {
  const db   = require('./db');
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const logs = await db.getByDate(date);
    const cols = ['id','timestamp','userId','userName','deviceId','deviceName','slotName','allowed','reason'];
    const header = cols.join(',') + '\n';
    const rows   = (logs || []).map(l =>
      cols.map(k => JSON.stringify(l[k] ?? '')).join(',')
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cafeteria-${date}.csv"`);
    res.send(header + rows);
  } catch (err) {
    console.error('[Admin] CSV export error', err);
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

module.exports = { router, requireAdmin, unlockHandler, setBroadcast, seedIfNeeded };
