# SCENARA — TECHNICAL & PRODUCT DOCUMENT
### Version 0.4 · March 2026 · Confidential

---

## 1. SYSTEM OVERVIEW

### What Scenara Is
Scenara is a **real-time prediction market simulation platform** where users bet simulated currency on the outcomes of real-world events — crypto price movements, Brazilian politics, global geopolitics, sports results, and technology news. No real money changes hands. The experience mirrors a professional trading platform with PnL tracking, leaderboard rankings, performance grading, and live probability charts.

### Core Idea
Give users the intellectual experience of prediction markets — reading signals, forming opinions, pricing uncertainty — without financial risk. The platform rewards calibration (being right at the right odds) rather than luck.

### What Problem It Solves
- **For curious users:** Bridges the gap between "I have an opinion on this event" and "I want to express that opinion with skin in the game"
- **For finance-adjacent audiences:** Teaches probability thinking, risk management, and market intuition without capital requirements
- **For Brazil specifically:** No Portuguese-language prediction market exists. Scenara targets a completely unaddressed market with local events (Selic rate, Lula approval, Ibovespa, Copa do Brasil)

### Why It's Different From Trading Apps
| Feature | Trading Apps | Scenara |
|---|---|---|
| Real money required | Yes | No — simulated only |
| Events | Stocks/crypto only | Crypto + politics + sports + tech + geopolitics |
| Outcome type | Price up/down | Binary/multi-outcome scenarios |
| Performance metric | Returns | Accuracy score (Brier-score calibration) |
| Social layer | None / minimal | Leaderboard + percentile rank + streaks |
| Barrier to entry | KYC, bank, age | Zero — open immediately |
| Educational angle | None | Explicit: grade system, accuracy scoring |

---

## 2. FULL ARCHITECTURE

### Backend — FastAPI (Python)
```
scenara-backend/
├── app/
│   ├── main.py               # App factory, CORS, startup hooks, admin routes
│   ├── config.py             # Settings (app name, debug, DB URL)
│   ├── db.py                 # SQLAlchemy engine, SessionLocal, Base
│   ├── models/
│   │   ├── __init__.py       # Re-exports all models
│   │   ├── user.py           # User + streak columns
│   │   ├── account.py        # Simulation wallet
│   │   ├── event.py          # Market event
│   │   ├── scenario.py       # Outcome within an event
│   │   ├── prediction.py     # User bet on a scenario
│   │   ├── transaction.py    # Ledger entry
│   │   └── probability_history.py  # Time-series probability snapshots
│   ├── routers/
│   │   ├── users.py          # User creation
│   │   ├── events.py         # Event CRUD + resolution + history
│   │   ├── predictions.py    # Bet placement + portfolio summary
│   │   └── accounts.py       # Balance + leaderboard
│   └── services/
│       └── event_generator.py  # Scheduler: 5-min snapshots + hourly event creation
├── backfill_history.py       # One-time script: seed historical probability data
├── migrate_history.py        # One-time script: create probability_history table
└── scenara.db                 # SQLite database (dev)
```

**Runtime:** Uvicorn ASGI server · Python 3.11 · SQLite (dev) / PostgreSQL-ready
**Scheduler:** asyncio tasks — snapshot every 5 minutes, new events every 60 minutes
**Docs:** Swagger UI at `/docs`, ReDoc at `/redoc`

---

### Mobile — Expo React Native (TypeScript)
```
scenara-mobile/
├── app/
│   ├── _layout.tsx           # Root layout: font loading, tab navigator
│   └── (tabs)/
│       ├── _layout.tsx       # Tab config: MARKETS / PORTFOLIO / INSIGHTS / RANKINGS
│       ├── index.tsx         # Markets screen (hero + grid + detail panel)
│       ├── portfolio.tsx     # Portfolio screen (balance + positions + performance)
│       ├── insights.tsx      # Insights screen (accuracy grade + P&L + percentile)
│       └── leaderboard.tsx   # Rankings screen (sorted table + your standing)
├── components/
│   └── ProbabilityChart.tsx  # SVG line chart with hover/touch tooltip
├── src/
│   ├── api/
│   │   └── client.ts         # Axios instance, base URL config
│   ├── config/
│   │   └── api.ts            # API_BASE_URL (localhost:8000)
│   └── session/
│       ├── TradingContext.tsx # Global state: account, predictions, placePrediction()
│       └── SessionContext.tsx # User session, KYC state (future auth)
```

