"""
Add display_name column to users table.

Run once:
  cd scenara-backend
  source venv/bin/activate
  python3 migrate_display_name.py
"""

from app.db import engine
from sqlalchemy import text

print("Adding display_name column to users...")

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN display_name VARCHAR(100) NOT NULL DEFAULT ''"))
        conn.commit()
        print("✓ display_name column added.")
    except Exception as e:
        if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
            print("✓ display_name column already exists, skipping.")
        else:
            raise e

print("Done.")