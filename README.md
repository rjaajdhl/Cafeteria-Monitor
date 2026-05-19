# Cafeteria Monitor — Design System

## Overview

**Cafeteria Monitor** is a real-time cafeteria access control dashboard built for iPad (and desktop browser). It integrates with **Suprema Biostar2** — a biometric (fingerprint/card) access control system — to monitor meal scan events across multiple cafeteria stations. Staff can see who was allowed or denied entry for a given meal time slot, in real time, with live SSE push updates.

### What it does
- Streams live scan events from Biostar2 over Server-Sent Events (SSE)
- Shows allow/deny status per person, per device, per time slot
- Detects and flags duplicate scans (one meal per person per slot per day)
- Filters by device (restaurant station) and meal time slot (Breakfast / Lunch / Dinner)
- Displays aggregate stats: allowed count, denied count, total

### Products / Surfaces
| Surface | Description |
|---|---|
| **iPad Monitor App** | Primary UI — dark-mode, full-screen, touch-optimized dashboard |
| **Node.js Backend** | Express + Biostar2 client + SSE + JSON log store |

### Source Files
- `files (2)/index.html` — Full frontend app
- `files (2)/server.js` — Express server + SSE hub
- `files (2)/biostar.js` — Biostar2 REST/WebSocket client
- `files (2)/filter.js` — Duplicate detection + time slot filtering
- `files (2)/db.js` — JSON-file log store
- `files (2)/config.json` — Device + time slot config
- `files (2)/package.json` — Node.js deps (express, node-fetch, ws, dotenv)

No Figma link was provided. Design system is derived entirely from the codebase.

---

## CONTENT FUNDAMENTALS

### Tone & Voice
- **Terse and operational** — this is a monitoring tool, not a consumer product. Copy is minimal, functional, and status-oriented.
- **All caps for labels** — stat labels, tab labels, and tags use `text-transform: uppercase` with letter-spacing. E.g. `ALLOWED`, `DENIED`, `TOTAL`, `BREAKFAST`.
- **No emoji in data** — the app uses a single decorative empty-state icon (`⬡`), but no emoji in actual log entries or stats.
- **I/You language**: None — the app is entirely third-person / impersonal. It's a dashboard, not a conversation.
- **Numbers, not words** — stats are bare integers. Dates and times are formatted precisely with 24-hour clock.
- **Error messages** are short, factual banners: `"⚠ Biostar2 connection lost — reconnecting..."`.
- **Status labels** are single words: `Live`, `Reconnecting...`, `Connecting...`, `Biostar2 offline`.
- **Reason tags** are lowercase single words: `duplicate`, `ok`.
- **No pleasantries** — no "Welcome!", no "Great job!", no loading spinners with messages.

### Casing conventions
- App title: Title Case (`Cafeteria Monitor`)
- Tab labels: Title Case (`All Stations`, `Breakfast`, `Lunch`, `Dinner`)
- Stat labels: ALL CAPS (`ALLOWED`, `DENIED`, `TOTAL`)
- Status tags: lowercase (`duplicate`, `ok`)
- Banner text: Sentence case with ⚠ prefix

### Vibe
Dense, utilitarian, dark-mode operator console. Feels like a control room display.

---

## VISUAL FOUNDATIONS

### Color System
Dark navy/void background with electric green for "allowed" and hot pink/red for "denied." A golden yellow accent marks active time slots. Muted blue-grey for neutral text.

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0a0a0f` | Page background — near-black with blue tint |
| `--surface` | `#111118` | Card/panel backgrounds, topbar |
| `--surface2` | `#1a1a24` | Elevated surface, denied entry rows |
| `--border` | `#2a2a3a` | All borders, dividers |
| `--accent` | `#00e5a0` | Allow status, live indicator, primary actions |
| `--accent-dim` | `rgba(0,229,160,0.12)` | Allow row highlight bg, allow icon bg |
| `--deny` | `#ff4d6d` | Deny status, offline indicator, error banner |
| `--deny-dim` | `rgba(255,77,109,0.12)` | Deny row bg, deny icon bg, error banner bg |
| `--text` | `#e8e8f0` | Primary text — warm white with blue undertone |
| `--text-muted` | `#6b6b88` | Secondary text, labels, inactive tabs |
| `--text-dim` | `#3a3a52` | Tertiary text, timestamps |
| `--slot-active` | `#f5c842` | Active time slot tab underline + text |

### Typography
Three font families with distinct roles:

