"""
Add title_pt and description_pt columns to events table.

Run once:
  cd scenara-backend
  source venv/bin/activate
  python3 migrate_bilingual.py
"""

from app.db import engine
from sqlalchemy import text

print("Adding bilingual columns to events table...")

with engine.connect() as conn:
    for col, typ in [("title_pt", "VARCHAR(255)"), ("description_pt", "TEXT")]:
        try:
            conn.execute(text(f"ALTER TABLE events ADD COLUMN {col} {typ}"))
            conn.commit()
            print(f"✓ {col} added.")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print(f"✓ {col} already exists, skipping.")
            else:
                raise e

print("Done.")