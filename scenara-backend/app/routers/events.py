from __future__ import annotations

from datetime import datetime
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
    description: str | None
    probability: float
    sort_order: int
    status: str


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    slug: str
    title: str
    description: str | None
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


def _update_streak(user: User, won: bool) -> None:
    if won:
        user.current_streak = (user.current_streak or 0) + 1
        if user.current_streak > (user.best_streak or 0):
            user.best_streak = user.current_streak
    else:
        user.current_streak = 0


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

    for idx, sp in enumerate(payload.scenarios):
        scenario = Scenario(
            event_id=event.id,
            title=sp.title,
            description=sp.description,
            probability=sp.probability,
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


@router.get("/", response_model=list[EventOut])
def list_events(
    db: Session = Depends(get_db),
    status: Optional[str] = Query(default=None),
    featured_only: bool = Query(default=False),
    limit: int = Query(default=20, ge=1, le=100),
):
    query = db.query(Event).options(joinedload(Event.scenarios))
    if status:
        query = query.filter(Event.status == status)
    if featured_only:
        query = query.filter(Event.is_featured.is_(True))
    return query.order_by(Event.created_at.desc()).limit(limit).all()


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = (
        db.query(Event)
        .options(joinedload(Event.scenarios))
        .filter(Event.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
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

    scenario.probability = payload.probability
    db.flush()

    # Log history snapshot
    _log_probability(db, scenario, source="updated")

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

    open_predictions = (
        db.query(Prediction)
        .filter(
            Prediction.scenario_id.in_(scenario_ids),
            Prediction.status == "open",
        )
        .all()
    )

    now = datetime.utcnow()
    total_winners = 0
    total_losers = 0
    total_payout = 0.0

    for prediction in open_predictions:
        account = (
            db.query(Account)
            .filter(
                Account.user_id == prediction.user_id,
                Account.account_type == "simulation",
                Account.is_active.is_(True),
            )
            .first()
        )
        user = db.query(User).filter(User.id == prediction.user_id).first()

        if prediction.scenario_id == payload.winning_scenario_id:
            payout = float(prediction.simulated_amount) * prediction.payout_multiplier
            pnl = payout - float(prediction.simulated_amount)
            prediction.status = "won"
            prediction.pnl = pnl
            prediction.settled_at = now
            if account:
                account.balance = float(account.balance) + payout
                db.add(Transaction(
                    user_id=prediction.user_id,
                    account_id=account.id,
                    type="prediction_win",
                    amount=payout,
                    currency=account.currency,
                ))
            if user:
                _update_streak(user, won=True)
            total_winners += 1
            total_payout += payout
        else:
            pnl = -float(prediction.simulated_amount)
            prediction.status = "lost"
            prediction.pnl = pnl
            prediction.settled_at = now
            if account:
                db.add(Transaction(
                    user_id=prediction.user_id,
                    account_id=account.id,
                    type="prediction_loss",
                    amount=0,
                    currency=account.currency,
                ))
            if user:
                _update_streak(user, won=False)
            total_losers += 1

    # Mark event resolved + log final probability snapshot
    event.status = "resolved"
    event.resolution_note = payload.resolution_note
    event.resolved_at = now

    for scenario in event.scenarios:
        final_prob = 100.0 if scenario.id == payload.winning_scenario_id else 0.0
        scenario.status = "won" if scenario.id == payload.winning_scenario_id else "lost"
        scenario.probability = final_prob
        _log_probability(db, scenario, source="resolved")

    db.commit()

    return EventResolveResponse(
        ok=True,
        event_id=event.id,
        winning_scenario_id=payload.winning_scenario_id,
        status=event.status,
        predictions_settled=len(open_predictions),
        total_winners=total_winners,
        total_losers=total_losers,
        total_payout=round(total_payout, 2),
    )