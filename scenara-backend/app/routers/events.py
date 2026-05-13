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
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.user import User
from app.models.probability_history import ScenarioProbabilityHistory
from app.services.resolution import settle_event
from app.routers.auth import get_admin_user, get_current_user

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
    """Full event schema — used for the single-event detail endpoint."""
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
    image_url:          str | None  = None
    external_source:    str | None  = None
    external_url:       str | None  = None
    external_volume:    float | None = None
    external_liquidity: float | None = None


class EventListOut(BaseModel):
    """Slim list schema — omits long description text to cut data transfer ~40 %.
    The markets feed only needs title + category + scenarios + metadata;
    the full description is only loaded when a user opens the detail view."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    slug: str
    title: str
    title_pt: str | None
    title_zh: str | None
    category: str
    source: str | None
    status: str
    is_featured: bool
    closes_at: datetime | None
    resolved_at: datetime | None
    scenarios: list[ScenarioOut]
    image_url:          str | None  = None
    external_source:    str | None  = None
    external_url:       str | None  = None
    external_volume:    float | None = None
    external_liquidity: float | None = None


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

def _fill_zh_translations(events: list) -> None:
    """
    Check if any events are missing ZH translations and, if so, fire a
    background daemon thread to translate them.

    Returns IMMEDIATELY — the HTTP response is never blocked by the
    Google Translate API call. The first request for an event in Chinese
    will see untranslated text; all subsequent requests will see the
    cached translation after the thread completes (typically < 2 seconds).

    Why a thread instead of asyncio: the route handlers are sync `def`
    functions, so there is no running event loop to attach a coroutine to.
    A daemon thread gets its own SQLAlchemy session from the connection pool
    — sessions are not thread-safe and must not be shared.
    """
    import logging, threading
    _log = logging.getLogger(__name__)

    # Collect IDs of events that actually need work so the thread only re-queries
    # the rows that matter, not the entire result set.
    needs = [
        e.id for e in events
        if (not e.title_zh and e.title)
        or (not e.description_zh and e.description)
        or any(not s.title_zh and s.title for s in e.scenarios)
    ]
    if not needs:
        return

    def _bg_translate(event_ids: list[int]) -> None:
        """Background thread body — creates its own DB session and commit."""
        from app.db import SessionLocal
        from app.services.translate import translate_batch

        bg_db = SessionLocal()
        try:
            bg_events = (
                bg_db.query(Event)
                .options(joinedload(Event.scenarios))
                .filter(Event.id.in_(event_ids))
                .all()
            )

            texts: list[str] = []
            targets: list[tuple] = []
            for ev in bg_events:
                if not ev.title_zh and ev.title:
                    texts.append(ev.title)
                    targets.append((ev, "title_zh"))
                if not ev.description_zh and ev.description:
                    texts.append(ev.description)
                    targets.append((ev, "description_zh"))
                for sc in ev.scenarios:
                    if not sc.title_zh and sc.title:
                        texts.append(sc.title)
                        targets.append((sc, "title_zh"))

            if not texts:
                return

            translated = translate_batch(texts)
            changed = 0
            for (obj, field), value in zip(targets, translated):
                if value:
                    original = getattr(obj, field.replace("_zh", ""))
                    if value.strip() != (original or "").strip():
                        setattr(obj, field, value)
                        changed += 1
            if changed:
                bg_db.commit()
                _log.info("[ZH/bg] Translated %d field(s) for event IDs %s", changed, event_ids)
        except Exception as e:
            _log.error("[ZH/bg] Background translation failed: %s", e)
            bg_db.rollback()
        finally:
            bg_db.close()

    threading.Thread(target=_bg_translate, args=(needs,), daemon=True).start()
    _log.debug("[ZH fill] %d event(s) queued for background translation", len(needs))


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
def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    if not payload.scenarios:
        raise HTTPException(status_code=400, detail="At least one scenario is required")

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

    _fill_zh_translations(events)
    return events


# In-process response cache for /events/.  The event LIST is stable for
# several minutes (probabilities drift but new events are rare), so a 120 s
# TTL removes almost all repeat DB hits on free-tier Render+Neon while still
# surfacing newly created events within 2 minutes.
_EVENTS_CACHE: dict[tuple, tuple[float, list]] = {}
_EVENTS_CACHE_TTL_SECONDS = 120


@router.get("/trending", response_model=list[EventListOut])
def trending_events(
    limit: int = Query(default=20, ge=1, le=50),
    lang: str = Query(default="en"),
    db: Session = Depends(get_db),
):
    """Top open markets sorted by Polymarket trading volume.

    Returns the highest-volume open Polymarket-sourced markets — these are
    the markets the world is actually betting on right now.  Falls back to
    `is_featured` order when no Polymarket events exist yet (fresh DB).

    Cached for 60 s server-side so a tab-switch refresh on the markets
    screen never re-queries the DB within that window.
    """
    import time
    cache_key = ("trending", limit, lang)
    cached = _EVENTS_CACHE.get(cache_key)
    if cached and (time.time() - cached[0]) < _EVENTS_CACHE_TTL_SECONDS:
        return cached[1]

    # Polymarket-only.  Sorted by reported trading volume so the markets the
    # world is actually betting on appear first.  Legacy template-generated
    # events are excluded entirely (use /events/?include_legacy=true to see
    # them for admin / debug purposes).
    events = (
        db.query(Event)
        .options(joinedload(Event.scenarios))
        .filter(Event.status == "open", Event.external_source == "polymarket")
        .order_by(Event.external_volume.desc().nullslast(), Event.id.desc())
        .limit(limit)
        .all()
    )

    if lang == "zh":
        _fill_zh_translations(events)
    _EVENTS_CACHE[cache_key] = (time.time(), events)
    return events


@router.get("/", response_model=list[EventListOut])
def list_events(
    db: Session = Depends(get_db),
    status: Optional[str] = Query(default=None),
    featured_only: bool = Query(default=False),
    category: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    lang: str = Query(default="en"),
    include_legacy: bool = Query(
        default=False,
        description="Set true to include non-Polymarket events. Default false hides legacy template-generated events still in the DB awaiting cleanup.",
    ),
):
    import time
    from collections import defaultdict

    cache_key = (status, featured_only, category, limit, offset, lang, include_legacy)
    cached = _EVENTS_CACHE.get(cache_key)
    if cached and (time.time() - cached[0]) < _EVENTS_CACHE_TTL_SECONDS:
        return cached[1]

    base_q = db.query(Event).options(joinedload(Event.scenarios))
    if status:
        base_q = base_q.filter(Event.status == status)
    if featured_only:
        base_q = base_q.filter(Event.is_featured.is_(True))
    if category and category != "all":
        base_q = base_q.filter(Event.category == category)
    # Polymarket-only by default — see brief: Polymarket is the sole market
    # source.  `include_legacy=true` is an escape hatch for admin tooling.
    if not include_legacy:
        base_q = base_q.filter(Event.external_source == "polymarket")

    # ── Fast single-query path ────────────────────────────────────────────────
    # Previously "all" categories used a two-round-trip approach:
    #   1) window-function query to get ordered IDs
    #   2) second query to fetch full Event objects
    # On cold Neon/Render connections this doubled latency and often caused
    # the "failed to load markets" error.  Now we use one ORDER BY id DESC
    # query (hits the ix_events_status_category index) and do a lightweight
    # Python-side round-robin interleave — no extra DB round-trip, no window
    # function overhead.
    events: list[Event] = (
        base_q
        .order_by(Event.is_featured.desc(), Event.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Round-robin category interleave (first page only — pagination pages are
    # already deterministic by id DESC so interleaving would break continuity).
    if offset == 0 and (not category or category == "all"):
        by_cat: dict[str, list] = defaultdict(list)
        for e in events:
            by_cat[e.category].append(e)
        # Featured events first, then round-robin by category
        featured = [e for e in events if e.is_featured]
        rest_by_cat: dict[str, list] = defaultdict(list)
        for e in events:
            if not e.is_featured:
                rest_by_cat[e.category].append(e)
        cats = sorted(rest_by_cat.keys())
        interleaved: list[Event] = list(featured)
        iters = [iter(rest_by_cat[c]) for c in cats]
        while iters:
            next_iters = []
            for it in iters:
                try:
                    interleaved.append(next(it))
                except StopIteration:
                    continue
                else:
                    next_iters.append(it)
            if not next_iters:
                break
            iters = next_iters
        events = interleaved[:limit]

    # Only trigger background ZH translation when the user is actually viewing
    # in Chinese — for en/pt requests the background thread would fire extra
    # read+write DB queries on every uncached response for no user benefit,
    # burning Neon free-tier data transfer quota unnecessarily.
    if lang == "zh":
        _fill_zh_translations(events)
    _EVENTS_CACHE[cache_key] = (time.time(), events)
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
    _fill_zh_translations([event])
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

    # Fetch all history for the event in ONE query, then partition in Python.
    # Cap at 200 points per scenario via reservoir downsampling to keep
    # response size bounded on long-running markets.
    MAX_POINTS = 200
    all_history = (
        db.query(ScenarioProbabilityHistory)
        .filter(ScenarioProbabilityHistory.event_id == event_id)
        .order_by(
            ScenarioProbabilityHistory.scenario_id,
            ScenarioProbabilityHistory.recorded_at.asc(),
        )
        .all()
    )
    # Group by scenario_id
    from collections import defaultdict as _dd
    history_by_scenario: dict = _dd(list)
    for h in all_history:
        history_by_scenario[h.scenario_id].append(h)

    def _downsample(rows, n):
        """Keep n evenly-spaced rows from a sorted list."""
        if len(rows) <= n:
            return rows
        step = len(rows) / n
        return [rows[int(i * step)] for i in range(n)]

    scenario_title_map = {s.id: s.title for s in event.scenarios}

    for scenario in event.scenarios:
        raw = history_by_scenario.get(scenario.id, [])
        history = _downsample(raw, MAX_POINTS)

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


# ── Batch history cache ──────────────────────────────────────────────────────
# Same 5-min TTL as the natural snapshot cadence — within that window, history
# data hasn't actually changed.  Keyed by sorted-tuple of event IDs so the
# cache hits for the typical "fetch top 20 events on page load" pattern.
_BATCH_HISTORY_CACHE: dict[tuple, tuple[float, list]] = {}
_BATCH_HISTORY_CACHE_TTL_SECONDS = 60   # 1 minute — short enough to feel live


class BatchHistoryOut(BaseModel):
    """Response for /events/history/batch — one entry per requested event."""
    histories: list[EventHistoryOut]


@router.get("/history/batch", response_model=BatchHistoryOut)
def get_batch_probability_history(
    ids: str = Query(..., description="Comma-separated event IDs, e.g. ?ids=1,2,3"),
    db: Session = Depends(get_db),
):
    """Bulk-fetch probability history for many events in one round-trip.

    Massive speedup vs N parallel /events/{id}/history calls on free-tier
    hosting where each request needs its own DB connection from a small pool.
    Caches the assembled response for 60 s — within that window, real
    snapshots haven't moved (5-min cadence) so re-using is safe.
    """
    import time
    from collections import defaultdict as _dd

    # Parse + deduplicate IDs; cap at 50 to bound memory/query size.
    try:
        event_ids = sorted({int(x) for x in ids.split(",") if x.strip()})[:50]
    except ValueError:
        raise HTTPException(status_code=400, detail="ids must be comma-separated integers")
    if not event_ids:
        return BatchHistoryOut(histories=[])

    cache_key = tuple(event_ids)
    cached = _BATCH_HISTORY_CACHE.get(cache_key)
    if cached and (time.time() - cached[0]) < _BATCH_HISTORY_CACHE_TTL_SECONDS:
        return BatchHistoryOut(histories=cached[1])

    # ── ONE query for all events (with scenarios joined) ─────────────────────
    events = (
        db.query(Event)
        .options(joinedload(Event.scenarios))
        .filter(Event.id.in_(event_ids))
        .all()
    )
    events_by_id = {e.id: e for e in events}

    # ── ONE query for all history rows across all events ─────────────────────
    all_history = (
        db.query(ScenarioProbabilityHistory)
        .filter(ScenarioProbabilityHistory.event_id.in_(event_ids))
        .order_by(
            ScenarioProbabilityHistory.event_id,
            ScenarioProbabilityHistory.scenario_id,
            ScenarioProbabilityHistory.recorded_at.asc(),
        )
        .all()
    )
    history_by_scenario: dict = _dd(list)
    for h in all_history:
        history_by_scenario[h.scenario_id].append(h)

    MAX_POINTS = 100  # smaller than the single-endpoint cap (200) since we batch
    def _downsample(rows, n):
        if len(rows) <= n:
            return rows
        step = len(rows) / n
        return [rows[int(i * step)] for i in range(n)]

    histories: list[EventHistoryOut] = []
    for eid in event_ids:
        event = events_by_id.get(eid)
        if not event:
            continue
        scenario_results: list[ScenarioHistoryOut] = []
        for scenario in event.scenarios:
            raw = history_by_scenario.get(scenario.id, [])
            history = _downsample(raw, MAX_POINTS)
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
            # Same synthetic-fallback logic as the single-event endpoint —
            # ensures every chart has at least 12 points so it always renders.
            if len(points) < 2:
                rng = random.Random(eid * 7919 + scenario.id * 31)
                now = datetime.utcnow()
                current_prob = scenario.probability
                start_offset = rng.uniform(-8, 8)
                start_prob = max(2.0, min(98.0, current_prob + start_offset))
                synth: list[ProbabilityPoint] = []
                for i in range(12):
                    frac = i / 11
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
                points = synth + points
            scenario_results.append(ScenarioHistoryOut(
                scenario_id=scenario.id,
                scenario_title=scenario.title,
                points=points,
            ))
        histories.append(EventHistoryOut(event_id=eid, scenarios=scenario_results))

    _BATCH_HISTORY_CACHE[cache_key] = (time.time(), histories)
    return BatchHistoryOut(histories=histories)


@router.patch("/scenarios/{scenario_id}/probability", response_model=ScenarioOut)
def update_scenario_probability(
    scenario_id: int,
    payload: ScenarioUpdateProbability,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
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
    _admin: User = Depends(get_admin_user),
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

    result = settle_event(db, event, payload.winning_scenario_id, payload.resolution_note or "")
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Settlement failed"))

    total_winners = result["total_winners"]
    total_losers = result["total_losers"]
    total_payout = result["total_payout"]

    # Push notifications are fired inside settle_event via notify_prediction_settled
    # (background threads, one per prediction). No duplicate work needed here.

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
async def top_up_events(
    _current_user: User = Depends(get_current_user),
):
    """
    On-demand market refresh — requires authentication.  Was previously a
    template-based event generator; now triggers a Polymarket sync pass so
    users who scroll past all current markets can pull in fresh ones from
    the live source.
    """
    from app.services.polymarket_sync import sync_markets_once
    report = await sync_markets_once()
    return {"ok": True, "report": report}