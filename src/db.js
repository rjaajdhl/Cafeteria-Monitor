/**
 * db.js
 * Lightweight JSON file-based log store.
 * 
 * NOTE: This is intentionally simple for portability.
 * In production, swap this for SQLite (better-sqlite3) or PostgreSQL.
 * The interface (insert, getTodayLogs, getLogsByDate, getSeenRecords) stays the same.
 *
 * Log record shape:
 * {
 *   id: number,
 *   date: "YYYY-MM-DD",
 *   timestamp: ISO string,
 *   deviceId: string,
 *   deviceName: string,
 *   userId: string,
 *   userName: string,
 *   slotName: string,
 *   slotLabel: string,
 *   allowed: boolean,
 *   reason: "ok" | "duplicate" | "outside_slot",
 *   duplicateKey: string | null
 * }
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'logs.json');

class LogStore {
  constructor() {
    this._ensureDir();
    this.records = this._load();
    this._nextId = this.records.length ? Math.max(...this.records.map(r => r.id)) + 1 : 1;
  }

  _ensureDir() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '[]');
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch {
      return [];
    }
  }

  _save() {
    fs.writeFileSync(DB_PATH, JSON.stringify(this.records, null, 2));
  }

  /**
   * Insert a processed event result into the log store.
   * @param {object} result - Output from EventFilter.process()
   * @returns {object} Saved record with ID
   */
  insert(result) {
    const record = { id: this._nextId++, ...result };
    this.records.push(record);
    this._save();
    return record;
  }

  /**
   * Get all logs for today, optionally filtered by deviceId and/or slotName.
   * @param {object} filters - { deviceId?, slotName? }
   */
  getTodayLogs(filters = {}) {
    const today = new Date().toISOString().slice(0, 10);
    return this._query({ ...filters, date: today });
  }

  getRecentLogs(minutes = 5, filters = {}) {
    const cutoff = Date.now() - Number(minutes) * 60 * 1000;
    return this._query(filters).filter(record => new Date(record.timestamp).getTime() >= cutoff);
  }

  /**
   * Get logs for a specific date, optionally filtered.
   * @param {string} date - "YYYY-MM-DD"
   * @param {object} filters - { deviceId?, slotName?, allowed? }
   */
  getLogsByDate(date, filters = {}) {
    return this._query({ ...filters, date });
  }

  /**
   * Get all allowed records (for duplicate hydration on restart).
   * Only returns today's records to limit memory usage.
   */
  getSeenRecords() {
    const today = new Date().toISOString().slice(0, 10);
    return this.records.filter(r => r.date === today && r.allowed === true);
  }

  /**
   * Internal query helper.
   */
  _query(filters) {
    return this.records.filter(r => {
      if (filters.date && r.date !== filters.date) return false;
      if (filters.deviceId && r.deviceId !== filters.deviceId) return false;
      if (filters.slotName && r.slotName !== filters.slotName) return false;
      if (filters.allowed !== undefined && r.allowed !== filters.allowed) return false;
      return true;
    });
  }

  /**
   * Get summary counts for a date: per device per slot, allowed vs denied.
   * @param {string} date - "YYYY-MM-DD"
   * @returns {object} Nested summary object
   */
  getSummary(date) {
    const logs = this.getLogsByDate(date);
    const summary = {};

    for (const log of logs) {
      if (!log.slotName) continue; // skip outside_slot entries
      const key = `${log.deviceName}|${log.slotName}`;
      if (!summary[key]) {
        summary[key] = {
          deviceId: log.deviceId,
          deviceName: log.deviceName,
          slotName: log.slotName,
          slotLabel: log.slotLabel,
          allowed: 0,
          denied: 0
        };
      }
      if (log.allowed) summary[key].allowed++;
      else summary[key].denied++;
    }

    return Object.values(summary);
  }
}

module.exports = LogStore;
