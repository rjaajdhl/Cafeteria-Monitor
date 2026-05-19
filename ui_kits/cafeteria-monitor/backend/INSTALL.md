# How to integrate — minimal diff

Your existing `filter.js` and `db.js` are **unchanged**.
`biostar.js`, `server.js` and `package.json` need updating, plus two new files.
Frontend files are already bundled in `public/` — nothing to copy manually.

## Step 1 — copy new files

```
your-project/
├── src/
│   ├── admin.js       ← NEW   — copy from backend/src/admin.js
│   ├── biostar.js     ← REPLACE with backend/src/biostar.js
│   └── server.js      ← REPLACE with backend/src/server.js
├── data/
│   └── admin.json     ← NEW   — copy from backend/data/admin.json
│                          (or delete it — it's auto-created on first boot)
├── public/
│   ├── index.html     ← already included in backend/public/
│   └── admin-panel.html ← already included in backend/public/
└── package.json       ← REPLACE with backend/package.json
```

## Step 2 — install new deps

```bash
npm install
```

New packages: `bcrypt`, `cookie-parser`, `express-session`.

## Step 3 — run

```bash
npm start
```

First boot output:
```
[Admin] ⚠  Created default admin — username: admin  password: admin — CHANGE THIS!
[Admin] ⚠  Created default unlock PIN: 123456 — CHANGE THIS via /admin-panel!
[Server] Cafeteria Monitor running on http://0.0.0.0:3000
[Server] Admin panel → http://0.0.0.0:3000/admin-panel.html
[BioStar] Connected
```

## Step 4 — change defaults (important!)

1. Open `http://server-ip:3000/admin-panel.html`
2. Log in: `admin` / `admin`
3. Go to **Admins** → create a real account → delete `admin`
4. Go to **Unlock PIN** → set a proper 6-digit PIN

## Optional: SESSION_SECRET env var

Set in a `.env` file at the project root so sessions survive restarts:
```
SESSION_SECRET=some-long-random-string-here
```

Without this, every server restart logs everyone out (not a big deal for kiosk use).
