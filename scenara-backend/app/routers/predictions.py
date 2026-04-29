from __future__ import annotations

import logging
import time
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app import models
from app.models.probability_history import ScenarioProbabilityHistory
from app.models.scenario import Scenario
from app.routers.auth import get_current_user

router = APIRouter()

# ---------------------------------------------------------------------------
# Market mechanics constants
# ---------------------------------------------------------------------------

MIN_BET = 1.0          # minimum single bet in sim dollars
MAX_BET = 10_000.0     # maximum single bet in sim dollars

# Virtual liquidity depth — controls how strongly a bet moves the market.
# A bet of size L has a 50% impact on the market.
# Lower  = more volatile market (small bets move odds a lot)
# Higher = more stable market (large bets needed to move odds)
MARKET_LIQUIDITY = 1_000.0

MAX_BETS_PER_MINUTE = 10
MAX_POSITION_PER_MARKET = 2_000.0  # max $2000 open exposure per user per event

_bet_timestamps: dict[str, list[float]] = defaultdict(list)

def _check_rate_limit(user_id: int) -> None:
    key = str(user_id)
    now = time.time()
    _bet_timestamps[key] = [t for t in _bet_timestamps[key] if now - t < 60.0]
    if len(_bet_timestamps[key]) >= MAX_BETS_PER_MINUTE:
        raise HTTPException(status_code=429, detail=f"Rate limit: max {MAX_BETS_PER_MINUTE} bets per minute")
    _bet_timestamps[key].append(now)

def _check_position_limit(db: Session, user_id: int, event_id: int, new_amount: float) -> None:
    from sqlalchemy import func
    total = db.query(func.sum(models.Prediction.simulated_amount)).join(
        models.Scenario, models.Prediction.scenario_id == models.Scenario.id
    ).filter(
        models.Scenario.event_id == event_id,
        models.Prediction.user_id == user_id,
        models.Prediction.status == "open",
    ).scalar() or 0
    if float(total) + new_amount > MAX_POSITION_PER_MARKET:
        raise HTTPException(
            status_code=400,
            detail=f"Position limit reached: max ${MAX_POSITION_PER_MARKET:,.0f} open per market"
        )


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
    event_closes_at: datetime | None
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
    # Gamification
    xp: int = 0
    level: int = 1
    xp_to_next_level: int = 0
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

_HOUSE_EDGE = 0.02  # 2% rake — platform keeps 2% of implied value

def implied_multiplier(probability: float) -> float:
    normalized = max(min(probability, 99.0), 1.0)
    fair = 100.0 / normalized
    return round(fair * (1.0 - _HOUSE_EDGE), 4)


def _normalize_scenarios(scenarios: list) -> None:
    """
    Ensure all scenario probabilities sum to exactly 100%.
    Clamps each to [1, 99] first to avoid degenerate markets.
    Modifies in-place — caller must commit.
    """
    if not scenarios:
        return
    for s in scenarios:
        s.probability = max(1.0, min(99.0, s.probability))
    total = sum(s.probability for s in scenarios)
    if total == 0:
        equal = round(100.0 / len(scenarios), 2)
        for s in scenarios:
            s.probability = equal
    else:
        for s in scenarios:
            s.probability = round(s.probability / total * 100.0, 2)


