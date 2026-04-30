"""
app/routers/social.py

Social-graph endpoints: follow/unfollow other traders, list followers/following,
fetch a public trader profile (stats visible to everyone), and a personalized
"feed" of recent bets from the users you follow.

All endpoints that mutate state require an authenticated user; read endpoints
are public-ish (still require auth so we can surface is_following correctly).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, case
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import (
    User, UserFollow, Prediction, Scenario, Event, Account,
)
from app.routers.auth import get_current_user
from app.services.notifications import notify_new_follower

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class TraderCard(BaseModel):
    """Lightweight row for follower/following lists and suggestions."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_name: str
    email_prefix: str           # first part of email before @, as a fallback handle
    is_following: bool = False  # whether the requesting user follows this user
    follower_count: int = 0
    total_pnl: float = 0.0
    win_rate: float = 0.0
    current_streak: int = 0


class TraderProfile(BaseModel):
    """Full public profile returned by GET /social/users/{id}."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_name: str
    email_prefix: str
    created_at: datetime
    is_following: bool
    is_self: bool
    follower_count: int
    following_count: int
    # Stats
    balance: float
    total_pnl: float
    total_bets: int
    winning_bets: int
    win_rate: float
    current_streak: int
    best_streak: int
    # Gamification
    level: int = 1
    xp: int = 0


class FeedItem(BaseModel):
    """One bet from someone you follow, for the Following feed."""
    user_id: int
    display_name: str
    event_id: int
    event_title: str
    scenario_title: str
    amount: float
    created_at: datetime


class FollowResponse(BaseModel):
    ok: bool
    following: bool
    follower_count: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _email_prefix(user: User) -> str:
    try:
        return (user.email or "").split("@", 1)[0][:24]
    except Exception:
        return ""


def _user_stats_map(db: Session, user_ids: list[int]) -> dict[int, dict]:
    """One-shot per-user prediction stats for a list of user_ids.

    Returns: {user_id: {total_bets, winning_bets, win_rate, total_pnl}}
    """
    if not user_ids:
        return {}

    # Aggregate settled predictions only so win_rate is meaningful.
    rows = (
        db.query(
            Prediction.user_id.label("uid"),
            func.count(Prediction.id).label("total"),
            func.sum(case((Prediction.status == "won", 1), else_=0)).label("wins"),
            func.coalesce(func.sum(Prediction.pnl), 0.0).label("pnl"),
        )
        .filter(Prediction.user_id.in_(user_ids))
        .group_by(Prediction.user_id)
        .all()
    )
    out: dict[int, dict] = {uid: {"total_bets": 0, "winning_bets": 0, "win_rate": 0.0, "total_pnl": 0.0} for uid in user_ids}
    for r in rows:
        total = int(r.total or 0)
        wins = int(r.wins or 0)
        out[r.uid] = {
            "total_bets": total,
            "winning_bets": wins,
            "win_rate": (wins / total * 100.0) if total > 0 else 0.0,
            "total_pnl": float(r.pnl or 0.0),
        }
    return out


def _follower_counts(db: Session, user_ids: list[int]) -> dict[int, int]:
    if not user_ids:
        return {}
    rows = (
        db.query(UserFollow.followee_id, func.count(UserFollow.id))
        .filter(UserFollow.followee_id.in_(user_ids))
        .group_by(UserFollow.followee_id)
        .all()
    )
    return {uid: 0 for uid in user_ids} | {uid: int(cnt) for uid, cnt in rows}


def _followees_of(db: Session, follower_id: int, among: list[int]) -> set[int]:
    """Which of `among` does follower_id follow? Small set for is_following flags."""
    if not among:
        return set()
    rows = (
        db.query(UserFollow.followee_id)
        .filter(UserFollow.follower_id == follower_id, UserFollow.followee_id.in_(among))
        .all()
    )
    return {r[0] for r in rows}


# ── Follow / Unfollow ─────────────────────────────────────────────────────────

@router.post("/users/{user_id}/follow", response_model=FollowResponse)
def follow_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    existing = (
        db.query(UserFollow)
        .filter(
            UserFollow.follower_id == current_user.id,
            UserFollow.followee_id == user_id,
        )
        .first()
    )
    if not existing:
        db.add(UserFollow(follower_id=current_user.id, followee_id=user_id))
        db.commit()
        notify_new_follower(
            target_user_id=user_id,
            follower_display_name=current_user.display_name or current_user.email.split("@")[0],
            follower_id=current_user.id,
        )

    follower_count = (
        db.query(func.count(UserFollow.id))
        .filter(UserFollow.followee_id == user_id)
        .scalar()
    ) or 0
    return FollowResponse(ok=True, following=True, follower_count=int(follower_count))


@router.delete("/users/{user_id}/follow", response_model=FollowResponse)
def unfollow_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(UserFollow).filter(
        UserFollow.follower_id == current_user.id,
        UserFollow.followee_id == user_id,
    ).delete(synchronize_session=False)
    db.commit()
    follower_count = (
        db.query(func.count(UserFollow.id))
        .filter(UserFollow.followee_id == user_id)
        .scalar()
    ) or 0
    return FollowResponse(ok=True, following=False, follower_count=int(follower_count))


# ── Profile ───────────────────────────────────────────────────────────────────

@router.get("/users/{user_id}", response_model=TraderProfile)
def get_trader_profile(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    is_self = user.id == current_user.id
    is_following = False
    if not is_self:
        is_following = db.query(UserFollow).filter(
            UserFollow.follower_id == current_user.id,
            UserFollow.followee_id == user.id,
        ).first() is not None

    follower_count = db.query(func.count(UserFollow.id)).filter(UserFollow.followee_id == user.id).scalar() or 0
    following_count = db.query(func.count(UserFollow.id)).filter(UserFollow.follower_id == user.id).scalar() or 0

    # Balance from primary simulation account only (not aggregated across all account types)
    balance = (
        db.query(func.coalesce(func.sum(Account.balance), 0.0))
        .filter(
            Account.user_id == user.id,
            Account.account_type == "simulation",
            Account.is_active.is_(True),
        )
        .scalar()
    ) or 0.0

    stats = _user_stats_map(db, [user.id]).get(user.id, {})

    from app.services.xp import level_from_xp
    user_xp = int(user.xp or 0)
    return TraderProfile(
        id=user.id,
        display_name=user.display_name or _email_prefix(user),
        email_prefix=_email_prefix(user),
        created_at=user.created_at,
        is_following=is_following,
        is_self=is_self,
        follower_count=int(follower_count),
        following_count=int(following_count),
        balance=float(balance),
        total_pnl=float(stats.get("total_pnl", 0.0)),
        total_bets=int(stats.get("total_bets", 0)),
        winning_bets=int(stats.get("winning_bets", 0)),
        win_rate=float(stats.get("win_rate", 0.0)),
        current_streak=int(user.current_streak or 0),
        best_streak=int(user.best_streak or 0),
        xp=user_xp,
        level=level_from_xp(user_xp),
    )


# ── Followers / Following lists ───────────────────────────────────────────────

@router.get("/users/{user_id}/followers", response_model=list[TraderCard])
def get_followers(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
):
    rows = (
        db.query(UserFollow)
        .filter(UserFollow.followee_id == user_id)
        .order_by(UserFollow.created_at.desc())
        .limit(limit)
        .all()
    )
    follower_ids = [r.follower_id for r in rows]
    return _cards_for(db, follower_ids, current_user.id)


@router.get("/users/{user_id}/following", response_model=list[TraderCard])
def get_following(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
):
    rows = (
        db.query(UserFollow)
        .filter(UserFollow.follower_id == user_id)
        .order_by(UserFollow.created_at.desc())
        .limit(limit)
        .all()
    )
    followee_ids = [r.followee_id for r in rows]
    return _cards_for(db, followee_ids, current_user.id)


def _cards_for(db: Session, user_ids: list[int], viewer_id: int) -> list[TraderCard]:
    if not user_ids:
        return []
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    user_map = {u.id: u for u in users}
    stats_map = _user_stats_map(db, user_ids)
    follower_counts = _follower_counts(db, user_ids)
    following_set = _followees_of(db, viewer_id, user_ids)
    # Preserve the order user_ids came in so the list reflects "most recent follow first"
    cards: list[TraderCard] = []
    for uid in user_ids:
        u = user_map.get(uid)
        if not u:
            continue
        s = stats_map.get(uid, {})
        cards.append(TraderCard(
            id=u.id,
            display_name=u.display_name or _email_prefix(u),
            email_prefix=_email_prefix(u),
            is_following=(uid in following_set),
            follower_count=follower_counts.get(uid, 0),
            total_pnl=float(s.get("total_pnl", 0.0)),
            win_rate=float(s.get("win_rate", 0.0)),
            current_streak=int(u.current_streak or 0),
        ))
    return cards


# ── Suggested traders (top of leaderboard minus ones you already follow) ──────

@router.get("/suggested", response_model=list[TraderCard])
def suggested_traders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(default=10, ge=1, le=50),
):
    """Return top traders by realized PnL that the viewer isn't already following."""
    already_following = {
        r[0] for r in db.query(UserFollow.followee_id)
        .filter(UserFollow.follower_id == current_user.id).all()
    }
    already_following.add(current_user.id)  # don't suggest self

    # Top PnL users
    pnl_rows = (
        db.query(
            Prediction.user_id.label("uid"),
            func.coalesce(func.sum(Prediction.pnl), 0.0).label("pnl"),
        )
        .group_by(Prediction.user_id)
        .order_by(func.coalesce(func.sum(Prediction.pnl), 0.0).desc())
        .limit(limit * 4)  # overfetch to filter
        .all()
    )
    ranked = [int(r.uid) for r in pnl_rows if int(r.uid) not in already_following][:limit]
    return _cards_for(db, ranked, current_user.id)


