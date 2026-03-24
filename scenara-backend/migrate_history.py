"""
Run this once to create the scenario_probability_history table.

Usage:
  cd orryin-backend
  venv\Scripts\activate
  python migrate_history.py
"""

from app.db import engine, Base

# Import all models so Base knows about them
from app.models.user import User
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.event import Event
from app.models.scenario import Scenario
from app.models.prediction import Prediction
from app.models.probability_history import ScenarioProbabilityHistory

print("Creating missing tables...")
Base.metadata.create_all(bind=engine)
print("Done. Table 'scenario_probability_history' is ready.")