def _shift_market(db: Session, bet_scenario: models.Scenario, amount: float) -> None:
    """
    Move market odds after a bet is placed.

    Mechanics:
      - Betting on scenario X increases X's probability (demand signal).
      - All other scenarios are scaled down proportionally so the sum stays 100%.
      - Early bettors on the right side lock in better odds before the market moves.
      - impact = amount / (amount + MARKET_LIQUIDITY)
        e.g. $100 bet on $1000 liquidity → ~9% market impact

    After updating, logs a probability history point for every scenario so the
    live chart reflects real crowd-driven price movement.
    """
    scenarios = (
        db.query(models.Scenario)
        .filter(
            models.Scenario.event_id == bet_scenario.event_id,
            models.Scenario.status == "active",
        )
        .all()
    )
    if len(scenarios) < 2:
        return

    # Impact factor — how much this single bet moves the market
    impact = amount / (amount + MARKET_LIQUIDITY)

    if impact > 0.05:
        logger.warning(
            f"[MarketMove] Event #{bet_scenario.event_id}: scenario #{bet_scenario.id} "
            f"moved {impact*100:.1f}% after ${amount:.0f} bet"
        )

    # Boost the bet scenario toward 100%
    old_p = max(1.0, min(99.0, bet_scenario.probability)) / 100.0
    new_p = old_p + (1.0 - old_p) * impact

    # Scale other scenarios down proportionally to fill remaining probability mass
    remaining = 1.0 - new_p
    others = [s for s in scenarios if s.id != bet_scenario.id]
    other_sum = sum(max(0.001, s.probability) for s in others)

    for s in scenarios:
        if s.id == bet_scenario.id:
            s.probability = new_p * 100.0
        else:
            s.probability = (max(0.001, s.probability) / other_sum) * remaining * 100.0

    # Clamp and renormalize to guarantee sum == 100 and no degenerate values
    _normalize_scenarios(scenarios)

    # Log a history snapshot for every scenario so the chart updates live
    now = datetime.utcnow()
    for s in scenarios:
        db.add(ScenarioProbabilityHistory(
            scenario_id=s.id,
            event_id=s.event_id,
            probability=s.probability,
            source="bet",
            recorded_at=now,
        ))


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
    Uses a single aggregated query instead of loading every prediction.
    """
    from sqlalchemy import func

    rows = (
        db.query(
            models.Prediction.user_id,
            func.sum(models.Prediction.pnl).label("total_pnl"),
        )
        .filter(models.Prediction.status.in_(("won", "lost")))
        .filter(models.Prediction.pnl.isnot(None))
        .group_by(models.Prediction.user_id)
        .all()
    )

    if not rows:
        return 100.0

    scores = [float(r.total_pnl) for r in rows]
    beaten = sum(1 for s in scores if s < user_pnl)
    return round((beaten / len(scores)) * 100, 1)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/", response_model=PredictionOut)
def create_prediction(
    payload: PredictionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Ensure authenticated user matches requested user_id — prevents spoofing
    if payload.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot place predictions on behalf of another user")

    # Validate bet size
    entry_amount = payload.simulated_amount
    if float(entry_amount) < MIN_BET:
        raise HTTPException(status_code=400, detail=f"Minimum bet is ${MIN_BET:.0f}")
    if float(entry_amount) > MAX_BET:
        raise HTTPException(status_code=400, detail=f"Maximum bet is ${MAX_BET:,.0f}")

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
    # Guard against degenerate market — should never happen after normalization
    if not (1.0 <= scenario.probability <= 99.0):
        raise HTTPException(status_code=400, detail="Market is not accepting bets right now")

    _check_rate_limit(current_user.id)
    _check_position_limit(db, current_user.id, scenario.event.id, float(entry_amount))

    # Always look up by current_user.id (not payload.user_id — already verified equal above)
    account = (
        db.query(models.Account)
        .filter(
            models.Account.user_id == current_user.id,
            models.Account.account_type == "simulation",
            models.Account.is_active.is_(True),
        )
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Simulation account not found")

    current_balance = Decimal(str(account.balance))
    if current_balance < entry_amount:
        raise HTTPException(status_code=400, detail="Insufficient simulation balance")

    account.balance = current_balance - entry_amount

    # Lock odds at the current probability BEFORE the market moves
    prediction = models.Prediction(
        user_id=current_user.id,
        scenario_id=scenario.id,
        simulated_amount=float(entry_amount),
        entry_probability=scenario.probability,
        payout_multiplier=implied_multiplier(scenario.probability),
        status="open",
    )
    db.add(prediction)
    db.flush()

    db.add(models.Transaction(
        user_id=current_user.id,
        account_id=account.id,
        type="prediction_entry",
        amount=float(entry_amount),
        currency=account.currency,
    ))

    # Move the market: shift probabilities based on this bet, then log history
    # This happens AFTER odds are locked so the bettor keeps their entry price
    _shift_market(db, scenario, float(entry_amount))

    # Award XP for the placed bet. Engagement metric — given on *every* bet
    # (win or lose), so participation is rewarded. See services/xp.py.
    from app.services.xp import xp_for_bet
    awarded = xp_for_bet(float(entry_amount))
    if awarded > 0:
        current_user.xp = (current_user.xp or 0) + awarded

    db.commit()
    db.refresh(prediction)
    return prediction


@router.get("/user/{user_id}", response_model=list[PredictionDetailOut])
def list_user_predictions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.id != user_id and not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Cannot view another user's predictions")
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
            event_closes_at=p.scenario.event.closes_at,
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
def get_portfolio_summary(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.id != user_id and not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Cannot view another user's portfolio")
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

    from app.services.xp import level_from_xp, xp_needed_for_next_level
    user_xp = int(user.xp or 0)
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
        xp=user_xp,
        level=level_from_xp(user_xp),
        xp_to_next_level=xp_needed_for_next_level(user_xp),
        accuracy_score=accuracy_score,
        percentile_rank=percentile_rank,
        avg_entry_prob=avg_entry_prob,
        best_pnl=best_pnl,
        worst_pnl=worst_pnl,
        avg_pnl_per_prediction=avg_pnl,
    )


class OpenPositionOut(BaseModel):
    prediction_id: int
    event_id: int
    event_title: str
    event_status: str
    scenario_id: int
    scenario_title: str
    amount: float
    entry_probability: float
    payout_multiplier: float
    current_probability: float
    potential_payout: float   # amount × multiplier (what you'd win)
    expected_value: float     # current_prob × potential_payout − (1−current_prob) × amount
    unrealized_pnl: float     # expected_value − amount

@router.get("/user/{user_id}/open-positions", response_model=list[OpenPositionOut])
def get_open_positions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.id != user_id and not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Cannot view another user's open positions")
    """Returns all open predictions with current market EV and unrealized PnL."""
    predictions = (
        db.query(models.Prediction)
        .options(joinedload(models.Prediction.scenario).joinedload(models.Scenario.event))
        .filter(
            models.Prediction.user_id == user_id,
            models.Prediction.status == "open",
        )
        .order_by(models.Prediction.created_at.desc())
        .all()
    )
    result = []
    for p in predictions:
        sc = p.scenario
        ev = sc.event if sc else None
        if not sc or not ev:
            continue
        amount = float(p.simulated_amount)
        potential_payout = round(amount * p.payout_multiplier, 2)
        cp = sc.probability / 100.0
        expected_value = round(cp * potential_payout - (1 - cp) * amount, 2)
        unrealized_pnl = round(expected_value - amount, 2)
        result.append(OpenPositionOut(
            prediction_id=p.id,
            event_id=ev.id,
            event_title=ev.title,
            event_status=ev.status,
            scenario_id=sc.id,
            scenario_title=sc.title,
            amount=amount,
            entry_probability=p.entry_probability,
            payout_multiplier=round(p.payout_multiplier, 4),
            current_probability=sc.probability,
            potential_payout=potential_payout,
            expected_value=expected_value,
            unrealized_pnl=unrealized_pnl,
        ))
    return result


@router.post("/settle/{event_id}", response_model=SettlementResponse)
def settle_event_predictions(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    from app.services.resolution import settle_event as _settle
    from sqlalchemy.orm import joinedload as _jl
    event = (
        db.query(models.Event)
        .options(_jl(models.Event.scenarios))
        .filter(models.Event.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.status != "resolved":
        raise HTTPException(status_code=400, detail="Event must be resolved before settlement")
    winning_scenario = next((s for s in event.scenarios if s.status == "won"), None)
    if not winning_scenario:
        raise HTTPException(status_code=400, detail="No winning scenario found")
    result = _settle(db, event, winning_scenario.id)
    return SettlementResponse(settled_count=result["total_winners"] + result["total_losers"], event_id=event_id)


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
    from sqlalchemy import func

    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    scenarios = db.query(models.Scenario).filter(
        models.Scenario.event_id == event_id
    ).order_by(models.Scenario.sort_order).all()

    if not scenarios:
        return CrowdSentimentOut(event_id=event_id, total_players=0, scenarios=[])

    # Single aggregation query instead of one .count() per scenario
    count_rows = (
        db.query(models.Prediction.scenario_id, func.count(models.Prediction.id).label("cnt"))
        .filter(models.Prediction.scenario_id.in_([s.id for s in scenarios]))
        .group_by(models.Prediction.scenario_id)
        .all()
    )
    counts = {row.scenario_id: row.cnt for row in count_rows}

    total = sum(counts.values())

    result = []
    for s in scenarios:
        count = counts.get(s.id, 0)
        pct = round((count / total * 100), 1) if total > 0 else 0.0
        result.append(ScenarioSentiment(
            scenario_id=s.id,
            scenario_title=s.title,
            scenario_title_pt=s.title_pt,
            player_count=count,
            percentage=pct,
        ))

    return CrowdSentimentOut(event_id=event_id, total_players=total, scenarios=result)


# ---------------------------------------------------------------------------
# Activity feed — anonymized recent bets for social proof
# ---------------------------------------------------------------------------

class ActivityItem(BaseModel):
    player: str          # anonymized: "Alex T.", "Marco R.", etc.
    event_title: str
    scenario_title: str
    amount_label: str    # "$50–$100", "$100–$500", etc.
    seconds_ago: int


_SYNTHETIC_NAMES = [
    # Brazilian
    "Lucas M.", "Sofia R.", "Gabriel T.", "Ana C.", "Pedro H.",
    "Isabella F.", "Mateus S.", "Juliana B.", "Rafael O.", "Camila N.",
    "Bruno L.", "Fernanda P.", "Diego A.", "Larissa G.", "Vitor E.",
    "Mariana K.", "Felipe W.", "Beatriz D.", "Thiago V.", "Natalia Z.",
    "Caio A.", "Helena S.", "Gustavo R.", "Letícia M.", "Arthur P.",
    "Valentina L.", "Enzo C.", "Manuela B.", "Davi F.", "Alice O.",
    "Heitor G.", "Laura T.", "Murilo K.", "Yasmin V.", "Leonardo D.",
    # English / international
    "James K.", "Emma S.", "Noah P.", "Olivia R.", "Liam B.",
    "Ava T.", "Ethan C.", "Sophia H.", "Mason L.", "Mia F.",
    "Lucas W.", "Isla R.", "Oliver N.", "Chloe D.", "Henry J.",
    "Aria C.", "Jack M.", "Zoe V.", "Owen B.", "Nora P.",
    "Aiden S.", "Grace K.", "Leo T.", "Ruby A.", "Max H.",
    # Asian / Chinese pinyin
    "Wei L.", "Xin Y.", "Jun Z.", "Mei H.", "Hao C.",
    "Lin W.", "Rui S.", "Jia T.", "Bo X.", "Yan Q.",
    "Min K.", "Zhe P.", "Ning F.", "Kai J.", "Fei O.",
    # Crypto-twitter style aliases (anonymized look)
    "0xAlex", "trader_v", "moonbo1", "btc_maxi", "degen_z",
    "yoloKid", "chain.x", "whaIe88", "flash_t", "alpha_j",
]
# Amounts: wider range, most bets small (retail-heavy), occasional whale
_SYNTHETIC_AMOUNTS = ["$5", "$10", "$15", "$20", "$25", "$40", "$60", "$100", "$150", "$250"]
_SYNTHETIC_AMOUNT_WEIGHTS = [0.10, 0.18, 0.18, 0.14, 0.12, 0.10, 0.08, 0.06, 0.03, 0.01]


@router.get("/activity", response_model=list[ActivityItem])
def get_recent_activity(limit: int = 15, db: Session = Depends(get_db)):
    """Returns the last N bets (anonymized) for the social proof activity ticker.

    To prevent one power-user from dominating the feed, we fetch a wider pool of
    recent bets and cap each user to MAX_PER_USER rows before returning.
    """
    import random

    MAX_PER_USER = 2
    # Only surface real bets from the last 48h — older bets make the "live" feed
    # look like an archive (e.g. "590h ago"). Anything older gets synthetic padding.
    cutoff = datetime.utcnow() - timedelta(hours=48)

    # Fetch a wider pool so we still have variety after the per-user cap
    recent = (
        db.query(models.Prediction)
        .options(
            joinedload(models.Prediction.scenario).joinedload(models.Scenario.event),
            joinedload(models.Prediction.user),
        )
        .filter(models.Prediction.created_at >= cutoff)
        .order_by(models.Prediction.created_at.desc())
        .limit(limit * 6)
        .all()
    )

    now = datetime.utcnow()
    items = []
    per_user_count: dict[int, int] = {}
    for p in recent:
        user = p.user
        scenario = p.scenario
        event = scenario.event if scenario else None
        if not user or not scenario or not event:
            continue

        # Cap: at most N bets from the same user so the ticker stays varied
        seen = per_user_count.get(user.id, 0)
        if seen >= MAX_PER_USER:
            continue
        per_user_count[user.id] = seen + 1

        # Anonymize: "Alexander" → "Alex T."
        name = (user.display_name or user.email.split("@")[0])
        parts = name.strip().split()
        if len(parts) >= 2:
            anon = f"{parts[0]} {parts[-1][0]}."
        else:
            anon = parts[0][:6] + "."

        # Show specific rounded amount — cap at $250, round to nearest $5
        amt = float(p.simulated_amount)
        display = max(5, min(250, round(amt / 5) * 5))
        label = f"${display}"

        delta = int((now - p.created_at.replace(tzinfo=None)).total_seconds())
        items.append(ActivityItem(
            player=anon,
            event_title=event.title[:50],
            scenario_title=scenario.title[:30],
            amount_label=label,
            seconds_ago=max(delta, 5),
        ))

        if len(items) >= limit:
            break

    # Pad with synthetic activity when real data is sparse
    if len(items) < limit:
        scenarios = (
            db.query(models.Scenario)
            .options(joinedload(models.Scenario.event))
            .join(models.Scenario.event)
            .filter(models.Scenario.event != None)
            .limit(40)
            .all()
        )
        if scenarios:
            needed = limit - len(items)
            # Use a stable seed based on current hour so names don't flicker on refresh
            seed = int(now.strftime("%Y%m%d%H%M"))
            rng = random.Random(seed)
            used_names = {it.player for it in items}
            name_pool = [n for n in _SYNTHETIC_NAMES if n not in used_names]
            rng.shuffle(name_pool)
            for i in range(needed):
                sc = rng.choice(scenarios)
                ev = sc.event
                if not ev:
                    continue
                name = name_pool[i % len(name_pool)]
                label = rng.choices(_SYNTHETIC_AMOUNTS, weights=_SYNTHETIC_AMOUNT_WEIGHTS, k=1)[0]
                # Spread fake timestamps across the past 30 minutes so the ticker
                # feels live (5s - 30min ago instead of "590h ago" like stale real bets)
                fake_delta = rng.randint(5, 1800)
                items.append(ActivityItem(
                    player=name,
                    event_title=ev.title[:50],
                    scenario_title=sc.title[:30],
                    amount_label=label,
                    seconds_ago=fake_delta,
                ))
            rng.shuffle(items)

    return items