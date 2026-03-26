from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app import models

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class PredictionCreate(BaseModel):
    user_id: int
    scenario_id: int
    simulated_amount: Decimal = Field(..., gt=0)


class PredictionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    scenario_id: int
    simulated_amount: Decimal
    entry_probability: float
    status: str
    payout_multiplier: float
    pnl: Decimal | None


class PredictionDetailOut(BaseModel):
    id: int
    user_id: int
    scenario_id: int
    scenario_title: str
    event_id: int
    event_title: str
    event_status: str
    simulated_amount: Decimal
    entry_probability: float
    status: str
    payout_multiplier: float
    pnl: Decimal | None
    created_at: datetime
    settled_at: datetime | None


class PortfolioSummaryOut(BaseModel):
    user_id: int
    balance: Decimal
    total_predictions: int
    open_count: int
    won_count: int
    lost_count: int
    void_count: int
    total_pnl: Decimal
    total_wagered: Decimal
    current_streak: int
    best_streak: int
    win_rate: float
    # Performance insights
    accuracy_score: float      # calibration score 0-100
    percentile_rank: float     # what % of users this user beats
    avg_entry_prob: float      # average probability at time of entry
    best_pnl: float            # single best prediction PnL
    worst_pnl: float           # single worst prediction PnL
    avg_pnl_per_prediction: float


class SettlementResponse(BaseModel):
    settled_count: int
    event_id: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def implied_multiplier(probability: float) -> float:
    normalized = max(min(probability, 99.0), 1.0)
    return round(100.0 / normalized, 4)


def _compute_accuracy_score(predictions: list) -> float:
    """
    Brier-score-based accuracy.
    For each settled prediction: score = 1 - (outcome - prob/100)^2
    Perfect calibration = 100, random = ~75, terrible = 0.
    """
    settled = [p for p in predictions if p.status in ("won", "lost")]
    if not settled:
        return 0.0
    total = 0.0
    for p in settled:
        outcome = 1.0 if p.status == "won" else 0.0
        prob = (p.entry_probability or 50.0) / 100.0
        brier = (outcome - prob) ** 2
        score = 1.0 - brier  # 0 to 1
        total += score
    return round((total / len(settled)) * 100, 1)


