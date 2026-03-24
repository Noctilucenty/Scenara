from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.db import get_db
from app import models

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    currency: str
    balance: float
    account_type: str
    is_active: bool


class LeaderboardEntry(BaseModel):
    rank: int
    user_id: int
    email: str
    display_name: str
    balance: float
    total_pnl: float
    total_predictions: int
    won_count: int
    lost_count: int
    win_rate: float
    current_streak: int       # NEW
    best_streak: int          # NEW


class LeaderboardOut(BaseModel):
    entries: list[LeaderboardEntry]
    total_users: int


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/user/{user_id}", response_model=AccountOut)
def get_user_simulation_account(user_id: int, db: Session = Depends(get_db)):
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
    if not account:
        raise HTTPException(status_code=404, detail="Simulation account not found")

    return account


@router.get("/leaderboard", response_model=LeaderboardOut)
def get_leaderboard(
    db: Session = Depends(get_db),
    sort_by: str = Query(default="pnl", enum=["pnl", "balance", "win_rate"]),
    limit: int = Query(default=20, ge=1, le=100),
):
    accounts = (
        db.query(models.Account)
        .join(models.User, models.Account.user_id == models.User.id)
        .filter(
            models.Account.account_type == "simulation",
            models.Account.is_active.is_(True),
            models.User.is_active.is_(True),
        )
        .all()
    )

    entries: list[LeaderboardEntry] = []

    for account in accounts:
        predictions = (
            db.query(models.Prediction)
            .filter(models.Prediction.user_id == account.user_id)
            .all()
        )

        total_predictions = len(predictions)
        won_count = sum(1 for p in predictions if p.status == "won")
        lost_count = sum(1 for p in predictions if p.status == "lost")

        total_pnl = sum(
            float(p.pnl) for p in predictions
            if p.pnl is not None and p.status in ("won", "lost")
        )

        settled = won_count + lost_count
        win_rate = round((won_count / settled) * 100, 1) if settled > 0 else 0.0

        user = db.query(models.User).filter(
            models.User.id == account.user_id
        ).first()

        if not user:
            continue

        entries.append(
            LeaderboardEntry(
                rank=0,
                user_id=account.user_id,
                email=user.email,
                display_name=user.email.split("@")[0],
                balance=round(float(account.balance), 2),
                total_pnl=round(total_pnl, 2),
                total_predictions=total_predictions,
                won_count=won_count,
                lost_count=lost_count,
                win_rate=win_rate,
                current_streak=user.current_streak or 0,
                best_streak=user.best_streak or 0,
            )
        )

    # Sort
    if sort_by == "balance":
        entries.sort(key=lambda e: e.balance, reverse=True)
    elif sort_by == "win_rate":
        entries.sort(key=lambda e: (e.win_rate, e.won_count), reverse=True)
    else:
        entries.sort(key=lambda e: e.total_pnl, reverse=True)

    for i, entry in enumerate(entries):
        entry.rank = i + 1

    total_users = len(entries)
    entries = entries[:limit]

    return LeaderboardOut(entries=entries, total_users=total_users)