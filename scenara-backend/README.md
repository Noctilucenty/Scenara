# Scenara Backend

> Real-time prediction market simulation platform — FastAPI backend

![Python](https://img.shields.io/badge/Python-3.11-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.110-green) ![SQLite](https://img.shields.io/badge/Database-SQLite-lightgrey) ![License](https://img.shields.io/badge/License-MIT-purple)

---

## Overview

Scenara's backend is a FastAPI REST API that powers the full prediction market lifecycle — event creation, probability tracking, bet placement, resolution, payout, leaderboard, and performance analytics.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | FastAPI 0.110 |
| ORM | SQLAlchemy 2.0 |
| Database | SQLite (dev) / PostgreSQL-ready |
| Server | Uvicorn ASGI |
| Scheduler | asyncio background tasks |
| Prices | CoinGecko public API |
| Language | Python 3.11 |

---

## Project Structure

```
scenara-backend/
├── app/
│   ├── main.py                  # App factory, CORS, startup, admin routes
│   ├── config.py                # Settings (app name, debug, DB URL)
│   ├── db.py                    # SQLAlchemy engine + session
│   ├── models/
│   │   ├── __init__.py          # Re-exports all models
│   │   ├── user.py              # User + streak tracking
│   │   ├── account.py           # Simulation wallet
│   │   ├── event.py             # Prediction market event
│   │   ├── scenario.py          # Outcome within an event
│   │   ├── prediction.py        # User bet on a scenario
│   │   ├── transaction.py       # Balance ledger
│   │   └── probability_history.py  # Time-series chart data
│   ├── routers/
│   │   ├── users.py             # User creation
│   │   ├── events.py            # Event CRUD + resolution + history
│   │   ├── predictions.py       # Bet placement + portfolio analytics
│   │   └── accounts.py          # Balance + leaderboard
│   └── services/
│       └── event_generator.py   # 5-min snapshots + hourly event creation
├── backfill_history.py          # Seed historical probability data
├── migrate_history.py           # Create probability_history table
├── requirements.txt
└── .env.example
```

---

## Getting Started

### Prerequisites
- Python 3.11+
- pip

### Installation

```bash
# Clone the repo
git clone https://github.com/Noctilucenty/Orryin-2.0.git
cd Scenara/scenara-backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Mac/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Environment

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Default `.env`:
```
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

### Run

```bash
uvicorn app.main:app --reload --port 8000
```

API docs available at: `http://localhost:8000/docs`

---

## API Endpoints

### Events
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/events/` | Create a new prediction market |
| `GET` | `/events/` | List all events |
| `GET` | `/events/{id}` | Get single event |
| `GET` | `/events/{id}/history` | Probability time-series for charts |
| `PATCH` | `/events/scenarios/{id}/probability` | Update scenario probability |
| `POST` | `/events/{id}/resolve` | Resolve market, pay out winners |

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
| `GET` | `/accounts/leaderboard` | Ranked leaderboard (sort by pnl/balance/win_rate) |

### Admin
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/admin/generate-events` | Trigger immediate event creation |
| `POST` | `/admin/snapshot` | Trigger probability snapshot for all open events |

---

## Core Logic

### Prediction Placement
1. Validates user, scenario (must be `active`), event (must be `open`)
2. Checks `account.balance >= amount`
3. Deducts amount immediately
4. Creates prediction with `entry_probability` and `payout_multiplier = 100 / probability`
5. Logs `prediction_entry` transaction

### Resolution
1. Selects winning scenario
2. For **winners**: `payout = amount × multiplier`, credits account, increments streak
3. For **losers**: `pnl = -amount`, resets streak to 0
4. Logs final probability snapshot (100% winner, 0% loser)
5. Sets event `status = "resolved"`

### Performance Analytics
- **Accuracy score**: Brier-score based (0–100) — rewards calibration not just wins
- **Percentile rank**: % of other users beaten by total PnL
- **Payout multiplier**: `100 / entry_probability` (actuarially neutral)

### Auto-Scheduler
- **Every 5 minutes**: logs probability snapshot for all open events (±0.6% Gaussian random walk)
- **Every 60 minutes**: creates new events from CoinGecko live prices + 6 random diverse events (Brazil politics, economy, sports, tech, geopolitics)

---

## Event Categories

| Category | Examples |
|---|---|
| `crypto` | BTC/ETH/SOL/BNB price targets |
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
| `Event` | Prediction market (title, category, status, closes_at) |
| `Scenario` | Outcome option with probability |
| `Prediction` | User bet (amount, entry_prob, multiplier, pnl) |
| `Transaction` | Full audit ledger of all balance changes |
| `ScenarioProbabilityHistory` | Time-series data for probability charts |

---

## Requirements

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

## License

MIT © Scenara 2026