| Family | Source | Usage |
|---|---|---|
| **Syne** (700, 800) | Google Fonts | App title / display headings only |
| **Inter** (400, 500, 600) | Google Fonts | Body text, names, UI copy |
| **DM Mono** (400, 500) | Google Fonts | Timestamps, IDs, stats, live indicator, metadata |

- Display heading: `Syne 800, 18px, letter-spacing: -0.3px`
- Stats: `DM Mono 500, 24px`
- Timestamps / meta: `DM Mono 400, 11–12px`
- Log name: `Inter 600, 14px`
- Tab labels: `Inter 600, 12px, uppercase, letter-spacing: 0.8px`
- Stat labels: `Inter 600, 10px, uppercase, letter-spacing: 0.8px`

### Backgrounds
- Flat dark fill only — no gradients, no textures, no images
- Two surface levels: `--bg` (base) and `--surface` / `--surface2` (cards/panels)
- No blurs, no frosted glass

### Spacing & Layout
- App is full-viewport, flex column, `overflow: hidden` — no scroll on outer container
- Content padding: `20px` horizontal throughout
- Gap between log entries: `6px`
- Card padding: `10–14px` internal
- Border radius: `6–8px` for cards and tabs; `50%` for status dot and icon circles
- Top bar / slot tabs are `flex-shrink: 0` fixed — log list scrolls independently

### Borders
- All surfaces use `1px solid var(--border)` (`#2a2a3a`)
- Allow log entries: `1px solid rgba(0,229,160,0.2)`
- Deny log entries: `1px solid rgba(255,77,109,0.2)`
- Active device tab: `1px solid var(--accent)`

### Animation
- **Slide-in on log entry**: `opacity 0→1, translateY(-6px→0), 0.2s ease`
- **Live dot pulse**: `opacity 1→0.4, scale 1→0.8, 2s infinite`
- **Screen flash on scan**: full-viewport color overlay, `0.4s ease` fade-out
- **Tab hover**: `color 0.15s, border-color 0.15s`
- **Device tab hover**: `all 0.15s`
- No bounces, no spring physics — all eases are `ease` or `ease-forward`

### Hover / Press States
- Device tabs: background becomes `--accent-dim`, border becomes `--accent`, text becomes `--accent`
- Slot tabs: text color change + bottom border color change (`0.15s`)
- No scale/shrink press states — these are iPad touch targets

### Cards
- `border-radius: 8px`
- `border: 1px solid var(--border)` (neutral) or colored border for allow/deny
- `background: var(--surface)` or `--surface2` for deny rows
- No drop shadows — all depth is via border color

### Iconography
- Status icons are text characters inside circular badges: `✓` (allow) and `✗` (deny)
- No icon font, no SVG icons
- One decorative unicode char: `⬡` (hexagon) in empty state

### Corner Radii
- Log entries, stat cards: `8px`
- Device tabs: `6px`
- Status icon circles: `50%`
- Slot tab underlines: no radius (bottom border only)

### Imagery
- None. Pure data display — no photos, no illustrations.

### Color vibe of content
- Cold/dark blue-grey field with neon-tinted accent colors. Console/terminal aesthetic.

---

## ICONOGRAPHY

No icon font, no SVG icon system. Icons are purely typographic:

| Usage | Character | Notes |
|---|---|---|
| Allow status | `✓` | Inside green circle badge |
| Deny status | `✗` | Inside red circle badge |
| Empty state | `⬡` | Decorative hexagon, 40px, 30% opacity |
| Warning banner | `⚠` | Inline with text |

**Approach:** Keep iconography minimal and text-based. No image assets exist in this codebase. If adding icons to future features, use a thin stroke system (e.g. Lucide) at `16–18px` with `--text-muted` color, never filled icons.

---

## File Index

```
README.md                        ← This file
SKILL.md                         ← Agent skill definition
colors_and_type.css              ← CSS custom properties: colors + typography
assets/                          ← (No visual assets in source — typographic only)
preview/
  colors-base.html               ← Base color palette swatches
  colors-semantic.html           ← Semantic color usage (allow/deny/slot)
  type-families.html             ← Font family specimens
  type-scale.html                ← Type scale + UI text styles
  spacing-tokens.html            ← Spacing, radius, border tokens
  components-topbar.html         ← Top bar component
  components-tabs.html           ← Slot tabs + device tabs
  components-stats.html          ← Stats row cards
  components-log-entries.html    ← Log entry states
  components-badges.html         ← Status icons + tags
ui_kits/
  cafeteria-monitor/
    README.md
    index.html                   ← Interactive iPad prototype
    TopBar.jsx
    LogEntry.jsx
    TabBar.jsx
    StatsRow.jsx
```
