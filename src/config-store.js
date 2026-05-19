const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'app-config.json');
const CONFIG_DIR = path.join(__dirname, '..', 'config');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

class ConfigStore {
  constructor() {
    this.config = this._load();
  }

  _load() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const existing = readJsonIfExists(CONFIG_PATH);
    if (existing) return this._normalize(existing);

    const seed =
      readJsonIfExists(path.join(CONFIG_DIR, 'config.json')) ||
      readJsonIfExists(path.join(CONFIG_DIR, 'config.example.json')) ||
      {};
    const normalized = this._normalize(this._withEnvDefaults(seed));
    this._save(normalized);
    return normalized;
  }

  _withEnvDefaults(config) {
    return {
      ...config,
      biostar: {
        ...(config.biostar || {}),
        host: process.env.BIOSTAR_HOST || config.biostar?.host,
        port: process.env.BIOSTAR_PORT || config.biostar?.port,
        https: process.env.BIOSTAR_HTTPS === undefined
          ? config.biostar?.https
          : String(process.env.BIOSTAR_HTTPS) !== 'false',
        username: process.env.BIOSTAR_USERNAME || config.biostar?.username,
        password: process.env.BIOSTAR_PASSWORD || config.biostar?.password
      },
      options: {
        ...(config.options || {}),
        appPort: process.env.PORT || process.env.APP_PORT || config.options?.appPort,
        startBiostar: process.env.START_BIOSTAR === undefined
          ? config.options?.startBiostar
          : String(process.env.START_BIOSTAR) !== 'false'
      }
    };
  }

  _normalize(config) {
    return {
      biostar: {
        host: config.biostar?.host || 'biostar.local',
        port: Number(config.biostar?.port || 443),
        https: config.biostar?.https !== false,
        username: config.biostar?.username || '',
        password: config.biostar?.password || ''
      },
      devices: Array.isArray(config.devices) ? config.devices.map(device => ({
        id: String(device.id),
        name: String(device.name || device.id),
        enabled: device.enabled !== false
      })) : [],
      timeSlots: Array.isArray(config.timeSlots) ? config.timeSlots.map(slot => ({
        name: String(slot.name),
        label: String(slot.label || slot.name),
        start: String(slot.start),
        end: String(slot.end)
      })) : [],
      options: {
        enforceTimeSlotInApp: Boolean(config.options?.enforceTimeSlotInApp),
        appPort: Number(config.options?.appPort || 3000),
        logRetentionDays: Number(config.options?.logRetentionDays || 90),
        recentLogMinutes: Number(config.options?.recentLogMinutes || 5),
        startBiostar: config.options?.startBiostar !== false
      }
    };
  }

  _save(config = this.config) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  }

  getConfig() {
    return clone(this.config);
  }

  updateConfig(nextConfig) {
    this.config = this._normalize({ ...this.config, ...nextConfig });
    this._save();
    return this.getConfig();
  }

  updateBiostar(biostar) {
    this.config.biostar = this._normalize({ ...this.config, biostar }).biostar;
    this._save();
    return this.getConfig();
  }

  updateOptions(options) {
    this.config.options = this._normalize({
      ...this.config,
      options: { ...this.config.options, ...options }
    }).options;
    this._save();
    return this.getConfig();
  }

  upsertDevice(device) {
    const normalized = this._normalize({ devices: [device] }).devices[0];
    const index = this.config.devices.findIndex(item => item.id === normalized.id);
    if (index >= 0) this.config.devices[index] = normalized;
    else this.config.devices.push(normalized);
    this._save();
    return this.getConfig();
  }

  deleteDevice(id) {
    this.config.devices = this.config.devices.filter(device => device.id !== String(id));
    this._save();
    return this.getConfig();
  }

  upsertTimeSlot(slot) {
    const normalized = this._normalize({ timeSlots: [slot] }).timeSlots[0];
    const index = this.config.timeSlots.findIndex(item => item.name === normalized.name);
    if (index >= 0) this.config.timeSlots[index] = normalized;
    else this.config.timeSlots.push(normalized);
    this._save();
    return this.getConfig();
  }

  deleteTimeSlot(name) {
    this.config.timeSlots = this.config.timeSlots.filter(slot => slot.name !== String(name));
    this._save();
    return this.getConfig();
  }
}

module.exports = ConfigStore;