**Framework:** Expo SDK 51 · React Native · TypeScript
**Navigation:** Expo Router (file-based) · Bottom tab navigator
**Fonts:** DM Sans (400/500/700) via `@expo-google-fonts/dm-sans`
**Charts:** `react-native-svg` — custom SVG arc gauges and line charts
**HTTP:** Axios with interceptors

---

### State Management — TradingContext
Central global state provider wrapping the entire app. Exposes:
- `account` — current simulation wallet (balance, currency)
- `predictions` — user's full prediction history with event/scenario metadata
- `loadingPortfolio` / `portfolioError` — async states
- `userId` — hardcoded to `DEV_USER_ID = 2` until auth is built
- `refreshPortfolio()` — re-fetches account + predictions
- `placePrediction(scenarioId, amount)` — calls API, returns `{ ok, error }`

---

### API Communication Flow
```
Mobile Screen
    → calls placePrediction() from TradingContext
    → TradingContext calls api.post('/predictions/', payload)
    → Axios sends to FastAPI at localhost:8000
    → FastAPI router validates, runs business logic
    → SQLAlchemy writes to SQLite
    → Response returns updated prediction
    → TradingContext calls refreshPortfolio()
    → Screen re-renders with new state
```

---

## 3. DATABASE MODELS

### User (`users` table)
| Field | Type | Purpose |
|---|---|---|
| id | Integer PK | Primary identifier |
| email | String(255) unique | Login credential (future) |
| hashed_password | String | Bcrypt hash (future auth) |
| is_active | Boolean | Soft-delete flag |
| current_streak | Integer | Live consecutive win count |
| best_streak | Integer | All-time best streak |
| created_at / updated_at | DateTime | Audit fields |

**Relationships:** One User → Many Accounts, Many Predictions
**Notes:** Streak columns were added via manual `ALTER TABLE` migration (not in original schema)

---

### Account (`accounts` table) — Simulation Wallet
| Field | Type | Purpose |
|---|---|---|
| id | Integer PK | |
| user_id | FK → users | Owner |
| account_type | String | Always `"simulation"` for now |
| balance | Numeric | Current simulated balance (starts at $10,000) |
| currency | String | Always `"USD"` |
| is_active | Boolean | Active wallet flag |

**Relationships:** One User → One active simulation Account
**Business rule:** Balance is decremented on prediction placement, incremented on win payout

---

### Event (`events` table)
| Field | Type | Purpose |
|---|---|---|
| id | Integer PK | |
| slug | String(150) unique | URL-safe identifier, includes hash suffix to avoid duplicates |
| title | String(255) | Question text, e.g. "Will BTC be above $70,000 in 1 hour?" |
| description | Text nullable | Context/explanation |
| category | String(50) | `crypto`, `politics`, `economy`, `sports`, `technology`, `geopolitics` |
| source | String(255) | `CoinGecko` or `Scenara` |
| status | String | `open` → `resolved` |
| resolution_note | Text | Explanation of outcome |
| is_featured | Boolean | Show in hero card |
| closes_at | DateTime | When market closes |
| resolved_at | DateTime | When market was resolved |

**Relationships:** One Event → Many Scenarios, Many ProbabilityHistory entries

---

### Scenario (`scenarios` table)
| Field | Type | Purpose |
|---|---|---|
| id | Integer PK | |
| event_id | FK → events | Parent event |
| title | String(255) | Outcome label, e.g. "Yes — above", "No — breaks out" |
| description | Text nullable | Extra context |
| probability | Float | Current probability (0–100), updated by snapshots |
| sort_order | Integer | Display order |
| status | String | `active` → `won` or `lost` |

