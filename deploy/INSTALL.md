# Deploy Instructions

## What changed in your repo
Only two files need updating (your other src/ files are untouched):

  src/server.js          ← REPLACE (adds /api/unlock, broadcastConfig, /api/admin/logs.csv)
  public/index.html      ← REPLACE (login screen, real auth, SSE-driven data)
  public/admin-panel.html← REPLACE (all endpoints match real API)

No new npm packages needed — the patched server.js uses only what is already in your package.json.

## Steps

1. Copy files from this zip into your project root:
   src/server.js          → src/server.js
   public/index.html      → public/index.html
   public/admin-panel.html→ public/admin-panel.html

2. Start the server:
   npm start

3. First run creates data/users.json with:
   username: admin
   password: admin123
   passcode: 1234  (this is the iPad unlock PIN)

4. Open http://SERVER_IP:3000/admin-panel.html
   - Log in: admin / admin123
   - Go to Users → edit admin → set a real password and passcode
   - Go to Stations → confirm device IDs match your BioStar2 setup
   - Go to System → update BioStar2 host/credentials

5. On each iPad:
   Safari → http://SERVER_IP:3000 → Share → Add to Home Screen

## Auth model
- admin role: can access /admin-panel.html, manage everything
- viewer role: runs on iPad kiosks, sees only their assigned devices
- passcode: short PIN (4–8 digits) used to unlock the iPad UI controls

## Preview mode
Open index.html or admin-panel.html directly (file://) to see the UI
with mock data. Login: any username / any password.
Admin panel: admin / [anything]
