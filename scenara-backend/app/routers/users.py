from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app import models
from app.routers.auth import get_current_user, hash_password

router = APIRouter()

# Streak freezes regenerate weekly. Users can spend one to protect their
# current streak from a single losing settlement.
STREAK_FREEZE_COOLDOWN_DAYS = 7


class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    is_active: bool

    class Config:
        orm_mode = True


@router.post("/dev-create", response_model=UserOut)
def create_dev_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Admin-only: create a user account (uses real bcrypt hashing).
    Kept for seeding test environments — requires an authenticated admin.
    """
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        email=payload.email,
        hashed_password=hash_password(payload.password),  # real bcrypt — never plaintext
        is_active=True,
        current_streak=0,
        best_streak=0,
    )
    db.add(user)
    db.flush()

    simulation_account = models.Account(
        user_id=user.id,
        currency="USD",
        balance=Decimal("10000.00"),
        account_type="simulation",
        is_active=True,
    )
    db.add(simulation_account)
    db.flush()

    seed_transaction = models.Transaction(
        user_id=user.id,
        account_id=simulation_account.id,
        type="seed",
        amount=Decimal("10000.00"),
        currency="USD",
    )
    db.add(seed_transaction)

    db.commit()
    db.refresh(user)
    return user


@router.get("/", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Admin-only: list users (never exposed to regular users)."""
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return db.query(models.User).limit(50).all()


# ── Streak freeze ────────────────────────────────────────────────────────────

class StreakFreezeStatus(BaseModel):
    active: bool                              # already armed for the next loss?
    available: bool                           # can the user activate one right now?
    next_available_at: Optional[datetime]     # when the cooldown unlocks


@router.get("/me/streak-freeze", response_model=StreakFreezeStatus)
def streak_freeze_status(current_user: models.User = Depends(get_current_user)):
    last = current_user.last_streak_freeze_at
    cooldown = timedelta(days=STREAK_FREEZE_COOLDOWN_DAYS)
    next_at = (last + cooldown) if last else None
    available = (last is None) or (datetime.utcnow() >= last + cooldown)
    return StreakFreezeStatus(
        active=bool(current_user.streak_freeze_active),
        available=available and not current_user.streak_freeze_active,
        next_available_at=next_at,
    )


@router.post("/me/streak-freeze", response_model=StreakFreezeStatus)
def activate_streak_freeze(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Arm a streak freeze. The next losing prediction consumes it instead
    of resetting current_streak to 0. One activation per 7 days."""
    now = datetime.utcnow()
    last = current_user.last_streak_freeze_at
    cooldown = timedelta(days=STREAK_FREEZE_COOLDOWN_DAYS)
    if current_user.streak_freeze_active:
        raise HTTPException(status_code=400, detail="Streak freeze already active")
    if last and (now - last) < cooldown:
        raise HTTPException(
            status_code=400,
            detail=f"Streak freeze on cooldown until {last + cooldown}",
        )
    current_user.streak_freeze_active = True
    current_user.last_streak_freeze_at = now
    db.commit()
    return StreakFreezeStatus(
        active=True, available=False,
        next_available_at=now + cooldown,
    )


# ── Achievements ─────────────────────────────────────────────────────────────

class Achievement(BaseModel):
    id: str
    name: str
    description: str
    earned: bool
    progress: float = 0.0       # 0.0–1.0; 1.0 means earned

class AchievementsOut(BaseModel):
    achievements: list[Achievement]
    earned_count: int
    total_count: int


def _compute_achievements(db: Session, user: models.User) -> list[Achievement]:
    """All achievements derive from existing aggregates — no new tables."""
    pred_count = (
        db.query(func.count(models.Prediction.id))
        .filter(models.Prediction.user_id == user.id)
        .scalar() or 0
    )
    won = (
        db.query(func.count(models.Prediction.id))
        .filter(models.Prediction.user_id == user.id, models.Prediction.status == "won")
        .scalar() or 0
    )
    settled = (
        db.query(func.count(models.Prediction.id))
        .filter(models.Prediction.user_id == user.id, models.Prediction.status.in_(["won", "lost"]))
        .scalar() or 0
    )
    win_rate = (won / settled) if settled else 0.0

    # Crypto-specific predictions (joined through scenario.event)
    crypto_pred = (
        db.query(func.count(models.Prediction.id))
        .join(models.Scenario, models.Scenario.id == models.Prediction.scenario_id)
        .join(models.Event, models.Event.id == models.Scenario.event_id)
        .filter(models.Prediction.user_id == user.id, models.Event.category == "crypto")
        .scalar() or 0
    )

    streak = user.current_streak or 0
    best   = user.best_streak or 0
    xp     = user.xp or 0

    defs: list[tuple[str, str, str, float]] = [
        # id,                name,                       desc,                                                   progress 0-1
        ("first_prediction", "First Step",               "Place your first prediction.",                          min(1.0, pred_count / 1)),
        ("ten_predictions",  "Getting Warm",             "Place 10 predictions.",                                 min(1.0, pred_count / 10)),
        ("hundred_pred",     "Century",                  "Place 100 predictions.",                                min(1.0, pred_count / 100)),
        ("first_win",        "First Win",                "Win your first prediction.",                            min(1.0, won / 1)),
        ("sharp",            "Sharp",                    "Reach a 60%+ win rate over 20+ settled predictions.",   min(1.0, win_rate / 0.6) if settled >= 20 else 0.0),
        ("contrarian",       "Contrarian",               "Win a prediction you bought at <30% probability.",      0.0),  # set below
        ("crypto_hawk",      "Crypto Hawk",              "Place 25 predictions in crypto markets.",               min(1.0, crypto_pred / 25)),
        ("streak_3",         "On a Roll",                "Hit a 3-prediction win streak.",                        min(1.0, max(streak, best) / 3)),
        ("streak_7",         "Hot Streak",               "Hit a 7-prediction win streak.",                        min(1.0, max(streak, best) / 7)),
        ("level_5",          "Level 5",                  "Earn 750 XP.",                                          min(1.0, xp / 750)),
        ("level_10",         "Level 10",                 "Earn 3000 XP.",                                         min(1.0, xp / 3000)),
    ]

    # Contrarian — won a prediction bought below 30%.
    contrarian_hit = (
        db.query(func.count(models.Prediction.id))
        .filter(
            models.Prediction.user_id == user.id,
            models.Prediction.status == "won",
            models.Prediction.entry_probability < 30.0,
        )
        .scalar() or 0
    )
    defs = [
        (a, n, d, (1.0 if (a == "contrarian" and contrarian_hit > 0) else p))
        for (a, n, d, p) in defs
    ]

    return [
        Achievement(id=a, name=n, description=d, earned=(p >= 1.0), progress=p)
        for (a, n, d, p) in defs
    ]


@router.get("/me/achievements", response_model=AchievementsOut)
def get_my_achievements(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    items = _compute_achievements(db, current_user)
    return AchievementsOut(
        achievements=items,
        earned_count=sum(1 for x in items if x.earned),
        total_count=len(items),
    )


@router.get("/{user_id}/achievements", response_model=AchievementsOut)
def get_user_achievements(
    user_id: int,
    db: Session = Depends(get_db),
):
    """Public — used by profile share pages."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="User not found")
    items = _compute_achievements(db, user)
    return AchievementsOut(
        achievements=items,
        earned_count=sum(1 for x in items if x.earned),
        total_count=len(items),
    )