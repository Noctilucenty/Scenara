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
from app.routers.auth import get_current_user
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


# ── Auth guard ────────────────────────────────────────────────────────────────

def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


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

    total = 0
    batch_size = 50
    while True:
        events = (
            db.query(Event)
            .options(joinedload(Event.scenarios))
            .filter(Event.title_zh.is_(None))
            .limit(batch_size)
            .all()
        )
        if not events:
            break
        _fill_zh_translations(events, db)
        total += len(events)

    return {
        "ok": True,
        "cleared_events": n_events,
        "cleared_scenarios": n_scenarios,
        "retranslated_events": total,
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
