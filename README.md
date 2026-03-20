# Scenara

**Predict the future. Track your edge.**

Scenara is a real-time prediction market simulation platform where users bet simulated currency on the outcomes of real-world events — crypto prices, Brazilian politics, global geopolitics, sports, and technology news.


---

## What it is

Scenara lets you form an opinion on a real-world event and express it with skin in the game. Every prediction is scored not just on whether you were right, but on *how confident* you were — rewarding calibration over luck.

Think of it as a trading platform for ideas.

---

## Features

- **Live prediction markets** — crypto prices, Brazilian elections, F1, NBA, geopolitics, tech
- **Real-time probability charts** — every market updates every 5 minutes from live data
- **Performance grading** — Brier-score accuracy system grades you S / A / B / C / D
- **Leaderboard** — compete by P&L, balance, or win rate
- **Streak tracking** — consecutive wins tracked with escalating badges
- **Portfolio analytics** — percentile rank, accuracy score, best/worst prediction
- **Responsive layout** — full Polymarket-style web dashboard + mobile app

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI · SQLAlchemy · SQLite |
| Mobile / Web | Expo React Native · TypeScript |
| Charts | react-native-svg (custom SVG) |
| Prices | CoinGecko public API |
| Fonts | DM Sans |

---

## Structure

```
Scenara/
├── scenara-backend/     # FastAPI REST API
└── scenara-mobile/      # Expo React Native app (iOS + Android + Web)
```

→ [Backend README](./Scenara/scenara-backend/README.md)
→ [Mobile README](./Scenara/scenara-mobile/README.md)

---

## Quick Start

```bash
# Backend
cd scenara-backend
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
python migrate_history.py
uvicorn app.main:app --reload

# Mobile (new terminal)
cd scenara-mobile
npm install
npx expo start --web
```

Open `http://localhost:8081` — the full dashboard runs in your browser.

---

## Screenshots

> Markets grid · Detail panel · Portfolio · Leaderboard · Insights

*Coming soon*

---

## Roadmap

- [ ] User authentication (JWT)
- [ ] Auto-resolution of expired markets
- [ ] Portuguese (pt-BR) localization
- [ ] WebSocket live updates
- [ ] Push notifications

---

## License

MIT © Scenara 2026
