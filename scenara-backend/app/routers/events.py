from __future__ import annotations

import math
import random
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models.event import Event
from app.models.scenario import Scenario
from app.models.prediction import Prediction
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.user import User
from app.models.probability_history import ScenarioProbabilityHistory
from app.services.resolution import settle_event

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ScenarioCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    probability: float = Field(..., ge=0, le=100)
    sort_order: int = 0


class EventCreate(BaseModel):
    slug: str = Field(..., min_length=3, max_length=150)
    title: str = Field(..., min_length=3, max_length=255)
    description: str | None = None
    category: str = Field(default="macro", min_length=2, max_length=50)
    source: str | None = None
    is_featured: bool = False
    closes_at: datetime | None = None
    scenarios: list[ScenarioCreate]


class ScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    title_pt: str | None = None
    title_zh: str | None = None
    description: str | None
    probability: float
    sort_order: int
    status: str


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    slug: str
    title: str
    title_pt: str | None
    title_zh: str | None
    description: str | None
    description_pt: str | None
    description_zh: str | None
    category: str
    source: str | None
    status: str
    resolution_note: str | None
    is_featured: bool
    closes_at: datetime | None
    resolved_at: datetime | None
    scenarios: list[ScenarioOut]


class ScenarioUpdateProbability(BaseModel):
    probability: float = Field(..., ge=0, le=100)


class EventResolveRequest(BaseModel):
    winning_scenario_id: int
    resolution_note: str | None = None


class EventResolveResponse(BaseModel):
    ok: bool
    event_id: int
    winning_scenario_id: int
    status: str
    predictions_settled: int
    total_winners: int
    total_losers: int
    total_payout: float


class ProbabilityPoint(BaseModel):
    scenario_id: int
    scenario_title: str
    probability: float
    recorded_at: datetime
    source: str


class ScenarioHistoryOut(BaseModel):
    scenario_id: int
    scenario_title: str
    points: list[ProbabilityPoint]


class EventHistoryOut(BaseModel):
    event_id: int
    scenarios: list[ScenarioHistoryOut]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fill_zh_translations(events: list, db: Session) -> None:
    """Batch-translate any events/scenarios missing zh fields and cache results in DB."""
    import logging
    from app.services.translate import translate_batch
    _log = logging.getLogger(__name__)

    texts: list[str] = []
    targets: list[tuple] = []  # (obj, field)

    for event in events:
        if not event.title_zh and event.title:
            texts.append(event.title)
            targets.append((event, "title_zh"))
        if not event.description_zh and event.description:
            texts.append(event.description)
            targets.append((event, "description_zh"))
        for scenario in event.scenarios:
            if not scenario.title_zh and scenario.title:
                texts.append(scenario.title)
                targets.append((scenario, "title_zh"))

    if not texts:
        _log.debug("[ZH fill] %d events — all already have title_zh, skipping API call.", len(events))
        return

    _log.info("[ZH fill] %d events came in, %d strings need translation. Calling API...",
              len(events), len(texts))
    translated = translate_batch(texts)

    changed = 0
    failed = 0
    for (obj, field), value in zip(targets, translated):
        if value:
            # Guard: if Google returned the original English text unchanged (common for
            # un-translatable tokens like "$60 – $75"), don't cache it — we'd never retry.
            original = getattr(obj, field.replace("_zh", ""))
            if value.strip() == (original or "").strip():
                failed += 1
                continue
            setattr(obj, field, value)
            changed += 1
        else:
            failed += 1

    _log.info("[ZH fill] Done — %d translated, %d failed/skipped.", changed, failed)

    if changed:
        try:
            db.commit()
        except Exception as e:
            _log.error("[ZH fill] DB commit failed: %s", e)
            db.rollback()
            raise


