"""
app/services/event_generator.py
─────────────────────────────────────────────────────────────────────────────
LEGACY shim.  Previously contained ~2 400 lines of synthetic market generation
(STATIC_EVENTS templates, CoinGecko crypto bet generation, random-walk
probability snapshots).  All of that was deleted when Scenara switched to
Polymarket as its sole market source.

This file now exists only so old import paths in main.py and the admin
endpoint at routers/events.py keep working.  Every function below is a
thin wrapper around `app.services.polymarket_sync`.

If you're adding new market-source logic, edit polymarket_sync.py — not this.
"""
from __future__ import annotations

import logging

from app.services.polymarket_sync import (
    sync_markets_once,
    start_polymarket_sync_loop,
    _expire_old_events,  # noqa: F401  (re-exported for legacy callers)
)

logger = logging.getLogger(__name__)


async def run_event_generator() -> None:
    """Legacy entrypoint — was `run_event_generator()` in the old generator.

    Triggers one Polymarket sync pass: pulls fresh markets, refreshes
    probabilities on already-imported events, expires past-due events.
    """
    logger.info("[EventGenerator] (legacy entrypoint) → triggering Polymarket sync")
    await sync_markets_once()


async def run_snapshot() -> None:
    """No-op kept for backward compatibility.

    The old `run_snapshot()` walked all open events and nudged their
    probabilities with random Gaussian noise — a "fake liquidity" trick to
    make charts look alive.  Polymarket events have their probabilities
    refreshed from real market data on every sync pass, so this synthetic
    nudge is no longer wanted (it would actually *corrupt* real Polymarket
    probabilities with random walks).

    Kept as a callable no-op so the admin endpoint at main.py:/admin/snapshot
    doesn't 500 when invoked — it just logs and returns.
    """
    logger.info(
        "[Snapshot] no-op — Polymarket sync owns probability updates now. "
        "Trigger /admin/generate-events if you want a manual market refresh."
    )


async def start_scheduler() -> None:
    """Legacy entrypoint — was the every-5-min snapshot + every-60-min generator.

    Now runs the Polymarket sync loop on the 20-minute cadence.  Kept under
    the old name so main.py's existing `asyncio.create_task(start_scheduler())`
    keeps working without edits.
    """
    await start_polymarket_sync_loop(interval_seconds=20 * 60)