# ── Following feed ────────────────────────────────────────────────────────────

@router.get("/feed", response_model=list[FeedItem])
def get_following_feed(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(default=30, ge=1, le=100),
):
    """Recent bets from users you follow, newest first, last 7 days."""
    cutoff = datetime.utcnow() - timedelta(days=7)

    followee_ids = [
        r[0] for r in db.query(UserFollow.followee_id)
        .filter(UserFollow.follower_id == current_user.id).all()
    ]
    if not followee_ids:
        return []

    preds = (
        db.query(Prediction)
        .options(
            joinedload(Prediction.user),
            joinedload(Prediction.scenario).joinedload(Scenario.event),
        )
        .filter(
            Prediction.user_id.in_(followee_ids),
            Prediction.created_at >= cutoff,
        )
        .order_by(Prediction.created_at.desc())
        .limit(limit)
        .all()
    )

    items: list[FeedItem] = []
    for p in preds:
        if not p.user or not p.scenario or not p.scenario.event:
            continue
        items.append(FeedItem(
            user_id=p.user.id,
            display_name=p.user.display_name or _email_prefix(p.user),
            event_id=p.scenario.event.id,
            event_title=p.scenario.event.title[:80],
            scenario_title=p.scenario.title[:40],
            amount=float(p.simulated_amount),
            created_at=p.created_at,
        ))
    return items
