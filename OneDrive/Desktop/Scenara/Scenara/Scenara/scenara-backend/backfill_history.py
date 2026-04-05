"""
backfill_history.py

One-time script to seed realistic probability history for all existing events.
Simulates hourly snapshots going back to when each event was created.

Usage:
  cd orryin-backend
  venv\\Scripts\\activate
  python backfill_history.py
"""

import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.db import SessionLocal, engine, Base
from app.models.event import Event
from app.models.scenario import Scenario
from app.models.probability_history import ScenarioProbabilityHistory

# Make sure tables exist
Base.metadata.create_all(bind=engine)


def simulate_probability_walk(
    start_prob: float,
    num_points: int,
    volatility: float = 2.0,
) -> list[float]:
    """
    Simulate a realistic probability random walk.
    Starts at start_prob, walks with given volatility, stays in [5, 95].
    """
    probs = [start_prob]
    current = start_prob
    for _ in range(num_points - 1):
        nudge = random.gauss(0, volatility)
        current = max(5.0, min(95.0, current + nudge))
        probs.append(round(current, 2))
    return probs


def backfill(db: Session) -> None:
    events = db.query(Event).all()
    print(f"Found {len(events)} events to backfill.")

    total_inserted = 0

    for event in events:
        scenarios = db.query(Scenario).filter(
            Scenario.event_id == event.id
        ).all()

        if not scenarios:
            continue

        created_at = event.created_at or datetime.utcnow() - timedelta(hours=6)
        now = datetime.utcnow()

        # Calculate how many hourly snapshots fit between creation and now
        delta_hours = max(1, int((now - created_at).total_seconds() / 3600))
        # Cap at 48 points to avoid flooding small events
        num_points = min(delta_hours, 48)

        # Generate timestamps: hourly from created_at to now
        timestamps = [
            created_at + timedelta(hours=i * (delta_hours / num_points))
            for i in range(num_points)
        ]
        # Always include now as last point
        if timestamps[-1] < now - timedelta(minutes=5):
            timestamps.append(now)

        for scenario in scenarios:
            # Check existing history count
            existing = db.query(ScenarioProbabilityHistory).filter(
                ScenarioProbabilityHistory.scenario_id == scenario.id
            ).count()

            if existing >= 3:
                print(f"  Scenario {scenario.id} already has {existing} points, skipping.")
                continue

            # Simulate walk from initial probability
            start = scenario.probability
            # If resolved, walk toward 100 or 0
            if scenario.status == "won":
                end_target = 95.0
            elif scenario.status == "lost":
                end_target = 5.0
            else:
                end_target = start

            probs = simulate_probability_walk(
                start_prob=start,
                num_points=len(timestamps),
                volatility=1.8,
            )

            # Bias last few points toward end_target if resolved
            if scenario.status in ("won", "lost"):
                for j in range(max(0, len(probs) - 3), len(probs)):
                    blend = (j - (len(probs) - 4)) / 3
                    probs[j] = round(probs[j] * (1 - blend) + end_target * blend, 2)

            # Delete existing single creation point to replace with full history
            db.query(ScenarioProbabilityHistory).filter(
                ScenarioProbabilityHistory.scenario_id == scenario.id
            ).delete()

            for ts, prob in zip(timestamps, probs):
                db.add(ScenarioProbabilityHistory(
                    scenario_id=scenario.id,
                    event_id=event.id,
                    probability=prob,
                    source="backfill",
                    recorded_at=ts,
                ))
                total_inserted += 1

    db.commit()
    print(f"Backfill complete. Inserted {total_inserted} history points.")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        backfill(db)
    finally:
        db.close()