**Relationships:** One Scenario → Many Predictions, Many ProbabilityHistory entries
**Business rule:** On resolution, winning scenario set to 100%, losing to 0%. All open predictions on this event are settled.

---

### Prediction (`predictions` table)
| Field | Type | Purpose |
|---|---|---|
| id | Integer PK | |
| user_id | FK → users | Bettor |
| scenario_id | FK → scenarios | What they bet on |
| simulated_amount | Numeric | Amount wagered |
| entry_probability | Float | Probability at time of bet (for accuracy scoring) |
| payout_multiplier | Float | `100 / entry_probability` — implied odds |
| status | String | `open` → `won` / `lost` / `void` |
| pnl | Numeric nullable | Profit/loss after settlement |
| settled_at | DateTime nullable | When resolved |
| created_at | DateTime | When placed |

**Business rule:** `payout_multiplier = 100 / probability`. On win: payout = `amount × multiplier`. PnL = payout - amount. On loss: PnL = -amount.

---

### Transaction (`transactions` table) — Ledger
| Field | Type | Purpose |
|---|---|---|
| id | Integer PK | |
| user_id | FK → users | Actor |
| account_id | FK → accounts | Wallet affected |
| type | String | `prediction_entry`, `prediction_win`, `prediction_loss`, `void` |
| amount | Float | Value moved |
| currency | String | Always `"USD"` |
| created_at | DateTime | Timestamp |

**Purpose:** Full audit trail of all balance changes. Not yet surfaced in UI.

---

### ScenarioProbabilityHistory (`scenario_probability_history` table)
| Field | Type | Purpose |
|---|---|---|
| id | Integer PK | |
| scenario_id | FK → scenarios | Which scenario |
| event_id | FK → events | Parent event (denormalized for fast queries) |
| probability | Float | Probability at this moment |
| source | String(32) | `created`, `5min`, `hourly`, `updated`, `resolved`, `backfill` |
| recorded_at | DateTime | Timestamp of snapshot |

**Purpose:** Powers the live probability charts. Snapshots every 5 minutes with small random walk (±0.6% Gaussian noise) to simulate realistic market sentiment shifts.

---

## 4. BACKEND ENDPOINTS

### `POST /events/`
**Purpose:** Create a new prediction market
**Input:** `slug`, `title`, `description`, `category`, `source`, `is_featured`, `closes_at`, `scenarios[]` (title + probability + sort_order)
**Output:** Full event with scenarios
**Logic:** Creates Event + Scenarios, logs initial probability snapshot for each scenario

### `GET /events/`
**Purpose:** List all events (supports filter by status, featured_only, limit)
**Output:** Array of EventOut with nested scenarios
**Used by:** Markets screen on load and refresh

### `GET /events/{event_id}`
**Purpose:** Single event fetch
**Output:** EventOut with scenarios

### `GET /events/{event_id}/history`
**Purpose:** Full probability time-series for all scenarios of an event
**Output:** `{ event_id, scenarios: [{ scenario_id, scenario_title, points: [{ probability, recorded_at, source }] }] }`
**Used by:** ProbabilityChart component

### `PATCH /events/scenarios/{scenario_id}/probability`
**Purpose:** Manually update a scenario's probability
**Input:** `{ probability: float }`
**Logic:** Updates probability + logs a snapshot

### `POST /events/{event_id}/resolve`
**Purpose:** Resolve a market with a winning scenario
**Input:** `{ winning_scenario_id, resolution_note? }`
**Logic:**
1. Validates event is open
2. Finds all open predictions for this event
3. For each prediction:
   - If on winning scenario: status=`won`, calculates payout, credits account, logs Transaction
   - If on losing scenario: status=`lost`, PnL=-amount, logs Transaction
