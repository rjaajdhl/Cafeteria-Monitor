const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_PATH = path.join(DATA_DIR, 'users.json');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashSecret(secret, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(secret), salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifySecret(secret, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, expected] = stored.split(':');
  const actual = hashSecret(secret, salt).split(':')[1];
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

class AuthStore {
  constructor() {
    this.users = this._load();
  }

  _load() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(USERS_PATH)) {
      return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
    }

    const admin = {
      id: crypto.randomUUID(),
      username: process.env.ADMIN_USERNAME || 'admin',
      displayName: 'Administrator',
      role: 'admin',
      passwordHash: hashSecret(process.env.ADMIN_PASSWORD || 'admin123'),
      passcodeHash: hashSecret(process.env.ADMIN_PASSCODE || '1234'),
      deviceIds: [],
      createdAt: new Date().toISOString()
    };
    this._save([admin]);
    return [admin];
  }

  _save(users = this.users) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
  }

  sanitize(user) {
    if (!user) return null;
    const { passwordHash, passcodeHash, ...safe } = user;
    return clone(safe);
  }

  listUsers() {
    return this.users.map(user => this.sanitize(user));
  }

  findById(id) {
    return this.users.find(user => user.id === id) || null;
  }

  findByUsername(username) {
    return this.users.find(user => user.username.toLowerCase() === String(username).toLowerCase()) || null;
  }

  authenticate(username, password) {
    const user = this.findByUsername(username);
    if (!user || !verifySecret(password, user.passwordHash)) return null;
    return user;
  }

  verifyPasscode(userId, passcode) {
    const user = this.findById(userId);
    return Boolean(user && verifySecret(passcode, user.passcodeHash));
  }

  createUser(input) {
    if (!input.username || !input.password || !input.passcode) {
      throw new Error('username, password, and passcode are required');
    }
    if (this.findByUsername(input.username)) {
      throw new Error('username already exists');
    }

    const user = {
      id: crypto.randomUUID(),
      username: String(input.username).trim(),
      displayName: String(input.displayName || input.username).trim(),
      role: input.role === 'admin' ? 'admin' : 'viewer',
      passwordHash: hashSecret(input.password),
      passcodeHash: hashSecret(input.passcode),
      deviceIds: Array.isArray(input.deviceIds) ? input.deviceIds.map(String) : [],
      createdAt: new Date().toISOString()
    };
    this.users.push(user);
    this._save();
    return this.sanitize(user);
  }

  updateUser(id, input) {
    const user = this.findById(id);
    if (!user) throw new Error('user not found');
    if (input.username && input.username !== user.username && this.findByUsername(input.username)) {
      throw new Error('username already exists');
    }

    if (input.username) user.username = String(input.username).trim();
    if (input.displayName !== undefined) user.displayName = String(input.displayName).trim();
    if (input.role) user.role = input.role === 'admin' ? 'admin' : 'viewer';
    if (Array.isArray(input.deviceIds)) user.deviceIds = input.deviceIds.map(String);
    if (input.password) user.passwordHash = hashSecret(input.password);
    if (input.passcode) user.passcodeHash = hashSecret(input.passcode);
    this._save();
    return this.sanitize(user);
  }

  deleteUser(id) {
    const user = this.findById(id);
    if (!user) throw new Error('user not found');
    if (user.role === 'admin' && this.users.filter(item => item.role === 'admin').length <= 1) {
      throw new Error('cannot delete the last admin');
    }
    this.users = this.users.filter(item => item.id !== id);
    this._save();
  }
}

module.exports = AuthStore;
