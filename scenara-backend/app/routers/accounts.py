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
# Hand-crafted ghost users — realistic handles from a global community.
# Deliberately diverse: different regions, naming styles, no bot tropes.
_GHOST_NAMED: list[tuple[str, float, float, float, int]] = [
    # display_name,     base_balance,  base_pnl,   win_rate%, streak
    # ── Americas ────────────────────────────────────────────────────────────
    ("sofia_v",         13_450.0,  3_450.0, 68.5, 5),
    ("lucas_b",         11_820.0,  1_820.0, 61.2, 3),
    ("ana.m",           15_780.0,  5_780.0, 72.4, 7),
    ("gabriel_r",       12_100.0,  2_100.0, 59.8, 2),
    ("camila_sp",        9_340.0,   -660.0, 44.1, 0),
    ("james_t",         14_220.0,  4_220.0, 70.0, 6),
    ("emma_w",          10_870.0,   870.0,  55.3, 1),
    ("ryan_m",           8_910.0, -1_090.0, 41.7, 0),
    ("sarah.b",         11_200.0,  1_200.0, 58.9, 2),
    ("pedro_a",         13_900.0,  3_900.0, 66.7, 4),
    # ── Brazil ──────────────────────────────────────────────────────────────
    ("beatriz_c",       12_680.0,  2_680.0, 63.0, 3),
    ("mateus_r",        10_540.0,   540.0,  52.4, 1),
    ("julia.a",         14_050.0,  4_050.0, 69.8, 5),
    ("thiago_b",         9_720.0,   -280.0, 47.2, 0),
    ("leticia_m",        8_430.0, -1_570.0, 39.5, 0),
    # ── East Asia ───────────────────────────────────────────────────────────
    ("wei_y",           13_100.0,  3_100.0, 65.4, 4),
    ("xia_l",           15_600.0,  5_600.0, 74.1, 8),
    ("ming.z",          11_490.0,  1_490.0, 60.5, 2),
    ("yuna_j",          12_340.0,  2_340.0, 62.7, 3),
    ("ryo_m",           10_050.0,    50.0,  50.8, 1),
    # ── Europe ──────────────────────────────────────────────────────────────
    ("marie_f",         13_670.0,  3_670.0, 67.3, 5),
    ("henrik_s",        11_950.0,  1_950.0, 59.2, 2),
    ("marco_g",         14_510.0,  4_510.0, 71.6, 6),
    ("nina_n",           9_880.0,   -120.0, 48.9, 0),
    ("carlos_e",        10_660.0,   660.0,  54.0, 1),
    # ── South & Southeast Asia ──────────────────────────────────────────────
    ("priya_s",         14_800.0,  4_800.0, 71.0, 6),
    ("arjun_d",         13_220.0,  3_220.0, 66.0, 4),
    ("omar_k",          12_050.0,  2_050.0, 61.5, 3),
    ("kai_nz",          10_780.0,   780.0,  54.8, 1),
    ("aisha_r",          9_560.0,   -440.0, 46.3, 0),
]

# Procedural name components — first names + suffix patterns that look human.
_PROC_FIRST = [
    "alex", "mia",  "jake", "zara", "noah", "lena", "omar", "ines",
    "eli",  "nora", "ivan", "vera", "tao",  "rita", "sven", "luna",
    "nico", "jade", "rafa", "dana", "leon", "alba", "finn", "yuki",
    "drew", "zoe",  "hugo", "ada",  "cole", "iris",
]
_PROC_SUFFIX = [
    "_k",  "_m",  "_r",  "_v",  "_p",  "_h",  "_w",  "_d",
    ".t",  ".s",  ".j",  ".c",  ".l",  ".n",  ".b",  ".a",
    "42",  "88",  "21",  "77",  "99",  "007", "x",
]

_GHOST_LEVEL_XP = [120, 200, 350, 500, 750, 900, 1100, 1400]
_GHOST_POOL_SIZE = 300   # maximum ghost traders available