4. Updates streak on User model (increment on win, reset to 0 on loss)
5. Sets scenario statuses (`won`/`lost`), probabilities (100/0)
6. Logs final probability snapshot for each scenario
7. Sets event status=`resolved`, resolved_at=now
**Output:** `{ ok, total_winners, total_losers, total_payout, predictions_settled }`

---

### `POST /predictions/`
**Purpose:** Place a prediction (bet)
**Input:** `{ user_id, scenario_id, simulated_amount }`
**Logic:**
1. Validates user, scenario (must be `active`), event (must be `open`)
2. Finds simulation account, checks balance ≥ amount
3. Deducts amount from balance
4. Creates Prediction with `entry_probability` and `payout_multiplier`
5. Logs `prediction_entry` Transaction
**Output:** PredictionOut

### `GET /predictions/user/{user_id}`
**Purpose:** Full prediction history with event + scenario metadata
**Output:** Array of PredictionDetailOut (includes event_title, scenario_title, event_status)

### `GET /predictions/user/{user_id}/summary`
**Purpose:** Portfolio summary + performance analytics
**Output:**
- `balance`, `total_predictions`, `won_count`, `lost_count`, `open_count`
- `total_pnl`, `total_wagered`
- `current_streak`, `best_streak`
- `win_rate` — won / (won + lost) × 100
- `accuracy_score` — Brier-score based (0–100), rewards calibration
- `percentile_rank` — % of other users this user beats by PnL
- `avg_entry_prob`, `best_pnl`, `worst_pnl`, `avg_pnl_per_prediction`

---

### `GET /accounts/user/{user_id}`
**Purpose:** Get simulation account for a user
**Output:** Account with balance

### `GET /accounts/leaderboard`
**Purpose:** Ranked list of all users
**Query params:** `sort_by` (pnl/balance/win_rate), `limit`
**Output:** `{ entries: [...], total_users }`
**Each entry:** rank, display_name, balance, total_pnl, won_count, lost_count, win_rate, current_streak, best_streak

---

### `POST /admin/generate-events`
**Purpose:** Trigger immediate event creation (Swagger testing)

### `POST /admin/snapshot`
**Purpose:** Trigger immediate probability snapshot for all open events

---

## 5. CORE LOGIC

### Prediction Placement Flow
```
1. User selects scenario on Markets screen
2. Types amount (default $100)
3. Taps "Predict" / "Yes" / "No"
4. TradingContext.placePrediction(scenarioId, amount) called
5. POST /predictions/ → FastAPI validates
6. Account balance checked: balance >= amount
7. balance -= amount (immediate deduction)
8. Prediction created: status="open"
9. entry_probability = scenario.probability at this moment
10. payout_multiplier = 100 / entry_probability
    → e.g. 65% probability → 1.538x multiplier
    → e.g. 52% probability → 1.923x multiplier
11. Transaction logged: type="prediction_entry"
12. refreshPortfolio() called → UI updates balance
```

### Resolution Flow
```
1. Admin taps "RESOLVE" on event card
2. Selects winning scenario from modal
3. POST /events/{id}/resolve
4. Backend iterates all open predictions on this event:
   
   For WINNERS (bet on winning scenario):
   - payout = simulated_amount × payout_multiplier
   - pnl = payout - simulated_amount
   - account.balance += payout
   - prediction.status = "won"
   - user.current_streak += 1
   - if current_streak > best_streak: best_streak = current_streak
   - Transaction: type="prediction_win", amount=payout
   
   For LOSERS:
   - pnl = -simulated_amount (full loss)
   - prediction.status = "lost"
   - user.current_streak = 0
   - Transaction: type="prediction_loss"

5. Scenarios updated: winner→probability=100, loser→probability=0
6. Final probability snapshot logged for chart
7. Event status = "resolved"
```

