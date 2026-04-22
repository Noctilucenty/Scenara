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
