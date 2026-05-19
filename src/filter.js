/**
 * filter.js
 * Filters incoming Biostar2 events:
 *   1. Only process events from configured cafeteria devices
 *   2. (Optional) Only process events within configured time slots
 *   3. Duplicate detection: one scan per user per device per time slot per day
 *
 * Duplicate key format: "YYYY-MM-DD|deviceId|userId|slotName"
 * In-memory store resets on server restart. DB persists across restarts.
 */

/**
 * Convert "HH:MM" string to total minutes from midnight.
 */
function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Get current time as "HH:MM" in local time.
 */
function nowHHMM() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Get today's date as "YYYY-MM-DD".
 */
function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

class EventFilter {
  /**
   * @param {object[]} devices   - Array of { id, name } from config
   * @param {object[]} timeSlots - Array of { name, label, start, end } from config
   * @param {object}   options   - { enforceTimeSlotInApp: boolean }
   */
  constructor(devices, timeSlots, options = {}) {
    // Build lookup map: deviceId to device name
    this.deviceMap = {};
    for (const d of devices) {
      this.deviceMap[String(d.id)] = d.name;
    }

    this.timeSlots = timeSlots;
    this.enforceTimeSlot = options.enforceTimeSlotInApp || false;

    // In-memory duplicate store: Set of "date|deviceId|userId|slotName"
    // Acts as a fast first-pass cache; DB is source of truth on restart
    this.seenKeys = new Set();
  }

  /**
   * Determine which time slot the given time string "HH:MM" falls into.
   * Returns the slot object or null if outside all slots.
   */
  getTimeSlot(timeStr) {
    const current = toMinutes(timeStr);
    for (const slot of this.timeSlots) {
      if (current >= toMinutes(slot.start) && current <= toMinutes(slot.end)) {
        return slot;
      }
    }
    return null;
  }

  /**
   * Process a raw Biostar2 WebSocket event.
   * Returns a structured result object or null if the event should be ignored.
   *
   * Result shape:
   * {
   *   allowed: boolean,
   *   reason: string,          // 'ok' | 'duplicate' | 'outside_slot'
   *   deviceId: string,
   *   deviceName: string,
   *   userId: string,
   *   userName: string,
   *   slotName: string,        // 'breakfast' | 'lunch' | 'dinner'
   *   slotLabel: string,
   *   timestamp: string,       // ISO string
   *   date: string,            // 'YYYY-MM-DD'
   *   duplicateKey: string
   * }
   */
  process(rawEvent) {
    // Biostar2 event structure varies by version.
    // Common fields: device_id, user_id, user_name, datetime, event_type_id
    const deviceId = String(
      rawEvent?.device_id?.id ?? rawEvent?.DeviceID ?? rawEvent?.device_id ?? ''
    );
    const userId = String(
      rawEvent?.user_id?.user_id ?? rawEvent?.UserID ?? rawEvent?.user_id ?? ''
    );
    const userName =
      rawEvent?.user_id?.user_name ?? rawEvent?.UserName ?? rawEvent?.user_name ?? 'Unknown';

    // Ignore events from devices not in our cafeteria list
    if (!this.deviceMap[deviceId]) return null;

    const deviceName = this.deviceMap[deviceId];
    const timestamp = rawEvent?.datetime ?? new Date().toISOString();
    const eventTime = new Date(timestamp);
    const timeStr = `${String(eventTime.getHours()).padStart(2, '0')}:${String(eventTime.getMinutes()).padStart(2, '0')}`;
    const date = eventTime.toISOString().slice(0, 10);

    const slot = this.getTimeSlot(timeStr);

    // Optional: enforce time slots in app (Case A handles this in Biostar2 itself)
    if (!slot) {
      if (this.enforceTimeSlot) {
        return {
          allowed: false,
          reason: 'outside_slot',
          deviceId, deviceName, userId, userName,
          slotName: null, slotLabel: null,
          timestamp, date,
          duplicateKey: null
        };
      }
      // Not enforcing in app; still log it but mark as outside_slot passthrough
      return null;
    }

    // Build duplicate detection key
    const duplicateKey = `${date}|${deviceId}|${userId}|${slot.name}`;

    // Check for duplicate
    if (this.seenKeys.has(duplicateKey)) {
      return {
        allowed: false,
        reason: 'duplicate',
        deviceId, deviceName, userId, userName,
        slotName: slot.name, slotLabel: slot.label,
        timestamp, date,
        duplicateKey
      };
    }

    // New valid scan; register it
    this.seenKeys.add(duplicateKey);

    return {
      allowed: true,
      reason: 'ok',
      deviceId, deviceName, userId, userName,
      slotName: slot.name, slotLabel: slot.label,
      timestamp, date,
      duplicateKey
    };
  }

  /**
   * Load existing duplicate keys from DB records into memory cache.
   * Call this on server startup to restore state across restarts.
   *
   * @param {object[]} records - Array of { date, deviceId, userId, slotName }
   */
  hydrate(records) {
    for (const r of records) {
      this.seenKeys.add(`${r.date}|${r.deviceId}|${r.userId}|${r.slotName}`);
    }
    console.log(`[Filter] Hydrated ${records.length} existing records into memory cache`);
  }
}

module.exports = EventFilter;