### Accuracy Score (Brier-Score)
```
For each settled prediction:
  outcome = 1.0 if won, 0.0 if lost
  prob = entry_probability / 100
  brier = (outcome - prob)²
  score = (1 - brier) × 100

accuracy_score = mean(score for all settled predictions)

Example:
  Bet Yes at 65% probability → wins
  brier = (1 - 0.65)² = 0.1225
  score = (1 - 0.1225) × 100 = 87.75

  Bet Yes at 65% probability → loses
  brier = (0 - 0.65)² = 0.4225
  score = (1 - 0.4225) × 100 = 57.75
```

### Payout Multiplier Logic
The multiplier is designed to be **actuarially neutral** (in theory):
- 50% probability → 2.00x payout
- 65% probability → 1.54x payout
- 35% probability → 2.86x payout
- 90% probability → 1.11x payout (low-risk, low-reward)

---

## 6. MOBILE APP STRUCTURE

### Markets Screen (`index.tsx`) — Primary screen
**Web layout (>900px):**
- Sticky top bar: SCENARA wordmark + balance card + refresh
- Trending strip: scrollable pills of live market titles
- Category filter tabs: All / Politics / Economy / Crypto / Sports / Tech / Global
- Left column (flex 1): Hero featured card (big chart + scenarios + predict buttons) + grid below
- Center column (420px, when event selected): Polymarket-style detail panel — chart, outcome table, Yes/No toggle, amount input, quick-amount buttons, Trade button
- Right column (280–320px): Sidebar — Hot Markets ranked list + By Category counts

**Mobile layout (<900px):**
- Same trending strip + category tabs
- Hero card full width
- 2-column grid
- Tap card → slide-up modal with full detail + predict

**Grid responsiveness:**
- <900px: 2 columns
- 900–1299px: 3 columns
- ≥1300px: 4 columns

### Portfolio Screen (`portfolio.tsx`)
- Current balance (gold gradient text, large)
- Streak banner (conditional, animated gold gradient): ✦ WINNING → ⚡ STREAK → 🔥 HOT STREAK → 🔥🔥 ON FIRE → 🔥🔥🔥 UNSTOPPABLE
- Stats grid: TOTAL / OPEN / WON / LOST
- P&L row: Total PnL (green/red) + Win Rate (gold) + Total Wagered
- Performance Snapshot: Accuracy score / Percentile rank / Best single win
- Position list: each prediction card with WAGERED / PROB / MULT / PnL

### Insights Screen (`insights.tsx`)
**Web layout:** Two-column — main content left, grade scale + quick stats sidebar right
- Giant performance grade letter (S/A/B/C/D) — 80px, color-coded
- Accuracy score (Brier-based, 0–100)
- Percentile rank circle: "You outperform X% of all traders"
- Trading Stats card: Total Predictions, Win Rate, Accuracy, Avg Entry Probability, Streak
- P&L Breakdown: Total PnL, Avg per Prediction, Best Win, Worst Loss, Total Wagered
- Position Summary: OPEN / WON / LOST boxes
- Grade Scale reference

### Rankings Screen (`leaderboard.tsx`)
**Web layout:** Two-column — full ranked table left, Your Standing + Top 3 podium + Platform Stats sidebar right
- Sort tabs: Top P&L / Balance / Win Rate
- Gold/Silver/Bronze gradient rank circles (Roman numerals I/II/III) for top 3
- Each row: rank + name + YOU badge + streak badge + W/L/win rate + PnL + balance
- Streak fire badges: ⚡ (3+), 🔥 (5+), 🔥🔥 (7+), 🔥🔥🔥 (10+)

### Navigation (`_layout.tsx`)
- Bottom tab bar: `◈ MARKETS` · `◉ PORTFOLIO` · `◎ INSIGHTS` · `◆ RANKINGS`
- Tab bar background: `#08090C`, gold active tint `#C5A052`
- KYC and Funding tabs hidden (`href: null`) — not needed for simulation

### API Layer (`src/api/client.ts`)
- Axios instance with `baseURL = API_BASE_URL` (localhost:8000)
- No auth headers yet (no JWT implemented)
- All requests/responses are plain JSON

