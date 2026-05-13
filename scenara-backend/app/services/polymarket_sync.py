"""
Polymarket ingestion — pulls active prediction markets from the public Gamma
API and mirrors them into Scenara's `events` table as external markets.

Positioning:
  Polymarket = real-world *crowd consensus signal* used as an intelligence
  layer. Scenara remains simulation-only — no real-money trading is ever
  performed. We never call CLOB authenticated endpoints.

Sources used:
  - https://gamma-api.polymarket.com/markets   (no auth)

Strategy:
  - Pull active, binary, decent-volume markets ending within 90 days
  - Insert as new Scenara events tagged with external_source="polymarket"
  - Refresh probabilities on existing external events from the same feed
  - Fail-closed: any network/parse error logs and skips, never raises
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session, joinedload

from app.db import SessionLocal
from app.models.event import Event
from app.models.scenario import Scenario
from app.models.probability_history import ScenarioProbabilityHistory
from app.models.prediction import Prediction
from app.models.account import Account

logger = logging.getLogger(__name__)

GAMMA_BASE = "https://gamma-api.polymarket.com"
SOURCE = "polymarket"

# Quality gates — defensive defaults. Tighten/loosen via env later if needed.
MIN_VOLUME_USD       = 1_000.0      # below this is dust
MIN_LIQUIDITY_USD    = 500.0
MAX_DAYS_TO_CLOSE    = 90           # ignore evergreen multi-year markets
MAX_INGEST_PER_RUN   = 30           # don't dump 200 new markets in one cycle
DEFAULT_FETCH_LIMIT  = 100          # markets to fetch per Gamma request

# Polymarket categories → Scenara categories. Anything unmapped lands in
# "general" and admin can re-bucket later.
_CATEGORY_MAP = {
    "crypto":         "crypto",
    "cryptocurrency": "crypto",
    "politics":       "politics",
    "elections":      "politics",
    "us elections":   "politics",
    "sports":         "sports",
    "soccer":         "sports",
    "basketball":     "sports",
    "tennis":         "sports",
    "nfl":            "sports",
    "nba":            "sports",
    "geopolitics":    "geopolitics",
    "world":          "geopolitics",
    "economy":        "economy",
    "macro":          "economy",
    "tech":           "technology",
    "technology":     "technology",
    "ai":             "technology",
    "pop culture":    "entertainment",
    "entertainment":  "entertainment",
    "music":          "music",
    "tv":             "tv",
    "science":        "science",
    "weather":        "weather",
}

NSFW_KEYWORDS = (
    "porn", "nsfw", "sex tape", "onlyfans",
)


def _slugify(text: str, max_len: int = 140) -> str:
    s = re.sub(r"[^\w\s-]", "", (text or "").lower()).strip()
    s = re.sub(r"[\s_-]+", "-", s)
    return s[:max_len] or "polymarket-market"


def _parse_json_field(raw: Any) -> Optional[list]:
    """Polymarket returns `outcomes` and `outcomePrices` as JSON-encoded strings."""
    if raw is None:
        return None
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            v = json.loads(raw)
            return v if isinstance(v, list) else None
        except Exception:
            return None
    return None


def _normalize_category(raw: str | None) -> str:
    if not raw:
        return "general"
    return _CATEGORY_MAP.get(raw.strip().lower(), "general")


def _looks_nsfw(text: str | None) -> bool:
    if not text:
        return False
    t = text.lower()
    return any(k in t for k in NSFW_KEYWORDS)


def _parse_iso(s: str | None) -> Optional[datetime]:
    if not s:
        return None
    try:
        # Polymarket dates: "2026-12-31T23:59:59Z" — strip Z for fromisoformat
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


# ── HTTP ─────────────────────────────────────────────────────────────────────

async def _fetch_markets(limit: int = DEFAULT_FETCH_LIMIT, offset: int = 0) -> list[dict]:
    """One page of Gamma /markets. Returns [] on any failure."""
    params = {
        "active":  "true",
        "closed":  "false",
        "limit":   str(limit),
        "offset":  str(offset),
        "order":   "volume",
        "ascending": "false",
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(f"{GAMMA_BASE}/markets", params=params)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                return data
            # Some Gamma deployments wrap in { "data": [...] }
            return data.get("data", []) if isinstance(data, dict) else []
    except Exception as e:
        logger.warning("[Polymarket] fetch failed (offset=%s): %s", offset, e)
        return []


# ── Filtering ────────────────────────────────────────────────────────────────

def _is_acceptable(market: dict) -> tuple[bool, str]:
    """Quality gate. Returns (ok, reason_if_not)."""
    if not market.get("active") or market.get("closed"):
        return False, "inactive"
    question = (market.get("question") or "").strip()
    if not question:
        return False, "no question"
    if _looks_nsfw(question) or _looks_nsfw(market.get("description") or ""):
        return False, "nsfw"

    outcomes = _parse_json_field(market.get("outcomes"))
    prices   = _parse_json_field(market.get("outcomePrices"))
    if not outcomes or not prices or len(outcomes) != len(prices):
        return False, "malformed outcomes"
    if len(outcomes) != 2:
        # v1: binary markets only — multi-outcome support is more complex
        return False, "non-binary"

    try:
        volume    = float(market.get("volume") or 0)
        liquidity = float(market.get("liquidity") or 0)
    except (TypeError, ValueError):
        return False, "bad volume/liquidity"
    if volume < MIN_VOLUME_USD:
        return False, f"volume<{MIN_VOLUME_USD}"
    if liquidity < MIN_LIQUIDITY_USD:
        return False, f"liquidity<{MIN_LIQUIDITY_USD}"

    end = _parse_iso(market.get("endDate"))
    if not end:
        return False, "no endDate"
    now = datetime.utcnow()
    if end <= now:
        return False, "already ended"
    if (end - now).days > MAX_DAYS_TO_CLOSE:
        return False, f"closes>{MAX_DAYS_TO_CLOSE}d"

    return True, ""


# ── Persistence ──────────────────────────────────────────────────────────────

def _existing_external_ids(db: Session) -> set[str]:
    rows = (
        db.query(Event.external_id)
        .filter(Event.external_source == SOURCE)
        .all()
    )
    return {r[0] for r in rows if r[0]}


def _insert_market(db: Session, market: dict) -> Optional[Event]:
    """Insert one Polymarket market as a new Scenara event with two scenarios."""
    outcomes = _parse_json_field(market.get("outcomes")) or []
    prices   = _parse_json_field(market.get("outcomePrices")) or []
    if len(outcomes) != 2 or len(prices) != 2:
        return None

    ext_id    = str(market.get("id") or market.get("conditionId") or "").strip()
    question  = (market.get("question") or "").strip()
    if not ext_id or not question:
        return None

    slug_base = market.get("slug") or _slugify(question)
    slug      = f"pm-{slug_base[:120]}-{ext_id[-8:]}"  # ensure uniqueness

    end_dt = _parse_iso(market.get("endDate"))
    image_url = market.get("image") or market.get("icon") or None
    pm_url = (
        market.get("url")
        or (f"https://polymarket.com/event/{market.get('slug')}" if market.get("slug") else None)
    )
    category = _normalize_category(market.get("category"))

    event = Event(
        slug=slug,
        title=question[:255],
        description=(market.get("description") or "")[:5000],
        category=category,
        source="polymarket",
        status="open",
        is_featured=False,
        closes_at=end_dt,
        external_source=SOURCE,
        external_id=ext_id,
        external_url=pm_url,
        external_volume=float(market.get("volume") or 0),
        external_liquidity=float(market.get("liquidity") or 0),
        external_synced_at=datetime.utcnow(),
        image_url=(image_url[:500] if image_url else None),
    )
    db.add(event)
    db.flush()  # need event.id for scenarios

    for i, (label, price) in enumerate(zip(outcomes, prices)):
        try:
            prob_pct = max(0.0, min(100.0, float(price) * 100.0))
        except (TypeError, ValueError):
            prob_pct = 50.0
        sc = Scenario(
            event_id=event.id,
            title=str(label)[:255],
            probability=prob_pct,
            sort_order=i,
            status="open",
        )
        db.add(sc)
        db.flush()
        # Snapshot the initial probability so charts have a starting point.
        db.add(ScenarioProbabilityHistory(
            scenario_id=sc.id,
            event_id=event.id,
            probability=prob_pct,
            source="polymarket-ingest",
            recorded_at=datetime.utcnow(),
        ))

    return event


def _refresh_existing_event(db: Session, event: Event, market: dict) -> bool:
    """
    Update probabilities on an existing Polymarket-mirrored event from a fresh
    Gamma payload. Returns True if probabilities actually changed.
    """
    outcomes = _parse_json_field(market.get("outcomes")) or []
    prices   = _parse_json_field(market.get("outcomePrices")) or []
    if len(outcomes) != 2 or len(prices) != 2:
        return False

    scenarios_sorted = sorted(event.scenarios or [], key=lambda s: s.sort_order)
    if len(scenarios_sorted) != 2:
        return False

    changed = False
    for sc, raw_price in zip(scenarios_sorted, prices):
        try:
            new_pct = max(0.0, min(100.0, float(raw_price) * 100.0))
        except (TypeError, ValueError):
            continue
        if abs((sc.probability or 0) - new_pct) >= 0.5:  # ignore noise
            sc.probability = new_pct
            db.add(ScenarioProbabilityHistory(
                scenario_id=sc.id,
                event_id=event.id,
                probability=new_pct,
                source="polymarket",
                recorded_at=datetime.utcnow(),
            ))
            changed = True

    try:
        event.external_volume    = float(market.get("volume") or 0)
        event.external_liquidity = float(market.get("liquidity") or 0)
    except (TypeError, ValueError):
        pass
    # Backfill image on events ingested before the image_url column existed.
    if not event.image_url:
        img = market.get("image") or market.get("icon") or None
        if img:
            event.image_url = img[:500]
    event.external_synced_at = datetime.utcnow()
    return changed


# ── Event lifecycle: expire past-closes_at markets and refund predictions ────

def _expire_old_events(db: Session) -> int:
    """Close events whose closes_at has passed.  Refunds any still-open
    predictions (they were never resolved — return the user's stake).

    For Polymarket events this is the safety net when neither the AI auto-
    resolver nor a manual admin call has settled the market by close time.
    Previously lived in the deleted event_generator.py — moved here so
    market lifecycle stays alongside the (now sole) market source.
    """
    now = datetime.utcnow()
    expired = db.query(Event).filter(
        Event.status == "open",
        Event.closes_at < now,
    ).all()
    count = 0
    for event in expired:
        # Crypto auto-resolver path is gone, but keep the guard so any legacy
        # CoinGecko-sourced events still in the DB get left alone.
        if event.source == "CoinGecko":
            continue
        event.status = "resolved"
        event.resolution_note = "Market closed · Mercado encerrado"
        try:
            predictions = (
                db.query(Prediction)
                .filter(Prediction.event_id == event.id, Prediction.status == "open")
                .all()
            )
            for p in predictions:
                p.status = "void"
                p.pnl = 0.0
                account = db.query(Account).filter(Account.user_id == p.user_id).first()
                if account:
                    account.balance += p.simulated_amount
        except Exception:
            # Refund best-effort — don't let a bad row stop the rest from closing.
            pass
        count += 1
    if count:
        db.commit()
    return count


# ── Orchestration ────────────────────────────────────────────────────────────

async def sync_markets_once(max_new: int = MAX_INGEST_PER_RUN) -> dict:
    """
    Run one sync pass.
      - Pull markets from Gamma
      - Refresh probabilities on already-imported events
      - Insert up to `max_new` brand-new ones that pass quality filters
    Returns a small report dict.
    """
    raw = await _fetch_markets(limit=DEFAULT_FETCH_LIMIT, offset=0)

    # Always run the lifecycle sweep — even if the Gamma fetch failed, we
    # should still close events past their closes_at and refund open bets.
    expired_count = 0
    db: Session = SessionLocal()
    try:
        expired_count = _expire_old_events(db)
        if expired_count:
            logger.info("[Polymarket] expired %d past-due events", expired_count)
    finally:
        db.close()

    if not raw:
        return {"ok": False, "fetched": 0, "refreshed": 0, "inserted": 0, "skipped": 0, "expired": expired_count}

    db = SessionLocal()
    refreshed = 0
    inserted  = 0
    skipped   = 0
    skip_reasons: dict[str, int] = {}
    try:
        existing = _existing_external_ids(db)

        # Index existing events by external_id for refresh path
        existing_events: dict[str, Event] = {}
        if existing:
            rows = (
                db.query(Event)
                .options(joinedload(Event.scenarios))
                .filter(Event.external_source == SOURCE,
                        Event.external_id.in_(existing),
                        Event.status == "open")
                .all()
            )
            existing_events = {e.external_id: e for e in rows if e.external_id}

        for market in raw:
            ext_id = str(market.get("id") or market.get("conditionId") or "").strip()
            if not ext_id:
                skipped += 1
                skip_reasons["no_id"] = skip_reasons.get("no_id", 0) + 1
                continue

            # Refresh path
            ev = existing_events.get(ext_id)
            if ev is not None:
                try:
                    if _refresh_existing_event(db, ev, market):
                        refreshed += 1
                except Exception as e:
                    logger.exception("[Polymarket] refresh failed for %s: %s", ext_id, e)
                    db.rollback()
                continue

            # New-insert path — quality gate first
            ok, reason = _is_acceptable(market)
            if not ok:
                skipped += 1
                skip_reasons[reason] = skip_reasons.get(reason, 0) + 1
                continue
            if inserted >= max_new:
                skipped += 1
                skip_reasons["batch_cap"] = skip_reasons.get("batch_cap", 0) + 1
                continue

            try:
                ev = _insert_market(db, market)
                if ev is not None:
                    inserted += 1
            except Exception as e:
                logger.exception("[Polymarket] insert failed for %s: %s", ext_id, e)
                db.rollback()
                skipped += 1
                skip_reasons["exception"] = skip_reasons.get("exception", 0) + 1

        db.commit()
    finally:
        db.close()

    logger.info(
        "[Polymarket] sync done — refreshed=%d inserted=%d skipped=%d reasons=%s",
        refreshed, inserted, skipped, skip_reasons,
    )
    return {
        "ok": True,
        "fetched": len(raw),
        "refreshed": refreshed,
        "inserted": inserted,
        "skipped": skipped,
        "expired": expired_count,
        "skip_reasons": skip_reasons,
    }


async def start_polymarket_sync_loop(interval_seconds: int = 20 * 60) -> None:
    """Background task: run sync_markets_once on an interval.

    Polymarket is now Scenara's sole market source, so the default cadence
    is 20 minutes — frequent enough that probabilities feel live, infrequent
    enough that the public Gamma API stays happy under sustained load."""
    logger.info("[Polymarket] sync loop started — interval=%ds", interval_seconds)
    # Small startup delay so we don't compete with migration / other startup work
    await asyncio.sleep(60)
    while True:
        try:
            await sync_markets_once()
        except Exception as e:
            logger.exception("[Polymarket] sync loop tick failed: %s", e)
        await asyncio.sleep(interval_seconds)
