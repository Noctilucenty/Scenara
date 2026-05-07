"""
Prunes excess scenario_probability_history rows for resolved events.

Open events are never touched — their charts must stay fully live.
Resolved events are trimmed to KEEP_POINTS evenly-spaced snapshots so
charts still render a meaningful curve (first point, last point, and
N-2 evenly-distributed points between them).
"""

from __future__ import annotations

import logging
from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)

KEEP_POINTS = 50


def prune_resolved_event_history(db: Session) -> int:
    """
    Delete excess history rows for resolved-event scenarios.
    Returns number of rows deleted (0 if nothing to prune).
    """
    result = db.execute(text("""
        DELETE FROM scenario_probability_history
        USING (
            SELECT
                id,
                ROW_NUMBER() OVER (PARTITION BY scenario_id ORDER BY recorded_at ASC) AS rn,
                COUNT(*)    OVER (PARTITION BY scenario_id)                           AS total
            FROM scenario_probability_history
            WHERE scenario_id IN (
                SELECT s.id
                FROM scenarios s
                JOIN events e ON e.id = s.event_id
                WHERE e.status = 'resolved'
            )
        ) ranked
        WHERE scenario_probability_history.id = ranked.id
          AND ranked.total > :keep
          AND NOT (
                ranked.rn = 1
             OR ranked.rn = ranked.total
             OR (ranked.rn - 1) % GREATEST(1, (ranked.total / :keep)::int) = 0
          )
    """), {"keep": KEEP_POINTS})
    db.commit()
    deleted = result.rowcount or 0
    if deleted:
        logger.info("[HistoryPruner] Pruned %d stale probability-history rows.", deleted)
    return deleted
