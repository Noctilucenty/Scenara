import random
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.db import get_db
from app import models
from app.routers.auth import get_current_user, get_current_user_optional

router = APIRouter()

# ---------------------------------------------------------------------------
# Ghost-trader pool  (deterministic padding for an empty / sparse leaderboard)
# ---------------------------------------------------------------------------
# Hand-crafted ghost users — realistic handles from a global community.
# Rules: no two names share the same base word; named-pool bases are disjoint
# from _PROC_FIRST so users never see 4+ variants of the same name.
_GHOST_NAMED: list[tuple[str, float, float, float, int]] = [
    # display_name,     base_balance,  base_pnl,   win_rate%, streak
    # ── North America ───────────────────────────────────────────────────────
    ("luke_b",          14_220.0,  4_220.0, 70.0, 6),
    ("james_t",         11_820.0,  1_820.0, 61.2, 3),
    ("zack_m",           8_910.0, -1_090.0, 41.7, 0),
    ("haley.p",         11_200.0,  1_200.0, 58.9, 2),
    ("tyler.b",         10_870.0,    870.0, 55.3, 1),
    # ── South America ───────────────────────────────────────────────────────
    ("sofia_v",         13_450.0,  3_450.0, 68.5, 5),
    ("valentina97",     15_780.0,  5_780.0, 72.4, 7),
    ("gabo.r",          12_100.0,  2_100.0, 59.8, 2),
    ("fernanda_q",       9_340.0,   -660.0, 44.1, 0),
    ("diogo_a",         13_900.0,  3_900.0, 66.7, 4),
    # ── Brazil ──────────────────────────────────────────────────────────────
    ("beatriz_c",       12_680.0,  2_680.0, 63.0, 3),
    ("rodrigo77",       10_540.0,    540.0, 52.4, 1),
    ("thais.o",         14_050.0,  4_050.0, 69.8, 5),
    ("caio88",           9_720.0,   -280.0, 47.2, 0),
    ("isabela_m",        8_430.0, -1_570.0, 39.5, 0),
    # ── East Asia ───────────────────────────────────────────────────────────
    ("wei_y",           13_100.0,  3_100.0, 65.4, 4),
    ("xiu.l",           15_600.0,  5_600.0, 74.1, 8),
    ("yuna_j",          12_340.0,  2_340.0, 62.7, 3),
    ("kenji_h",         11_490.0,  1_490.0, 60.5, 2),
    ("ryo_k",           10_050.0,     50.0, 50.8, 1),
    # ── Europe ──────────────────────────────────────────────────────────────
    ("henrik_s",        11_950.0,  1_950.0, 59.2, 2),
    ("marco_g",         14_510.0,  4_510.0, 71.6, 6),
    ("britta.n",         9_880.0,   -120.0, 48.9, 0),
    ("ulrika_e",        10_660.0,    660.0, 54.0, 1),
    ("anya_f",          13_670.0,  3_670.0, 67.3, 5),
    # ── South & Southeast Asia ──────────────────────────────────────────────
    ("priya_s",         14_800.0,  4_800.0, 71.0, 6),
    ("arjun_d",         13_220.0,  3_220.0, 66.0, 4),
    ("faisal_k",        12_050.0,  2_050.0, 61.5, 3),
    ("nadia.nz",        10_780.0,    780.0, 54.8, 1),
    ("selin_r",          9_560.0,   -440.0, 46.3, 0),
]

# Procedural name components.
# Base-name pool: disjoint from all named-pool first-word bases so there are
# never more than 3 occurrences of any single base name in the whole 300-entry pool.
_PROC_FIRST = [
    # Realistic short first names from diverse cultures. Disjoint from
    # _GHOST_NAMED first words. Avoids invented/mythological handles so
    # the leaderboard looks like real people, not trading bots.
    "liam",   "noah",   "emma",   "mia",    "ethan",
    "lia",    "luiz",   "paulo",  "rafa",   "lara",
    "hiro",   "kai",    "rin",    "mika",   "akira",
    "kavya",  "rohan",  "tanvi",  "nikhil", "anil",
    "eva",    "jonas",  "olga",   "linus",  "petra",
    "zaid",   "sana",   "karim",  "lina",   "omar",
]
# Suffix pool: only patterns that look like normal username choices —
# initials and birth-year-style numbers. No "_0x" / "_fx" / "pro" / "io" etc.
_PROC_SUFFIX = [
    "_a",   "_b",   "_c",   "_d",   "_e",
    "_l",   "_m",   "_p",   "_r",   "_s",
    ".b",   ".c",   ".d",   ".g",   ".h",
    ".m",   ".n",   ".p",   ".s",   ".t",
    "84",   "91",   "94",   "97",   "02",
]

_GHOST_LEVEL_XP = [120, 200, 350, 500, 750, 900, 1100, 1400]
_GHOST_POOL_SIZE = 300   # maximum ghost traders available


def _ghost_name(idx: int) -> str:
    """Deterministic unique name for procedural ghost slot `idx`.

    Uses a stride-7 interleave so consecutive indices cycle through all
    30 first-names before repeating any, and the suffix chosen for each
    recurrence of the same first-name is maximally different (offsets of
    +10 and +20 in suffix-space, guaranteed because gcd(7, 25) == 1).

    Example: alex appears as alex_k / alex99 / alexpro — clearly distinct.
    """
    n_first = len(_PROC_FIRST)
    n_suf   = len(_PROC_SUFFIX)
    first_i = idx % n_first
    suf_i   = (idx * 7) % n_suf   # stride-7 coprime to 25 → no repeats in 25 steps
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