### TradingContext (`src/session/TradingContext.tsx`)
- `DEV_USER_ID = 2` hardcoded (replaces auth until login screen built)
- On mount: fetches account + predictions
- `placePrediction(scenarioId, amount)`:
  1. POST /predictions/
  2. On success: refreshPortfolio()
  3. Returns `{ ok: true }` or `{ ok: false, error: string }`
- `refreshPortfolio()`: parallel fetch of account + prediction list

---

## 7. UX / PRODUCT FLOW

```
1. OPEN APP
   → TradingContext fetches account balance + prediction history
   → Markets screen loads, fetches /events/ + all /events/{id}/history in parallel
   → Grid renders with probability charts pre-populated

2. VIEW EVENTS
   → Trending strip shows live market titles
   → Category tabs filter grid
   → Each card shows: category badge, arc gauge (% chance), mini chart, scenario rows
   → Gauge color: green ≥60%, gold 40–60%, red <40%

3. PLACE PREDICTION
   → Tap grid card → detail panel opens (web: inline right, mobile: modal)
   → Select Yes or No (green/red buttons showing probability)
   → Enter amount or use +$1/$5/$10/$100 quick buttons
   → Tap Trade → POST /predictions/
   → Balance deducted immediately, green banner confirms

4. SEE BALANCE UPDATE
   → TradingContext.refreshPortfolio() fires
   → Balance card updates across all screens
   → New prediction appears in Portfolio

5. RESOLVE EVENT
   → Admin taps RESOLVE on event card or detail panel
   → Bottom sheet shows scenarios, select winner
   → Confirm → POST /events/{id}/resolve
   → Winners paid out, streak updated
   → Events screen refreshes, resolved events show CLOSED badge

6. VIEW PORTFOLIO
   → Portfolio tab: balance + positions list
   → Each settled prediction shows PnL in green (won) or red (lost)
   → Streak banner animates if current_streak ≥ 1

7. CHECK LEADERBOARD
   → Rankings tab: ranked by P&L by default
   → Your row highlighted with YOU badge
   → Switch sort to Balance or Win Rate
   → Web sidebar shows your standing + top 3 podium
```

---

## 8. FEATURES COMPLETED

### Core Prediction System
- [x] Event creation (manual + auto-generated)
- [x] Multi-scenario events (2–4 outcomes per event)
- [x] Probability-based payout multiplier
- [x] Prediction placement with balance deduction
- [x] Entry probability locked at time of bet
- [x] Open/Won/Lost/Void status lifecycle

### Resolution System
- [x] Manual resolution via admin UI button
- [x] Winner/loser payout calculation
- [x] Streak update on resolution (increment/reset)
- [x] Final probability snapshot logged on resolution

### Balance & Wallet System
- [x] Simulation account with starting balance
- [x] Real-time balance deduction on prediction
- [x] Payout credit on win
- [x] Full transaction ledger (audit trail)

### Probability Charts
- [x] Time-series probability history table
- [x] 5-minute auto-snapshots with Gaussian random walk
- [x] SVG line chart with area fills (green=Yes, red=No)
- [x] Web hover tooltip (onMouseMove) + mobile touch tooltip (PanResponder)
- [x] Gold crosshair + colored dots at cursor position
- [x] Backfill script for historical data seeding
- [x] Compact inline chart on grid cards, expandable full chart

### Event Generation
- [x] Auto-generation from CoinGecko live prices (BTC, ETH, SOL, BNB)
- [x] 25 static diverse event templates (Brazil politics/economy, sports, tech, geopolitics)
- [x] Random selection of 6 templates per hour (prevents flooding)
- [x] Hourly new events + 5-minute probability snapshots on single scheduler
- [x] `POST /admin/generate-events` and `POST /admin/snapshot` for manual triggers

### Performance Analytics
- [x] Accuracy score (Brier-score calibration, 0–100)
- [x] Percentile rank vs all users
- [x] Performance grade (S/A/B/C/D) with color coding
- [x] Win rate, avg P&L per prediction, best/worst single prediction
- [x] Avg entry probability (measures risk appetite)

