# Scenara

> Real-time prediction market simulation platform — take positions on real-world events, track your PnL, and compete on the leaderboard.

![Python](https://img.shields.io/badge/Python-3.11-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.110-green) ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue) ![SQLite](https://img.shields.io/badge/Database-SQLite-lightgrey) ![License](https://img.shields.io/badge/License-MIT-purple) [![Live](https://img.shields.io/badge/Live-scenara.vercel.app-brightgreen)](https://scenara.vercel.app)

---

## Overview

Scenara is a full-stack prediction market simulation where users take positions on real-world outcomes — crypto price targets, Brazilian politics, global sports, macroeconomics, and geopolitical events — using a simulated wallet. No real money involved.

Every **five minutes**, open market probabilities shift via a Gaussian random walk, keeping charts alive. Every **hour**, new markets are created automatically from live CoinGecko data and a curated pool of global events. When a market resolves, payouts are calculated using the user's entry probability, winners are credited, streaks update, and the full result is logged to an audit ledger.

Performance is measured through PnL, a Brier-score accuracy grade (0–100), win streaks, and a percentile rank against all other users.

---

## Monorepo Structure

```
Scenara/
├── scenara-backend/          # FastAPI REST API
│   ├── app/
│   │   ├── main.py           # App factory, CORS, startup, admin routes
│   │   ├── config.py         # Settings (app name, debug, DB URL)
│   │   ├── db.py             # SQLAlchemy engine + session factory
│   │   ├── models/
│   │   │   ├── __init__.py   # Re-exports all models
│   │   │   ├── user.py       # User + streak tracking
│   │   │   ├── account.py    # Simulation wallet
│   │   │   ├── event.py      # Prediction market event
│   │   │   ├── scenario.py   # Outcome option within an event
│   │   │   ├── prediction.py # User bet on a scenario
│   │   │   ├── transaction.py           # Balance ledger
│   │   │   └── probability_history.py   # Time-series chart data
│   │   ├── routers/
│   │   │   ├── users.py        # User creation
│   │   │   ├── events.py       # Event CRUD + resolution + history
│   │   │   ├── predictions.py  # Bet placement + portfolio analytics
│   │   │   └── accounts.py     # Balance + leaderboard
│   │   └── services/
│   │       └── event_generator.py  # 5-min snapshots + hourly event creation
│   ├── backfill_history.py   # Seed historical probability data
│   ├── migrate_history.py    # Create probability_history table
│   ├── requirements.txt
│   └── .env.example
│
├── scenara-mobile/           # TypeScript frontend (deployed on Vercel)
│
├── vercel.json               # Vercel build config
└── .github/workflows/        # CI/CD pipelines
```

---

## Tech Stack

### Backend
| Layer | Technology |
|---|---|
| Framework | FastAPI 0.110 |
| ORM | SQLAlchemy 2.0 |
| Database | SQLite (dev) / PostgreSQL-ready |
| Server | Uvicorn ASGI |
| Scheduler | asyncio background tasks |
| Price Data | CoinGecko public API |
| Language | Python 3.11 |

### Frontend
| Layer | Technology |
|---|---|
| Language | TypeScript |
| Deployment | Vercel |

---

## Getting Started

### Prerequisites
- Python 3.11+
- pip
- Node.js (for frontend)

### Backend Setup

```bash
# Clone the repo
git clone https://github.com/Noctilucenty/Scenara.git
cd Scenara/scenara-backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Mac/Linux
venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt
```

### Environment

```bash
cp .env.example .env
```

Default `.env`:

```env
APP_NAME=Scenara
APP_DEBUG=true
DATABASE_URL=sqlite:///./scenara.db
```

### Database Setup

```bash
# Create all tables
python migrate_history.py

# Seed historical probability data for charts
python backfill_history.py
```

### Run the Backend

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive API docs available at `http://localhost:8000/docs`.

---

## API Reference

### Events

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/events/` | Create a new prediction market |
| `GET` | `/events/` | List all events |
| `GET` | `/events/{id}` | Get a single event |
| `GET` | `/events/{id}/history` | Probability time-series for charts |
| `PATCH` | `/events/scenarios/{id}/probability` | Update scenario probability |
| `POST` | `/events/{id}/resolve` | Resolve market and pay out winners |

### Predictions

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/predictions/` | Place a prediction (bet) |
| `GET` | `/predictions/user/{id}` | User's full prediction history |
| `GET` | `/predictions/user/{id}/summary` | Portfolio analytics + performance grade |

### Accounts

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/accounts/user/{id}` | Get simulation wallet |
| `GET` | `/accounts/leaderboard` | Ranked leaderboard (sort by PnL / balance / win rate) |

### Admin

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/admin/generate-events` | Trigger immediate event creation |
| `POST` | `/admin/snapshot` | Trigger probability snapshot for all open events |

---

## Core Logic

### Prediction Placement

1. Validates user, scenario (must be `active`), and event (must be `open`)
2. Checks `account.balance >= amount`
3. Deducts amount immediately
4. Creates prediction record with `entry_probability` and `payout_multiplier = 100 / probability`
5. Logs `prediction_entry` transaction to the audit ledger

### Resolution

1. Admin selects the winning scenario
2. **Winners** — `payout = amount × multiplier`, balance credited, streak incremented
3. **Losers** — `pnl = -amount`, streak reset to 0
4. Final 100% / 0% probability snapshot logged for the chart
5. Event `status` set to `"resolved"`

### Performance Analytics

| Metric | Description |
|---|---|
| Accuracy score | Brier-score based (0–100). Rewards calibration, not just win rate. |
| Percentile rank | Percentage of other users beaten by total PnL. |
| Payout multiplier | `100 / entry_probability` — actuarially neutral. |

### Auto-Scheduler

| Interval | Action |
|---|---|
| Every 5 minutes | Logs a ±0.6% Gaussian random walk probability snapshot for all open events |
| Every 60 minutes | Creates new events from live CoinGecko prices + 6 curated global events |

---

## Event Categories

| Category | Examples |
|---|---|
| `crypto` | BTC / ETH / SOL / BNB price targets |
| `politics` | Lula approval, Brazilian elections, STF rulings |
| `economy` | Selic rate, USD/BRL, Ibovespa, IPCA inflation |
| `sports` | Copa do Brasil, F1, NBA, FIFA World Cup |
| `technology` | GPT-5 release, Tesla robotaxi, 5G coverage |
| `geopolitics` | Ukraine ceasefire, Fed rates, BRICS, Trump tariffs |

---

## Database Models

| Model | Purpose |
|---|---|
| `User` | Auth + streak tracking (`current_streak`, `best_streak`) |
| `Account` | Simulation wallet with balance |
| `Event` | Prediction market (title, category, status, `closes_at`) |
| `Scenario` | Outcome option with probability |
| `Prediction` | User bet (amount, `entry_prob`, multiplier, PnL) |
| `Transaction` | Full audit ledger of all balance changes |
| `ScenarioProbabilityHistory` | Time-series data for probability charts |

---

## Backend Requirements

```
fastapi
uvicorn[standard]
sqlalchemy
pydantic
httpx
python-dotenv
passlib[bcrypt]
```

---

## Roadmap

- [ ] JWT authentication + user sessions
- [ ] PostgreSQL + Alembic migrations
- [ ] Auto-resolution of expired crypto events
- [ ] WebSocket push for live probability updates
- [ ] Portuguese (pt-BR) event templates

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change. Make sure to update tests where applicable.

---

## License

MIT © Scenara 2026
