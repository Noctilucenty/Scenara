"""
Crowd-sourced market resolution.
Users who bet on a market can vote on the outcome.
When 60%+ of voters agree on an outcome AND at least 3 votes are cast,
the market auto-resolves to that outcome.
"""
from __future__ import annotations

from collections import Counter
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.event import Event
from app.models.scenario import Scenario
from app.models.prediction import Prediction

router = APIRouter()

# In-memory votes: event_id → {user_id: scenario_id}
_votes: dict[int, dict[int, int]] = {}

MIN_VOTES = 3          # minimum votes needed to trigger resolution
CONSENSUS_PCT = 0.60   # 60% agreement needed


class VoteRequest(BaseModel):
    scenario_id: int


@router.post("/events/{event_id}/vote")
async def vote_outcome(
    event_id: int,
    payload: VoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Vote on the outcome of a market. Only users who bet can vote."""
    event = db.query(Event).filter(Event.id == event_id, Event.status == "open").first()
    if not event:
        raise HTTPException(404, "Event not found or already resolved")

    scenario = db.query(Scenario).filter(
        Scenario.id == payload.scenario_id,
        Scenario.event_id == event_id,
    ).first()
    if not scenario:
        raise HTTPException(404, "Scenario not found")

    # Check user has a prediction on this event
    prediction = db.query(Prediction).filter(
        Prediction.user_id == current_user.id,
        Prediction.event_id == event_id,
    ).first()
    if not prediction:
        raise HTTPException(403, "You must have a prediction on this market to vote")

    # Record vote
    if event_id not in _votes:
        _votes[event_id] = {}
    _votes[event_id][current_user.id] = payload.scenario_id

    # Check for consensus
    votes = list(_votes[event_id].values())
    if len(votes) >= MIN_VOTES:
        counts = Counter(votes)
        top_scenario_id, top_count = counts.most_common(1)[0]
        if top_count / len(votes) >= CONSENSUS_PCT:
            # Trigger resolution
            from app.routers.events import _resolve_event
            try:
                result = _resolve_event(event_id, top_scenario_id, db, resolution_note="Community vote")
                _votes.pop(event_id, None)
                return {"ok": True, "voted": True, "resolved": True, "winner": top_scenario_id}
            except Exception:
                pass

    return {
        "ok": True,
        "voted": True,
        "resolved": False,
        "votes": len(votes),
        "needed": MIN_VOTES,
    }


@router.get("/events/{event_id}/votes")
async def get_votes(event_id: int):
    """Get current vote counts for an event."""
    votes = _votes.get(event_id, {})
    counts = Counter(votes.values())
    return {
        "event_id": event_id,
        "total": len(votes),
        "counts": dict(counts),
        "needed": MIN_VOTES,
        "threshold": CONSENSUS_PCT,
    }