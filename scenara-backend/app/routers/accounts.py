import random
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.db import get_db
from app import models
from app.routers.auth import get_current_user

router = APIRouter()

# ---------------------------------------------------------------------------
# Ghost-trader pool  (deterministic padding for an empty / sparse leaderboard)
# ---------------------------------------------------------------------------
# Each tuple: (display_name, base_balance, base_pnl, win_rate_pct, streak)
# Real values are perturbed by ±20 % using a seeded RNG so the same ghost
# always shows the same numbers — no flickering on each refresh.

_GHOST_TRADERS: list[tuple[str, float, float, float, int]] = [
    # ── US / Western handles ──────────────────────────────────────────────────
    ("BullHunter99",    13_450.0,  3_450.0, 68.5, 5),
    ("CryptoShark_NY",  11_820.0,  1_820.0, 61.2, 3),
    ("MarketWizard",    15_780.0,  5_780.0, 72.4, 7),
    ("WallStPhantom",   12_100.0,  2_100.0, 59.8, 2),
    ("TradeKing88",      9_340.0,   -660.0, 44.1, 0),
    ("QuantDragon",     14_220.0,  4_220.0, 70.0, 6),
    ("AlphaWave",       10_870.0,   870.0,  55.3, 1),
    ("DeepValueJoe",     8_910.0,  -1_090.0, 41.7, 0),
    ("NightOwlBets",    11_200.0,  1_200.0, 58.9, 2),
    ("SentinelX",       13_900.0,  3_900.0, 66.7, 4),
    # ── Brazil ───────────────────────────────────────────────────────────────
    ("LucasTrader",     12_680.0,  2_680.0, 63.0, 3),
    ("FerTrader_BR",    10_540.0,   540.0,  52.4, 1),
    ("CariocaWins",     14_050.0,  4_050.0, 69.8, 5),
    ("TauroBrasil",      9_720.0,   -280.0, 47.2, 0),
    ("NegociaBR",        8_430.0,  -1_570.0, 39.5, 0),
    # ── China ────────────────────────────────────────────────────────────────
    ("WangMarkets",     13_100.0,  3_100.0, 65.4, 4),
    ("ShanghaiQuant",   15_600.0,  5_600.0, 74.1, 8),
    ("DragonTrader_CN", 11_490.0,  1_490.0, 60.5, 2),
    ("LiAlpha",         12_340.0,  2_340.0, 62.7, 3),
    ("ZhangBull",       10_050.0,    50.0,  50.8, 1),
    # ── UK / Europe ──────────────────────────────────────────────────────────
    ("LondonFox",       13_670.0,  3_670.0, 67.3, 5),
    ("TechCityBets",    11_950.0,  1_950.0, 59.2, 2),
    ("BerlinQuant",     14_510.0,  4_510.0, 71.6, 6),
    ("ParisTrade",       9_880.0,   -120.0, 48.9, 0),
    ("MadridFX",        10_660.0,   660.0,  54.0, 1),
]

_GHOST_LEVEL_XP = [120, 200, 350, 500, 750, 900, 1100, 1400]  # xp per level index


def _build_ghost_entries() -> list["LeaderboardEntry"]:
    """Return a deterministic list of synthetic leaderboard entries.

    Each ghost uses a per-name seeded RNG so values never change between
    requests (no flickering).  user_id is negative so the frontend can gate
    follow / profile navigation for non-real users.
    """
    from app.services.xp import level_from_xp

    ghosts: list[LeaderboardEntry] = []
    for idx, (name, bal, pnl, wr, streak) in enumerate(_GHOST_TRADERS):
        rng = random.Random(hash(name) & 0xFF_FFFF)
        fuzz = 1.0 + rng.uniform(-0.18, 0.18)

        balance    = round(bal * fuzz, 2)
        total_pnl  = round(pnl * fuzz, 2)
        win_rate   = round(min(max(wr + rng.uniform(-5, 5), 25.0), 85.0), 1)
        cur_streak = max(0, streak + rng.randint(-1, 1))
        best_st    = cur_streak + rng.randint(0, 4)

        # Derive plausible prediction counts from win_rate + a fuzzy total
        total_preds = rng.randint(18, 90)
        settled     = int(total_preds * rng.uniform(0.7, 0.95))
        won         = int(settled * win_rate / 100)
        lost        = settled - won

        xp  = _GHOST_LEVEL_XP[min(streak, len(_GHOST_LEVEL_XP) - 1)]
        xp += rng.randint(0, 80)

        ghosts.append(LeaderboardEntry(
            rank=0,
            user_id=-(idx + 1),   # negative → synthetic, not a real profile
            email="",
            display_name=name,
            balance=balance,
            total_pnl=total_pnl,
            total_predictions=total_preds,
            won_count=won,
            lost_count=lost,
            win_rate=win_rate,
            current_streak=cur_streak,
            best_streak=best_st,
            is_following=False,
            follower_count=rng.randint(2, 40),
            xp=xp,
            level=level_from_xp(xp),
        ))
    return ghosts


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
    current_streak: int
    best_streak: int
    is_following: bool = False   # whether the calling user follows this one
    follower_count: int = 0      # for "popular trader" sorting later
    level: int = 1               # derived from user.xp via sqrt curve
    xp: int = 0


