# Scenara

**Real-time prediction market simulation platform** — take positions on real-world events, track your PnL, and compete on the leaderboard.

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-green)](https://fastapi.tiangolo.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-61.9%25-blue)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)
[![Live](https://img.shields.io/badge/Live-scenara.vercel.app-brightgreen)](https://scenara.vercel.app)

---

## What is Scenara?

Scenara lets you bet (with simulated currency) on real-world outcomes — crypto prices, Brazilian politics, sports results, geopolitical events, and more. Every five minutes, probability charts update via a Gaussian random walk. Every hour, new markets open automatically from live CoinGecko prices and a curated set of global events.

Your performance is tracked through PnL, a Brier-score accuracy grade, and a percentile rank against all other users.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend Framework | FastAPI 0.110 |
| ORM | SQLAlchemy 2.0 |
| Database | SQLite (dev) / PostgreSQL-ready |
| Server | Uvicorn ASGI |
| Scheduler | asyncio background tasks |
| Price Data | CoinGecko public API |
| Language | Python 3.11 |
| Frontend | TypeScript / React (Vercel) |

---

## Project Structure

```
Scenara/
├── scenara-backend/
│   ├── app/
│   │   ├── main.py                    # App factory, CORS, startup, admin routes
│   │   ├── config.py                  # Settings (app name, debug, DB URL)
│   │   ├── db.py                      # SQLAlchemy engine + session
│   │   ├── models/
│   │   │   ├── user.py                # User + streak tracking
│   │   │   ├── account.py             # Simulation wallet
│   │   │   ├── event.py               # Prediction market event
│   │   │   ├── scenario.py            # Outcome within an event
│   │   │   ├── prediction.py          # User bet on a scenario
│   │   │   ├── transaction.py         # Balance ledger
│   │   │   └── probability_history.py # Time-series chart data
│   │   ├── routers/
│   │   │   ├── users.py               # User creation
│   │   │   ├── events.py              # Event CRUD + resolution + history
│   │   │   ├── predictions.py         # Bet placement + portfolio analytics
│   │   │   └── accounts.py            # Balance + leaderboard
│   │   └── services/
│   │       └── event_generator.py     # 5-min snapshots + hourly event creation
│   ├── backfill_history.py            # Seed historical probability data
│   ├── migrate_history.py             # Create probability_history table
│   ├── requirements.txt
│   └── .env.example
└── scenara-mobile/                    # TypeScript frontend
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- pip

### Installation

```bash
# Clone the repo
git clone https://github.com/Noctilucenty/Scenara.git
cd Scenara/scenara-backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Mac/Linux
# venv\Scripts\activate         # Windows

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
python migrate_history.py   # Create all tables
python backfill_history.py  # Seed historical probability data for charts
```

### Run

```bash
uvicorn app.main:app --reload --port 8000
```

API docs available at `http://localhost:8000/docs`.

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

### Placing a Prediction

1. Validates user, scenario (must be active), and event (must be open)
2. Checks `account.balance >= amount`
3. Deducts amount immediately and records `prediction_entry` transaction
4. Stores `entry_probability` and `payout_multiplier = 100 / probability`

### Resolution

1. Admin selects the winning scenario
2. Winners receive `payout = amount × multiplier`; streak increments
3. Losers record `pnl = -amount`; streak resets to 0
4. Final 100%/0% probability snapshot is logged; event status set to `resolved`

### Performance Analytics

- **Accuracy score** — Brier-score based (0–100), rewards calibration over raw win rate
- **Percentile rank** — percentage of other users beaten by total PnL
- **Payout multiplier** — `100 / entry_probability` (actuarially neutral)

---

## Auto-Scheduler

| Interval | Action |
|---|---|
| Every 5 minutes | Logs a ±0.6% Gaussian random walk probability snapshot for all open events |
| Every 60 minutes | Creates new events from CoinGecko live prices + 6 diverse global events |

---

## Event Categories

| Category | Examples |
|---|---|
| Crypto | BTC / ETH / SOL / BNB price targets |
| Politics | Lula approval, Brazilian elections, STF rulings |
| Economy | Selic rate, USD/BRL, Ibovespa, IPCA inflation |
| Sports | Copa do Brasil, F1, NBA, FIFA World Cup |
| Technology | GPT-5 release, Tesla robotaxi, 5G coverage |
| Geopolitics | Ukraine ceasefire, Fed rates, BRICS, Trump tariffs |

---

## Database Models

| Model | Purpose |
|---|---|
| `User` | Auth + streak tracking (`current_streak`, `best_streak`) |
| `Account` | Simulation wallet with balance |
| `Event` | Prediction market (title, category, status, `closes_at`) |
| `Scenario` | Outcome option with probability |
| `Prediction` | User bet (amount, entry probability, multiplier, PnL) |
| `Transaction` | Full audit ledger of all balance changes |
| `ScenarioProbabilityHistory` | Time-series data for probability charts |

---

## Roadmap

- [ ] JWT authentication + user sessions
- [ ] PostgreSQL + Alembic migrations
- [ ] Auto-resolution of expired crypto events
- [ ] WebSocket push for live probability updates
- [ ] Portuguese (pt-BR) event templates

---

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss what you'd like to change.

---

## License

MIT © Scenara 2026
