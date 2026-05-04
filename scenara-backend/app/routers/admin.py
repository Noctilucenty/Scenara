"""
app/routers/admin.py

Admin endpoints for manually resolving non-crypto events.
All routes require an authenticated admin user (is_admin=True).
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import case
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models.event import Event
from app.models.user import User
from app.routers.auth import get_current_user, get_admin_user
from app.services.resolution import settle_event, void_event

router = APIRouter()


# ── SMTP test (any authenticated user) ───────────────────────────────────────

@router.post("/test-smtp")
def test_smtp(current_user: User = Depends(get_current_user)):
    """
    Send a test email to the current user's address to verify SMTP is working.
    Callable by any authenticated user (not admin-only) to help debug delivery.
    """
    from app.services.email import send_email
    from app.config import settings
    ok = send_email(
        to=current_user.email,
        subject="Scenara SMTP test ✓",
        body_text=(
            f"Hi {current_user.display_name}!\n\n"
            "If you received this, your SMTP configuration is working correctly.\n\n"
            "— Scenara"
        ),
        body_html=f"""
<html><body style="font-family:sans-serif;background:#08090C;color:#F1F5F9;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#0D1117;border-radius:16px;padding:32px;border:1px solid rgba(124,92,252,0.2)">
    <h2 style="color:#7C5CFC;margin-top:0">scenara</h2>
    <p>Hi <strong>{current_user.display_name}</strong>!</p>
    <p style="color:#94A3B8">If you received this, your SMTP configuration is working correctly. ✅</p>
  </div>
