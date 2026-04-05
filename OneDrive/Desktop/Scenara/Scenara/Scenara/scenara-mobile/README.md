# Scenara Mobile

> Real-time prediction market simulation platform — Expo React Native app

![Expo](https://img.shields.io/badge/Expo-SDK_51-black) ![React Native](https://img.shields.io/badge/React_Native-0.74-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue) ![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android%20%7C%20Web-purple)

---

## Overview

Scenara's mobile app is built with Expo React Native and runs on iOS, Android, and Web from a single codebase. It delivers a premium prediction market experience — live probability charts, event grid, portfolio tracking, performance insights, and competitive rankings.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 51 + React Native |
| Language | TypeScript |
| Navigation | Expo Router (file-based) |
| State | React Context (TradingContext) |
| HTTP | Axios |
| Charts | react-native-svg (custom SVG) |
| Fonts | DM Sans via @expo-google-fonts |
| Gradients | expo-linear-gradient |

---

## Project Structure

```
scenara-mobile/
├── app/
│   ├── _layout.tsx              # Root layout: font loading
│   └── (tabs)/
│       ├── _layout.tsx          # Tab navigator: MARKETS / PORTFOLIO / INSIGHTS / RANKINGS
│       ├── index.tsx            # Markets screen — hero, grid, detail panel
│       ├── portfolio.tsx        # Portfolio — balance, positions, performance
│       ├── insights.tsx         # Insights — accuracy grade, P&L, percentile rank
│       └── leaderboard.tsx      # Rankings — sorted table, your standing
├── components/
│   └── ProbabilityChart.tsx     # SVG line chart with hover + touch tooltip
├── src/
│   ├── api/
│   │   └── client.ts            # Axios instance
│   ├── config/
│   │   └── api.ts               # API_BASE_URL
│   ├── session/
│   │   ├── TradingContext.tsx   # Global state: account, predictions, placePrediction()
│   │   └── SessionContext.tsx   # User session (future auth)
│   └── theme.ts                 # Scenara brand tokens
├── package.json
└── app.json
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Expo CLI
- Scenara backend running on `localhost:8000`

### Installation

```bash
# Clone the repo
git clone https://github.com/Noctilucenty/Orryin-2.0.git
cd Scenara/scenara-mobile

# Install dependencies
npm install

# Install Expo-specific packages
npx expo install react-native-svg expo-linear-gradient

# Install fonts
npm install @expo-google-fonts/dm-sans expo-font
```

### Configuration

Edit `src/config/api.ts` to point to your backend:

```typescript
// Local development
export const API_BASE_URL = "http://localhost:8000";

// Or your deployed backend
export const API_BASE_URL = "https://your-backend.railway.app";
```

### Run

```bash
# Web (recommended for development)
npx expo start --web

# iOS simulator
npx expo start --ios

# Android emulator
npx expo start --android
```

---

## Screens

### Markets (`index.tsx`)
The primary screen. Displays live prediction markets in a responsive grid.

**Web layout (≥900px):**
- Sticky header with Scenara wordmark + balance
- Trending strip — scrollable live market titles
- Category filter tabs — All / Politics / Economy / Crypto / Sports / Tech / Global
- **Left column**: Featured hero card with chart + predict buttons + full market grid
- **Center column**: Polymarket-style detail panel when a card is tapped (sticky, inline)
- **Right column**: Hot Markets ranked list + By Category counts

**Mobile layout (<900px):**
- Same header, trending strip, and category tabs
- Hero card full width
- 2-column grid
- Tap card → slide-up modal with full detail

**Grid responsiveness:**
- `< 900px` → 2 columns
- `900–1299px` → 3 columns
- `≥ 1300px` → 4 columns

---

### Portfolio (`portfolio.tsx`)
Tracks the user's simulation balance, open positions, and performance.

- **Balance card**: current balance with position stats (Total / Open / Won / Lost)
- **Streak banner**: animates from ✦ WINNING → ⚡ STREAK → 🔥 HOT STREAK → 🔥🔥🔥 UNSTOPPABLE
- **Performance snapshot**: Accuracy score / Percentile rank / Best single win
- **Positions list**: each prediction with Wagered / Probability / Multiplier / PnL

---

### Insights (`insights.tsx`)
Performance analytics and calibration scoring.

- **Grade card**: giant letter grade (S/A/B/C/D) based on Brier-score accuracy
- **Percentile rank**: gradient circle showing what % of traders you beat
- **Trading stats**: win rate, accuracy score, avg entry probability, streak
- **P&L breakdown**: total, avg per prediction, best/worst single bet
- **Grade scale**: reference card with what each grade means

**Web layout**: two-column — main stats left, grade scale + quick stats sidebar right

---

### Leaderboard (`leaderboard.tsx`)
Competitive rankings across all users.

- Sort by **P&L** / **Balance** / **Win Rate**
- Top 3 get gradient rank circles (gradient purple→blue / silver / bronze) with Roman numerals
- Streak fire badges: ⚡ (3+) 🔥 (5+) 🔥🔥 (7+) 🔥🔥🔥 (10+)
- **YOU** badge highlights your row
- **Web sidebar**: Your Standing card + Top 3 podium + Platform Stats

---

## Components

### ProbabilityChart

Custom SVG line chart showing probability history for each scenario.

```tsx
<ProbabilityChart
  scenarios={history}   // ScenarioHistory[]
  height={160}          // px
  compact={false}       // true = mini card chart, false = full expanded
  width={400}           // optional override
/>
```

**Features:**
- Green line = Yes/first scenario, Red = No/second scenario
- Area fills with gradient opacity
- Web: `onMouseMove` hover tooltip with gold crosshair
- Mobile: `PanResponder` touch tooltip
- Tooltip shows timestamp + probability for each scenario
- Compact mode for grid cards, full mode for detail panel

---

## Global State — TradingContext

```tsx
const {
  account,           // { balance, currency }
  predictions,       // PredictionDetailOut[]
  loadingPortfolio,
  portfolioError,
  userId,            // number (DEV_USER_ID = 2 until auth is built)
  refreshPortfolio,  // () => void
  placePrediction,   // (scenarioId, amount) => Promise<{ ok, error? }>
} = useTrading();
```

`placePrediction` handles the full bet flow:
1. POST `/predictions/`
2. On success → `refreshPortfolio()`
3. Returns `{ ok: true }` or `{ ok: false, error: string }`

---

## Brand Design System

```typescript
// Scenara gradient (extracted from logo)
BLUE:     "#4F8EF7"   // left
PURPLE:   "#7C5CFC"   // center (primary accent)
PINK:     "#F050AE"   // right

// Backgrounds
BG:       "#08090C"   // near-black obsidian
CARD:     "#0D1117"   // elevated surface
SURFACE:  "#111620"   // input backgrounds

// Text
TEXT:     "#F1F5F9"   // primary — near white
TEXT_SUB: "#94A3B8"   // secondary — readable
TEXT_MID: "#64748B"   // muted

// Status
GREEN:    "#22C55E"   // Yes, wins, positive
RED:      "#EF4444"   // No, losses, negative

// Font: DM Sans 400 / 500 / 700
```

All gradient buttons, borders, and accents use the `BLUE → PURPLE → PINK` system to match the Scenara logo.

---

## Dependencies

```json
{
  "expo": "~51.0.0",
  "react-native": "0.74",
  "expo-router": "~3.5.0",
  "expo-linear-gradient": "~13.0.0",
  "react-native-svg": "~15.2.0",
  "@expo-google-fonts/dm-sans": "^0.2.3",
  "expo-font": "~12.0.0",
  "axios": "^1.6.0",
  "@react-navigation/native": "^6.0.0"
}
```

---

## Roadmap

- [ ] User auth — login / signup screens + JWT
- [ ] Push notifications (win alerts, new markets, streak milestones)
- [ ] Portuguese (pt-BR) localization
- [ ] Auto-refresh every 30s without manual pull
- [ ] WebSocket integration for live probability updates
- [ ] Empty state onboarding tutorial

---

## License

MIT © Scenara 2026