### Streak System
- [x] `current_streak` and `best_streak` columns on User model
- [x] Incremented on win, reset to 0 on first loss
- [x] Displayed in Portfolio (banner), Leaderboard (fire badges), Rankings sidebar

### Leaderboard
- [x] Ranked list sortable by P&L / Balance / Win Rate
- [x] Shows W/L/win rate + streak badges per user
- [x] Your Standing highlighted with YOU badge
- [x] Web sidebar: Top 3 podium with gold/silver/bronze gradients

### UI & Design System
- [x] Black obsidian background (`#08090C`) matching Scenara logo
- [x] Gold gradient accent system (`#C5A052` → `#E8C97A`)
- [x] DM Sans font family (400/500/700) across all screens
- [x] Arc gauge component (SVG, centered number, color-coded)
- [x] Responsive grid: 2/3/4 columns based on screen width
- [x] Web resize listener for live reflow
- [x] Polymarket-style full-page detail panel (web only)
- [x] Category color system (6 categories with icons + colors)
- [x] Trending strip + category filter tabs
- [x] Hero featured card with big chart + predict buttons
- [x] Hot Markets + By Category sidebar

---

## 9. CURRENT LIMITATIONS

### Authentication
- **No auth system.** `DEV_USER_ID = 2` hardcoded in TradingContext
- Anyone with the app shares the same user account
- No JWT, no sessions, no login/signup screen
- **Risk:** Cannot ship to real users in this state

### Database
- **SQLite** — single-file, no concurrency, no horizontal scaling
- Migration system is manual `ALTER TABLE` commands, not Alembic
- No database indexes beyond what SQLAlchemy creates by default
- History table will grow unboundedly — no pruning/archival

### Event Resolution
- **Manual only** — events never auto-resolve
- Closing time (`closes_at`) is stored but never enforced
- No cron to auto-close or auto-resolve expired events
- Admin resolves manually through the UI

### Probability Simulation
- The random walk (±0.6% Gaussian per 5 minutes) is **fake market movement**
- It does not reflect real information or user betting volume
- All events start with hardcoded probabilities (52/48, 65/35)
- No order book, no liquidity, no price discovery

### Scaling
- Single FastAPI process — no worker pool
- No Redis, no message queue, no WebSockets for live updates
- Probability changes require full page refresh to see
- Loading all event histories in parallel on startup is O(n) API calls

### Social / Competitive Layer
- No user-generated events
- No comments or discussion on events
- No sharing or social features
- No notifications (win, streak, new event)

### Business Model
- No monetization layer designed or implemented
- No premium features, no ads, no referral system

---

## 10. PRODUCT STAGE

**Classification: Early MVP**

### Why not Prototype:
- Full prediction lifecycle is functional end-to-end
- Real data (CoinGecko prices) feeds the system
- Performance analytics (Brier score, percentile rank) are real
- UI is production-quality with responsive layout and luxury design

### Why not Early Product:
- No authentication — cannot onboard real users
- No automated event resolution
- No real-time updates (WebSockets)
- Single user in the database
- No user onboarding flow (empty state, tutorial, etc.)
- No error monitoring, no logging infrastructure

### What makes it an MVP:
- Core value proposition (place predictions, track performance, compete) is fully functional
- The product is demonstrable to investors and early users
- Technical architecture is sound and extensible
- Design matches a premium product standard

---

## 11. NEXT STEPS (PRIORITIZED)

### Immediate (0–2 weeks) — Must-do to onboard first users

1. **User Authentication**
   - Build login/signup screens
   - JWT token system (FastAPI OAuth2PasswordBearer)
   - Replace `DEV_USER_ID = 2` with real session
   - Store token in SecureStore (mobile) or cookies (web)

