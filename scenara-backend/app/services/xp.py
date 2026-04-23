"""
XP + level helpers.

Shared by `predictions.py` (awarding) and anywhere we need to expose the
current level to the frontend (portfolio, leaderboard, social profile).

Design notes
------------
- XP is awarded ONLY at prediction creation, not at settlement. Awarding on
  settlement would reward winners twice (PnL + XP) and leave losers feeling
  punished for participating. XP measures *engagement*, not skill.
- A bet of $5 = 1 XP; $50 = 10 XP; $250 = 50 XP.  Anything under $5 earns 0,
  which prevents dust-farming.
- Level curve is square-root: level = 1 + floor(sqrt(xp / 100)).
    L1 = 0 XP
    L2 = 100 XP
    L3 = 400 XP
    L5 = 1600 XP
    L10 = 8100 XP
  Early levels feel fast, later levels feel earned — typical RPG pacing.
"""
from __future__ import annotations

import math


# Tunables — keep in one place so we can tweak without hunting through routes.
XP_PER_DOLLAR = 1 / 5          # $1 → 0.2 XP (rounded down)
MIN_DOLLARS_FOR_XP = 5         # bets under this award nothing
LEVEL_XP_BASE = 100            # curve divisor


def xp_for_bet(dollar_amount: float) -> int:
    """Return how much XP this bet awards. Never negative."""
    if dollar_amount < MIN_DOLLARS_FOR_XP:
        return 0
    return max(0, int(dollar_amount * XP_PER_DOLLAR))


def level_from_xp(xp: int | None) -> int:
    """
    Compute the user's display level from total XP.

    L = 1 + floor(sqrt(xp / 100))
    """
    if not xp or xp <= 0:
        return 1
    return 1 + int(math.sqrt(xp / LEVEL_XP_BASE))


def xp_needed_for_next_level(xp: int | None) -> int:
    """How many XP until the next level-up."""
    current = level_from_xp(xp)
    # Solve: sqrt(next_xp / 100) >= current  →  next_xp >= current^2 * 100
    next_threshold = (current ** 2) * LEVEL_XP_BASE
    return max(0, next_threshold - int(xp or 0))
