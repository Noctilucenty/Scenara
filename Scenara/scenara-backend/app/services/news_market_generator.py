"""
app/services/news_market_generator.py

Fetches breaking news via GNews and uses Groq LLM to generate
10 prediction markets per article. Runs every 2 hours.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import random
import re
import time
from datetime import datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.event import Event
from app.models.scenario import Scenario
from app.models.probability_history import ScenarioProbabilityHistory

logger = logging.getLogger(__name__)

GNEWS_API_KEY = os.getenv("GNEWS_API_KEY", "")
GROQ_API_KEY  = os.getenv("GROQ_API_KEY", "")
GROQ_URL      = "https://api.groq.com/openai/v1/chat/completions"
GNEWS_BASE    = "https://gnews.io/api/v4"

# How many markets to generate per news article
MARKETS_PER_ARTICLE = 10
# Max articles to process per run (stay under GNews quota)
MAX_ARTICLES_PER_RUN = 3
# Cache generated slugs to avoid duplicates across runs
_generated_slugs: set[str] = set()
# Last run timestamp
_last_run: float = 0
RUN_INTERVAL = 7200  # 2 hours

NEWS_QUERIES = [
    "Brazil politics Lula",
    "world economy inflation",
    "Bitcoin crypto market",
    "war Ukraine Russia Gaza",
    "artificial intelligence OpenAI",
    "World Cup football soccer",
    "Iran oil sanctions",
    "US politics Trump",
    "Brazil economy Selic",
    "technology Apple Google",
]

CATEGORY_MAP = {
    "politics": "politics",
    "economy": "economy",
    "crypto": "crypto",
    "sports": "sports",
    "technology": "technology",
    "geopolitics": "geopolitics",
    "entertainment": "entertainment",
    "science": "science",
    "weather": "weather",
}

PROMPT_TEMPLATE = """You are a prediction market creator for Scenara, a Brazilian prediction market app.

Given this breaking news article:
TITLE: {title}
DESCRIPTION: {description}
SOURCE: {source}

Generate exactly {count} prediction market questions related to this news. Each must be:
- A YES/NO question about the near future (next 7-30 days)
- Specific, measurable, and resolvable
- Related to the news article's topic
- Interesting to bet on

Return ONLY valid JSON, no markdown, no explanation:
{{
  "markets": [
    {{
      "title": "English question here?",
      "title_pt": "Portuguese question here?",
      "description": "Brief English context (1-2 sentences)",
      "description_pt": "Brief Portuguese context (1-2 sentences)",
      "category": "one of: politics|economy|crypto|sports|technology|geopolitics|entertainment|science|weather",
      "yes_probability": <integer 10-90>,
      "closes_hours": <integer 48-168>
    }}
  ]
}}

