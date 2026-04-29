# Scenara

> Real-time prediction market simulation — take positions on real-world events, track your PnL, compete on the leaderboard, and follow other traders.

![Python](https://img.shields.io/badge/Python-3.11-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![React Native](https://img.shields.io/badge/React_Native-0.81-61dafb)
![Expo](https://img.shields.io/badge/Expo-SDK_54-black)
![SQLite](https://img.shields.io/badge/Dev_DB-SQLite-lightgrey)
![PostgreSQL](https://img.shields.io/badge/Prod_DB-PostgreSQL_(Neon)-blue)
![License](https://img.shields.io/badge/License-MIT-purple)
[![Live](https://img.shields.io/badge/Live-scenara.vercel.app-brightgreen)](https://scenara.vercel.app)

---

## What Is Scenara?

Scenara is a full-stack **prediction market simulation** platform. Users take positions on real-world outcomes — crypto price targets, Brazilian politics, global sports, macroeconomics, geopolitical events, and live news headlines — using a simulated wallet. **No real money is involved.**

Every **five minutes**, open market probabilities drift via a Gaussian random walk, keeping charts alive and positions dynamic. Every **hour**, new markets are auto-generated from live CoinGecko price data and a curated pool of global events. When a market resolves, payouts are calculated using each user's entry probability, winners are credited, streaks update, and the full result is logged to an immutable audit ledger.

Performance is tracked through PnL, a Brier-score accuracy grade (0–100), win streaks, XP, user level, and a percentile rank against every other user on the platform.

---

## Monorepo Structure

```
Scenara/
├── scenara-backend/                  # FastAPI REST API (Python 3.11)
│   ├── app/
│   │   ├── main.py                   # App factory, CORS, startup orchestration
│   │   ├── config.py                 # Pydantic-settings (env vars, secrets)
│   │   ├── db.py                     # SQLAlchemy engine + session factory
│   │   ├── observability.py          # Sentry init (safe no-op when DSN unset)
│   │   ├── models/
│   │   │   ├── user.py               # User, streak, XP, level, notify prefs
│   │   │   ├── account.py            # Simulation wallet
│   │   │   ├── event.py              # Prediction market event
│   │   │   ├── scenario.py           # Outcome option within an event
│   │   │   ├── prediction.py         # User bet (entry prob, multiplier, PnL)
│   │   │   ├── transaction.py        # Immutable balance audit ledger
│   │   │   ├── probability_history.py# Time-series chart data
│   │   │   ├── comment.py            # Market comments + threading
│   │   │   ├── device_token.py       # Push notification device registry
│   │   │   ├── user_follow.py        # Social graph (follower/following)
│   │   │   ├── kyc.py                # KYC verification record
│   │   │   └── brokerage.py          # Brokerage integration stub
│   │   ├── routers/
│   │   │   ├── auth.py               # JWT login, registration, OTP reset
│   │   │   ├── users.py              # User CRUD + profile management
│   │   │   ├── events.py             # Market CRUD, resolution, history
│   │   │   ├── predictions.py        # Bet placement, XP award, portfolio
│   │   │   ├── accounts.py           # Wallet, leaderboard, analytics
│   │   │   ├── news.py               # AI-curated news + news markets
│   │   │   ├── comments.py           # Market comment threads
│   │   │   ├── voting.py             # Market outcome voting
│   │   │   ├── social.py             # Follow/unfollow, feed, public profiles
│   │   │   ├── notifications.py      # Notify preferences + VAPID key
│   │   │   ├── push.py               # Device token registration
│   │   │   ├── admin.py              # Admin-only controls
│   │   │   ├── kyc.py                # KYC submission + status
│   │   │   └── mvp.py                # MVP aggregate endpoint
│   │   ├── services/
│   │   │   ├── event_generator.py    # 5-min snapshots + hourly market creation
│   │   │   ├── auto_resolver.py      # Auto-resolve expired crypto markets
│   │   │   ├── resolution.py         # Payout settlement engine
│   │   │   ├── notifications.py      # Fan-out push notification dispatcher
│   │   │   ├── news_market_generator.py  # News → prediction market pipeline
│   │   │   ├── email.py              # OTP email delivery (SMTP)
│   │   │   ├── translate.py          # i18n translation layer
│   │   │   └── xp.py                 # XP award + level calculation
│   │   ├── integrations/             # Third-party API clients
│   │   └── migrations/               # Schema migration scripts
│   ├── backfill_history.py           # Seed historical probability data
│   ├── backfill_translations.py      # Backfill translated event content
│   ├── migrate_bilingual.py          # One-shot bilingual migration
│   ├── requirements.txt
│   └── Procfile                      # Heroku/Render entrypoint
│
├── scenara-mobile/                   # Expo + React Native (TypeScript)
│   ├── app/
│   │   ├── (tabs)/
│   │   │   ├── index.tsx             # Markets home feed
│   │   │   ├── portfolio.tsx         # Portfolio + PnL analytics
│   │   │   ├── leaderboard.tsx       # Global & friends leaderboard
│   │   │   ├── news.tsx              # News feed
│   │   │   ├── insights.tsx          # AI insights
│   │   │   ├── kyc.tsx               # KYC verification flow
│   │   │   ├── funding.tsx           # Wallet funding screen
│   │   │   └── settings.tsx          # Account settings
│   │   ├── market-detail.tsx         # Market deep-dive + chart + comments
│   │   ├── user-profile.tsx          # Public trader profile
│   │   ├── news-detail.tsx           # Full news article
│   │   ├── login.tsx                 # Login screen
│   │   ├── register.tsx              # Registration flow
│   │   ├── onboarding.tsx            # First-launch onboarding
│   │   ├── forgot-password.tsx       # Email OTP request
│   │   ├── reset-password.tsx        # OTP verification + new password
│   │   ├── notifications-settings.tsx# Push notification preferences
│   │   ├── how-it-works.tsx          # Product explainer
│   │   ├── language-select.tsx       # Language picker (EN / PT-BR / ZH)
│   │   └── terms.tsx                 # Terms of service
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts             # Axios API client + token interceptor
│   │   ├── state/
│   │   │   └── portfolioStore.ts     # Zustand portfolio state
│   │   ├── screens/                  # Shared screen components
│   │   ├── config/                   # App config + environment
│   │   ├── i18n.tsx                  # i18next internationalisation
│   │   ├── lib/                      # Shared utilities
│   │   ├── observability/            # Sentry React Native integration
│   │   ├── session/                  # Auth session management
│   │   ├── utils/                    # Formatters, helpers
│   │   └── theme.ts                  # Design tokens
│   ├── components/                   # Reusable UI components
│   ├── hooks/                        # Custom React hooks
│   ├── constants/                    # App-wide constants
│   ├── assets/                       # Images, fonts, icons
│   └── public/                       # Static assets (web)
│
├── vercel.json                        # Vercel deployment config + rewrites
└── SCENARA_TECHNICAL_DOCUMENT.md      # Detailed technical specification
```

---

## Tech Stack

### Backend

| Layer | Technology |
|---|---|
| Framework | FastAPI 0.115 |
| ORM | SQLAlchemy 2.0 |
| Database (dev) | SQLite |
| Database (prod) | PostgreSQL via Neon |
| Server | Uvicorn ASGI |
| Auth | JWT (python-jose) + bcrypt |
| Scheduler | asyncio background tasks |
| Push Notifications | Expo Push API + pywebpush (Web Push / VAPID) |
| Email (OTP) | SMTP via smtplib |
| Price Data | CoinGecko public API |
| Translation | Custom translate service layer |
| Observability | Sentry SDK for FastAPI |
| Language | Python 3.11 |

### Mobile / Frontend

| Layer | Technology |
|---|---|
| Framework | Expo SDK 54 + React Native 0.81 |
| Language | TypeScript 5.9 |
| Navigation | Expo Router 6 (file-based) + React Navigation 7 |
| State | Zustand |
| HTTP Client | Axios |
| Animations | React Native Reanimated 4 |
| Charts | react-native-svg |
| Fonts | DM Sans (Google Fonts via Expo) |
| Push Notifications | expo-notifications + Expo Push API |
| Secure Storage | expo-secure-store |
| Internationalization | i18next (EN / PT-BR / ZH) |
| Observability | Sentry React Native SDK |
| Deployment | Vercel (web export) |

---

## Feature Overview

### Prediction Markets
- Browse markets across **6 categories**: crypto, politics, economy, sports, technology, geopolitics
- Take YES/NO or multi-outcome positions with simulated balance
- Entry probability locked at time of bet; payout multiplier = `100 / entry_probability`
- Real-time probability charts (5-minute Gaussian random walk)
- Market search by keyword and category filter
- Community voting on outcomes before resolution
- Threaded comment discussions on each market

### Auto-Scheduler

| Interval | Action |
|---|---|
| Every 5 minutes | Gaussian ±0.6% probability snapshot for all open markets |
| Every 60 minutes | New markets generated from CoinGecko live prices + 6 curated global events |
| Continuous | Auto-resolver checks and settles expired crypto markets against live prices |

### Performance Analytics

| Metric | Description |
|---|---|
| PnL | Realized + unrealized profit/loss in simulation currency |
| Accuracy Score | Brier-score based (0–100); rewards calibration, not just win rate |
| Win Streak | Current and best consecutive winning streak |
| Percentile Rank | Percentage of users beaten by total PnL |
| XP & Level | XP awarded on prediction placement; non-linear level thresholds |

### Social Graph
- Follow / unfollow other traders
- Personalized feed of recent bets from traders you follow
- Public trader profile (stats visible to all authenticated users)
- Follower / following lists with pagination

### Leaderboard
- Rank by PnL, total balance, or win rate
- Global leaderboard + friends-only leaderboard
- Percentile rank displayed per user

### Push Notifications
- Device token registration for Expo push (iOS + Android)
- Web Push via VAPID (browser subscriptions)
- Per-user notification preferences (market resolution, follows, comments, etc.)
- Admin smoke-test endpoint to verify push round-trip

### News
- AI-curated news feed with category tagging
- News-to-market pipeline: news items automatically spawn related prediction markets
- Full article view in-app

### Authentication & Security
- JWT access tokens with secure refresh
- bcrypt password hashing
- Email OTP-based forgot-password / reset-password flow
- KYC verification flow (document submission + status polling)
- Admin-protected routes requiring elevated JWT claims

### Internationalisation
- Full UI in **English**, **Portuguese (PT-BR)**, and **Mandarin Chinese (ZH)**
- Language selection persisted per user
- Backend translation layer for dynamically generated event titles

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+ and npm
- Expo CLI (`npm install -g expo-cli`)
- (Optional) PostgreSQL for production-like local dev

---

### Backend Setup

```bash
# Clone the repository
git clone https://github.com/Noctilucenty/Scenara.git
cd Scenara/scenara-backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # macOS / Linux
venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt
```

#### Environment Variables

```bash
cp .env.example .env
```

Key variables in `.env`:

```env
# Core
APP_NAME=Scenara
APP_DEBUG=true
DATABASE_URL=sqlite:///./scenara.db       # Use postgresql+psycopg2://... for prod

# Auth
SECRET_KEY=your-256-bit-secret
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Email OTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=your@email.com

# Push Notifications (optional)
VAPID_PRIVATE_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_SUBJECT=mailto:your@email.com

# Observability (optional)
SENTRY_DSN=https://...@sentry.io/...

# CoinGecko (optional — falls back to curated event pool)
COINGECKO_API_KEY=...
```

#### Database Setup

```bash
# SQLite (dev) — tables are created automatically on first startup.
# For PostgreSQL, run the migration scripts after pointing DATABASE_URL at Postgres:
python migrate_bilingual.py
python backfill_history.py
python backfill_translations.py
```

#### Run the Backend

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive API docs available at [http://localhost:8000/docs](http://localhost:8000/docs).

---

### Mobile / Frontend Setup

```bash
cd Scenara/scenara-mobile

# Install dependencies
npm install

# Run on web (opens browser at localhost:8081)
npm run web

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android
```

The API base URL is configured in `src/config/`. For local development, point it at `http://localhost:8000`. For production web builds, Vercel picks up the `vercel.json` and deploys automatically on push to `main`.

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Register a new user |
| `POST` | `/auth/login` | Login, returns JWT |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/forgot-password` | Send OTP to email |
| `POST` | `/auth/reset-password` | Verify OTP + set new password |

### Users

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/users/me` | Get current user profile |
| `PATCH` | `/users/me` | Update profile (name, avatar, language) |
| `GET` | `/users/{id}` | Get public user profile |

### Events (Markets)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/events/` | Create a new prediction market (admin) |
| `GET` | `/events/` | List all markets (filter by category, status) |
| `GET` | `/events/{id}` | Get a single market |
| `GET` | `/events/{id}/history` | Probability time-series for charts |
| `PATCH` | `/events/scenarios/{id}/probability` | Update scenario probability (admin) |
| `POST` | `/events/{id}/resolve` | Resolve market and pay out winners (admin) |

### Predictions (Bets)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/predictions/` | Place a prediction |
| `GET` | `/predictions/user/{id}` | User's full prediction history |
| `GET` | `/predictions/user/{id}/summary` | Portfolio analytics + performance grade |

### Accounts (Wallet)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/accounts/user/{id}` | Get simulation wallet |
| `GET` | `/accounts/leaderboard` | Ranked leaderboard (PnL / balance / win rate) |

### Social

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/social/follow/{id}` | Follow a trader |
| `DELETE` | `/social/follow/{id}` | Unfollow a trader |
| `GET` | `/social/followers/{id}` | List followers |
| `GET` | `/social/following/{id}` | List following |
| `GET` | `/social/feed` | Activity feed from traders you follow |
| `GET` | `/social/profile/{id}` | Public trader profile with stats |

### News

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/news/` | Paginated news feed |
| `GET` | `/news/{id}` | Single news article |

### Comments

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/comments/event/{id}` | Get comment thread for a market |
| `POST` | `/comments/` | Post a comment |
| `DELETE` | `/comments/{id}` | Delete own comment |

### Voting

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/voting/event/{id}` | Cast a community vote on an outcome |
| `GET` | `/voting/event/{id}` | Get current vote tally |

### Notifications

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/notifications/vapid-public-key` | VAPID public key for Web Push |
| `GET` | `/notifications/preferences` | Get notify preferences |
| `PATCH` | `/notifications/preferences` | Update notify preferences |
| `POST` | `/notifications/register` | Register device push token |
| `DELETE` | `/notifications/register` | Unregister device push token |
| `POST` | `/notifications/test` | Admin smoke-test push to own devices |

### Admin

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/admin/generate-events` | Trigger immediate market creation |
| `POST` | `/admin/snapshot` | Trigger probability snapshot |
| `POST` | `/admin/resolve/{id}` | Force-resolve a market |

### KYC

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/kyc/submit` | Submit KYC documents |
| `GET` | `/kyc/status` | Get current KYC status |

---

## Core Logic

### Prediction Placement

1. Validate user, scenario (`active`), and event (`open`)
2. Check `account.balance >= amount`
3. Deduct amount immediately from wallet (atomic with ledger entry)
4. Create prediction record with `entry_probability` and `payout_multiplier = 100 / probability`
5. Award XP to user (awarded at placement, not settlement — prevents winner double-reward)
6. Log `prediction_entry` transaction to the immutable audit ledger
7. Fan out push notifications to followers

### Resolution

1. Admin (or auto-resolver for crypto markets) selects the winning scenario
2. **Winners** — `payout = amount × multiplier`, balance credited, streak incremented, push notification sent
3. **Losers** — `pnl = -amount`, streak reset to 0, push notification sent
4. Final 100% / 0% probability snapshot logged for chart continuity
5. Event `status` set to `"resolved"`
6. Community voters who backed the correct outcome are credited

### Auto-Resolver

Crypto markets with price targets auto-resolve when CoinGecko confirms the target has been breached or the expiry window passes. Runs as a continuous asyncio background task alongside the probability snapshot scheduler.

### XP & Levels

XP is awarded when a prediction is placed (not settled). Level thresholds are non-linear — early levels are easy to reach to maintain new-user momentum, later levels require consistent volume. Level is displayed on the public profile and leaderboard.

### Brier-Score Accuracy

```
accuracy = 100 × (1 − mean((outcome − entry_probability)²))
```

A score of 100 means perfectly calibrated predictions. Compared to simple win rate, Brier score rewards users who place bets at accurate probability estimates, not just users who happen to win.

---

## Database Models

| Model | Key Fields |
|---|---|
| `User` | `email`, `display_name`, `hashed_password`, `current_streak`, `best_streak`, `xp`, `level`, `notify_*` preferences |
| `Account` | `user_id`, `balance` |
| `Event` | `title`, `category`, `status` (`open` / `resolved` / `void`), `closes_at`, `language` |
| `Scenario` | `event_id`, `title`, `probability`, `is_winner` |
| `Prediction` | `user_id`, `scenario_id`, `amount`, `entry_probability`, `payout_multiplier`, `pnl` |
| `Transaction` | `account_id`, `type`, `amount`, `description` — immutable audit ledger |
| `ScenarioProbabilityHistory` | `scenario_id`, `probability`, `recorded_at` — powers charts |
| `Comment` | `user_id`, `event_id`, `body`, `parent_id` (threading) |
| `DeviceToken` | `user_id`, `token`, `platform` (`expo` / `web`) |
| `UserFollow` | `follower_id`, `followee_id` |
| `KYC` | `user_id`, `status`, `document_url` |

---

## Event Categories

| Category | Examples |
|---|---|
| `crypto` | BTC / ETH / SOL / BNB price targets (auto-generated from CoinGecko) |
| `politics` | Lula approval, Brazilian elections, STF rulings |
| `economy` | Selic rate, USD/BRL, Ibovespa, IPCA inflation |
| `sports` | Copa do Brasil, F1 Championship, NBA Finals, FIFA World Cup |
| `technology` | GPT-5 release, Tesla robotaxi, 5G coverage milestones |
| `geopolitics` | Ukraine ceasefire, Fed rate decisions, BRICS expansion, Trump tariffs |

---

## Deployment

### Backend (Render / Heroku)

The `Procfile` at `scenara-backend/Procfile` configures the server entrypoint:

```
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Set all environment variables in the hosting dashboard. Production database is PostgreSQL via [Neon](https://neon.tech) — set `DATABASE_URL` to the Neon connection string (`postgresql+psycopg2://...`).

### Frontend (Vercel)

`vercel.json` at the repo root handles:
- Build: `cd scenara-mobile && npm install && npx expo export --platform web`
- Output: `scenara-mobile/dist`
- Catch-all rewrite to `index.html` for SPA routing
- Direct pass-through for `/sw.js` (service worker required for Web Push)

Pushes to `main` deploy automatically.

---

## Observability

Both the backend and mobile app integrate **Sentry**:

- **Backend**: `sentry-sdk[fastapi]` is initialized before any router import so startup errors are captured. Safe no-op when `SENTRY_DSN` is unset.
- **Mobile**: `@sentry/react-native` is initialized at app entry. Source maps are uploaded on build for readable stack traces.

---

## Changelog

### v0.9.7 — Stability & Race Condition Fixes
- Fixed stale follower lists served from cache after follow/unfollow
- Fixed leaderboard double-fetch race condition on tab focus
- Fixed streak counter race (won't exceed reality on concurrent settlements)
- Fixed push notification deduplication (duplicate Expo tokens no longer fan out twice)
- Fixed market detail animation reset when navigating back
- Fixed insights screen error on empty portfolio
- Fixed ZIP guard on malformed push subscription payloads

### v0.9.6 — Major Bug Fix Sprint (20+ fixes)
- Security: SQL injection hardening on event search
- Security: Rate limiting on auth endpoints
- Data integrity: Atomic prediction placement (balance deduct + ledger entry in one transaction)
- Frontend: Fixed market detail chart crash on null history
- Frontend: Fixed leaderboard infinite scroll loading state
- Frontend: Fixed portfolio PnL sign on void market settlement
- Frontend: Fixed multiple crash-on-load issues across screens

### v0.9.5 — Market Speed + Category Search + Admin Analytics
- Market feed loads 3× faster via N+1 query elimination
- Category filter chips on home feed
- Keyword search with debounce
- Admin dashboard with market analytics and resolution controls

### v0.9.4 — Performance & Memoization
- Memoized expensive leaderboard calculations
- Stable event handler references to prevent unnecessary re-renders
- Response cache headers for probability history endpoint
- Carousel momentum improvements

### v0.9.3 — Internationalisation Fixes
- Fixed featured news showing in English when Chinese (ZH) is selected
- Fixed chart legend language following user preference
- Expanded Chinese hot-topic translations
- Fixed garbled strings on language switch (stale closure bug)
- Fixed amount formatting for non-Latin locales

### v0.9.2 — Push Notifications
- Expo Push API integration (iOS + Android)
- Web Push via VAPID (browser)
- Per-user notification preference toggles
- Device token registration / deregistration

### v0.9.1 — Forgot-Password / OTP Reset
- Email OTP-based password reset flow (backend + redesigned screens)
- Web-safe navigation fallbacks for Expo Router on Vercel
- Fixed multiple navigation edge cases on web platform

### v0.9 — Social Graph
- Follow / unfollow traders
- Activity feed from followed traders
- Public trader profiles with stats
- Follower / following lists

### v0.8 — Foundation
- Initial Scenara setup (rebrand from Orryin)
- FastAPI backend with SQLAlchemy + SQLite
- Prediction placement + resolution engine
- Probability snapshot scheduler
- Leaderboard + portfolio analytics
- React Native / Expo frontend

---

## Roadmap

- [ ] WebSocket push for live probability updates (replace polling)
- [ ] Alembic database migrations (replace manual migration scripts)
- [ ] Auto-resolution of all non-crypto expired events
- [ ] Real-time market chat alongside threaded comments
- [ ] Mobile-native push on more platforms (macOS, watchOS)
- [ ] Expanded PT-BR and ZH event template libraries
- [ ] Two-factor authentication (TOTP)
- [ ] Referral system with XP bonus

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss the proposal. Ensure that `requirements.txt` and `package.json` remain in sync and that any new router is registered in `app/main.py`.

---

## License

MIT © Scenara 2026