def _log_probability(
    db: Session,
    scenario: Scenario,
    source: str = "updated",
) -> None:
    """Insert one probability snapshot row."""
    db.add(ScenarioProbabilityHistory(
        scenario_id=scenario.id,
        event_id=scenario.event_id,
        probability=scenario.probability,
        source=source,
        recorded_at=datetime.utcnow(),
    ))


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/", response_model=EventOut)
def create_event(payload: EventCreate, db: Session = Depends(get_db)):
    existing = db.query(Event).filter(Event.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="Event slug already exists")

    event = Event(
        slug=payload.slug,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        source=payload.source,
        is_featured=payload.is_featured,
        closes_at=payload.closes_at,
        status="open",
    )
    db.add(event)
    db.flush()

    # Normalize input probabilities so they sum to exactly 100%
    raw_total = sum(sp.probability for sp in payload.scenarios) or 100.0
    normalized_probs = [
        max(1.0, min(99.0, round(sp.probability / raw_total * 100.0, 2)))
        for sp in payload.scenarios
    ]
    # Re-check after clamping — redistribute any rounding remainder to first scenario
    norm_total = sum(normalized_probs)
    normalized_probs[0] = round(normalized_probs[0] + (100.0 - norm_total), 2)

    for idx, sp in enumerate(payload.scenarios):
        scenario = Scenario(
            event_id=event.id,
            title=sp.title,
            description=sp.description,
            probability=normalized_probs[idx],
            sort_order=sp.sort_order if sp.sort_order else idx,
            status="active",
        )
        db.add(scenario)
        db.flush()
        # Log initial probability snapshot
        _log_probability(db, scenario, source="created")

    db.commit()

    created = (
        db.query(Event)
        .options(joinedload(Event.scenarios))
        .filter(Event.id == event.id)
        .first()
    )
    return created


