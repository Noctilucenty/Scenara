"""
app/services/event_generator.py

Generates diverse prediction events across:
- Brazilian politics & elections
- Brazilian economy & markets
- Global crypto prices (CoinGecko)
- International sports (Copa, F1, NBA)
- Technology & AI news
- Global geopolitics

Snapshots every 5 minutes, new events every 60 minutes.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import random
from datetime import datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.event import Event
from app.models.scenario import Scenario
from app.models.probability_history import ScenarioProbabilityHistory

logger = logging.getLogger(__name__)

COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"
COINS = {"bitcoin": "BTC", "ethereum": "ETH", "solana": "SOL", "binancecoin": "BNB"}
CURRENCY = "usd"

SNAPSHOT_INTERVAL_SECONDS = 5 * 60
_snapshot_count = 0


# ---------------------------------------------------------------------------
# Static diverse event templates
# These rotate — a random subset gets created each hour
# ---------------------------------------------------------------------------

STATIC_EVENTS = [
    # ── Brazilian Politics ──────────────────────────────────────────────────
    {
        "slug_key": "br-lula-approval-week",
        "title": "Will Lula's approval rating stay above 40% this week?",
        "description": "Latest Datafolha poll shows Lula at 38–42%. Will he hold above 40% in this week's release?",
        "category": "politics",
        "scenarios": [("Yes", 55), ("No", 45)],
    },
    {
        "slug_key": "br-congress-pec-pass",
        "title": "Will the Brazilian Congress pass a new fiscal PEC this month?",
        "description": "The government is pushing for a constitutional amendment on spending. Will it be voted on and pass before month end?",
        "category": "politics",
        "scenarios": [("Yes — passes", 38), ("No — delayed", 62)],
    },
    {
        "slug_key": "br-stf-ruling",
        "title": "Will the STF issue a major ruling on social media regulation this week?",
        "description": "Brazil's Supreme Court (STF) has been deliberating on platform liability. Will a decisive vote happen this week?",
        "category": "politics",
        "scenarios": [("Yes", 42), ("No", 58)],
    },
    {
        "slug_key": "br-election-2026-lula",
        "title": "Will Lula announce his 2026 re-election bid before June?",
        "description": "Political analysts expect a formal announcement in the first half of 2026. Will it come before June 1st?",
        "category": "politics",
        "scenarios": [("Yes — before June", 61), ("No — after June", 39)],
    },
    {
        "slug_key": "br-bolsonaro-ineligible",
        "title": "Will Bolsonaro remain ineligible for the 2026 election?",
        "description": "Bolsonaro was declared ineligible until 2030. Will this ruling stand through 2026?",
        "category": "politics",
        "scenarios": [("Yes — stays ineligible", 72), ("No — overturned", 28)],
    },

    # ── Brazilian Economy ───────────────────────────────────────────────────
    {
        "slug_key": "br-selic-cut-next",
        "title": "Will Brazil's BACEN cut the Selic rate at the next COPOM meeting?",
        "description": "The COPOM meets soon. With inflation above target, will they cut, hold, or hike?",
        "category": "economy",
        "scenarios": [("Cut — below current", 25), ("Hold", 55), ("Hike", 20)],
    },
    {
        "slug_key": "br-dollar-real-6",
        "title": "Will USD/BRL close above R$6.00 this week?",
        "description": "The Real has been under pressure. Will the dollar close above 6 reais at any point this week?",
        "category": "economy",
        "scenarios": [("Yes — above R$6.00", 48), ("No — stays below", 52)],
    },
    {
        "slug_key": "br-ibovespa-130k",
        "title": "Will the Ibovespa close above 130,000 points by end of month?",
        "description": "Brazil's main index is near 125k. Will it reach 130k before month end?",
        "category": "economy",
        "scenarios": [("Yes", 34), ("No", 66)],
    },
    {
        "slug_key": "br-inflation-ipca",
        "title": "Will Brazil's IPCA inflation stay below 5% this year?",
        "description": "Annual inflation is currently tracking near 4.8%. Will it finish 2026 under 5%?",
        "category": "economy",
        "scenarios": [("Yes — under 5%", 44), ("No — above 5%", 56)],
    },
    {
        "slug_key": "br-pib-growth",
        "title": "Will Brazil's GDP grow more than 2% in 2026?",
        "description": "IMF projects 1.9% growth. Will Brazil beat 2% GDP expansion this year?",
        "category": "economy",
        "scenarios": [("Yes — above 2%", 41), ("No — 2% or less", 59)],
    },

    # ── International Sports ────────────────────────────────────────────────
    {
        "slug_key": "f1-next-race-winner",
        "title": "Will Verstappen win the next Formula 1 Grand Prix?",
        "description": "Max Verstappen leads the championship. Will he take victory at the next race?",
        "category": "sports",
        "scenarios": [("Yes — Verstappen wins", 38), ("No — another driver", 62)],
    },
    {
        "slug_key": "copa-brasil-flamengo",
        "title": "Will Flamengo reach the Copa do Brasil final this year?",
        "description": "Flamengo is one of the favorites. Will they make it to the final stage?",
        "category": "sports",
        "scenarios": [("Yes", 52), ("No", 48)],
    },
    {
        "slug_key": "nba-playoffs-lakers",
        "title": "Will the Lakers make the NBA playoffs this season?",
        "description": "Los Angeles is battling for a play-in spot. Will they secure full playoff berth?",
        "category": "sports",
        "scenarios": [("Yes — playoffs", 58), ("No — miss out", 42)],
    },
    {
        "slug_key": "world-cup-2026-brazil",
        "title": "Will Brazil win the 2026 FIFA World Cup?",
        "description": "Brazil hosts the 2026 Copa America warm-up. What are the odds they lift the trophy in 2026?",
        "category": "sports",
        "scenarios": [("Yes — Brazil wins", 22), ("No — another country", 78)],
    },
    {
        "slug_key": "libertadores-2026",
        "title": "Will a Brazilian club win the 2026 Copa Libertadores?",
        "description": "Brazilian clubs have dominated recently. Will Flamengo, Fluminense, or Atletico MG take the title?",
        "category": "sports",
        "scenarios": [("Yes — Brazilian club", 45), ("No — Argentine/other", 55)],
    },

    # ── Technology & AI ─────────────────────────────────────────────────────
    {
        "slug_key": "openai-gpt5-release",
        "title": "Will OpenAI release GPT-5 before July 2026?",
        "description": "Rumors of GPT-5 have been circulating since late 2025. Will it ship publicly before July?",
        "category": "technology",
        "scenarios": [("Yes — before July", 55), ("No — July or later", 45)],
    },
    {
        "slug_key": "tesla-robotaxi-launch",
        "title": "Will Tesla launch its robotaxi service in a major city by end of 2026?",
        "description": "Elon Musk has promised fully autonomous robotaxis. Will it happen in any major US city this year?",
        "category": "technology",
        "scenarios": [("Yes", 32), ("No", 68)],
    },
    {
        "slug_key": "apple-ai-iphone",
        "title": "Will Apple's AI features overtake Google Assistant in usage by Q3 2026?",
        "description": "Apple Intelligence is expanding rapidly. Will it surpass Google Assistant in active user count?",
        "category": "technology",
        "scenarios": [("Yes", 29), ("No", 71)],
    },
    {
        "slug_key": "brazil-5g-coverage",
        "title": "Will 5G cover 80% of Brazilian cities by end of 2026?",
        "description": "Brazil's 5G rollout is underway. Will Anatel's coverage targets be met this year?",
        "category": "technology",
        "scenarios": [("Yes — 80%+", 47), ("No — below 80%", 53)],
    },

    # ── Global Geopolitics ──────────────────────────────────────────────────
    {
        "slug_key": "ukraine-ceasefire-2026",
        "title": "Will there be a formal ceasefire in Ukraine before July 2026?",
        "description": "Peace talks have been discussed by multiple mediators. Will a formal halt to hostilities be declared?",
        "category": "geopolitics",
        "scenarios": [("Yes — ceasefire by July", 31), ("No — conflict continues", 69)],
    },
    {
        "slug_key": "trump-tariffs-brazil",
        "title": "Will Trump impose new tariffs on Brazilian exports in 2026?",
        "description": "The US has threatened tariffs on steel and agricultural goods. Will Brazil face new trade barriers?",
        "category": "geopolitics",
        "scenarios": [("Yes — new tariffs", 44), ("No — exempt", 56)],
    },
    {
        "slug_key": "fed-rate-cut-june",
        "title": "Will the US Federal Reserve cut rates at the June 2026 meeting?",
        "description": "Markets are pricing in one more cut. Will the Fed deliver before summer?",
        "category": "geopolitics",
        "scenarios": [("Yes — cut in June", 52), ("No — hold or hike", 48)],
    },
    {
        "slug_key": "china-taiwan-2026",
        "title": "Will China conduct military exercises near Taiwan this quarter?",
        "description": "Tensions in the Taiwan Strait remain elevated. Will China announce or conduct military drills?",
        "category": "geopolitics",
        "scenarios": [("Yes", 61), ("No", 39)],
    },
    {
        "slug_key": "brics-expansion-2026",
        "title": "Will BRICS admit a new member nation in 2026?",
        "description": "Several countries have applied for BRICS membership. Will the bloc officially expand this year?",
        "category": "geopolitics",
        "scenarios": [("Yes", 58), ("No", 42)],
    },
]

CATEGORY_ICONS = {
    "politics": "🏛",
    "economy": "📈",
    "sports": "⚽",
    "technology": "💻",
    "geopolitics": "🌍",
    "crypto": "₿",
}


def _make_slug(key: str) -> str:
    hour_tag = datetime.utcnow().strftime("%Y%m%d%H")
    raw = f"{key}-{hour_tag}"
    short_hash = hashlib.md5(raw.encode()).hexdigest()[:6]
    return f"{key[:100]}-{short_hash}"


def _log_snapshot(db: Session, scenario: Scenario, source: str = "5min") -> None:
    db.add(ScenarioProbabilityHistory(
        scenario_id=scenario.id,
        event_id=scenario.event_id,
        probability=scenario.probability,
        source=source,
        recorded_at=datetime.utcnow(),
    ))


def _insert_event(event_data: dict, db: Session) -> bool:
    slug = event_data["slug"]
    if db.query(Event).filter(Event.slug == slug).first():
        return False

    closes_at = datetime.utcnow() + timedelta(hours=event_data.get("closes_hours", 24))

    event = Event(
        slug=slug,
        title=event_data["title"],
        description=event_data.get("description"),
        category=event_data.get("category", "general"),
        source=event_data.get("source", "Orryin"),
        status="open",
        is_featured=event_data.get("is_featured", False),
        closes_at=closes_at,
    )
    db.add(event)
    db.flush()

    for idx, (title, prob) in enumerate(event_data["scenarios"]):
        scenario = Scenario(
            event_id=event.id,
            title=title,
            probability=float(prob),
            sort_order=idx,
            status="active",
        )
        db.add(scenario)
        db.flush()
        _log_snapshot(db, scenario, source="created")

    return True


def _generate_static_events(db: Session) -> int:
    """Insert a random selection of static diverse events."""
    inserted = 0
    # Pick ~6 random events from the pool each hour (avoids flooding)
    selected = random.sample(STATIC_EVENTS, min(6, len(STATIC_EVENTS)))
    for template in selected:
        event_data = {
            "slug": _make_slug(template["slug_key"]),
            "title": template["title"],
            "description": template.get("description"),
            "category": template["category"],
            "source": "Orryin",
            "is_featured": False,
            "closes_hours": random.choice([6, 12, 24, 48]),
            "scenarios": template["scenarios"],
        }
        if _insert_event(event_data, db):
            inserted += 1
    return inserted


def _generate_crypto_events(prices: dict[str, float], db: Session) -> int:
    """Insert crypto price events from live CoinGecko data."""
    inserted = 0
    closes_at = datetime.utcnow() + timedelta(hours=1)

    for coin_id, symbol in COINS.items():
        price = prices.get(coin_id)
        if price is None:
            continue

        hour_tag = datetime.utcnow().strftime("%Y%m%d%H")

        # Event 1: above current price
        slug1 = _make_slug(f"{symbol}-above-{int(price)}-1h")
        e1 = {
            "slug": slug1,
            "title": f"Will {symbol} be above ${price:,.0f} in 1 hour?",
            "description": f"{symbol} is trading at ${price:,.2f}. Will it close above this in the next hour?",
            "category": "crypto",
            "source": "CoinGecko",
            "is_featured": symbol == "BTC",
            "closes_hours": 1,
            "scenarios": [("Yes", 52), ("No", 48)],
        }
        if _insert_event(e1, db):
            inserted += 1

        # Event 2: price range
        lower = round(price * 0.98, 0)
        upper = round(price * 1.02, 0)
        slug2 = _make_slug(f"{symbol}-range-{int(lower)}-{int(upper)}-1h")
        e2 = {
            "slug": slug2,
            "title": f"Will {symbol} stay between ${lower:,.0f}–${upper:,.0f} in 1 hour?",
            "description": f"{symbol} is at ${price:,.2f}. Will it remain within ±2% over the next hour?",
            "category": "crypto",
            "source": "CoinGecko",
            "is_featured": False,
            "closes_hours": 1,
            "scenarios": [("Yes", 65), ("No", 35)],
        }
        if _insert_event(e2, db):
            inserted += 1

    return inserted


def _snapshot_open_events(db: Session) -> int:
    """Nudge probabilities slightly and log a 5-min snapshot for all open events."""
    open_events = db.query(Event).filter(Event.status == "open").all()
    snapped = 0

    for event in open_events:
        scenarios = db.query(Scenario).filter(
            Scenario.event_id == event.id,
            Scenario.status == "active",
        ).all()
        if not scenarios:
            continue

        # Small random walk — ±0.6% per 5 min
        for scenario in scenarios:
            nudge = random.gauss(0, 0.6)
            new_prob = max(5.0, min(95.0, scenario.probability + nudge))
            scenario.probability = round(new_prob, 2)
            _log_snapshot(db, scenario, source="5min")
            snapped += 1

    db.commit()
    return snapped


async def fetch_prices() -> dict[str, float]:
    params = {"ids": ",".join(COINS.keys()), "vs_currencies": CURRENCY}
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(COINGECKO_URL, params=params)
        response.raise_for_status()
        data = response.json()
    return {
        coin_id: float(data[coin_id][CURRENCY])
        for coin_id in COINS
        if coin_id in data and CURRENCY in data[coin_id]
    }


async def run_snapshot() -> None:
    logger.info("[Snapshot] Running 5-min probability snapshot...")
    db: Session = SessionLocal()
    try:
        snapped = _snapshot_open_events(db)
        logger.info(f"[Snapshot] Logged {snapped} snapshots.")
    except Exception as e:
        logger.error(f"[Snapshot] Error: {e}")
        db.rollback()
    finally:
        db.close()


async def run_event_generator() -> None:
    logger.info("[EventGenerator] Creating new events...")
    db: Session = SessionLocal()
    try:
        # Diverse static events
        static_count = _generate_static_events(db)
        db.commit()
        logger.info(f"[EventGenerator] Inserted {static_count} static events.")

        # Crypto events from live prices
        try:
            prices = await fetch_prices()
            crypto_count = _generate_crypto_events(prices, db)
            db.commit()
            logger.info(f"[EventGenerator] Inserted {crypto_count} crypto events.")
        except Exception as e:
            logger.warning(f"[EventGenerator] Crypto fetch failed: {e}")

    except Exception as e:
        logger.error(f"[EventGenerator] Error: {e}")
        db.rollback()
    finally:
        db.close()


async def start_scheduler() -> None:
    """Snapshot every 5 min, create new events every 60 min."""
    snapshot_count = 0
    while True:
        await run_snapshot()
        snapshot_count += 1
        if snapshot_count % 12 == 1:  # every 12 * 5min = 60min
            await run_event_generator()
        logger.info("[Scheduler] Next snapshot in 5 minutes.")
        await asyncio.sleep(SNAPSHOT_INTERVAL_SECONDS)