class LeaderboardOut(BaseModel):
    entries: list[LeaderboardEntry]
    total_users: int


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/user/{user_id}", response_model=AccountOut)
def get_user_simulation_account(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Only the account owner or an admin may view account details.
    if current_user.id != user_id and not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorised to view this account",
        )

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
    viewer_id: Optional[int] = Query(default=None, description="If provided, returns is_following per row"),
):
    from sqlalchemy import func, case
    from app.models import UserFollow

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

    total_pnl_col = func.coalesce(pred_agg.c.total_pnl, 0.0).label("total_pnl")
    balance_col = models.Account.balance
    won_count_col = func.coalesce(pred_agg.c.won_count, 0).label("won_count")
    lost_count_col = func.coalesce(pred_agg.c.lost_count, 0).label("lost_count")

    base_q = (
        db.query(
            models.User.id,
            models.User.email,
            models.User.display_name,
            models.User.current_streak,
            models.User.best_streak,
            models.User.xp,
            balance_col,
            func.coalesce(pred_agg.c.total_predictions, 0).label("total_predictions"),
            won_count_col,
            lost_count_col,
            total_pnl_col,
        )
        .join(models.Account, models.Account.user_id == models.User.id)
        .outerjoin(pred_agg, pred_agg.c.user_id == models.User.id)
        .filter(
            models.Account.account_type == "simulation",
            models.Account.is_active.is_(True),
            models.User.is_active.is_(True),
        )
    )

    if sort_by == "balance":
        base_q = base_q.order_by(models.Account.balance.desc())
    elif sort_by == "win_rate":
        base_q = base_q.order_by(
            func.coalesce(pred_agg.c.won_count, 0).desc(),
        )
    else:
        base_q = base_q.order_by(func.coalesce(pred_agg.c.total_pnl, 0.0).desc())

    rows = base_q.all()

    from app.services.xp import level_from_xp
    entries = []
    for row in rows:
        settled = (row.won_count or 0) + (row.lost_count or 0)
        win_rate = round(((row.won_count or 0) / settled) * 100, 1) if settled > 0 else 0.0
        user_xp = int(row.xp or 0)
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
            xp=user_xp,
            level=level_from_xp(user_xp),
        ))

    # win_rate sort requires Python-side re-sort (depends on two columns: win_rate + won_count)
    if sort_by == "win_rate":
        entries.sort(key=lambda e: (e.win_rate, e.won_count), reverse=True)

    # Pad with ghost traders so the leaderboard always looks populated.
    # Only add as many ghosts as needed to reach `limit`; never show more
    # ghost entries than real ones when there are already enough real users.
    if len(entries) < limit:
        ghosts = _build_ghost_entries()
        # Sort ghost pool by the same metric as real entries
        if sort_by == "balance":
            ghosts.sort(key=lambda e: e.balance, reverse=True)
        elif sort_by == "win_rate":
            ghosts.sort(key=lambda e: (e.win_rate, e.won_count), reverse=True)
        else:
            ghosts.sort(key=lambda e: e.total_pnl, reverse=True)
        # Merge: interleave ghosts into the real list by the sort key so rankings
        # look natural rather than "all real users, then all ghosts".
        combined = entries + ghosts
        if sort_by == "balance":
            combined.sort(key=lambda e: e.balance, reverse=True)
        elif sort_by == "win_rate":
            combined.sort(key=lambda e: (e.win_rate, e.won_count), reverse=True)
        else:
            combined.sort(key=lambda e: e.total_pnl, reverse=True)
        entries = combined

    for i, entry in enumerate(entries):
        entry.rank = i + 1

    total_users = len(entries)
    entries = entries[:limit]

    # Decorate with social data (follower count, is_following) — only for the
    # trimmed top-N to keep it cheap. Two aggregate queries + one conditional.
    top_ids = [e.user_id for e in entries]
    if top_ids:
        fc_rows = (
            db.query(UserFollow.followee_id, func.count(UserFollow.id))
            .filter(UserFollow.followee_id.in_(top_ids))
            .group_by(UserFollow.followee_id)
            .all()
        )
        fc_map = {uid: int(cnt) for uid, cnt in fc_rows}

        following_set: set[int] = set()
        if viewer_id is not None:
            following_set = {
                r[0] for r in db.query(UserFollow.followee_id)
                .filter(
                    UserFollow.follower_id == viewer_id,
                    UserFollow.followee_id.in_(top_ids),
                ).all()
            }

        for e in entries:
            e.follower_count = fc_map.get(e.user_id, 0)
            e.is_following = e.user_id in following_set

    return LeaderboardOut(entries=entries, total_users=total_users)