def _compute_percentile(user_id: int, user_pnl: float, db: Session) -> float:
    """
    What percentage of other users does this user beat by total PnL.
    """
    all_users = db.query(models.User).filter(models.User.is_active.is_(True)).all()
    if len(all_users) <= 1:
        return 100.0

    user_scores = []
    for u in all_users:
        preds = db.query(models.Prediction).filter(models.Prediction.user_id == u.id).all()
        pnl = sum(float(p.pnl) for p in preds if p.pnl is not None and p.status in ("won", "lost"))
        user_scores.append(pnl)

    beaten = sum(1 for s in user_scores if s < user_pnl)
    return round((beaten / (len(user_scores) - 1)) * 100, 1) if len(user_scores) > 1 else 100.0


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/", response_model=PredictionOut)
def create_prediction(payload: PredictionCreate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    scenario = (
        db.query(models.Scenario)
        .options(joinedload(models.Scenario.event))
        .filter(models.Scenario.id == payload.scenario_id)
        .first()
    )
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if scenario.status != "active":
        raise HTTPException(status_code=400, detail="Scenario is not active")
    if scenario.event.status != "open":
        raise HTTPException(status_code=400, detail="Event is not open")

    account = (
        db.query(models.Account)
        .filter(
            models.Account.user_id == payload.user_id,
            models.Account.account_type == "simulation",
            models.Account.is_active.is_(True),
        )
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Simulation account not found")

    current_balance = Decimal(str(account.balance))
    entry_amount = payload.simulated_amount

    if current_balance < entry_amount:
        raise HTTPException(status_code=400, detail="Insufficient simulation balance")

    account.balance = current_balance - entry_amount

    prediction = models.Prediction(
        user_id=user.id,
        scenario_id=scenario.id,
        simulated_amount=float(entry_amount),
        entry_probability=scenario.probability,
        payout_multiplier=implied_multiplier(scenario.probability),
        status="open",
    )
    db.add(prediction)
    db.flush()

    tx = models.Transaction(
        user_id=user.id,
        account_id=account.id,
        type="prediction_entry",
        amount=float(entry_amount),
        currency=account.currency,
    )
    db.add(tx)
    db.commit()
    db.refresh(prediction)
    return prediction


@router.get("/user/{user_id}", response_model=list[PredictionDetailOut])
def list_user_predictions(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    predictions = (
        db.query(models.Prediction)
        .options(joinedload(models.Prediction.scenario).joinedload(models.Scenario.event))
        .filter(models.Prediction.user_id == user_id)
        .order_by(models.Prediction.created_at.desc())
        .all()
    )

    return [
        PredictionDetailOut(
            id=p.id,
            user_id=p.user_id,
            scenario_id=p.scenario_id,
            scenario_title=p.scenario.title,
            event_id=p.scenario.event.id,
            event_title=p.scenario.event.title,
            event_status=p.scenario.event.status,
            simulated_amount=p.simulated_amount,
            entry_probability=p.entry_probability,
            status=p.status,
            payout_multiplier=p.payout_multiplier,
            pnl=p.pnl,
            created_at=p.created_at,
            settled_at=p.settled_at,
        )
        for p in predictions
    ]


@router.get("/user/{user_id}/summary", response_model=PortfolioSummaryOut)
def get_portfolio_summary(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    account = (
        db.query(models.Account)
        .filter(
            models.Account.user_id == user_id,
            models.Account.account_type == "simulation",
            models.Account.is_active.is_(True),
        )
        .first()
    )
    balance = Decimal(str(account.balance)) if account else Decimal("0")

    predictions = (
        db.query(models.Prediction)
        .filter(models.Prediction.user_id == user_id)
        .all()
    )

    open_count = won_count = lost_count = void_count = 0
    total_pnl = Decimal("0")
    total_wagered = Decimal("0")
    settled_pnls: list[float] = []
    entry_probs: list[float] = []

    for p in predictions:
        total_wagered += Decimal(str(p.simulated_amount))
        entry_probs.append(p.entry_probability or 50.0)

        if p.status == "open":
            open_count += 1
        elif p.status == "won":
            won_count += 1
            pnl_val = Decimal(str(p.pnl)) if p.pnl is not None else Decimal("0")
            total_pnl += pnl_val
            settled_pnls.append(float(pnl_val))
        elif p.status == "lost":
            lost_count += 1
            pnl_val = Decimal(str(p.pnl)) if p.pnl is not None else Decimal("0")
            total_pnl += pnl_val
            settled_pnls.append(float(pnl_val))
        elif p.status == "void":
            void_count += 1

    settled = won_count + lost_count
    win_rate = round((won_count / settled) * 100, 1) if settled > 0 else 0.0

    accuracy_score = _compute_accuracy_score(predictions)
    percentile_rank = _compute_percentile(user_id, float(total_pnl), db)

    avg_entry_prob = round(sum(entry_probs) / len(entry_probs), 1) if entry_probs else 0.0
    best_pnl = round(max(settled_pnls), 2) if settled_pnls else 0.0
    worst_pnl = round(min(settled_pnls), 2) if settled_pnls else 0.0
    avg_pnl = round(sum(settled_pnls) / len(settled_pnls), 2) if settled_pnls else 0.0

    return PortfolioSummaryOut(
        user_id=user_id,
        balance=balance,
        total_predictions=len(predictions),
        open_count=open_count,
        won_count=won_count,
        lost_count=lost_count,
        void_count=void_count,
        total_pnl=total_pnl,
        total_wagered=total_wagered,
        current_streak=user.current_streak or 0,
        best_streak=user.best_streak or 0,
        win_rate=win_rate,
        accuracy_score=accuracy_score,
        percentile_rank=percentile_rank,
        avg_entry_prob=avg_entry_prob,
        best_pnl=best_pnl,
        worst_pnl=worst_pnl,
        avg_pnl_per_prediction=avg_pnl,
    )


@router.post("/settle/{event_id}", response_model=SettlementResponse)
def settle_event_predictions(event_id: int, db: Session = Depends(get_db)):
    event = (
        db.query(models.Event)
        .options(joinedload(models.Event.scenarios))
        .filter(models.Event.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.status != "resolved":
        raise HTTPException(status_code=400, detail="Event must be resolved before settlement")

    scenario_map = {s.id: s for s in event.scenarios}
    predictions = (
        db.query(models.Prediction)
        .join(models.Scenario, models.Prediction.scenario_id == models.Scenario.id)
        .filter(models.Scenario.event_id == event_id, models.Prediction.status == "open")
        .all()
    )

    settled_count = 0
    for prediction in predictions:
        scenario = scenario_map.get(prediction.scenario_id)
        if not scenario:
            continue
        account = (
            db.query(models.Account)
            .filter(
                models.Account.user_id == prediction.user_id,
                models.Account.account_type == "simulation",
                models.Account.is_active.is_(True),
            )
            .first()
        )
        if not account:
            continue

        prediction_amount = Decimal(str(prediction.simulated_amount))

        if scenario.status == "won":
            pnl_value = round(float(prediction_amount) * (prediction.payout_multiplier - 1.0), 2)
            prediction.status = "won"
            prediction.pnl = pnl_value
            account.balance = Decimal(str(account.balance)) + prediction_amount + Decimal(str(pnl_value))
            db.add(models.Transaction(
                user_id=prediction.user_id, account_id=account.id,
                type="prediction_win", amount=float(prediction_amount + Decimal(str(pnl_value))),
                currency=account.currency,
            ))
        elif scenario.status == "lost":
            prediction.status = "lost"
            prediction.pnl = round(-float(prediction_amount), 2)
            db.add(models.Transaction(
                user_id=prediction.user_id, account_id=account.id,
                type="prediction_loss", amount=float(prediction_amount),
                currency=account.currency,
            ))
        else:
            prediction.status = "void"
            prediction.pnl = 0
            account.balance = Decimal(str(account.balance)) + prediction_amount
            db.add(models.Transaction(
                user_id=prediction.user_id, account_id=account.id,
                type="void", amount=float(prediction_amount),
                currency=account.currency,
            ))

        prediction.settled_at = datetime.utcnow()
        settled_count += 1

    db.commit()
    return SettlementResponse(settled_count=settled_count, event_id=event_id)


# ---------------------------------------------------------------------------
# Crowd sentiment — how users bet on an event
# ---------------------------------------------------------------------------

class ScenarioSentiment(BaseModel):
    scenario_id: int
    scenario_title: str
    scenario_title_pt: str | None
    player_count: int
    percentage: float

class CrowdSentimentOut(BaseModel):
    event_id: int
    total_players: int
    scenarios: list[ScenarioSentiment]


@router.get("/events/{event_id}/sentiment", response_model=CrowdSentimentOut)
def get_crowd_sentiment(event_id: int, db: Session = Depends(get_db)):
    """Returns how many players bet on each scenario for a given event."""
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    scenarios = db.query(models.Scenario).filter(
        models.Scenario.event_id == event_id
    ).order_by(models.Scenario.sort_order).all()

    result = []
    total = 0
    counts = {}

    for s in scenarios:
        count = db.query(models.Prediction).filter(
            models.Prediction.scenario_id == s.id
        ).count()
        counts[s.id] = count
        total += count

    for s in scenarios:
        count = counts[s.id]
        pct = round((count / total * 100), 1) if total > 0 else 0.0
        result.append(ScenarioSentiment(
            scenario_id=s.id,
            scenario_title=s.title,
            scenario_title_pt=s.title_pt,
            player_count=count,
            percentage=pct,
        ))

    return CrowdSentimentOut(event_id=event_id, total_players=total, scenarios=result)