/**
 * biostar.js
 * Handles Biostar2 REST API authentication and WebSocket event streaming.
 * Auth flow: POST /api/login, save bs-session-id, connect WebSocket with same session.
 */

const fetch = require('node-fetch');
const WebSocket = require('ws');
const https = require('https');
const { EventEmitter } = require('events');

// Ignore self-signed certs on internal Biostar2 server
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

class BiostarClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.sessionId = null;
    this.ws = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 5000; // ms between reconnect attempts
  }

  /**
   * Returns the base HTTP(S) URL for REST calls.
   */
  get baseUrl() {
    const proto = this.config.https ? 'https' : 'http';
    return `${proto}://${this.config.host}:${this.config.port}`;
  }

  /**
   * Returns the WebSocket URL.
   * Biostar2 uses the same port for HTTP and WS (ws:// or wss://).
   */
  get wsUrl() {
    const proto = this.config.https ? 'wss' : 'ws';
    return `${proto}://${this.config.host}:${this.config.port}/wsapi`;
  }

  /**
   * Authenticate against Biostar2 REST API.
   * Saves session ID from response header for subsequent requests.
   */
  async login() {
    console.log(`[BioStar] Logging in to ${this.baseUrl}`);

    const res = await fetch(`${this.baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        User: {
          login_id: this.config.username,
          password: this.config.password
        }
      }),
      agent: httpsAgent
    });

    if (!res.ok) {
      throw new Error(`[BioStar] Login failed: HTTP ${res.status}`);
    }

    // Session ID is returned in response header, not body
    this.sessionId = res.headers.get('bs-session-id');
    if (!this.sessionId) {
      throw new Error('[BioStar] Login succeeded but no bs-session-id in response header');
    }

    console.log(`[BioStar] Login successful. Session ID obtained.`);
    return this.sessionId;
  }

  /**
   * Open WebSocket connection to Biostar2 event stream.
   * Biostar2 sends all device events as JSON messages over WS.
   * We pass the session ID as a query param since WS doesn't support custom headers in browser,
   * but in Node we can also send it via the 'headers' option.
   */
  connectWebSocket() {
    if (!this.sessionId) {
      throw new Error('[BioStar] Cannot open WebSocket: not logged in');
    }

    console.log(`[BioStar] Connecting WebSocket to ${this.wsUrl}`);

    this.ws = new WebSocket(this.wsUrl, {
      headers: { 'bs-session-id': this.sessionId },
      agent: httpsAgent,
      rejectUnauthorized: false
    });

    this.ws.on('open', () => {
      console.log('[BioStar] WebSocket connected');
      this.emit('connected');
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    });

    this.ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        this.emit('event', event);
      } catch (err) {
        console.error('[BioStar] Failed to parse WS message:', err.message);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.warn(`[BioStar] WebSocket closed (${code}): ${reason}. Reconnecting in ${this.reconnectDelay}ms...`);
      this.emit('disconnected');
      this._scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[BioStar] WebSocket error:', err.message);
      this.emit('error', err);
    });
  }

  /**
   * Schedule a reconnect attempt.
   * Re-login first since session may have expired.
   */
  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.login();
        this.connectWebSocket();
      } catch (err) {
        console.error('[BioStar] Reconnect failed:', err.message);
        this._scheduleReconnect();
      }
    }, this.reconnectDelay);
  }

  /**
   * Full startup: login then open WebSocket.
   */
  async start() {
    await this.login();
    this.connectWebSocket();
  }

  /**
   * Graceful shutdown.
   */
  stop() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
    this.sessionId = null;
    console.log('[BioStar] Client stopped');
  }
}

module.exports = BiostarClient;
