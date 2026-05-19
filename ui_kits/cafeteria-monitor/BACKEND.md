# Backend Handoff — Lock & Admin

This documents the endpoints the new frontend (`index.html` lock layer + `admin-panel.html`) expects from `server.js`. Implement these and the UI works against the real backend; until then both pages fall back to mock mode for preview.

## New dependencies

```bash
npm install bcrypt express-session cookie-parser
```

## Storage

Extend `config.json` (or move to `data/admin.json`, your call) with:

```json
{
  "unlockPinHash": "<bcrypt hash of 6-digit PIN>",
  "admins": [
    { "id": 1, "username": "admin", "passwordHash": "<bcrypt>", "createdAt": "2026-05-01T09:00:00Z" }
  ],
  "sessionSecret": "<random 32+ char string>"
}
```

Seed on first boot: if no admins exist, create `admin` / `admin` (force change on first login). Same for PIN — default `123456` if unset.

## Session middleware

```js
app.use(cookieParser());
app.use(session({
  secret: cfg.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8*60*60*1000 },
}));
function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: 'Not logged in' });
  next();
}
```

## Endpoints

### Unlock (iPad)
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/unlock` | `{ pin: "123456" }` | `200 { ok:true, token:"..." }` / `401 { error }` |

`token` is opaque to the frontend; can be a signed JWT or a session cookie value. The frontend stores it in `sessionStorage` and treats its presence as "unlocked".

### Admin auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/admin/login` | `{ username, password }` | `200 { ok:true, user:{id,username} }` (sets session cookie) |
| POST | `/api/admin/logout` | — | `200 { ok:true }` (clears session) |
| GET  | `/api/admin/me` | — | `200 { id, username }` / `401` |

### Admin accounts
| Method | Path | Body | Returns |
|---|---|---|---|
| GET    | `/api/admin/accounts` | — | `[{ id, username, createdAt }]` |
| POST   | `/api/admin/accounts` | `{ username, password }` | `201 { id, username, createdAt }` |
| DELETE | `/api/admin/accounts/:id` | — | `200 { ok:true }` |

Rules: can't delete your own account; can't delete the last remaining admin.

### Unlock PIN
| Method | Path | Body | Returns |
|---|---|---|---|
| PUT | `/api/admin/pin` | `{ newPin: "123456" }` | `200 { ok:true }` |

Validate `^\d{6}$`. Store as `bcrypt.hash(newPin, 10)`.

### Devices (stations)
| Method | Path | Body | Returns |
|---|---|---|---|
| GET    | `/api/admin/devices` | — | `[{ id, name }]` |
| POST   | `/api/admin/devices` | `{ id, name }` | `201 { id, name }` |
| PUT    | `/api/admin/devices/:id` | `{ name }` | `200 { id, name }` |
| DELETE | `/api/admin/devices/:id` | — | `200 { ok:true }` |

After any mutation, persist config and **broadcast** to all SSE clients:
```js
broadcast('config_changed', { devices, timeSlots });
```

### Time slots
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/admin/timeslots` | — | `[{ name, label, start, end }]` |
| PUT | `/api/admin/timeslots` | `[{ name, label, start, end }]` | same array |

Also broadcasts `config_changed` after save.

### Log export
| Method | Path | Returns |
|---|---|---|
| GET | `/api/admin/logs.csv?date=YYYY-MM-DD` | `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="cafeteria-YYYY-MM-DD.csv"` |

Columns: `id,timestamp,userId,userName,deviceId,deviceName,slot,allowed,reason`.

## SSE additions

`/events` gains one new event type. Existing `init`, default message, and `system` events stay as they are.

```
event: config_changed
data: { "devices": [...], "timeSlots": [...] }
```

The frontend hot-swaps station/slot lists without reload. Always broadcast after any device or timeslot mutation.

## Auth on mutations

All `/api/admin/*` routes (except `/login` and `/me`) require `requireAdmin`. Return `401 { error: "Not logged in" }` for missing/expired sessions — the frontend will redirect back to login.

`/api/unlock` is **public** (no admin session required) — it's used by the kiosk iPad which doesn't have an admin login. Rate-limit it (e.g. `express-rate-limit`, 10/min/IP) to deter brute force.

## Reload / hot config

`config.json` is read once at startup currently. After any admin mutation, re-emit the in-memory config object that `filter.js` references — don't re-read from disk on every event.
