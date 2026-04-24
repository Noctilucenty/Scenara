"""
Idempotent index creation — runs at startup, safe to re-run.

We already have single-column indexes on foreign keys (they come free from
the ForeignKey declarations) and a unique constraint on user_follows that
doubles as a composite index. This module adds the COMPOSITE and PARTIAL
indexes that accelerate our hot queries — the ones that currently do
seq scans because PostgreSQL can't efficiently combine multiple
single-column indexes for the WHERE + ORDER BY of our real queries.

Why not CREATE INDEX CONCURRENTLY:
  CONCURRENTLY can't run inside a transaction, and SQLAlchemy's
  engine.begin() implicitly opens one. For a free-tier Postgres with
  < 100K rows per table, the brief ACCESS EXCLUSIVE lock during a
  regular CREATE INDEX is a few milliseconds — acceptable. If we ever
  get to millions of rows, revisit with a proper maintenance window.

Dialect safety:
  Most syntax here (IF NOT EXISTS, partial indexes, DESC order) works
  on both SQLite (local dev) and PostgreSQL (Render). Anything
  Postgres-specific is gated on engine.dialect.name.
"""
from __future__ import annotations

import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)


# Each entry: (index_name, create_spec)
# create_spec goes AFTER "CREATE INDEX IF NOT EXISTS <name>" and includes
# the "ON <table> (...)" and any WHERE clause.
INDEXES: list[tuple[str, str]] = [
    # ── predictions ────────────────────────────────────────────────────────
    # Portfolio screen lists a user's predictions newest-first. Without this,
    # Postgres has to fetch all user_id matches and sort them.
    ("ix_predictions_user_created",
     "ON predictions (user_id, created_at DESC)"),

    # Settlement-history queries and the resolver job both scan by status.
    # Partial index keeps it small — only settled predictions get entries.
    ("ix_predictions_status_settled",
     "ON predictions (status, settled_at) WHERE status = 'settled'"),

    # Activity feed joins predictions to events and orders by created_at.
    # Helps the global recent-bets query on the markets screen.
    ("ix_predictions_created",
     "ON predictions (created_at DESC)"),

    # ── events ─────────────────────────────────────────────────────────────
    # The most-hit query: GET /events?status=open&category=X. Composite
    # index lets Postgres serve this without touching the table for
    # small categories.
    ("ix_events_status_category",
     "ON events (status, category)"),

    # "Closing soon" / countdown queries filter by status = open and
    # order by closes_at. Partial index on open-only keeps it tight.
    ("ix_events_open_closes",
     "ON events (closes_at) WHERE status = 'open'"),

    # Featured event lookup on the markets hero carousel.
    ("ix_events_featured_open",
     "ON events (is_featured, created_at DESC) WHERE status = 'open' AND is_featured = true"),

    # ── comments ───────────────────────────────────────────────────────────
    # Per-event thread view, newest-first.
    ("ix_comments_event_created",
     "ON comments (event_id, created_at DESC) WHERE event_id IS NOT NULL"),

    # News-article comment threads (keyed by URL hash on the client,
    # but URL string on the server side).
    ("ix_comments_news_created",
     "ON comments (news_url, created_at DESC) WHERE news_url IS NOT NULL"),

    # ── scenario_probability_history ──────────────────────────────────────
    # Sparkline / chart queries per scenario, oldest-first for line plots.
    ("ix_prob_history_scenario_time",
     "ON scenario_probability_history (scenario_id, recorded_at)"),
]


def ensure_indexes(engine) -> None:
    """Create all missing indexes. Idempotent and fast on subsequent runs.

    Logs each CREATE attempt. If one fails (e.g., referenced column
    doesn't exist because a table schema diverged), we log and continue
    rather than aborting startup — indexes are optional, not required
    for correctness.
    """
    dialect = engine.dialect.name
    created = 0
    skipped = 0

    for name, spec in INDEXES:
        sql = f"CREATE INDEX IF NOT EXISTS {name} {spec}"
        try:
            with engine.begin() as conn:
                conn.execute(text(sql))
            created += 1
        except Exception as e:
            skipped += 1
            logger.warning("[Indexes] Skipped %s (%s): %s", name, dialect, e)

    logger.info(
        "[Indexes] Ensured %d index(es) (%d skipped) on %s.",
        created, skipped, dialect,
    )


def explain_query(engine, sql: str, params: dict | None = None) -> list[str]:
    """Run EXPLAIN ANALYZE on a query and return the plan as lines.

    Used by /admin/db/explain for the dashboard. Postgres-only — on
    SQLite we return a simple EXPLAIN QUERY PLAN result instead.
    """
    dialect = engine.dialect.name
    verb = "EXPLAIN ANALYZE" if dialect == "postgresql" else "EXPLAIN QUERY PLAN"
    with engine.connect() as conn:
        result = conn.execute(text(f"{verb} {sql}"), params or {})
        rows = result.fetchall()
    return [" ".join(str(c) for c in row) for row in rows]