Make the yes_probability reflect realistic current odds based on the news context.
Vary the probability — not everything should be 50/50.
All questions must be in both English and Portuguese (Brazil).
"""


async def _fetch_news_articles() -> list[dict]:
    """Fetch fresh breaking news articles from GNews."""
    if not GNEWS_API_KEY:
        logger.warning("[NewsMarkets] No GNews API key set")
        return []
    query = random.choice(NEWS_QUERIES)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"{GNEWS_BASE}/search",
                params={
                    "q": query,
                    "lang": "en",
                    "max": MAX_ARTICLES_PER_RUN + 2,
                    "apikey": GNEWS_API_KEY,
                },
            )
            r.raise_for_status()
            articles = r.json().get("articles", [])
            logger.info(f"[NewsMarkets] Fetched {len(articles)} articles for query: {query}")
            return articles[:MAX_ARTICLES_PER_RUN]
    except Exception as e:
        logger.error(f"[NewsMarkets] GNews fetch error: {e}")
        return []


async def _generate_markets_for_article(article: dict) -> list[dict]:
    """Use Groq LLM to generate prediction markets for a news article."""
    if not GROQ_API_KEY:
        logger.warning("[NewsMarkets] No Groq API key set")
        return []

    title = article.get("title", "")
    description = article.get("description", "") or article.get("content", "")
    source = article.get("source", {}).get("name", "Unknown")

    prompt = PROMPT_TEMPLATE.format(
        title=title,
        description=description[:500],
        source=source,
        count=MARKETS_PER_ARTICLE,
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                GROQ_URL,
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "llama3-8b-8192",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.7,
                    "max_tokens": 2000,
                },
            )
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
            # Strip markdown fences if present
            content = re.sub(r"```json\s*|\s*```", "", content).strip()
            data = json.loads(content)
            markets = data.get("markets", [])
            logger.info(f"[NewsMarkets] Groq generated {len(markets)} markets for: {title[:50]}")
            return markets
    except json.JSONDecodeError as e:
        logger.error(f"[NewsMarkets] JSON parse error: {e}")
        return []
    except Exception as e:
        logger.error(f"[NewsMarkets] Groq error: {e}")
        return []


def _make_slug(title: str, article_url: str) -> str:
    """Generate a unique slug from title + article URL hash."""
    h = hashlib.md5(f"{title}{article_url}".encode()).hexdigest()[:8]
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower())[:40].strip("-")
    return f"news-{slug}-{h}"


def _seed_history(db: Session, scenario: Scenario) -> None:
    """Seed initial volatile probability history."""
    now = datetime.utcnow()
    prob = scenario.probability
    for i in range(12):
        ts = now - timedelta(hours=12 - i)
        drift = random.gauss(0, 2.5)
        prob = max(5.0, min(95.0, prob + drift))
        db.add(ScenarioProbabilityHistory(
            scenario_id=scenario.id,
            event_id=scenario.event_id,
            probability=round(prob, 2),
            source="seed",
            recorded_at=ts,
        ))


def _create_market_in_db(db: Session, market: dict, source_url: str) -> bool:
    """Create a single market from Groq-generated data. Returns True if created."""
    title = market.get("title", "").strip()
    title_pt = market.get("title_pt", title).strip()
    if not title or len(title) < 10:
        return False

    slug = _make_slug(title, source_url)
    if slug in _generated_slugs:
        return False

    # Check DB for duplicate slug
    existing = db.query(Event).filter(Event.slug == slug).first()
    if existing:
        _generated_slugs.add(slug)
        return False

    yes_prob = max(10, min(90, int(market.get("yes_probability", 50))))
    no_prob = 100 - yes_prob
    closes_hours = max(48, min(168, int(market.get("closes_hours", 72))))
    category = CATEGORY_MAP.get(market.get("category", "geopolitics"), "geopolitics")

    event = Event(
        slug=slug,
        title=title,
        title_pt=title_pt,
        description=market.get("description", ""),
        description_pt=market.get("description_pt", ""),
        category=category,
        source=source_url,
        is_featured=False,
        closes_at=datetime.utcnow() + timedelta(hours=closes_hours),
        status="open",
    )
    db.add(event)
    db.flush()

    # Yes/No scenarios
    yes_titles = [("Yes", "Sim"), ("Will happen", "Vai acontecer")]
    no_titles = [("No", "Não"), ("Won't happen", "Não vai acontecer")]
    yt, yt_pt = random.choice(yes_titles)
    nt, nt_pt = random.choice(no_titles)

    for order, (t, t_pt, prob) in enumerate([
        (yt, yt_pt, yes_prob),
        (nt, nt_pt, no_prob),
    ]):
        s = Scenario(
            event_id=event.id,
            title=t,
            title_pt=t_pt,
            probability=float(prob),
            sort_order=order,
            status="open",
        )
        db.add(s)
        db.flush()
        _seed_history(db, s)

    _generated_slugs.add(slug)
    return True


async def run_news_market_generator() -> int:
    """
    Main entry point. Fetches news, generates markets via Groq, saves to DB.
    Returns number of markets created.
    """
    global _last_run
    now = time.time()

    # Rate limit: don't run more than once per interval
    if now - _last_run < RUN_INTERVAL:
        remaining = int(RUN_INTERVAL - (now - _last_run))
        logger.info(f"[NewsMarkets] Skipping — next run in {remaining}s")
        return 0

    _last_run = now
    logger.info("[NewsMarkets] Starting news market generation run")

    articles = await _fetch_news_articles()
    if not articles:
        return 0

    total_created = 0

    for article in articles:
        source_url = article.get("url", "")
        markets = await _generate_markets_for_article(article)

        if not markets:
            continue

        db = SessionLocal()
        try:
            created = 0
            for market in markets:
                if _create_market_in_db(db, market, source_url):
                    created += 1
            db.commit()
            total_created += created
            logger.info(f"[NewsMarkets] Created {created} markets from article: {article.get('title', '')[:50]}")
        except Exception as e:
            db.rollback()
            logger.error(f"[NewsMarkets] DB error: {e}")
        finally:
            db.close()

        # Small delay between articles to avoid rate limits
        await asyncio.sleep(2)

    logger.info(f"[NewsMarkets] Run complete. Total markets created: {total_created}")
    return total_created


async def start_news_market_scheduler() -> None:
    """Background task — runs news market generation every 2 hours."""
    logger.info("[NewsMarkets] Scheduler started (every 2 hours)")
    while True:
        try:
            await run_news_market_generator()
        except Exception as e:
            logger.error(f"[NewsMarkets] Scheduler error: {e}")
        await asyncio.sleep(RUN_INTERVAL)