"""
Daily Challenge — one curated market per UTC day.

Every user sees the same market for that day (Wordle-style) so the social
proof + return-tomorrow loop works. Selection is deterministic from the
date so it's stable within a UTC day even if the scheduler re-runs.

Endpoints:
  GET  /daily-challenge/today              — today's challenge + your progress
  POST /daily-challenge/today/predict      — record that you predicted today
"""
from __future__ import annotations

import hashlib
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models.event import Event
from app.models.scenario import Scenario
from app.models.prediction import Prediction
from app.models.user import User
from app.routers.auth import get_current_user_optional

router = APIRouter()


class ScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    title_pt: Optional[str] = None
    title_zh: Optional[str] = None
    probability: float


class DailyChallengeOut(BaseModel):
    date: str                          # YYYY-MM-DD UTC
    event_id: int
    title: str
    title_pt: Optional[str] = None
    title_zh: Optional[str] = None
    category: str
    closes_at: Optional[datetime]
    scenarios: list[ScenarioOut]
    participants: int                  # how many users predicted on it today
    you_predicted: bool                # whether the auth'd user already predicted


def _today_utc() -> date:
    return datetime.utcnow().date()


def _pick_event_id_for_day(d: date, candidate_ids: list[int]) -> Optional[int]:
    """Deterministic daily pick: SHA-256(date) mod len(candidates)."""
    if not candidate_ids:
        return None
    h = hashlib.sha256(d.isoformat().encode()).digest()
    idx = int.from_bytes(h[:4], "big") % len(candidate_ids)
    return candidate_ids[idx]


def _select_daily_event(db: Session) -> Optional[Event]:
    """
    Pick an open event closing within the next 7 days. Prefer events with
    higher prediction volume so the daily challenge is something users
    actually care about.
    """
    now = datetime.utcnow()
    horizon = now + timedelta(days=7)

    # Volume-weighted candidate pool: top 25 events by recent prediction count.
    volume_subq = (
        db.query(
            Scenario.event_id.label("event_id"),
            func.count(Prediction.id).label("vol"),
        )
        .join(Prediction, Prediction.scenario_id == Scenario.id)
        .group_by(Scenario.event_id)
        .subquery()
    )
    candidates = (
        db.query(Event.id)
        .outerjoin(volume_subq, volume_subq.c.event_id == Event.id)
        .filter(
            Event.status == "open",
            Event.closes_at != None,
            Event.closes_at > now,
            Event.closes_at <= horizon,
        )
        .order_by(func.coalesce(volume_subq.c.vol, 0).desc(), Event.id.asc())
        .limit(25)
        .all()
    )
    candidate_ids = [c[0] for c in candidates]
    if not candidate_ids:
        # Fallback: any open event closing in the future, ordered by id for stability.
        fallback = (
            db.query(Event.id)
            .filter(
                Event.status == "open",
                Event.closes_at != None,
                Event.closes_at > now,
            )
            .order_by(Event.id.asc())
            .limit(25)
            .all()
        )
        candidate_ids = [c[0] for c in fallback]

    chosen_id = _pick_event_id_for_day(_today_utc(), candidate_ids)
    if chosen_id is None:
        return None
    return (
        db.query(Event)
        .options(joinedload(Event.scenarios))
        .filter(Event.id == chosen_id)
        .first()
    )


def _user_has_predicted(db: Session, user_id: int, event: Event) -> bool:
    """True if the user has any prediction on a scenario of this event today."""
    today_start = datetime.combine(_today_utc(), datetime.min.time())
    scenario_ids = [s.id for s in (event.scenarios or [])]
    if not scenario_ids:
        return False
    return (
        db.query(Prediction.id)
        .filter(
            Prediction.user_id == user_id,
            Prediction.scenario_id.in_(scenario_ids),
            Prediction.created_at >= today_start,
        )
        .first()
        is not None
    )


def _participants_today(db: Session, event: Event) -> int:
    today_start = datetime.combine(_today_utc(), datetime.min.time())
    scenario_ids = [s.id for s in (event.scenarios or [])]
    if not scenario_ids:
        return 0
    return (
        db.query(func.count(func.distinct(Prediction.user_id)))
        .filter(
            Prediction.scenario_id.in_(scenario_ids),
            Prediction.created_at >= today_start,
        )
        .scalar()
        or 0
    )


@router.get("/today", response_model=DailyChallengeOut)
def get_today(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    event = _select_daily_event(db)
    if not event:
        raise HTTPException(status_code=404, detail="No open events available for today's challenge")

    return DailyChallengeOut(
        date=_today_utc().isoformat(),
        event_id=event.id,
        title=event.title,
        title_pt=event.title_pt,
        title_zh=event.title_zh,
        category=event.category,
        closes_at=event.closes_at,
        scenarios=[
            ScenarioOut(
                id=s.id,
                title=s.title,
                title_pt=s.title_pt,
                title_zh=s.title_zh,
                probability=float(s.probability or 0),
            )
            for s in sorted(event.scenarios or [], key=lambda x: x.sort_order)
        ],
        participants=_participants_today(db, event),
        you_predicted=_user_has_predicted(db, current_user.id, event) if current_user else False,
    )
