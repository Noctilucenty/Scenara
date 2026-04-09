"""
app/services/resolution.py

Shared settlement logic used by:
  - Manual resolve endpoint (events.py)
  - Auto-resolver (auto_resolver.py)
  - Settle endpoint (predictions.py)

Single source of truth — fix here, fixed everywhere.
"""
from __future__ import annotations
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.prediction import Prediction
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.user import User
from app.models.event import Event
from app.models.probability_history import ScenarioProbabilityHistory


def _update_streak(user: User, won: bool) -> None:
    if won:
        user.current_streak = (user.current_streak or 0) + 1
        if user.current_streak > (user.best_streak or 0):
            user.best_streak = user.current_streak
    else:
        user.current_streak = 0


def settle_event(
    db: Session,
    event: Event,
    winning_scenario_id: int,
    resolution_note: str = "",
) -> dict:
    """
    Settle all open predictions for an event.
    Winners get payout. Losers keep nothing. Returns summary dict.
    """
    scenario_ids = {s.id for s in event.scenarios}
    if winning_scenario_id not in scenario_ids:
        return {"ok": False, "error": "winning_scenario_id not in event"}

    open_predictions = (
        db.query(Prediction)
        .filter(
            Prediction.scenario_id.in_(scenario_ids),
            Prediction.status == "open",
        )
        .all()
    )

    now = datetime.utcnow()
    total_winners = total_losers = 0
    total_payout = 0.0

    for prediction in open_predictions:
        account = (
            db.query(Account)
            .filter(
                Account.user_id == prediction.user_id,
                Account.account_type == "simulation",
                Account.is_active.is_(True),
            )
            .first()
        )
        user = db.query(User).filter(User.id == prediction.user_id).first()

        if prediction.scenario_id == winning_scenario_id:
            payout = float(prediction.simulated_amount) * prediction.payout_multiplier
            pnl = payout - float(prediction.simulated_amount)
            prediction.status = "won"
            prediction.pnl = round(pnl, 2)
            prediction.settled_at = now
            if account:
                account.balance = float(account.balance) + payout
                db.add(Transaction(
                    user_id=prediction.user_id, account_id=account.id,
                    type="prediction_win", amount=round(payout, 2),
                    currency=account.currency,
                ))
            if user:
                _update_streak(user, won=True)
            total_winners += 1
            total_payout += payout
        else:
            prediction.status = "lost"
            prediction.pnl = round(-float(prediction.simulated_amount), 2)
            prediction.settled_at = now
            if account:
                db.add(Transaction(
                    user_id=prediction.user_id, account_id=account.id,
                    type="prediction_loss", amount=0,
                    currency=account.currency,
                ))
            if user:
                _update_streak(user, won=False)
            total_losers += 1

    # Mark event resolved + log final probability snapshots
    event.status = "resolved"
    event.resolution_note = resolution_note
    event.resolved_at = now

    for scenario in event.scenarios:
        scenario.status = "won" if scenario.id == winning_scenario_id else "lost"
        scenario.probability = 100.0 if scenario.id == winning_scenario_id else 0.0
        db.add(ScenarioProbabilityHistory(
            scenario_id=scenario.id,
            event_id=scenario.event_id,
            probability=scenario.probability,
            source="resolved",
            recorded_at=now,
        ))

    db.commit()

    # Auto top-up any users whose balance dropped below threshold
    for prediction in open_predictions:
        _auto_topup(db, prediction.user_id)

    return {
        "ok": True,
        "event_id": event.id,
        "winning_scenario_id": winning_scenario_id,
        "total_winners": total_winners,
        "total_losers": total_losers,
        "total_payout": round(total_payout, 2),
        "resolution_note": resolution_note,
    }


def void_event(db: Session, event: Event, note: str = "Event expired — all bets refunded") -> dict:
    """
    Void all open predictions — refund amounts, mark event resolved.
    Used for non-crypto events that expire without a determined outcome.
    """
    scenario_ids = {s.id for s in event.scenarios}
    open_predictions = (
        db.query(Prediction)
        .filter(
            Prediction.scenario_id.in_(scenario_ids),
            Prediction.status == "open",
        )
        .all()
    )

    now = datetime.utcnow()
    refunded = 0

    for prediction in open_predictions:
        account = (
            db.query(Account)
            .filter(
                Account.user_id == prediction.user_id,
                Account.account_type == "simulation",
                Account.is_active.is_(True),
            )
            .first()
        )
        prediction.status = "void"
        prediction.pnl = 0.0
        prediction.settled_at = now
        if account:
            account.balance = float(account.balance) + float(prediction.simulated_amount)
            db.add(Transaction(
                user_id=prediction.user_id, account_id=account.id,
                type="void", amount=float(prediction.simulated_amount),
                currency=account.currency,
            ))
        refunded += 1

    event.status = "resolved"
    event.resolution_note = note
    event.resolved_at = now
    for s in event.scenarios:
        s.status = "lost"

    db.commit()
    return {"ok": True, "event_id": event.id, "refunded": refunded}


TOPUP_THRESHOLD = 100.0   # top up when balance drops below this
TOPUP_TARGET    = 1_000.0 # restore balance to this amount

def _auto_topup(db: Session, user_id: int) -> bool:
    """
    If user's sim balance is below TOPUP_THRESHOLD, restore it to TOPUP_TARGET.
    Called after every settlement. Returns True if a top-up was performed.
    """
    account = (
        db.query(Account)
        .filter(
            Account.user_id == user_id,
            Account.account_type == "simulation",
            Account.is_active.is_(True),
        )
        .first()
    )
    if not account:
        return False
    if float(account.balance) < TOPUP_THRESHOLD:
        added = TOPUP_TARGET - float(account.balance)
        account.balance = TOPUP_TARGET
        db.add(Transaction(
            user_id=user_id, account_id=account.id,
            type="top_up", amount=round(added, 2),
            currency=account.currency,
        ))
        db.commit()
        return True
    return False