2. **Auto-Resolution of Expired Events**
   - Add a scheduler task that closes events past `closes_at`
   - For crypto price events: call CoinGecko at close time, compare to threshold, resolve automatically
   - Remove dependency on manual admin resolution for crypto events

3. **Database Migration to PostgreSQL + Alembic**
   - Replace SQLite with PostgreSQL
   - Add Alembic for proper schema versioning
   - Deploy backend to Railway or Render

4. **Real-Time Updates (WebSockets or Polling)**
   - Currently requires manual refresh to see new probabilities
   - Add auto-refresh every 30 seconds, or WebSocket push for probability changes

---

### Short Term (2–8 weeks) — Make it compelling for early adopters

5. **User Onboarding Flow**
   - Welcome screen explaining Scenara
   - Starting balance shown prominently on first load
   - Tutorial: how to read a market, how payout multipliers work
   - Empty states with CTAs ("Place your first prediction")

6. **Event Quality**
   - Human-curated events (not just auto-generated)
   - More Brazilian events: specific political polls, Ibovespa targets, Copa results
   - Event categories with icons visible in filter tabs
   - Event resolution notes shown to users

7. **Push Notifications**
   - "🔥 Your streak is at 5 wins — keep going!"
   - "✅ Event resolved — you won $66.67"
   - "⚡ New market: Will Lula's approval drop below 35%?"

8. **History Pruning**
   - `scenario_probability_history` will accumulate millions of rows
   - Keep only last 48 hours for open events, full history for resolved
   - Add indexed queries on `recorded_at`

9. **Social Features**
   - Comment thread on each event
   - Share position card (image export)
   - "Friends" leaderboard (compete with people you know)

---

### Long Term (2–6 months) — Product-market fit and scale

10. **Multi-Language Support**
    - Portuguese (pt-BR) as primary language for Brazilian market
    - English as secondary

11. **Real-Time Order Book Simulation**
    - Allow probability to shift based on user prediction volume
    - More Yes predictions → Yes probability rises
    - Creates genuine market dynamics, not random walk

12. **Web App (Dedicated)**
    - Decouple web from React Native
    - Build a standalone Next.js app for the browser experience
    - Better SEO, shareable event URLs

13. **API for Third-Party Events**
    - Webhook integration: receive external event data (sports scores, election results)
    - Auto-resolve events when webhook fires with outcome

14. **Premium Features / Monetization**
    - "Pro" tier: unlimited predictions, advanced analytics, early access to events
    - Tournament mode: buy-in with real currency (requires licensing)
    - White-label version for companies running internal prediction markets

15. **Infrastructure**
    - Horizontal scaling: multiple API workers behind load balancer
    - Redis for session cache + rate limiting
    - PostgreSQL read replicas for leaderboard queries
    - CDN for mobile app assets
    - Sentry for error monitoring
    - Datadog or Grafana for metrics

---

## APPENDIX: BRAND TOKENS

```
BG:          #08090C  (near-black obsidian)
CARD:        #0D1117  (elevated dark surface)
SURFACE:     #161B27  (input backgrounds)
GOLD:        #C5A052  (primary brand, logo match)
GOLD_LIGHT:  #E8C97A  (wins, highlights)
GOLD_DIM:    #9A7840  (labels, secondary gold)
TEXT:        #F1F5F9  (primary — near white)
TEXT_SUB:    #94A3B8  (secondary — readable)
TEXT_MID:    #64748B  (muted — subordinate)
GREEN:       #22C55E  (Yes, wins, positive)
RED:         #EF4444  (No, losses, negative)
BLUE:        #60A5FA  (open positions)

Category colors:
Politics:    #818CF8  (indigo)
Economy:     #34D399  (emerald)
Crypto:      #F7931A  (bitcoin orange)
Sports:      #60A5FA  (blue)
Technology:  #A78BFA  (purple)
Geopolitics: #FB923C  (amber)

Font: DM Sans — 400 Regular / 500 Medium / 700 Bold
```

---

*Document generated: March 2026 · Scenara v0.4 · Confidential*