@router.get("/search", response_model=list[EventOut])
def search_events(
    q: str = Query(..., min_length=1, max_length=100),
    category: str | None = Query(None),
    lang: str = Query(default="en"),
    include_closed: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    """Search events by keyword across all three language title/description columns.

    On PostgreSQL we use a tsvector full-text index with ts_rank ordering —
    relevance-first, then recency. On SQLite (local dev) we fall back to the
    simple ILIKE path since tsvector isn't available.

    Why the `simple` text-search config:
      We store en/pt/zh text in the same row; an English stemmer would butcher
      Portuguese accents and vice-versa. The `simple` config just tokenizes +
      lowercases, which is the right cross-language compromise.

    Ranking weights:
      title  (A) — strongest signal; what users actually scan for
      description (B) — supporting keywords
    """
    from sqlalchemy import or_, text as sql_text
    from app.db import engine

    dialect = engine.dialect.name
    status_filter = [] if include_closed else [Event.status == "open"]

    if dialect == "postgresql":
        # plainto_tsquery is injection-safe: it treats the input as plain text,
        # stripping tsquery operators. No need to sanitize q.
        fts_expr = (
            "setweight(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(title_pt,'') || ' ' || coalesce(title_zh,'')), 'A') || "
            "setweight(to_tsvector('simple', coalesce(description,'') || ' ' || coalesce(description_pt,'') || ' ' || coalesce(description_zh,'')), 'B')"
        )
        rank_sql = sql_text(f"ts_rank(({fts_expr}), plainto_tsquery('simple', :q)) AS rank")
        match_sql = sql_text(f"({fts_expr}) @@ plainto_tsquery('simple', :q)")
        query = (
            db.query(Event, rank_sql)
            .options(joinedload(Event.scenarios))
            .filter(*status_filter)
            .filter(match_sql)
            .params(q=q)
        )
        if category and category != "all":
            query = query.filter(Event.category == category)
        # Rank first, then recency tiebreaker. ts_rank returns 0 for terms not
        # found which shouldn't happen after the @@ filter, but the order_by
        # is tolerant either way.
        rows = query.order_by(sql_text("rank DESC"), Event.created_at.desc()).limit(30).all()
        events = [row[0] for row in rows]
    else:
        # SQLite fallback — no tsvector, so we do the ILIKE union and order
        # by recency. Correctness matches the prior behavior.
        query = db.query(Event).options(joinedload(Event.scenarios)).filter(
            *status_filter,
            or_(
                Event.title.ilike(f"%{q}%"),
                Event.title_pt.ilike(f"%{q}%"),
                Event.title_zh.ilike(f"%{q}%"),
                Event.description.ilike(f"%{q}%"),
                Event.description_zh.ilike(f"%{q}%"),
            ),
        )
        if category and category != "all":
            query = query.filter(Event.category == category)
        events = query.order_by(Event.created_at.desc()).limit(30).all()

    _fill_zh_translations(events, db)
    return events


@router.get("/", response_model=list[EventOut])
def list_events(
    db: Session = Depends(get_db),
    status: Optional[str] = Query(default=None),
    featured_only: bool = Query(default=False),
    category: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    lang: str = Query(default="en"),
):
    from sqlalchemy import func

    base_q = db.query(Event).options(joinedload(Event.scenarios))
    if status:
        base_q = base_q.filter(Event.status == status)
    if featured_only:
        base_q = base_q.filter(Event.is_featured.is_(True))
    if category and category != "all":
        base_q = base_q.filter(Event.category == category)
        events = base_q.order_by(Event.id.desc()).offset(offset).limit(limit).all()
        _fill_zh_translations(events, db)
        return events

    # For "all" categories: interleave via round-robin row-number window function.
    # Step 1: get ordered IDs using window function
    rn_filter = []
    if status:
        rn_filter.append(Event.status == status)
    if featured_only:
        rn_filter.append(Event.is_featured.is_(True))

    rn_rows = (
        db.query(
            Event.id,
            func.row_number().over(
                partition_by=Event.category,
                order_by=Event.id.desc(),
            ).label("rn"),
        )
        .filter(*rn_filter)
        .order_by("rn", Event.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    if not rn_rows:
        return []

    # Step 2: fetch full Event objects for those IDs, preserving order
    id_order = {row.id: i for i, row in enumerate(rn_rows)}
    events = (
        db.query(Event)
        .options(joinedload(Event.scenarios))
        .filter(Event.id.in_(id_order.keys()))
        .all()
    )
    events.sort(key=lambda e: id_order.get(e.id, 999))
    _fill_zh_translations(events, db)
    return events


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, lang: str = Query(default="en"), db: Session = Depends(get_db)):
    event = (
        db.query(Event)
        .options(joinedload(Event.scenarios))
        .filter(Event.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    _fill_zh_translations([event], db)
    return event


@router.get("/{event_id}/history", response_model=EventHistoryOut)
def get_event_probability_history(
    event_id: int,
    db: Session = Depends(get_db),
):
    """
    Returns full probability history for all scenarios of an event.
    Used to render the live chart on each event card.
    """
    event = (
        db.query(Event)
        .options(joinedload(Event.scenarios))
        .filter(Event.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    result: list[ScenarioHistoryOut] = []

    for scenario in event.scenarios:
        history = (
            db.query(ScenarioProbabilityHistory)
            .filter(ScenarioProbabilityHistory.scenario_id == scenario.id)
            .order_by(ScenarioProbabilityHistory.recorded_at.asc())
            .all()
        )

        points = [
            ProbabilityPoint(
                scenario_id=h.scenario_id,
                scenario_title=scenario.title,
                probability=h.probability,
                recorded_at=h.recorded_at,
                source=h.source,
            )
            for h in history
        ]

        # If fewer than 2 real points, generate plausible synthetic history
        if len(points) < 2:
            rng = random.Random(event_id * 7919 + scenario.id * 31)
            now = datetime.utcnow()
            current_prob = scenario.probability
            n_points = 12
            # Walk backwards 24h, start from a slightly different probability
            start_offset = rng.uniform(-8, 8)
            start_prob = max(2.0, min(98.0, current_prob + start_offset))
            synth: list[ProbabilityPoint] = []
            for i in range(n_points):
                frac = i / (n_points - 1)
                base = start_prob + (current_prob - start_prob) * frac
                noise = rng.uniform(-3, 3) * math.sin(frac * math.pi)
                prob = max(1.0, min(99.0, base + noise))
                ts = now - timedelta(hours=24 * (1 - frac))
                synth.append(ProbabilityPoint(
                    scenario_id=scenario.id,
                    scenario_title=scenario.title,
                    probability=round(prob, 1),
                    recorded_at=ts,
                    source="synthetic",
                ))
            # Keep any real points and merge
            points = synth + points

        result.append(ScenarioHistoryOut(
            scenario_id=scenario.id,
            scenario_title=scenario.title,
            points=points,
        ))

    return EventHistoryOut(event_id=event_id, scenarios=result)


@router.patch("/scenarios/{scenario_id}/probability", response_model=ScenarioOut)
def update_scenario_probability(
    scenario_id: int,
    payload: ScenarioUpdateProbability,
    db: Session = Depends(get_db),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    # Clamp the new value
    new_prob = max(1.0, min(99.0, payload.probability))
    scenario.probability = new_prob

    # Renormalize siblings so the whole event still sums to 100%
    siblings = (
        db.query(Scenario)
        .filter(
            Scenario.event_id == scenario.event_id,
            Scenario.id != scenario_id,
            Scenario.status == "active",
        )
        .all()
    )
    if siblings:
        remaining = 100.0 - new_prob
        sib_total = sum(max(0.001, s.probability) for s in siblings)
        for s in siblings:
            s.probability = round((max(0.001, s.probability) / sib_total) * remaining, 2)

    # Log history for all affected scenarios
    _log_probability(db, scenario, source="updated")
    for s in siblings:
        _log_probability(db, s, source="updated")

    db.commit()
    db.refresh(scenario)
    return scenario


@router.post("/{event_id}/resolve", response_model=EventResolveResponse)
def resolve_event(
    event_id: int,
    payload: EventResolveRequest,
    db: Session = Depends(get_db),
):
    event = (
        db.query(Event)
        .options(joinedload(Event.scenarios))
        .filter(Event.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.status == "resolved":
        raise HTTPException(status_code=400, detail="Event already resolved")

    scenario_ids = {s.id for s in event.scenarios}
    if payload.winning_scenario_id not in scenario_ids:
        raise HTTPException(status_code=400, detail="Winning scenario does not belong to this event")

    # Capture open predictions before settlement for push notification user lists
    open_predictions = (
        db.query(Prediction)
        .filter(
            Prediction.scenario_id.in_(scenario_ids),
            Prediction.status == "open",
        )
        .all()
    )

    result = settle_event(db, event, payload.winning_scenario_id, payload.resolution_note or "")
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Settlement failed"))

    total_winners = result["total_winners"]
    total_losers = result["total_losers"]
    total_payout = result["total_payout"]

    # Send push notifications to all affected users
    try:
        import asyncio
        from app.routers.push import send_push_notifications
        winning_scenario = next((s for s in event.scenarios if s.id == payload.winning_scenario_id), None)
        winner_title = winning_scenario.title if winning_scenario else "Unknown"
        winner_user_ids = [p.user_id for p in open_predictions if p.scenario_id == payload.winning_scenario_id]
        loser_user_ids  = [p.user_id for p in open_predictions if p.scenario_id != payload.winning_scenario_id]
        if winner_user_ids:
            asyncio.create_task(send_push_notifications(
                winner_user_ids,
                title="You won! 🎉",
                body=f'"{event.title}" resolved as "{winner_title}". Check your portfolio!',
                data={"event_id": event.id, "type": "won"},
            ))
        if loser_user_ids:
            asyncio.create_task(send_push_notifications(
                loser_user_ids,
                title="Market resolved",
                body=f'"{event.title}" has been resolved. See results in your portfolio.',
                data={"event_id": event.id, "type": "lost"},
            ))
    except Exception:
        pass  # Push notifications are optional

    return EventResolveResponse(
        ok=True,
        event_id=result["event_id"],
        winning_scenario_id=result["winning_scenario_id"],
        status="resolved",
        predictions_settled=total_winners + total_losers,
        total_winners=total_winners,
        total_losers=total_losers,
        total_payout=total_payout,
    )


def _resolve_event(event_id: int, winning_scenario_id: int, db: Session, resolution_note: str = "") -> EventResolveResponse:
    """Internal helper for programmatic resolution (used by voting, auto-resolver)."""
    from pydantic import BaseModel
    class _Req(BaseModel):
        winning_scenario_id: int
        resolution_note: str | None = None
    return resolve_event(event_id, _Req(winning_scenario_id=winning_scenario_id, resolution_note=resolution_note), db)


@router.post("/top-up")
async def top_up_events():
    """
    On-demand event generation — called by the frontend when the user scrolls
    past all available events. Runs the event generator synchronously and returns
    how many new events were created.
    """
    import asyncio
    from app.services.event_generator import run_event_generator
    await run_event_generator()
    return {"ok": True}