</body></html>
""",
    )
    return {
        "ok": ok,
        "smtp_configured": bool(settings.smtp_host),
        "smtp_host": settings.smtp_host or "(not set — using console log)",
        "to": current_user.email,
        "message": "Email sent!" if ok else "Failed — check Render logs for SMTP error details.",
    }


# ── Schemas ───────────────────────────────────────────────────────────────────

class ScenarioSimple(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    title_pt: Optional[str]
    probability: float
    sort_order: int


class PendingEvent(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    title_pt: Optional[str]
    category: str
    closes_at: Optional[datetime]
    status: str
    is_featured: bool
    scenarios: list[ScenarioSimple]


class ResolveRequest(BaseModel):
    winning_scenario_id: int
    resolution_note: Optional[str] = None


class VoidRequest(BaseModel):
    note: Optional[str] = "Voided by admin"


class AISuggestion(BaseModel):
    event_id: int
    event_title: str
    category: str
    closes_at: Optional[str]
    scenarios: list[dict]           # [{id, title, sort_order}]
    winner_scenario_id: Optional[int]
    confidence: int
    note: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/pending-events", response_model=list[PendingEvent])
def list_pending_events(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """
    Return all open events that are past their closes_at (or have no closes_at
    but are still marked open) — excluding crypto since those auto-resolve.
    """
    events = (
        db.query(Event)
        .options(joinedload(Event.scenarios))
        .filter(
            Event.status == "open",
            Event.category != "crypto",
        )
        .order_by(
            # NULLs last — compatible with SQLite and PostgreSQL
            case((Event.closes_at.is_(None), 1), else_=0).asc(),
            Event.closes_at.asc(),
        )
        .all()
    )
    return events


@router.post("/ai-suggest", response_model=list[AISuggestion])
async def ai_suggest_resolutions(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """
    Run Gemini AI on all expired non-crypto events and return suggestions.
    Does NOT resolve anything — admin reviews and confirms each one manually.
    """
    from app.services.ai_resolver import ai_resolve_event
    import asyncio

    now = datetime.utcnow()
    expired = (
        db.query(Event)
        .options(joinedload(Event.scenarios))
        .filter(
            Event.status == "open",
            Event.category != "crypto",
            Event.closes_at != None,
            Event.closes_at <= now,
        )
        .order_by(Event.closes_at.asc())
        .all()
    )

    suggestions: list[AISuggestion] = []

    for event in expired:
        scenarios_sorted = sorted(event.scenarios, key=lambda s: s.sort_order)
        scenario_titles = [s.title for s in scenarios_sorted]

        winner_idx, confidence, note = await ai_resolve_event(
            title=event.title or "",
            description=event.description or "",
            scenarios=scenario_titles,
        )

        winner_id = scenarios_sorted[winner_idx].id if winner_idx is not None else None

        suggestions.append(AISuggestion(
            event_id=event.id,
            event_title=event.title,
            category=event.category,
            closes_at=event.closes_at.isoformat() if event.closes_at else None,
            scenarios=[{"id": s.id, "title": s.title, "sort_order": s.sort_order} for s in scenarios_sorted],
            winner_scenario_id=winner_id,
            confidence=confidence,
            note=note,
        ))

        # Small delay between calls to respect Gemini rate limits
        await asyncio.sleep(2)

    return suggestions


@router.post("/events/{event_id}/resolve")
def resolve_event(
    event_id: int,
    body: ResolveRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    event = (
        db.query(Event)
        .options(joinedload(Event.scenarios))
        .filter(Event.id == event_id, Event.status == "open")
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Open event not found")

    note = body.resolution_note or f"Manually resolved by admin at {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC"
    result = settle_event(db, event, body.winning_scenario_id, note)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Resolution failed"))
    return result


@router.post("/events/{event_id}/void")
def void_event_endpoint(
    event_id: int,
    body: VoidRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    event = (
        db.query(Event)
        .options(joinedload(Event.scenarios))
        .filter(Event.id == event_id, Event.status == "open")
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Open event not found")

    result = void_event(db, event, note=body.note or "Voided by admin")
    return result


@router.get("/me")
def admin_me(_admin: User = Depends(get_admin_user)):
    """Check if current user is admin — used by the frontend to show/hide admin UI."""
    return {"is_admin": True, "user_id": _admin.id, "email": _admin.email}


@router.post("/retranslate-zh")
def retranslate_zh(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """Force re-translation of all events/scenarios: clear title_zh/description_zh,
    then run the backfill loop. Use this when translations are stuck or wrong."""
    from app.models.scenario import Scenario
    from app.routers.events import _fill_zh_translations

    n_events = db.query(Event).update(
        {Event.title_zh: None, Event.description_zh: None},
        synchronize_session=False,
    )
    n_scenarios = db.query(Scenario).update(
        {Scenario.title_zh: None},
        synchronize_session=False,
    )
    db.commit()

    # Count how many events need translation, then fire a single background
    # pass instead of a while-loop. _fill_zh_translations returns immediately
    # (spawns a daemon thread) so a loop would re-read the same un-translated
    # rows forever — the thread hasn't committed yet. Instead we page through
    # the IDs synchronously and queue one thread per batch.
    total = 0
    batch_size = 50
    offset = 0
    while True:
        events = (
            db.query(Event)
            .options(joinedload(Event.scenarios))
            .filter(Event.title_zh.is_(None))
            .order_by(Event.id)
            .offset(offset)
            .limit(batch_size)
            .all()
        )
        if not events:
            break
        _fill_zh_translations(events)
        total += len(events)
        offset += batch_size
        # Safety cap: never spawn more than 10 batches (500 events) in a single
        # request — operator can call again for the rest.
        if offset >= batch_size * 10:
            break

    return {
        "ok": True,
        "cleared_events": n_events,
        "cleared_scenarios": n_scenarios,
        "queued_for_translation": total,
        "note": "Translation runs in background threads. Check /admin/zh-status for progress.",
    }


@router.get("/db/explain/{query_name}")
def db_explain(
    query_name: str,
    user_id: int = 1,
    event_id: int = 1,
    scenario_id: int = 1,
    category: str = "world",
    _admin: User = Depends(get_admin_user),
):
    """Run EXPLAIN ANALYZE against one of our hot queries.

    We keep a WHITELIST of query shapes (no user-supplied SQL — EXPLAIN ANALYZE
    runs the query for real, and identifier parameters can't be bound). Use the
    optional query-string args to probe a specific user/event, otherwise
    defaults to id=1 — fine for plan-shape inspection.

    Use this to verify an index is actually hit after deploying new indexes:
      GET /admin/db/explain/portfolio?user_id=42
    If you see 'Index Scan using ix_predictions_user_created' → the new index
    is doing its job. 'Seq Scan' → Postgres thinks seq scan is cheaper (tiny
    table) OR the index wasn't created — check startup logs.
    """
    from app.db import engine
    from app.migrations.indexes import explain_query

    # Curated shapes matching the indexes we just added — one per index.
    queries: dict[str, tuple[str, dict]] = {
        "portfolio": (
            "SELECT id, user_id, scenario_id, created_at FROM predictions "
            "WHERE user_id = :user_id ORDER BY created_at DESC LIMIT 50",
            {"user_id": user_id},
        ),
        "settled_predictions": (
            "SELECT id, user_id, settled_at FROM predictions "
            "WHERE status = 'settled' ORDER BY settled_at DESC LIMIT 100",
            {},
        ),
        "recent_bets": (
            "SELECT id, user_id, created_at FROM predictions "
            "ORDER BY created_at DESC LIMIT 50",
            {},
        ),
        "markets_by_category": (
            "SELECT id, slug, title, closes_at FROM events "
            "WHERE status = 'open' AND category = :category LIMIT 50",
            {"category": category},
        ),
        "closing_soon": (
            "SELECT id, slug, title, closes_at FROM events "
            "WHERE status = 'open' ORDER BY closes_at ASC LIMIT 20",
            {},
        ),
        "featured": (
            "SELECT id, slug, title FROM events "
            "WHERE status = 'open' AND is_featured = true "
            "ORDER BY created_at DESC LIMIT 10",
            {},
        ),
        "event_comments": (
            "SELECT id, user_id, body, created_at FROM comments "
            "WHERE event_id = :event_id ORDER BY created_at DESC LIMIT 50",
            {"event_id": event_id},
        ),
        "scenario_history": (
            "SELECT probability, recorded_at FROM scenario_probability_history "
            "WHERE scenario_id = :scenario_id ORDER BY recorded_at ASC",
            {"scenario_id": scenario_id},
        ),
    }

    if query_name not in queries:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown query '{query_name}'. Available: {sorted(queries.keys())}",
        )

    sql, params = queries[query_name]
    try:
        plan = explain_query(engine, sql, params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"EXPLAIN failed: {e}")

    return {
        "query_name": query_name,
        "sql": sql,
        "params": params,
        "plan": plan,
    }


@router.get("/zh-status")
def zh_status(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """Diagnostic: how many events/scenarios are missing title_zh?"""
    from app.models.scenario import Scenario
    total_events = db.query(Event).count()
    missing_events = db.query(Event).filter(Event.title_zh.is_(None)).count()
    total_scenarios = db.query(Scenario).count()
    missing_scenarios = db.query(Scenario).filter(Scenario.title_zh.is_(None)).count()
    # Return 10 example untranslated event titles so we can see what's stuck
    examples = (
        db.query(Event.id, Event.title)
        .filter(Event.title_zh.is_(None))
        .limit(10)
        .all()
    )
    return {
        "events": {"total": total_events, "missing_zh": missing_events},
        "scenarios": {"total": total_scenarios, "missing_zh": missing_scenarios},
        "example_untranslated": [{"id": i, "title": t} for i, t in examples],
    }


# ── Analytics endpoints ───────────────────────────────────────────────────────

@router.get("/stats/overview")
def admin_stats_overview(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """
    High-level platform snapshot: users, activity, predictions, volume.
    All numbers are computed from existing tables — no new tracking required.
    """
    from sqlalchemy import func, cast, Date
    from datetime import timedelta
    from app.models.prediction import Prediction
    from app.models.transaction import Transaction
    from app.models.comment import Comment

    today = datetime.utcnow().date()
    yesterday = today - timedelta(days=1)
    week_ago = today - timedelta(days=7)

    # ── User stats ────────────────────────────────────────────────────────────
    total_users = db.query(func.count(User.id)).scalar() or 0
    new_today   = db.query(func.count(User.id)).filter(
        cast(User.created_at, Date) == today
    ).scalar() or 0
    new_week    = db.query(func.count(User.id)).filter(
        cast(User.created_at, Date) >= week_ago
    ).scalar() or 0

    # DAU = users who logged in today (last_login_at updated on every login)
    dau_today = db.query(func.count(User.id)).filter(
        cast(User.last_login_at, Date) == today
    ).scalar() or 0
    dau_yesterday = db.query(func.count(User.id)).filter(
        cast(User.last_login_at, Date) == yesterday
    ).scalar() or 0

    # ── Prediction stats ──────────────────────────────────────────────────────
    total_predictions = db.query(func.count(Prediction.id)).scalar() or 0
    predictions_today = db.query(func.count(Prediction.id)).filter(
        cast(Prediction.created_at, Date) == today
    ).scalar() or 0

    total_volume = float(
        db.query(func.sum(Prediction.simulated_amount)).scalar() or 0
    )
    volume_today = float(
        db.query(func.sum(Prediction.simulated_amount)).filter(
            cast(Prediction.created_at, Date) == today
        ).scalar() or 0
    )

    # ── Comment stats ─────────────────────────────────────────────────────────
    total_comments   = db.query(func.count(Comment.id)).scalar() or 0
    comments_today   = db.query(func.count(Comment.id)).filter(
        cast(Comment.created_at, Date) == today
    ).scalar() or 0

    # ── Market stats ──────────────────────────────────────────────────────────
    open_markets     = db.query(func.count(Event.id)).filter(Event.status == "open").scalar() or 0
    resolved_markets = db.query(func.count(Event.id)).filter(Event.status == "resolved").scalar() or 0

    return {
        "users": {
            "total": total_users,
            "new_today": new_today,
            "new_this_week": new_week,
            "dau_today": dau_today,
            "dau_yesterday": dau_yesterday,
        },
        "predictions": {
            "total": total_predictions,
            "today": predictions_today,
            "total_volume": round(total_volume, 2),
            "volume_today": round(volume_today, 2),
        },
        "comments": {
            "total": total_comments,
            "today": comments_today,
        },
        "markets": {
            "open": open_markets,
            "resolved": resolved_markets,
        },
    }


@router.get("/stats/daily")
def admin_stats_daily(
    days: int = 30,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """
    Day-by-day breakdown for the last N days.
    Returns signup counts, DAU (login-based), predictions placed, and comments.
    Capped at 90 days to keep the query fast.
    """
    from sqlalchemy import func, cast, Date, text
    from datetime import timedelta
    from app.models.prediction import Prediction
    from app.models.comment import Comment

    days = min(days, 90)
    cutoff = datetime.utcnow().date() - timedelta(days=days - 1)

    # New signups per day
    signups = db.query(
        cast(User.created_at, Date).label("day"),
        func.count(User.id).label("count"),
    ).filter(
        cast(User.created_at, Date) >= cutoff,
    ).group_by("day").order_by("day").all()

    # DAU per day (users who logged in that day)
    dau = db.query(
        cast(User.last_login_at, Date).label("day"),
        func.count(User.id).label("count"),
    ).filter(
        User.last_login_at.isnot(None),
        cast(User.last_login_at, Date) >= cutoff,
    ).group_by("day").order_by("day").all()

    # Predictions placed per day
    preds = db.query(
        cast(Prediction.created_at, Date).label("day"),
        func.count(Prediction.id).label("count"),
        func.sum(Prediction.simulated_amount).label("volume"),
    ).filter(
        cast(Prediction.created_at, Date) >= cutoff,
    ).group_by("day").order_by("day").all()

    # Comments per day
    comments = db.query(
        cast(Comment.created_at, Date).label("day"),
        func.count(Comment.id).label("count"),
    ).filter(
        cast(Comment.created_at, Date) >= cutoff,
    ).group_by("day").order_by("day").all()

    # Merge into a single date-keyed dict for easy frontend consumption
    data: dict[str, dict] = {}
    for row in signups:
        d = str(row.day)
        data.setdefault(d, {})["signups"] = row.count
    for row in dau:
        d = str(row.day)
        data.setdefault(d, {})["dau"] = row.count
    for row in preds:
        d = str(row.day)
        data.setdefault(d, {})["predictions"] = row.count
        data[d]["volume"] = round(float(row.volume or 0), 2)
    for row in comments:
        d = str(row.day)
        data.setdefault(d, {})["comments"] = row.count

    # Fill zeros for missing days and sort chronologically
    result = []
    for i in range(days):
        d = str(cutoff + timedelta(days=i))
        row = data.get(d, {})
        result.append({
            "date": d,
            "signups":     row.get("signups", 0),
            "dau":         row.get("dau", 0),
            "predictions": row.get("predictions", 0),
            "volume":      row.get("volume", 0.0),
            "comments":    row.get("comments", 0),
        })
    return result


@router.get("/stats/top-markets")
def admin_stats_top_markets(
    limit: int = 10,
    days: int = 30,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """Top markets by prediction count and volume. Optionally filtered to last N days."""
    from sqlalchemy import func, cast, Date
    from datetime import timedelta
    from app.models.prediction import Prediction
    from app.models.scenario import Scenario

    cutoff = datetime.utcnow() - timedelta(days=days) if days < 9999 else None

    q = (
        db.query(
            Event.id,
            Event.title,
            Event.category,
            Event.status,
            func.count(Prediction.id).label("prediction_count"),
            func.sum(Prediction.simulated_amount).label("total_volume"),
        )
        .join(Scenario, Scenario.event_id == Event.id)
        .join(Prediction, Prediction.scenario_id == Scenario.id)
    )
    if cutoff:
        q = q.filter(Prediction.created_at >= cutoff)

    rows = (
        q.group_by(Event.id, Event.title, Event.category, Event.status)
        .order_by(func.count(Prediction.id).desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "event_id": r.id,
            "title": r.title,
            "category": r.category,
            "status": r.status,
            "prediction_count": r.prediction_count,
            "total_volume": round(float(r.total_volume or 0), 2),
        }
        for r in rows
    ]


@router.get("/stats/top-users")
def admin_stats_top_users(
    limit: int = 10,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """Top users ranked by XP, with prediction count and total volume."""
    from sqlalchemy import func
    from app.models.prediction import Prediction

    rows = (
        db.query(
            User.id,
            User.display_name,
            User.email,
            User.xp,
            User.current_streak,
            User.created_at,
            User.last_login_at,
            func.count(Prediction.id).label("prediction_count"),
            func.sum(Prediction.simulated_amount).label("total_volume"),
        )
        .outerjoin(Prediction, Prediction.user_id == User.id)
        .filter(User.is_active.is_(True))
        .group_by(
            User.id, User.display_name, User.email, User.xp,
            User.current_streak, User.created_at, User.last_login_at,
        )
        .order_by(User.xp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "user_id": r.id,
            "display_name": r.display_name,
            "email": r.email,
            "xp": r.xp,
            "current_streak": r.current_streak,
            "prediction_count": r.prediction_count or 0,
            "total_volume": round(float(r.total_volume or 0), 2),
            "joined": r.created_at.isoformat() if r.created_at else None,
            "last_login": r.last_login_at.isoformat() if r.last_login_at else None,
        }
        for r in rows
    ]
