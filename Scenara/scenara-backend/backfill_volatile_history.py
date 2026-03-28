"""
Run once to backfill existing probability history with more volatile data.
Makes existing charts look like real markets instead of flat lines.

Usage:
  cd scenara-backend
  source venv/bin/activate
  python3 backfill_volatile_history.py
"""
import sys
import random
sys.path.insert(0, ".")

from app.db import engine
from sqlalchemy import text

def main():
    with engine.connect() as conn:
        # Get all open scenarios
        scenarios = conn.execute(text(
            "SELECT s.id, s.probability, s.event_id FROM scenarios s "
            "JOIN events e ON e.id = s.event_id "
            "WHERE e.status = 'open' AND s.status = 'active'"
        )).fetchall()

        print(f"Found {len(scenarios)} active scenarios")
        inserted = 0

        for sid, current_prob, event_id in scenarios:
            # Delete existing flat history
            conn.execute(text(
                "DELETE FROM scenario_probability_history WHERE scenario_id = :sid"
            ), {"sid": sid})

            # Generate 48 points (4 hours back, every 5 min) with realistic volatility
            prob = current_prob
            points = []

            for i in range(48, 0, -1):
                # Work backwards from current prob
                if random.random() < 0.15:
                    nudge = random.gauss(0, 6.0)
                else:
                    nudge = random.gauss(0, 2.5)
                prob = max(4.0, min(96.0, prob - nudge))  # subtract to go backwards
                points.append((i, round(prob, 2)))

            # Insert from oldest to newest
            for minutes_ago, p in reversed(points):
                conn.execute(text(
                    "INSERT INTO scenario_probability_history "
                    "(scenario_id, probability, recorded_at, source) "
                    "VALUES (:sid, :prob, datetime('now', :offset), 'backfill')"
                ), {"sid": sid, "prob": p, "offset": f"-{minutes_ago * 5} minutes"})
                inserted += 1

        conn.commit()
        print(f"✓ Inserted {inserted} history points across {len(scenarios)} scenarios")
        print("Charts will now show realistic up-down movement")

if __name__ == "__main__":
    main()