def _ghost_name(idx: int) -> str:
    """Deterministic unique name for procedural ghost slot `idx`.

    Combines a first-name with a short suffix (initial, number, dot-initial)
    so the result looks like a real person's handle, not a trading bot.
    """
    n_first = len(_PROC_FIRST)
    n_suf   = len(_PROC_SUFFIX)
    suf_i   = idx % n_suf
    first_i = (idx // n_suf) % n_first
    return f"{_PROC_FIRST[first_i]}{_PROC_SUFFIX[suf_i]}"


def _build_ghost_entries(n: int = _GHOST_POOL_SIZE) -> list["LeaderboardEntry"]:
    """Return exactly `n` deterministic synthetic leaderboard entries.

    The first len(_GHOST_NAMED) slots use hand-crafted names; remaining slots
    are generated procedurally.  All stats are seeded by name hash so they
    never change between requests.  user_id is negative to signal synthetic.
    """
    from app.services.xp import level_from_xp

    ghosts: list[LeaderboardEntry] = []

    # 1. Hand-crafted entries (highest quality names)
    for idx, (name, bal, pnl, wr, streak) in enumerate(_GHOST_NAMED[:n]):
        rng = random.Random(hash(name) & 0xFF_FFFF)
        fuzz = 1.0 + rng.uniform(-0.18, 0.18)
        balance   = round(bal * fuzz, 2)
        total_pnl = round(pnl * fuzz, 2)
        win_rate  = round(min(max(wr + rng.uniform(-5, 5), 25.0), 85.0), 1)
        cur_str   = max(0, streak + rng.randint(-1, 1))
        best_str  = cur_str + rng.randint(0, 4)
        total_p   = rng.randint(18, 90)
        settled   = int(total_p * rng.uniform(0.7, 0.95))
        won       = int(settled * win_rate / 100)
        xp        = _GHOST_LEVEL_XP[min(streak, len(_GHOST_LEVEL_XP) - 1)] + rng.randint(0, 80)
        ghosts.append(LeaderboardEntry(
            rank=0, user_id=-(idx + 1), email="",
            display_name=name,
            balance=balance, total_pnl=total_pnl,
            total_predictions=total_p,
            won_count=won, lost_count=settled - won,
            win_rate=win_rate,
            current_streak=cur_str, best_streak=best_str,
            is_following=False, follower_count=rng.randint(2, 40),
            xp=xp, level=level_from_xp(xp),
        ))

    # 2. Procedural entries to fill remaining slots
    named_count = len(_GHOST_NAMED)
    for slot in range(n - named_count):
        idx  = named_count + slot
        name = _ghost_name(slot)
        rng  = random.Random(hash(name) & 0xFF_FFFF)
        # Procedural ghosts cluster around the middle of the leaderboard
        # (balance ~$9k–$12k, pnl –$1k to +$2k, win_rate 40–65%)
        balance   = round(rng.uniform(7_500, 13_500), 2)
        total_pnl = round(rng.uniform(-2_000, 3_500), 2)
        win_rate  = round(rng.uniform(35.0, 68.0), 1)
        cur_str   = rng.randint(0, 5)
        best_str  = cur_str + rng.randint(0, 6)
        total_p   = rng.randint(10, 120)
        settled   = int(total_p * rng.uniform(0.6, 0.95))
        won       = int(settled * win_rate / 100)
        xp        = rng.randint(50, 900)
        ghosts.append(LeaderboardEntry(
            rank=0, user_id=-(idx + 1), email="",
            display_name=name,
            balance=balance, total_pnl=total_pnl,
            total_predictions=total_p,
            won_count=won, lost_count=settled - won,
            win_rate=win_rate,
            current_streak=cur_str, best_streak=best_str,
            is_following=False, follower_count=rng.randint(0, 25),
            xp=xp, level=level_from_xp(xp),
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
    limit: int = Query(default=20, ge=1, le=300),
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
        ghosts = _build_ghost_entries(limit)
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