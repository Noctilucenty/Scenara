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
    from sqlalchemy import func, case

    # Single query: aggregate predictions per user
    pred_agg = (
        db.query(
            models.Prediction.user_id,
            func.count(models.Prediction.id).label("total_predictions"),
            func.sum(case((models.Prediction.status == "won", 1), else_=0)).label("won_count"),
            func.sum(case((models.Prediction.status == "lost", 1), else_=0)).label("lost_count"),
            func.sum(
                case(
                    (models.Prediction.status.in_(["won", "lost"]), models.Prediction.pnl),
                    else_=0,
                )
            ).label("total_pnl"),
        )
        .group_by(models.Prediction.user_id)
        .subquery()
    )

    rows = (
        db.query(
            models.User.id,
            models.User.email,
            models.User.display_name,
            models.User.current_streak,
            models.User.best_streak,
            models.Account.balance,
            func.coalesce(pred_agg.c.total_predictions, 0).label("total_predictions"),
            func.coalesce(pred_agg.c.won_count, 0).label("won_count"),
            func.coalesce(pred_agg.c.lost_count, 0).label("lost_count"),
            func.coalesce(pred_agg.c.total_pnl, 0.0).label("total_pnl"),
        )
        .join(models.Account, models.Account.user_id == models.User.id)
        .outerjoin(pred_agg, pred_agg.c.user_id == models.User.id)
        .filter(
            models.Account.account_type == "simulation",
            models.Account.is_active.is_(True),
            models.User.is_active.is_(True),
        )
        .all()
    )

    entries = []
    for row in rows:
        settled = (row.won_count or 0) + (row.lost_count or 0)
        win_rate = round(((row.won_count or 0) / settled) * 100, 1) if settled > 0 else 0.0
        entries.append(LeaderboardEntry(
            rank=0,
            user_id=row.id,
            email=row.email,
            display_name=row.display_name or row.email.split("@")[0],
            balance=round(float(row.balance), 2),
            total_pnl=round(float(row.total_pnl or 0), 2),
            total_predictions=row.total_predictions or 0,
            won_count=row.won_count or 0,
            lost_count=row.lost_count or 0,
            win_rate=win_rate,
            current_streak=row.current_streak or 0,
            best_streak=row.best_streak or 0,
        ))

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