# Scenara

[![Expo](https://img.shields.io/badge/Expo-SDK_51-000020?logo=expo&logoColor=white)](#)
[![React Native](https://img.shields.io/badge/React_Native-0.74-61DAFB?logo=react&logoColor=black)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](#)
[![Platform](https://img.shields.io/badge/Platform-iOS_%7C_Android_%7C_Web-7C5CFC)](#)

Mobile and web app for **Scenara** — a real-time prediction market simulation platform. Built with Expo React Native, runs on iOS, Android, and Web from a single codebase.

---

## What's built

This is not a placeholder MVP. The full prediction lifecycle is functional end-to-end:

- ✅ Live prediction markets with real-time probability charts
- ✅ Place predictions with simulated balance
- ✅ Automatic payout on resolution
- ✅ Portfolio tracking with PnL, win/loss history
- ✅ Performance grading (Brier-score accuracy, S/A/B/C/D)
- ✅ Percentile rank vs all users
- ✅ Leaderboard with streak badges
- ✅ Streak system (current + best, escalating fire badges)
- ✅ Responsive web layout (Polymarket-style dashboard)
- ✅ Probability charts with hover/touch tooltips
- ✅ Category filter tabs (Politics / Economy / Crypto / Sports / Tech / Global)
- ✅ Featured hero card + detail panel with trade UI
- ✅ Scenara blue-purple-pink gradient brand system

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 51 + React Native 0.74 |
| Language | TypeScript (strict) |
| Navigation | Expo Router (file-based) |
| State | React Context — TradingContext |
| HTTP | Axios |
| Charts | react-native-svg (custom SVG line charts + arc gauges) |
| Gradients | expo-linear-gradient |
| Fonts | DM Sans via @expo-google-fonts/dm-sans |

---

## Project structure

```
scenara-mobile/
├── app/
│   ├── _layout.tsx              # Root layout — font loading
│   └── (tabs)/
│       ├── _layout.tsx          # Tab bar: MARKETS / PORTFOLIO / INSIGHTS / RANKINGS
│       ├── index.tsx            # Markets — hero card, grid, detail panel
│       ├── portfolio.tsx        # Portfolio — balance, positions, PnL
│       ├── insights.tsx         # Insights — accuracy grade, percentile rank
│       └── leaderboard.tsx      # Rankings — leaderboard table + sidebar
├── components/
│   └── ProbabilityChart.tsx     # SVG line chart with hover + touch tooltip
├── src/
│   ├── api/
│   │   └── client.ts            # Axios instance
│   ├── config/
│   │   └── api.ts               # API_BASE_URL
│   ├── session/
│   │   ├── TradingContext.tsx   # Global state: balance, predictions, placePrediction()
│   │   └── SessionContext.tsx   # User session (auth placeholder)
│   └── theme.ts                 # Scenara brand tokens
└── package.json
```

---

## Screens

### ◈ Markets
The main screen. Displays all open and resolved prediction markets.

**Web (≥900px):**
- Trending strip of live market titles
- Category filter tabs
- Featured hero card with full chart + Yes/No predict buttons
- Responsive grid (2 / 3 / 4 columns based on screen width)
- Inline detail panel when card is tapped — chart, outcome table, amount input, trade button
- Sidebar — Hot Markets list + By Category counts

**Mobile (<900px):**
- Same trending strip and tabs
- Hero card + 2-column grid
- Tap card → slide-up modal with full detail

---

### ◉ Portfolio
Tracks your simulation balance and all open/settled positions.

- Balance card with position stats (Total / Open / Won / Lost)
- Streak banner: ✦ WINNING → ⚡ STREAK → 🔥 HOT STREAK → 🔥🔥🔥 UNSTOPPABLE
- Performance snapshot: accuracy score, percentile rank, best single win
- Full position list with Wagered / Entry Probability / Multiplier / PnL per trade

---

### ◎ Insights
Performance analytics based on calibration, not just win rate.

- **Grade letter** (S/A/B/C/D) — based on Brier-score accuracy (0–100)
- **Percentile rank** — gradient circle showing what % of traders you outperform
- Trading stats: win rate, accuracy, avg entry probability, current + best streak
- P&L breakdown: total, avg per prediction, best/worst single bet
- Grade scale reference

**Web**: two-column — main stats left, grade scale + quick stats sidebar right

---

### ◆ Rankings
Competitive leaderboard across all users.

- Sort by **P&L** / **Balance** / **Win Rate**
- Top 3 get gradient rank medals with Roman numerals (I / II / III)
- Streak fire badges per user
- **YOU** badge highlights your row
- **Web sidebar**: Your Standing card + Top 3 podium + Platform Stats

---

## Global state — TradingContext

```tsx
const {
  account,           // { balance, currency }
  predictions,       // full prediction history with event + scenario metadata
  loadingPortfolio,
  portfolioError,
  userId,            // number — DEV_USER_ID = 2 (until auth is built)
  refreshPortfolio,  // re-fetches account + predictions
  placePrediction,   // (scenarioId, amount) => Promise<{ ok, error? }>
} = useTrading();
```

`placePrediction` handles the full flow — POST to backend, deducts balance, refreshes portfolio.

---

## Brand design system

```typescript
// Scenara gradient (from logo)
BLUE:     "#4F8EF7"
PURPLE:   "#7C5CFC"   // primary accent
PINK:     "#F050AE"

// Backgrounds
BG:       "#08090C"   // obsidian
CARD:     "#0D1117"
SURFACE:  "#111620"

// Text
TEXT:     "#F1F5F9"   // near white
TEXT_SUB: "#94A3B8"
TEXT_MID: "#64748B"

// Status
GREEN:    "#22C55E"   // Yes / wins
RED:      "#EF4444"   // No / losses

// Font: DM Sans — 400 / 500 / 700
```

---

## Local development

### 1. Prerequisites
- Node.js 18+
- Scenara backend running on `localhost:8000`

### 2. Install

```bash
cd scenara-mobile
npm install
npx expo install react-native-svg expo-linear-gradient
npm install @expo-google-fonts/dm-sans expo-font
```

### 3. Configure backend URL

Edit `src/config/api.ts`:

```typescript
export const API_BASE_URL = "http://localhost:8000";
```

### 4. Run

```bash
# Web (full dashboard)
npx expo start --web

# iOS simulator
npx expo start --ios

# Android emulator
npx expo start --android
```

Open `http://localhost:8081` for the full web dashboard.

---

## Backend dependency

Expects the Scenara backend running locally at `http://127.0.0.1:8000`.

Key endpoints consumed:
```
GET    /events/
GET    /events/{id}/history
POST   /events/{id}/resolve
POST   /predictions/
GET    /predictions/user/{id}
GET    /predictions/user/{id}/summary
GET    /accounts/user/{id}
GET    /accounts/leaderboard
```

→ See [scenara-backend README](../scenara-backend/README.md)

---

## What's not built yet

| Feature | Status |
|---|---|
| User authentication (JWT / sessions) | 🔴 Not started |
| Auto-refresh / WebSocket live updates | 🔴 Not started |
| Push notifications | 🔴 Not started |
| Portuguese (pt-BR) localization | 🔴 Not started |
| App Store configuration | 🔴 Not started |
| KYC / real identity verification | 🟡 Deferred (simulation only) |

---

## License

MIT © Scenara 2026
