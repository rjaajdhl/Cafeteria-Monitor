# Cafeteria Monitor UI Kit

## Overview
High-fidelity recreation of the **Cafeteria Monitor** iPad dashboard. The app is a real-time log viewer for cafeteria meal scan events from Biostar2 biometric access control devices.

## Design Width
- **iPad target**: 820px wide, full viewport height
- Dark mode only

## Components
| File | Description |
|---|---|
| `TopBar.jsx` | App title, live/offline indicator, clock |
| `TabBar.jsx` | Slot tabs (Breakfast/Lunch/Dinner) + device tabs (per station) |
| `StatsRow.jsx` | Allowed / Denied / Total stat cards |
| `LogEntry.jsx` | Individual scan log row (allow/deny/duplicate states) |
| `index.html` | Full interactive prototype with mock SSE data replay |

## Interactions
- Click slot tabs to filter by meal time
- Click device tabs to filter by station
- New entries animate in from the top
- Screen flashes green (allow) or red (deny) on each new scan
- Toggle between Live and Offline states