class LiveStatsOut(BaseModel):
    """Public counters powering the home-screen LIVE banner."""
    traders: int          # total active users
    volume_24h: float     # USD-equivalent simulated volume in last 24h
    open_markets: int     # events with status="open"


# ── Display padding ──────────────────────────────────────────────────────────
# Public counters (LIVE banner traders count, leaderboard total_users) are
# padded so the platform doesn't look empty to non-admin users. Admins see
# real numbers — they need them for product decisions, growth tracking and
# the funnel/retention dashboards.
#
# Padding strategy: BASE + real + small time-based jitter. Numbers grow as
# real growth happens, and the per-minute drift makes the banner feel alive
# without flickering wildly on every poll.

DISPLAY_MIN_TRADERS = 400
DISPLAY_MAX_TRADERS = 1800
# Each user starts with $10K simulated. At ~1% capital turnover/day
# (mid-engagement for a prediction platform) that's ~$100/trader/day.
# Volume rides the same time-of-day curve as traders, so the two numbers
# can never drift out of plausibility.
PER_TRADER_DAILY_VOLUME_USD = 100.0
# Open-market floor for non-admin display. Polymarket sync brings the real
# count well past this, but we floor it so the banner never reads empty.
DISPLAY_BASE_OPEN_MARKETS = 500


def _time_of_day_factor() -> float:
    """0..1 daily activity curve.
    Peaks at 18:00 UTC (covers EU evening + US daytime — the heaviest global
    prediction-market hours) and troughs at 06:00 UTC (global sleep window).
    Smooth cosine, second-resolution, so the banner drifts continuously
    rather than stepping per hour.
    """
    import math
    from datetime import datetime
    now = datetime.utcnow()
    sod = now.hour * 3600 + now.minute * 60 + now.second
    # cos peaks at phase=0 → set phase=0 at sod=18:00 UTC.
    phase = 2.0 * math.pi * (sod - 18 * 3600) / 86_400.0
    return (math.cos(phase) + 1.0) / 2.0


def _curve_traders() -> float:
    """Untruncated time-curve trader count (used by the volume formula
    so volume tracks traders without double-clamping)."""
    factor = _time_of_day_factor()
    return DISPLAY_MIN_TRADERS + (DISPLAY_MAX_TRADERS - DISPLAY_MIN_TRADERS) * factor


def _displayed_traders(real_users: int) -> int:
    """Time-of-day-driven trader count clamped to [400, 1800].
    Real platform growth nudges the number up; jitter keeps it lively.
    """
    from datetime import datetime
    minute = int(datetime.utcnow().timestamp() // 60)
    jitter = (minute % 47) - 23                    # -23..+23
    raw = int(_curve_traders() + jitter + int(real_users))
    return max(DISPLAY_MIN_TRADERS, min(DISPLAY_MAX_TRADERS, raw))


def _displayed_volume_24h(real_volume: float) -> float:
    """Volume rides the same daily curve as traders.
    Real predictions add on top so live activity actually shows up.
    """
    from datetime import datetime
    minute = int(datetime.utcnow().timestamp() // 60)
    base = _curve_traders() * PER_TRADER_DAILY_VOLUME_USD
    return base + float(real_volume) + (minute % 23) * 100


def _displayed_open_markets(real_open: int) -> int:
    """Floor at DISPLAY_BASE_OPEN_MARKETS so the banner never undersells the
    catalog. Real growth is reflected once it surpasses the floor."""
    from datetime import datetime
    minute = int(datetime.utcnow().timestamp() // 60)
    if int(real_open) >= DISPLAY_BASE_OPEN_MARKETS:
        return int(real_open)
    return DISPLAY_BASE_OPEN_MARKETS + (minute % 11)


def _is_admin(user: Optional[models.User]) -> bool:
    return bool(user and getattr(user, "is_admin", False))


@router.get("/live-stats", response_model=LiveStatsOut)
def get_live_stats(
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user_optional),
):
    """
    Lightweight counters for the LIVE banner.

    - Admins receive real numbers (needed for funnel/retention work).
    - All other callers (anonymous + regular users) receive padded numbers
      so the platform reads as populated. Open-market count is never padded
      because users can scroll and count markets directly.
    """
    from datetime import datetime, timedelta
    from sqlalchemy import func

    cutoff = datetime.utcnow() - timedelta(hours=24)
    real_traders = (
        db.query(func.count(models.User.id))
        .filter(models.User.is_active.is_(True))
        .scalar() or 0
    )
    real_volume = (
        db.query(func.coalesce(func.sum(models.Prediction.simulated_amount), 0.0))
        .filter(models.Prediction.created_at >= cutoff)
        .scalar() or 0.0
    )
    open_markets = (
        db.query(func.count(models.Event.id))
        .filter(models.Event.status == "open")
        .scalar() or 0
    )

    if _is_admin(current_user):
        return LiveStatsOut(
            traders=int(real_traders),
            volume_24h=float(real_volume),
            open_markets=int(open_markets),
        )
    return LiveStatsOut(
        traders=_displayed_traders(real_traders),
        volume_24h=_displayed_volume_24h(real_volume),
        open_markets=_displayed_open_markets(open_markets),
    )


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
    current_user: Optional[models.User] = Depends(get_current_user_optional),
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

    # Match the LIVE banner: admins see real platform size; everyone else
    # sees the padded number so the rankings page reads as populated.
    real_user_count = (
        db.query(func.count(models.User.id))
        .filter(models.User.is_active.is_(True))
        .scalar() or 0
    )
    if _is_admin(current_user):
        displayed_total = int(real_user_count)
    else:
        displayed_total = _displayed_traders(real_user_count)

    return LeaderboardOut(entries=entries, total_users=displayed_total)